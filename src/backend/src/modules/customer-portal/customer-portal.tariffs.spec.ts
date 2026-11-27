import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { PortalAccountAccessService } from './portal-account-access.service';

/**
 * Tarifa general y niveles: ya no dependen del cargo sino de la acción asignable
 * `portalTariffs:manage` (global, depende de `portalAccounts:read`). Super Admin pasa siempre.
 */
describe('Tarifa general y niveles — acción portalTariffs:manage', () => {
  const grant = (actionId: string, scope = 'global') => ({ sourceId: `s-${actionId}`, actionId, scope });
  const read = grant('portalAccounts:read');
  const tariffs = grant('portalTariffs:manage');
  let grants: { grantsForUser: jest.Mock };
  let portal: CustomerPortalService;
  let controller: CustomerPortalController;
  let inner: { listMappings: jest.Mock; upsertMapping: jest.Mock; saveTier: jest.Mock };

  const as = (roles: string[]) => ({ sub: 'u1', roles });

  beforeEach(() => {
    grants = { grantsForUser: jest.fn().mockResolvedValue([]) };
    const access = new PortalAccountAccessService({} as any, grants as any, { getSubordinateIds: jest.fn() } as any);
    portal = new CustomerPortalService({} as any, {} as any, { get: jest.fn() } as any, { log: jest.fn() } as any, undefined, access);
    inner = {
      listMappings: jest.fn().mockResolvedValue([]),
      upsertMapping: jest.fn().mockResolvedValue({ ok: true }),
      saveTier: jest.fn().mockResolvedValue({ id: 't1' }),
    };
    Object.assign(portal, inner);
    controller = new CustomerPortalController(portal, { get: jest.fn() } as any);
  });

  const routes: Array<[string, (u: any) => Promise<unknown>]> = [
    ['GET admin/price-list-mappings', (u) => controller.listMappings(u)],
    ['POST admin/price-list-mappings', (u) => controller.mapping({} as any, u)],
    ['POST admin/tiers', (u) => controller.createTier({} as any, u)],
    ['PATCH admin/tiers/:id', (u) => controller.editTier('t1', {} as any, u)],
  ];

  it.each(routes)('%s: sin la acción responde 403, aunque sea Admin Comercial o tenga solo cuentas del portal', async (_name, call) => {
    grants.grantsForUser.mockResolvedValue([read, grant('portalAccounts:manage')]);
    await expect(call(as(['Admin Comercial']))).rejects.toBeInstanceOf(ForbiddenException);
    grants.grantsForUser.mockResolvedValue([]);
    await expect(call(as(['Admin Comercial']))).rejects.toBeInstanceOf(ForbiddenException);
    expect(inner.listMappings).not.toHaveBeenCalled();
    expect(inner.upsertMapping).not.toHaveBeenCalled();
    expect(inner.saveTier).not.toHaveBeenCalled();
  });

  it.each(routes)('%s: con la acción (sin cargo especial) pasa', async (_name, call) => {
    grants.grantsForUser.mockResolvedValue([read, tariffs]);
    await expect(call(as(['Operador']))).resolves.toBeDefined();
  });

  it.each(routes)('%s: Super Admin pasa sin concesiones', async (_name, call) => {
    await expect(call(as(['Super Admin']))).resolves.toBeDefined();
  });

  it('la acción sin su dependencia (portalAccounts:read) no basta', async () => {
    grants.grantsForUser.mockResolvedValue([tariffs]);
    await expect(controller.createTier({} as any, as(['Operador']))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('GET admin/tiers no cambia: Super Admin ve todo y quien solo tiene la acción de tarifas no entra por ahí', async () => {
    grants.grantsForUser.mockResolvedValue([read, tariffs]);
    await expect(portal.listTiersFor({ userId: 'u1', roles: ['Operador'] })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
