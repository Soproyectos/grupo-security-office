/**
 * Autorización de Biblioteca SOLO por concesiones del panel (nunca por cargo ni por Listas).
 *
 * - `assertGlobalGrant` / `hasGlobalGrant`: deciden con `concessionCanAction` (modelo estricto) pero
 *   solo ven las concesiones de alcance GLOBAL del usuario: una concesión ligada a una Lista o a un
 *   producto concreto no habilita un endpoint de Biblioteca. Super Admin conserva su excepción.
 * - `@RequireGrant('products:write', ...)` + `GrantGuard`: deniegan por defecto. Si el handler no
 *   declara ninguna acción, el guard responde 403 (un endpoint nunca queda abierto por omisión).
 *   Con varias acciones se exigen TODAS.
 */
import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccessContext } from '../acl/acl.service';
import { AccessAssignmentsService } from './access-assignments.service';
import { concessionCanAction } from './d5-action';

export const REQUIRED_GRANTS_KEY = 'biblioteca:required-grants';

type GrantsReader = Pick<AccessAssignmentsService, 'grantsForUser'>;

export async function hasGlobalGrant(
  grants: GrantsReader | undefined,
  actionId: string,
  ctx: AccessContext | undefined,
): Promise<boolean> {
  const globalOnly = {
    grantsForUser: async (userId: string) =>
      ((await grants?.grantsForUser(userId)) ?? []).filter((row) => row.scope === 'global'),
  } as unknown as AccessAssignmentsService;
  return (await concessionCanAction(globalOnly, actionId, ctx)).allowed;
}

export async function assertGlobalGrant(
  grants: GrantsReader | undefined,
  actionId: string,
  ctx: AccessContext | undefined,
): Promise<void> {
  if (!(await hasGlobalGrant(grants, actionId, ctx))) {
    throw new ForbiddenException(`Sin permiso ${actionId}`);
  }
}

@Injectable()
export class GrantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly grants?: AccessAssignmentsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_GRANTS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      throw new ForbiddenException('Endpoint sin permiso de panel declarado');
    }
    const user = context.switchToHttp().getRequest()?.user;
    const ctx: AccessContext = { userId: user?.sub ?? user?.id, roles: user?.roles ?? [], userName: user?.name ?? null };
    for (const actionId of required) await assertGlobalGrant(this.grants, actionId, ctx);
    return true;
  }
}

/**
 * Exige TODAS las acciones de panel indicadas (concesión global) y reemplaza a `@Roles` en el handler.
 * Aplica `GrantGuard` por sí mismo: basta este decorador.
 */
export const RequireGrant = (...actionIds: string[]) =>
  applyDecorators(SetMetadata(REQUIRED_GRANTS_KEY, actionIds), UseGuards(GrantGuard));
