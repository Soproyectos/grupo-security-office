jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { AclService } from '../../common/acl/acl.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { LibraryAuditService } from '../library-audit/library-audit.service';
import { ListasService } from './listas.service';

/**
 * T06 listas — Lista/Product/Price por la biblioteca; Assignment, User, Quote y AuditLog operativos.
 * Dobles explícitos (no es una prueba PostgreSQL).
 */
const ctx = { userId: 'fixture-actor', userName: 'Persona de listas', roles: ['Admin Comercial'] };
const LISTA = { id: 'lista-1', name: 'Lista fixture', code: 'FIX', archivedAt: null, isActive: true, deletionStatus: null };

function setup(opts: { mode?: 'legacy' | 'dedicated'; writesFrozen?: boolean; quotes?: number } = {}) {
  const mode = opts.mode ?? 'dedicated';
  const order: string[] = [];
  const events: Array<Record<string, any>> = [];
  const libTx: any = {
    lista: {
      create: jest.fn(async ({ data }: any) => { order.push('library:lista.create'); return { id: 'lista-new', currency: 'COP', isActive: true, type: null, ...data }; }),
      delete: jest.fn(async () => { order.push('library:lista.delete'); return {}; }),
    },
    product: { updateMany: jest.fn(async () => { order.push('library:product.updateMany'); return { count: 2 }; }) },
  };
  const prisma: any = {
    lista: { findUnique: jest.fn(async ({ where }: any) => (where?.code || where?.codigo ? null : LISTA)), create: libTx.lista.create, delete: libTx.lista.delete },
    product: { findMany: jest.fn(async () => [{ id: 'p1' }, { id: 'p2' }]), count: jest.fn(async () => 2), updateMany: libTx.product.updateMany },
    price: { count: jest.fn(async () => 3) },
    quote: { count: jest.fn(async () => opts.quotes ?? 0) },
    assignment: {
      count: jest.fn(async () => 1),
      deleteMany: jest.fn(async () => { order.push('operational:assignment.deleteMany'); return { count: 1 }; }),
      findMany: jest.fn(async () => []),
    },
    auditLog: {
      findMany: jest.fn(async () => [{ id: 'old-1', action: 'create', entity: 'LISTA', entityId: 'lista-1', createdAt: new Date('2026-01-01'), user: { id: 'u0', name: 'Histórico', email: 'h@ejemplo.invalid' } }]),
      count: jest.fn(async () => 1),
    },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(libTx) : Promise.all(arg))),
  };
  const libraryClient = {
    ...prisma,
    libraryAuditEvent: { findMany: jest.fn(async () => [{ id: 'e1', action: 'LISTA_CREATED', entityId: 'lista-1', summary: { code: 'FIX' }, occurredAt: new Date('2026-10-01'), actorId: 'fixture-actor', actorName: 'Persona de listas' }]) },
  };
  const library: any = {
    config: { mode, writesFrozen: opts.writesFrozen === true },
    client: mode === 'dedicated' ? libraryClient : prisma,
    assertWritesAllowed() {
      if (library.config.writesFrozen) throw new ServiceUnavailableException({ code: 'LIBRARY_WRITES_FROZEN', message: 'congelado' });
    },
    ownsTransaction: () => true,
    writeTransaction: async (work: (t: unknown) => Promise<unknown>) => { library.assertWritesAllowed(); return work(libTx); },
  };
  const libraryAudit = { append: jest.fn(async (_tx: unknown, event: Record<string, any>) => { order.push(`event:${event.action}`); events.push(event); return { id: 'e' }; }) };
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const acl = { assertListaAction: jest.fn().mockResolvedValue(undefined), assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(true) };
  const grants = { grantsForUser: jest.fn().mockResolvedValue([{ sourceId: 's', actionId: 'listas:create', scope: 'global' }]) };
  const service = new ListasService(
    prisma as PrismaService, acl as unknown as AclService, audit as unknown as AuditService, {} as FilesService, grants as never,
    library as BibliotecaPrismaService, libraryAudit as unknown as LibraryAuditService,
  );
  return { service, prisma, libTx, audit, events, order, libraryAudit };
}

describe('T06 listas — con biblioteca dedicada', () => {
  it('crear: Lista y evento en la misma transacción de biblioteca; sin AuditLog histórico', async () => {
    const { service, audit, events, order } = setup();
    await service.create({ code: 'NUEVA', name: 'Nueva' } as any, ctx);
    expect(order).toEqual(['library:lista.create', 'event:LISTA_CREATED']);
    expect(events[0]).toMatchObject({ entityType: 'Lista', entityId: 'lista-new', actor: { id: 'fixture-actor', name: 'Persona de listas' } });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('eliminar con cotizaciones (operativo) responde 409 antes de escribir en cualquiera de las dos bases', async () => {
    const { service, order, prisma } = setup({ quotes: 2 });
    await expect(service.removeLista('lista-1', { confirm: true } as any, ctx)).rejects.toBeInstanceOf(ConflictException);
    expect(order).toEqual([]);
    expect(prisma.assignment.deleteMany).not.toHaveBeenCalled();
  });

  it('eliminar: primero biblioteca (vínculos, Lista y evento) y después los accesos operativos', async () => {
    const { service, order, events, audit } = setup();
    const result = await service.removeLista('lista-1', { confirm: true } as any, ctx);
    expect(result).toMatchObject({ productosConservados: 2 });
    expect(order).toEqual(['library:product.updateMany', 'library:lista.delete', 'event:LISTA_DELETED', 'operational:assignment.deleteMany']);
    expect(events[0].summary).toMatchObject({ code: 'FIX', productosConservados: 2, snapshot: expect.objectContaining({ productCount: 2 }) });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('eliminar con congelación: 503 y no se toca ninguna base (tampoco los accesos operativos)', async () => {
    const { service, order, prisma } = setup({ writesFrozen: true });
    await expect(service.removeLista('lista-1', { confirm: true } as any, ctx)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LIBRARY_WRITES_FROZEN' }) });
    expect(order).toEqual([]);
    expect(prisma.assignment.deleteMany).not.toHaveBeenCalled();
  });

  it('historial de una Lista: junta los eventos de biblioteca con el AuditLog histórico, más reciente primero', async () => {
    const { service } = setup();
    const result = await service.findAudit('lista-1', ctx);
    expect(result.meta.total).toBe(2);
    expect(result.data.map((r: any) => r.id)).toEqual(['e1', 'old-1']);
    expect(result.data[0]).toMatchObject({ origin: 'biblioteca', user: { id: 'fixture-actor', name: 'Persona de listas' } });
  });

  it('legacy: eliminar conserva la transacción única de siempre y el AuditLog; sin eventos de biblioteca', async () => {
    const { service, prisma, audit, libraryAudit } = setup({ mode: 'legacy' });
    await service.removeLista('lista-1', { confirm: true } as any, ctx);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(Array.isArray(prisma.$transaction.mock.calls[0][0])).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete', entity: 'LISTA' }));
    expect(libraryAudit.append).not.toHaveBeenCalled();
  });

  it('legacy: el historial sigue siendo solo el AuditLog', async () => {
    const { service } = setup({ mode: 'legacy' });
    const result = await service.findAudit('lista-1', ctx);
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });
});
