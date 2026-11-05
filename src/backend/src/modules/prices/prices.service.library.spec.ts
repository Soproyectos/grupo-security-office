jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { ServiceUnavailableException } from '@nestjs/common';
import { AclService } from '../../common/acl/acl.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LibraryAuditService } from '../library-audit/library-audit.service';
import { ProductRevisionsService } from '../products/product-revisions.service';
import { PricesService } from './prices.service';

/** T06 precios — tarifas y precios manuales con la biblioteca dedicada, con dobles explícitos (no es una prueba PostgreSQL). */
function setup(opts: { mode?: 'legacy' | 'dedicated'; writesFrozen?: boolean } = {}) {
  const mode = opts.mode ?? 'dedicated';
  const events: Array<Record<string, any>> = [];
  const tx: any = {
    priceList: { create: jest.fn(async ({ data }: any) => ({ id: 'pl-1', ...data })), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn().mockResolvedValue({}) },
    price: {
      create: jest.fn(async ({ data }: any) => ({ id: 'price-new', ...data, product: { id: data.productId, sku: 'SKU-A' }, priceList: { id: data.priceListId, code: 'DPP_ORO_IVA' } })),
      update: jest.fn(async ({ data }: any) => ({ id: 'price-1', productId: 'product-a', priceListId: 'tariff-oro', value: data.value ?? 90, product: { id: 'product-a', sku: 'SKU-A' }, priceList: { id: 'tariff-oro', code: 'DPP_ORO_IVA' } })),
      delete: jest.fn().mockResolvedValue({}),
    },
    productChange: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma: any = {
    ...tx,
    priceList: {
      ...tx.priceList,
      findUnique: jest.fn(async ({ where }: any) => (where.id === 'tariff-oro' ? { code: 'DPP_ORO_IVA' } : null)),
    },
    price: {
      ...tx.price,
      findUnique: jest.fn().mockResolvedValue({ id: 'price-1', productId: 'product-a', priceListId: 'tariff-oro', value: 90, currency: 'COP' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    product: { findUnique: jest.fn().mockResolvedValue({ id: 'product-a', sku: 'SKU-A' }) },
    $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
  };
  const library: any = {
    config: { mode, writesFrozen: opts.writesFrozen === true },
    client: prisma,
    assertWritesAllowed() {
      if (library.config.writesFrozen) throw new ServiceUnavailableException({ code: 'LIBRARY_WRITES_FROZEN', message: 'congelado' });
    },
    ownsTransaction: () => true,
    writeTransaction: async (work: (t: unknown) => Promise<unknown>) => { library.assertWritesAllowed(); return prisma.$transaction(work); },
  };
  const libraryAudit = { append: jest.fn(async (_tx: unknown, event: Record<string, any>) => { events.push(event); return { id: 'e' }; }) };
  const revisions = { markPendingFromLive: jest.fn().mockResolvedValue({ id: 'rev-pending' }) };
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const acl = { assertProductAccess: jest.fn().mockResolvedValue(undefined) };
  const service = new PricesService(
    prisma as PrismaService, acl as unknown as AclService, audit as unknown as AuditService, undefined,
    library as BibliotecaPrismaService, libraryAudit as unknown as LibraryAuditService,
    revisions as unknown as ProductRevisionsService,
  );
  return { service, prisma, tx, audit, events, libraryAudit, library, revisions };
}

const actor = { userId: 'fixture-actor', userName: 'Persona de prueba', roles: ['Admin Comercial'] };

describe('T06 precios — PricesService con biblioteca dedicada', () => {
  it('crear tarifa: dato y evento en la misma transacción, sin AuditLog histórico', async () => {
    const { service, tx, events, audit, prisma } = setup();
    const created = await service.createPriceList({ name: 'Tarifa', code: 'NUEVA' } as any, 'fixture-actor');
    expect(created).toMatchObject({ id: 'pl-1', code: 'NUEVA' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.priceList.create).toHaveBeenCalledTimes(1);
    expect(events).toEqual([expect.objectContaining({ action: 'PRICE_LIST_CREATED', entityType: 'PriceList', entityId: 'pl-1', actor: { id: 'fixture-actor', name: null } })]);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('crear precio: marca revisión de trabajo en la misma transacción y conserva actor', async () => {
    const { service, tx, revisions, prisma } = setup();
    prisma.price.findUnique.mockResolvedValue(null);
    await service.createPrice({ productId: 'product-a', priceListId: 'tariff-oro', value: 90 } as any, actor);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(revisions.markPendingFromLive).toHaveBeenCalledWith('product-a', tx, { id: actor.userId, name: actor.userName });
  });

  it('editar precio: marca revisión de trabajo en la misma transacción y conserva actor', async () => {
    const { service, tx, revisions, prisma } = setup();
    await service.updatePrice('price-1', { value: 100 } as any, actor);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(revisions.markPendingFromLive).toHaveBeenCalledWith('product-a', tx, { id: actor.userId, name: actor.userName });
  });

  it('borrar precio: marca revisión de trabajo en la misma transacción y conserva actor', async () => {
    const { service, tx, revisions, prisma } = setup();
    await service.removePrice('price-1', actor);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(revisions.markPendingFromLive).toHaveBeenCalledWith('product-a', tx, { id: actor.userId, name: actor.userName });
  });

  it('eliminar precio manual: borrado, historial y evento comparten transacción y el evento lleva nombre del actor', async () => {
    const { service, tx, events, audit } = setup();
    await service.removePrice('price-1', actor);
    expect(tx.price.delete).toHaveBeenCalledWith({ where: { id: 'price-1' } });
    expect(tx.productChange.createMany).toHaveBeenCalledTimes(1);
    expect(events).toEqual([expect.objectContaining({ action: 'PRICE_DELETED_MANUAL', actor: { id: 'fixture-actor', name: 'Persona de prueba' } })]);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('un evento que falla propaga el error y no se traga (la transacción real revierte el dato)', async () => {
    const { service, tx, libraryAudit, prisma } = setup();
    libraryAudit.append.mockRejectedValueOnce(new Error('synthetic event failure'));
    await expect(service.createPriceList({ name: 'Tarifa', code: 'NUEVA' } as any, 'fixture-actor')).rejects.toThrow('synthetic event failure');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.priceList.create).toHaveBeenCalledTimes(1); // la transacción real revierte; el doble comprueba que el error no se oculta
  });

  it.each(['createPriceList', 'removePrice'] as const)('congelado: %s responde 503 sin escribir nada', async (method) => {
    const { service, tx, events } = setup({ writesFrozen: true });
    const call = method === 'createPriceList'
      ? service.createPriceList({ name: 'Tarifa', code: 'NUEVA' } as any, 'fixture-actor')
      : service.removePrice('price-1', actor);
    await expect(call).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LIBRARY_WRITES_FROZEN' }) });
    expect(tx.priceList.create).not.toHaveBeenCalled();
    expect(tx.price.delete).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it('legacy: crear tarifa conserva la llamada directa (sin transacción nueva), el AuditLog y ningún evento de biblioteca', async () => {
    const { service, prisma, audit, libraryAudit } = setup({ mode: 'legacy' });
    await service.createPriceList({ name: 'Tarifa', code: 'NUEVA' } as any, 'fixture-actor');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.priceList.create).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', entity: 'PriceList' }));
    expect(libraryAudit.append).not.toHaveBeenCalled();
  });
});
