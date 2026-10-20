import { ForbiddenException } from '@nestjs/common';
import type { AccessContext } from '../acl/acl.service';
import { ROLE } from '../rbac/roles.constants';
import type { AccessAssignmentsService } from './access-assignments.service';
import { getActionDefinition, type AccessScope } from './access-catalog';
import { resolveAccess, type AccessIdentity, type AccessResource, type ScopedGrant } from './data-scope';

/** The resource and its current list must come from the server, not the request body. */
export type CatalogResource = AccessResource & { readonly kind: 'lista' | 'product' };

export type ScopedConcessionReason =
  | 'super-admin'
  | 'grant'
  | 'no-identity'
  | 'no-grants'
  | 'action-denied'
  | 'resource-denied'
  | 'dependency-denied'
  | 'invalid-resource'
  | 'unknown-action'
  | 'disabled-action';

export interface ScopedConcessionDecision {
  readonly allowed: boolean;
  readonly reason: ScopedConcessionReason;
  readonly scope: AccessScope | null;
  readonly sources: readonly string[];
}

function denied(reason: ScopedConcessionReason): ScopedConcessionDecision {
  return { allowed: false, reason, scope: null, sources: [] };
}

function hasId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validResource(resource: CatalogResource): boolean {
  if (!resource || !hasId(resource.id)) return false;
  if (resource.kind === 'lista') return resource.id === resource.listId && hasId(resource.listId);
  if (resource.kind !== 'product' || resource.id !== resource.productId || !hasId(resource.productId)) return false;
  // Unassigned library products are legitimate; only product/global grants can cover them.
  return resource.listId === undefined || hasId(resource.listId);
}

/**
 * Pure counterpart for a batch already holding a CURRENT grant snapshot. Never
 * cache that snapshot across requests, downloads or background-job executions.
 * A legacy role/Lista ACL cannot widen the action's own list/product scope.
 */
export function decideCatalogResourceAccessFromGrants(
  rows: readonly ScopedGrant[],
  actionId: string,
  ctx: AccessContext | undefined,
  resource: CatalogResource,
): ScopedConcessionDecision {
  if (!hasId(ctx?.userId)) return denied('no-identity');
  if (!validResource(resource)) return denied('invalid-resource');
  const definition = getActionDefinition(actionId);
  if (!definition) return denied('unknown-action');
  if (!definition.enabled) return denied('disabled-action');

  const identity: AccessIdentity = {
    userId: ctx.userId,
    verified: true,
    active: true,
    sessionValid: true,
    sessionUserId: ctx.userId,
    // Callers supply the live authenticated server context. No other role bypasses grants.
    superAdmin: ctx.roles?.includes(ROLE.SUPER_ADMIN) === true,
  };
  if (identity.superAdmin) return { allowed: true, reason: 'super-admin', scope: 'global', sources: ['super-admin'] };
  if (rows.length === 0) return denied('no-grants');

  const decision = resolveAccess({ identity, actionId, grants: rows, resource });
  if (!decision.allowed) {
    if (decision.reason === 'missing-dependency') return denied('dependency-denied');
    return denied(rows.some((row) => row.actionId === actionId) ? 'resource-denied' : 'action-denied');
  }

  // resolveAccess checks immediate dependencies. Check the complete chain here,
  // always against the SAME resource; never manufacture dependency grants.
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function dependenciesGranted(id: string): boolean {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    const current = getActionDefinition(id);
    if (!current?.enabled) return false;
    visiting.add(id);
    for (const dependencyId of current.dependencies) {
      if (!resolveAccess({ identity, actionId: dependencyId, grants: rows, resource }).allowed ||
          !dependenciesGranted(dependencyId)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  }
  if (!dependenciesGranted(actionId)) return denied('dependency-denied');
  return { allowed: true, reason: 'grant', scope: decision.scope, sources: decision.sources };
}

/** Re-reads assignments on every authorization call, including downloads and job units. */
export async function decideCatalogResourceAccess(
  grants: Pick<AccessAssignmentsService, 'grantsForUser'> | undefined,
  actionId: string,
  ctx: AccessContext | undefined,
  resource: CatalogResource,
): Promise<ScopedConcessionDecision> {
  if (!hasId(ctx?.userId)) return denied('no-identity');
  const rows = ctx.roles?.includes(ROLE.SUPER_ADMIN) ? [] : (await grants?.grantsForUser(ctx.userId)) ?? [];
  return decideCatalogResourceAccessFromGrants(rows, actionId, ctx, resource);
}

export async function assertCatalogResourceAccess(
  grants: Pick<AccessAssignmentsService, 'grantsForUser'> | undefined,
  actionId: string,
  ctx: AccessContext | undefined,
  resource: CatalogResource,
): Promise<ScopedConcessionDecision> {
  const decision = await decideCatalogResourceAccess(grants, actionId, ctx, resource);
  if (!decision.allowed) throw new ForbiddenException(`Sin permiso ${actionId} (${decision.reason})`);
  return decision;
}
