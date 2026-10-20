/**
 * Resolver puro de acción y alcance por concesión individual (BASE-04 §3).
 *
 * Ni consulta ni muta datos ni se registra en Nest: recibe la identidad ya
 * validada en servidor (Passport/sesión), el catálogo y las concesiones
 * vigentes, y devuelve permitido/denegado con el alcance efectivo y las
 * fuentes que lo conceden.
 *
 * Reglas duras del contrato:
 *  (a) se evalúa POR ACCIÓN; nunca se suman acciones y se aplica después un
 *      alcance global (ficha regla 1);
 *  (b) `team` en `X:read` no otorga `X:edit` sobre recursos del equipo;
 *  (c) la identidad sale del servidor, jamás del cuerpo de la petición;
 *  (d) Super Admin y cuenta propia son excepciones EXPLÍCITAS, cada una con
 *      su propia línea y comentario (patrón `permissions.guard.ts:60`).
 */
import { UnauthorizedException } from '@nestjs/common';
import { ACCESS_CATALOG_VERSION, getActionDefinition } from './access-catalog';
import type { AccessScope } from './access-catalog';

/** Identidad ya verificada en servidor. Los flags de sesión los aporta el
 * consumidor (unit 2: live-admin-identity/jwt) desde Passport y `sessions.isActive`. */
export interface AccessIdentity {
  readonly userId: string;
  readonly jti?: string;
  readonly verified: boolean;
  readonly active: boolean;
  readonly sessionValid: boolean;
  readonly sessionUserId: string;
  readonly superAdmin: boolean;
  readonly teamOwnerIds?: readonly string[];
}

/** Concesión individual con su procedencia (`sourceId` = fila de AccessSource). */
export interface ScopedGrant {
  readonly sourceId: string;
  readonly actionId: string;
  readonly scope: AccessScope;
  readonly resourceId?: string;
}

export interface AccessResource {
  readonly id: string;
  readonly kind?: 'account' | 'customer' | 'quote' | 'lista' | 'product';
  readonly ownerId?: string;
  readonly listId?: string;
  readonly productId?: string;
}

export interface ResolveAccessInput {
  readonly identity: AccessIdentity;
  readonly actionId: string;
  readonly grants: readonly ScopedGrant[];
  readonly resource?: AccessResource;
  /** Scope declarado por el navegador. Se recibe solo para dejar constancia
   * de que NUNCA se usa como autoridad (BASE-04 §6, ficha caso 3). */
  readonly clientDeclaredScope?: AccessScope;
}

export interface AccessDecision {
  readonly allowed: boolean;
  readonly scope: AccessScope | null;
  readonly sources: readonly string[];
  readonly reason: string | null;
  readonly catalogVersion: string;
}

/** Orden del alcance para elegir el más amplio entre grants cubrientes de la
 * MISMA acción; `list`/`product` son scopes ligados a un recurso concreto. */
const SCOPE_RANK: Readonly<Record<AccessScope, number>> = Object.freeze({
  own: 1,
  list: 2,
  product: 2,
  team: 3,
  global: 4,
});

function deny(reason: string): AccessDecision {
  return { allowed: false, scope: null, sources: [], reason, catalogVersion: ACCESS_CATALOG_VERSION };
}

function allow(scope: AccessScope, sources: readonly string[]): AccessDecision {
  return { allowed: true, scope, sources: Object.freeze([...sources]), reason: null, catalogVersion: ACCESS_CATALOG_VERSION };
}

function covers(
  grant: ScopedGrant,
  resource: AccessResource | undefined,
  identity: AccessIdentity,
): boolean {
  // Sin recurso concreto (can/scopeOf de §4): basta la concesión de la acción.
  if (!resource) return true;
  switch (grant.scope) {
    case 'global':
      return true;
    case 'own':
      return resource.ownerId !== undefined && resource.ownerId === identity.userId;
    case 'team':
      return resource.ownerId !== undefined &&
        (resource.ownerId === identity.userId ||
          (identity.teamOwnerIds ?? []).includes(resource.ownerId));
    case 'list':
      return grant.resourceId !== undefined && resource.listId === grant.resourceId;
    case 'product':
      return grant.resourceId !== undefined && resource.productId === grant.resourceId;
    default:
      return false;
  }
}

export function resolveAccess(input: ResolveAccessInput): AccessDecision {
  const { identity, actionId, resource } = input;

  // (c) Identidad inválida → 401 (§8): nada se evalúa sin identidad de servidor.
  if (!identity || typeof identity.userId !== 'string' || identity.userId.trim() === '' ||
      identity.verified !== true || identity.active !== true ||
      identity.sessionValid !== true || identity.sessionUserId !== identity.userId) {
    throw new UnauthorizedException('Identidad o sesión inválidas');
  }

  // Acción desconocida o enabled:false → denegado (§3; UA access-policy:74-76).
  const definition = getActionDefinition(actionId);
  if (!definition) return deny('unknown-action');
  if (!definition.enabled) return deny('disabled-action');

  // EXCEPCIÓN 1 — Super Admin: exención explícita y auditable, no heredada por
  // rol genérico (patrón permissions.guard.ts:60; acl.service.ts).
  if (identity.superAdmin === true) return allow('global', ['super-admin']);

  // EXCEPCIÓN 2 — cuenta propia: el usuario conserva su propia cuenta y sus
  // herramientas personales sin concesiones (ficha regla 3: «Mi resumen» y
  // «Agenda y tareas» son personales; no es una autoconcesión sobre ajenos).
  if (resource?.kind === 'account' && resource.id === identity.userId) {
    return allow('own', ['self-account']);
  }

  // El scope declarado por el navegador jamás es autoridad (BASE-04 §6).
  void input.clientDeclaredScope;

  const grants = input.grants ?? [];
  const covering = grants.filter((grant) =>
    grant.actionId === actionId &&
    definition.allowedScopes.includes(grant.scope) &&
    covers(grant, resource, identity));

  if (covering.length === 0) return deny('no-covering-grant');

  // Dependencias explícitas (BASE-02 §5.3): sin herencia silenciosa.
  for (const dependencyId of definition.dependencies) {
    const dependency = getActionDefinition(dependencyId);
    const satisfied = dependency?.enabled === true && grants.some((grant) =>
      grant.actionId === dependencyId &&
      dependency.allowedScopes.includes(grant.scope) &&
      covers(grant, resource, identity));
    if (!satisfied) return deny('missing-dependency');
  }

  const scope = covering.reduce(
    (broadest, grant) => (SCOPE_RANK[grant.scope] > SCOPE_RANK[broadest] ? grant.scope : broadest),
    covering[0].scope,
  );
  const sources = [...new Set(covering.map((grant) => grant.sourceId))].sort();
  return allow(scope, sources);
}
