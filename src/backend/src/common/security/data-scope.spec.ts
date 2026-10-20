/**
 * BASE-04 unidad 1 — resolver puro de acción y alcance por concesión
 * (BASE-04 §3/§7/§8). Nada de HTTP ni de BD aquí: la denegación end-to-end
 * al editar un compañero se acredita después en COM-02/COM-03.
 *
 * RED observado: estos specs deben fallar mientras `./data-scope` no exista.
 */
import { UnauthorizedException } from '@nestjs/common';
import { resolveAccess } from './data-scope';
import type { AccessIdentity, AccessResource, ScopedGrant } from './data-scope';
import { ACCESS_CATALOG_VERSION } from './access-catalog';
import type { AccessScope } from './access-catalog';

const identity = (over: Partial<AccessIdentity> = {}): AccessIdentity => ({
  userId: 'u-1',
  jti: 'jti-1',
  verified: true,
  active: true,
  sessionValid: true,
  sessionUserId: 'u-1',
  superAdmin: false,
  teamOwnerIds: ['u-2'],
  ...over,
});

const grant = (
  actionId: string,
  scope: AccessScope,
  sourceId: string,
  resourceId?: string,
): ScopedGrant => ({ sourceId, actionId, scope, resourceId });

function expect401(run: () => unknown) {
  let error: unknown;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).getStatus()).toBe(401);
}

describe('data-scope — resolver (BASE-04 §3, §7, §8)', () => {
  describe('identidad inválida → 401 (§8)', () => {
    it('rechaza identidad no verificada', () => {
      expect401(() => resolveAccess({
        identity: identity({ verified: false }),
        actionId: 'customers:read',
        grants: [],
      }));
    });

    it('rechaza userId vacío', () => {
      expect401(() => resolveAccess({
        identity: identity({ userId: '' }),
        actionId: 'customers:read',
        grants: [],
      }));
    });

    it('rechaza sesión revocada', () => {
      expect401(() => resolveAccess({
        identity: identity({ sessionValid: false }),
        actionId: 'customers:read',
        grants: [],
      }));
    });

    it('rechaza identidad inactiva', () => {
      expect401(() => resolveAccess({
        identity: identity({ active: false }),
        actionId: 'customers:read',
        grants: [],
      }));
    });

    it('rechaza sesión perteneciente a otro usuario', () => {
      expect401(() => resolveAccess({
        identity: identity({ sessionUserId: 'u-9' }),
        actionId: 'customers:read',
        grants: [],
      }));
    });
  });

  describe('acción desconocida o deshabilitada → denegado (§3 / §8 400)', () => {
    it('deniega una acción que no existe en el catálogo', () => {
      const result = resolveAccess({
        identity: identity({ superAdmin: true }),
        actionId: 'customers:export',
        grants: [],
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('unknown-action');
      expect(result.scope).toBeNull();
    });

    it('deniega una acción con enabled:false (stockRequests:read, B2)', () => {
      const result = resolveAccess({
        identity: identity({ superAdmin: true }),
        actionId: 'stockRequests:read',
        grants: [grant('stockRequests:read', 'global', 's-1')],
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('disabled-action');
      expect(result.scope).toBeNull();
    });
  });

  describe('excepciones explícitas: Super Admin y cuenta propia (ficha regla 3)', () => {
    it('Super Admin permite sin concesiones, con alcance global y procedencia propia', () => {
      const result = resolveAccess({
        identity: identity({ superAdmin: true }),
        actionId: 'customers:read',
        grants: [],
      });
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('global');
      expect(result.sources).toEqual(['super-admin']);
    });

    it('la cuenta propia sigue disponible sin concesiones (herramientas personales)', () => {
      const result = resolveAccess({
        identity: identity(),
        actionId: 'users:read',
        grants: [],
        resource: { id: 'u-1', kind: 'account' },
      });
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('own');
      expect(result.sources).toEqual(['self-account']);
    });

    it('la cuenta propia no abre la cuenta de otro usuario', () => {
      const result = resolveAccess({
        identity: identity(),
        actionId: 'users:read',
        grants: [],
        resource: { id: 'u-2', kind: 'account' },
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('no-covering-grant');
    });
  });

  describe('caso 7.1 — lectura de equipo no amplía edición propia', () => {
    const grants: ScopedGrant[] = [
      grant('customers:read', 'team', 'src-team'),
      grant('customers:edit', 'own', 'src-own'),
    ];
    const teammate: AccessResource = { id: 'c-2', ownerId: 'u-2' };
    const mine: AccessResource = { id: 'c-1', ownerId: 'u-1' };

    it('permite leer la ficha de un compañero con alcance team', () => {
      const result = resolveAccess({
        identity: identity(), actionId: 'customers:read', grants, resource: teammate,
      });
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('team');
      expect(result.sources).toEqual(['src-team']);
    });

    it('deniega editar la ficha de un compañero: team en read no otorga edit', () => {
      const result = resolveAccess({
        identity: identity(), actionId: 'customers:edit', grants, resource: teammate,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('no-covering-grant');
    });

    it('permite editar la ficha propia con alcance own', () => {
      const result = resolveAccess({
        identity: identity(), actionId: 'customers:edit', grants, resource: mine,
      });
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('own');
      expect(result.sources).toEqual(['src-own']);
    });
  });

  describe('caso 7.3 — el scope del navegador jamás es autoridad (§6)', () => {
    it('ignora clientDeclaredScope global y resuelve own por la concesión del servidor', () => {
      const result = resolveAccess({
        identity: identity(),
        actionId: 'customers:edit',
        grants: [
          grant('customers:read', 'team', 's-read'),
          grant('customers:edit', 'own', 's-1'),
        ],
        resource: { id: 'c-1', ownerId: 'u-1' },
        clientDeclaredScope: 'global',
      });
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('own');
    });

    it('deniega cuando no hay concesión, aunque el navegador declare global', () => {
      const result = resolveAccess({
        identity: identity(),
        actionId: 'customers:edit',
        grants: [],
        resource: { id: 'c-1', ownerId: 'u-1' },
        clientDeclaredScope: 'global',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('no-covering-grant');
    });
  });

  describe('dependencias explícitas, sin herencia silenciosa (BASE-02 §5.3)', () => {
    it('quotes:create exige una concesión cubriente de customers:read', () => {
      const onlyOwn = resolveAccess({
        identity: identity(),
        actionId: 'quotes:create',
        grants: [grant('quotes:create', 'own', 's-1')],
        resource: { id: 'q-1', ownerId: 'u-1' },
      });
      expect(onlyOwn.allowed).toBe(false);
      expect(onlyOwn.reason).toBe('missing-dependency');

      const withRead = resolveAccess({
        identity: identity(),
        actionId: 'quotes:create',
        grants: [
          grant('quotes:create', 'own', 's-1'),
          grant('customers:read', 'team', 's-2'),
        ],
        resource: { id: 'q-1', ownerId: 'u-1' },
      });
      expect(withRead.allowed).toBe(true);
      expect(withRead.sources).toEqual(['s-1']);
    });
  });

  describe('procedencia y alcance efectivo (§3, caso 7.2 a nivel unitario)', () => {
    it('reporta todas las fuentes vigentes ordenadas y el alcance más amplio', () => {
      const result = resolveAccess({
        identity: identity(),
        actionId: 'customers:read',
        grants: [
          grant('customers:read', 'own', 's-b'),
          grant('customers:read', 'team', 's-a'),
        ],
        resource: { id: 'c-1', ownerId: 'u-1' },
      });
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('team');
      expect(result.sources).toEqual(['s-a', 's-b']);
    });

    it('al retirar una fuente conserva la restante con su propio alcance (7.2)', () => {
      const result = resolveAccess({
        identity: identity(),
        actionId: 'customers:read',
        grants: [grant('customers:read', 'own', 's-b')],
        resource: { id: 'c-1', ownerId: 'u-1' },
      });
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('own');
      expect(result.sources).toEqual(['s-b']);
    });

    it('los grants de otra acción nunca conceden esta acción', () => {
      const result = resolveAccess({
        identity: identity(),
        actionId: 'customers:edit',
        grants: [grant('customers:read', 'global', 's-1')],
        resource: { id: 'c-1', ownerId: 'u-2' },
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('no-covering-grant');
    });

    it('un scope no permitido por la definición no cubre el recurso', () => {
      const result = resolveAccess({
        identity: identity(),
        actionId: 'products:read',
        grants: [grant('products:read', 'own', 's-1')],
        resource: { id: 'p-1', listId: 'L1' },
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('no-covering-grant');
    });

    it('resuelve scope list por recurso concreto', () => {
      const grants = [grant('products:read', 'list', 's-1', 'L1')];
      const allowed = resolveAccess({
        identity: identity(),
        actionId: 'products:read',
        grants,
        resource: { id: 'p-1', listId: 'L1' },
      });
      expect(allowed.allowed).toBe(true);
      expect(allowed.scope).toBe('list');

      const denied = resolveAccess({
        identity: identity(),
        actionId: 'products:read',
        grants,
        resource: { id: 'p-2', listId: 'L2' },
      });
      expect(denied.allowed).toBe(false);
      expect(denied.reason).toBe('no-covering-grant');
    });

    it('sin recurso devuelve el alcance concedido para can()/scopeOf() (§4)', () => {
      const result = resolveAccess({
        identity: identity(),
        actionId: 'customers:edit',
        grants: [
          grant('customers:read', 'team', 's-read'),
          grant('customers:edit', 'own', 's-1'),
        ],
      });
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('own');
      expect(result.sources).toEqual(['s-1']);
    });

    it('siempre porta la versión de catálogo con la que resolvió (§4)', () => {
      const result = resolveAccess({
        identity: identity({ superAdmin: true }),
        actionId: 'customers:read',
        grants: [],
      });
      expect(result.catalogVersion).toBe(ACCESS_CATALOG_VERSION);
    });
  });
});
