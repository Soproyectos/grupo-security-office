/**
 * BASE-04 unidad 2 — identidad administrativa efectiva construida en el
 * servidor (BASE-04 §3 regla (c), §4 `identity`, §7 caso 7.3).
 *
 * RED observado: estos specs deben fallar mientras
 * `./live-admin-identity.service` no exista (Cannot find module).
 */
import { UnauthorizedException } from '@nestjs/common';
import { ACCESS_CATALOG_VERSION } from './access-catalog';
import { resolveAccess } from './data-scope';
import type { ScopedGrant } from './data-scope';
import { LiveAdminIdentityService } from './live-admin-identity.service';
import type { PassportSessionUser } from './live-admin-identity.service';

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 1000);

function buildService(overrides: {
  user?: Record<string, unknown> | null;
  session?: Record<string, unknown> | null;
  subordinates?: string[];
} = {}) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(overrides.user ?? null) },
    session: { findUnique: jest.fn().mockResolvedValue(overrides.session ?? null) },
  };
  const hierarchy = {
    getSubordinateIds: jest.fn().mockResolvedValue(overrides.subordinates ?? []),
  };
  return {
    prisma,
    hierarchy,
    service: new LiveAdminIdentityService(prisma as never, hierarchy as never),
  };
}

const activeUser = (roles: string[] = ['Vendedor']) => ({
  id: 'u-1',
  isActive: true,
  roles: roles.map((name) => ({ role: { name } })),
});

const liveSession = (userId = 'u-1', overrides: Record<string, unknown> = {}) => ({
  userId,
  revokedAt: null,
  expiresAt: FUTURE,
  ...overrides,
});

const passportUser = (overrides: Partial<PassportSessionUser> = {}): PassportSessionUser => ({
  sub: 'u-1',
  email: 'vendedor@grupo-security.test',
  name: 'Vendedor Demo',
  roles: ['Vendedor'],
  permissions: ['dashboard:pack:ventas'],
  jti: 'jti-1',
  ...overrides,
});

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

async function expect401Async(run: () => Promise<unknown>) {
  let error: unknown;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).getStatus()).toBe(401);
}

describe('LiveAdminIdentityService (BASE-04 §3, §4, §7.3)', () => {
  describe('construcción de la identidad desde Passport', () => {
    it('monta la identidad con usuario, sesión y roles vigentes del servidor', async () => {
      const { service, hierarchy } = buildService({
        user: activeUser(['Supervisor']),
        session: liveSession(),
        subordinates: ['u-2'],
      });

      const identity = await service.fromRequest({ user: passportUser() } as never);

      expect(identity).toEqual({
        userId: 'u-1',
        jti: 'jti-1',
        verified: true,
        active: true,
        sessionValid: true,
        sessionUserId: 'u-1',
        superAdmin: false,
        teamOwnerIds: ['u-2'],
      });
      expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('u-1');
    });

    it('marca superAdmin desde los roles de la BD, no desde el token', async () => {
      const { service } = buildService({
        user: activeUser(['Super Admin', 'Supervisor']),
        session: liveSession(),
      });

      const identity = await service.fromRequest({
        // Token viejo que NO declara Super Admin: manda la BD.
        user: passportUser({ roles: ['Vendedor'] }),
      } as never);

      expect(identity.superAdmin).toBe(true);
    });

    it('no da por buena la ausencia de sesión: sin jti la identidad es inválida', async () => {
      const { service } = buildService({ user: activeUser(), session: null });
      await expect401Async(() => service.fromRequest({
        user: passportUser({ jti: undefined }),
      } as never));
    });
  });

  describe('§7.3 — la identidad NUNCA sale del body, la query ni las cabeceras', () => {
    const hostileRequest = () => ({
      user: passportUser(),
      body: { userId: 'u-9', superAdmin: true, scope: 'global', roles: ['Super Admin'] },
      query: { userId: 'u-9', scope: 'global' },
      headers: { 'x-user-id': 'u-9', 'x-scope': 'global', authorization: 'Bearer forged' },
    });

    it('ignora credenciales hostiles y usa sólo el usuario de Passport', async () => {
      const { service } = buildService({
        user: activeUser(),
        session: liveSession(),
        subordinates: [],
      });

      const identity = await service.fromRequest(hostileRequest() as never);

      expect(identity.userId).toBe('u-1');
      expect(identity.superAdmin).toBe(false);
      expect(identity.sessionUserId).toBe('u-1');
    });

    it('rechaza con 401 una petición sin usuario de Passport aunque el body traiga uno', async () => {
      const { service } = buildService({ user: activeUser(), session: liveSession() });
      await expect401Async(() => service.fromRequest({
        body: { userId: 'u-1', superAdmin: true },
        query: { userId: 'u-1' },
        headers: { 'x-user-id': 'u-1' },
      } as never));
    });

    it('el scope declarado por el navegador no sustituye las concesiones del servidor', async () => {
      const { service } = buildService({
        user: activeUser(),
        session: liveSession(),
      });
      const identity = await service.fromRequest(hostileRequest() as never);

      // customers:edit exige la dependencia customers:read (BASE-02 §5.3).
      const grants: ScopedGrant[] = [
        { sourceId: 's-1', actionId: 'customers:read', scope: 'own' },
        { sourceId: 's-1', actionId: 'customers:edit', scope: 'own' },
      ];
      const decision = resolveAccess({
        identity,
        actionId: 'customers:edit',
        grants,
        resource: { id: 'c-1', ownerId: 'u-1' },
        clientDeclaredScope: 'global',
      });

      expect(decision.allowed).toBe(true);
      expect(decision.scope).toBe('own');
      expect(decision.catalogVersion).toBe(ACCESS_CATALOG_VERSION);
    });

    it('sin concesión el scope hostil no abre nada', async () => {
      const { service } = buildService({ user: activeUser(), session: liveSession() });
      const identity = await service.fromRequest(hostileRequest() as never);

      const decision = resolveAccess({
        identity,
        actionId: 'customers:edit',
        grants: [],
        resource: { id: 'c-1', ownerId: 'u-1' },
        clientDeclaredScope: 'global',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('no-covering-grant');
    });
  });

  describe('sesión y usuario (§8 → 401)', () => {
    it('rechaza usuario inexistente', async () => {
      const { service } = buildService({ user: null, session: liveSession() });
      await expect401Async(() => service.fromRequest({ user: passportUser() } as never));
    });

    it('rechaza usuario inactivo', async () => {
      const { service } = buildService({
        user: { ...activeUser(), isActive: false },
        session: liveSession(),
      });
      await expect401Async(() => service.fromRequest({ user: passportUser() } as never));
    });

    it('rechaza sesión revocada', async () => {
      const { service } = buildService({
        user: activeUser(),
        session: liveSession('u-1', { revokedAt: new Date() }),
      });
      await expect401Async(() => service.fromRequest({ user: passportUser() } as never));
    });

    it('rechaza sesión caducada', async () => {
      const { service } = buildService({
        user: activeUser(),
        session: liveSession('u-1', { expiresAt: PAST }),
      });
      await expect401Async(() => service.fromRequest({ user: passportUser() } as never));
    });

    it('rechaza una sesión que pertenece a otro usuario', async () => {
      const { service } = buildService({
        user: activeUser(),
        session: liveSession('u-9'),
      });
      await expect401Async(() => service.fromRequest({ user: passportUser() } as never));
    });

    it('rechaza una petición sin usuario de Passport', async () => {
      const { service } = buildService({ user: activeUser(), session: liveSession() });
      await expect401Async(() => service.fromRequest({} as never));
      await expect401Async(() => service.fromRequest(undefined as never));
    });
  });
});
