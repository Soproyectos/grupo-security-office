import { ServiceUnavailableException } from '@nestjs/common';
import { CatalogJobsService } from './catalog-jobs.service';

/**
 * T06 catalog-jobs — trabajos, unidades, productos y revisiones por la biblioteca; User operativo.
 * Dobles explícitos (no es una prueba PostgreSQL).
 */
const ctx = { userId: 'fixture-actor', userName: 'Persona de trabajos', roles: ['Super Admin'] };
const JOB = { id: 'job-1', kind: 'VALIDATION_SCAN', state: 'QUEUED', progressDone: 0, progressTotal: 1, error: null, resultSummary: null, createdAt: new Date(), startedAt: null, finishedAt: null, actorId: 'fixture-actor', cancelRequested: false };

function setup(opts: { mode?: 'legacy' | 'dedicated'; writesFrozen?: boolean; jobState?: string } = {}) {
  const mode = opts.mode ?? 'dedicated';
  const order: string[] = [];
  const events: Array<Record<string, any>> = [];
  const libTx: any = {
    catalogJob: {
      create: jest.fn(async () => { order.push('library:job.create'); return { ...JOB }; }),
      update: jest.fn(async ({ data }: any) => { order.push('library:job.update'); return { ...JOB, ...data }; }),
    },
  };
  const libraryClient: any = {
    ...libTx,
    catalogJob: { ...libTx.catalogJob, findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => ({ ...JOB, state: opts.jobState ?? 'QUEUED' })) },
    product: { findMany: jest.fn(async () => [{ id: 'p1' }]) },
    $queryRaw: jest.fn(async () => { order.push('library:claim'); return []; }),
  };
  const prisma: any = { user: { findUnique: jest.fn(async () => null) }, catalogJob: libraryClient.catalogJob, product: libraryClient.product, $queryRaw: libraryClient.$queryRaw };
  const library: any = {
    config: { mode, writesFrozen: opts.writesFrozen === true },
    client: mode === 'dedicated' ? libraryClient : prisma,
    assertWritesAllowed() {
      if (library.config.writesFrozen) throw new ServiceUnavailableException({ code: 'LIBRARY_WRITES_FROZEN', message: 'congelado' });
    },
    writeTransaction: async (work: (t: unknown) => Promise<unknown>) => { library.assertWritesAllowed(); return work(libTx); },
  };
  const libraryAudit = { append: jest.fn(async (_tx: unknown, event: Record<string, any>) => { order.push(`event:${event.action}`); events.push(event); return { id: 'e' }; }) };
  const acl = { getAllowedListaIds: jest.fn(async () => null), isListasAdmin: jest.fn(() => true), assertProductAccess: jest.fn() };
  const grants = { grantsForUser: jest.fn(async () => [{ sourceId: 's', actionId: 'products:validate', scope: 'global' }]) };
  const service = new CatalogJobsService(prisma, acl as never, grants as never, {} as never, library, libraryAudit as never);
  return { service, order, events, libraryClient, prisma, library };
}

describe('T06 catalog-jobs — con biblioteca dedicada', () => {
  it('encolar: trabajo y evento en la misma transacción de biblioteca', async () => {
    const { service, order, events } = setup();
    const r = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'filter' } } as never, ctx);
    expect(r.reused).toBe(false);
    expect(order).toEqual(['library:job.create', 'event:CATALOG_JOB_ENQUEUED']);
    expect(events[0]).toMatchObject({ entityType: 'CatalogJob', actor: { id: 'fixture-actor', name: 'Persona de trabajos' }, summary: { kind: 'VALIDATION_SCAN', unidades: 1 } });
  });

  it('encolar con congelación: 503 sin escribir ni emitir evento', async () => {
    const { service, order } = setup({ writesFrozen: true });
    await expect(service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'filter' } } as never, ctx)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LIBRARY_WRITES_FROZEN' }) });
    expect(order).toEqual([]);
  });

  it('cancelar un trabajo en cola escribe con su evento', async () => {
    const { service, order, events } = setup();
    await service.cancel('job-1', ctx);
    expect(order).toEqual(['library:job.update', 'event:CATALOG_JOB_CANCELLED']);
    expect(events[0].summary).toEqual({ result: 'cancelled' });
  });

  it('el trabajador no reclama nada mientras la biblioteca está congelada', async () => {
    const { service, order } = setup({ writesFrozen: true });
    await service.tick();
    expect(order).toEqual([]);
  });

  it('el reclamo atómico (SQL crudo) corre sobre la biblioteca, no sobre la base operativa', async () => {
    const { service, libraryClient } = setup();
    await service.claimNext();
    expect(libraryClient.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('legacy: encolar escribe directo, sin eventos de biblioteca', async () => {
    const { service, order } = setup({ mode: 'legacy' });
    await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'filter' } } as never, ctx);
    expect(order).toEqual(['library:job.create']);
  });
});
