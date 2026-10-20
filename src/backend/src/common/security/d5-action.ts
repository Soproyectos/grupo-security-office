/**
 * MODELO ESTRICTO DE CONCESIONES (enmienda de seguridad 2026-10-18 del
 * coordinador — sustituye la antigua «transición D5», que reactivaba la capa
 * heredada de roles cuando el usuario se quedaba sin concesiones).
 *
 * Política (hallazgo 1, «Transición D5»):
 *  - Una acción gobernada por concesiones se concede SOLO si:
 *      1) el actor es Super Admin — EXCEPCIÓN EXPLÍCITA Y COMPROBADA
 *         (`reason: 'super-admin'`), o
 *      2) existe una CONCESIÓN EXPLÍCITA para la acción (con su cadena de
 *         dependencias resuelta por `resolveAccess`).
 *  - La AUSENCIA de concesiones NUNCA reactiva permisos heredados del rol:
 *    retirar la última asignación equivale a revocar (`reason: 'no-grants'`).
 *  - Sin identidad no hay acceso (`reason: 'no-identity'`) — jamás «permitir
 *    por omisión».
 *
 * Las capas de datos/ACL por Lista (p. ej. `assertProductAccess`) siguen
 * aplicándose DESPUÉS como segunda comprobación de alcance; esta helper solo
 * responde por la acción de catálogo gobernada.
 */
import { ForbiddenException } from '@nestjs/common';
import type { AccessContext } from '../acl/acl.service';
import { ROLE } from '../rbac/roles.constants';
import type { AccessAssignmentsService } from './access-assignments.service';
import { resolveAccess, type AccessIdentity } from './data-scope'
import { decideCatalogResourceAccess, type CatalogResource } from './catalog-resource-access';

export type ConcessionReason =
  | 'super-admin' // excepción global explícita (única vía sin concesiones)
  | 'grant' // concesión explícita vigente para la acción
  | 'no-identity' // sin identidad: denegar (nunca "permitir por omisión")
  | 'no-grants' // sin ninguna concesión: NO reactiva el rol heredado
  | 'action-denied' // tiene concesiones, pero no para esta acción
  | 'dependency-denied' // tiene la acción pero le falta una dependencia
  | 'resource-denied'
  | 'invalid-resource'
  | 'unknown-action'
  | 'disabled-action'

export type ConcessionDecision =
  | { allowed: true; reason: Extract<ConcessionReason, 'super-admin' | 'grant'> }
  | { allowed: false; reason: Exclude<ConcessionReason, 'super-admin' | 'grant'> }

export async function concessionCanAction(
  grants: AccessAssignmentsService | undefined,
  actionId: string,
  ctx: AccessContext | undefined,
  resource?: CatalogResource,
): Promise<ConcessionDecision> {
  // With a resource this authorizes the action AND its exact scope. Without one,
  // the result only answers whether a menu/action is available somewhere.
  if (resource) {
    const decision = await decideCatalogResourceAccess(grants, actionId, ctx, resource);
    return decision.allowed
      ? { allowed: true, reason: decision.reason as 'super-admin' | 'grant' }
      : { allowed: false, reason: decision.reason as Exclude<ConcessionReason, 'super-admin' | 'grant'> };
  }
  if (!ctx?.userId?.trim()) return { allowed: false, reason: 'no-identity' }
  if (ctx.roles?.includes(ROLE.SUPER_ADMIN)) return { allowed: true, reason: 'super-admin' }
  const rows = (await grants?.grantsForUser(ctx.userId)) ?? []
  if (rows.length === 0) return { allowed: false, reason: 'no-grants' }
  const identity: AccessIdentity = {
    userId: ctx.userId,
    verified: true,
    active: true,
    sessionValid: true,
    sessionUserId: ctx.userId,
    superAdmin: false, // la única excepción global es la rama explícita de arriba
  }
  const access = resolveAccess({ identity, actionId, grants: rows })
  if (access.allowed) return { allowed: true, reason: 'grant' }
  const hasAction = rows.some((r: { actionId?: string }) => r.actionId === actionId)
  return { allowed: false, reason: hasAction ? 'dependency-denied' : 'action-denied' }
}

export async function concessionAssertAction(
  grants: AccessAssignmentsService | undefined,
  actionId: string,
  ctx: AccessContext | undefined,
  resource?: CatalogResource,
): Promise<ConcessionDecision> {
  const decision = await concessionCanAction(grants, actionId, ctx, resource)
  if (!decision.allowed) {
    throw new ForbiddenException(`Sin permiso ${actionId} (${decision.reason})`)
  }
  return decision
}

/** Alias de migración — NO reintroduce el fallback: mismo comportamiento estricto. */
export const d5CanAction = concessionCanAction
export const d5AssertAction = concessionAssertAction
