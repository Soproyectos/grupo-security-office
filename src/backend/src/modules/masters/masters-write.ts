import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { GrantGuard, REQUIRED_GRANTS_KEY, hasGlobalGrant } from '../../common/security/require-grant';

/**
 * `masters:write` is an ADDITIONAL accepted path on the master-catalog write endpoints: existing roles and
 * grants keep working unchanged, and nobody gains access unless they hold the global `masters:write` grant.
 */
export const MASTERS_WRITE_KEY = 'masters:write-also-accepted';
export const MASTERS_WRITE_ACTION = 'masters:write';

/** Marks a handler whose existing role check also accepts a global `masters:write` grant. */
export const AllowMastersWrite = () => SetMetadata(MASTERS_WRITE_KEY, true);

export async function holdsMastersWrite(grants: AccessAssignmentsService | undefined, request: any): Promise<boolean> {
  const user = request?.user;
  const userId = user?.sub ?? user?.id;
  if (!userId) return false;
  return hasGlobalGrant(grants, MASTERS_WRITE_ACTION, { userId, roles: user?.roles ?? [], userName: user?.name ?? null });
}

/** RolesGuard that, for handlers marked `@AllowMastersWrite()`, also lets in a holder of `masters:write`. */
@Injectable()
export class RolesOrMastersWriteGuard implements CanActivate {
  private readonly roles: RolesGuard;
  constructor(private readonly reflector: Reflector, @Optional() private readonly grants?: AccessAssignmentsService) {
    this.roles = new RolesGuard(reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.roles.canActivate(context)) return true;
    const marked = this.reflector.getAllAndOverride<boolean>(MASTERS_WRITE_KEY, [context.getHandler(), context.getClass()]);
    return !!marked && (await holdsMastersWrite(this.grants, context.switchToHttp().getRequest()));
  }
}

/** GrantGuard (all listed grants) that also accepts a global `masters:write` when the handler is marked. */
@Injectable()
export class GrantOrMastersWriteGuard extends GrantGuard {
  constructor(private readonly reflectorRef: Reflector, @Optional() private readonly grantsRef?: AccessAssignmentsService) {
    super(reflectorRef, grantsRef);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
      const marked = this.reflectorRef.getAllAndOverride<boolean>(MASTERS_WRITE_KEY, [context.getHandler(), context.getClass()]);
      if (marked && (await holdsMastersWrite(this.grantsRef, context.switchToHttp().getRequest()))) return true;
      throw error;
    }
  }
}

/** Same metadata as `@RequireGrant(...ids)`, but a holder of `masters:write` is accepted too. */
export const RequireGrantOrMastersWrite = (...actionIds: string[]) =>
  applyDecorators(SetMetadata(REQUIRED_GRANTS_KEY, actionIds), AllowMastersWrite(), UseGuards(GrantOrMastersWriteGuard));
