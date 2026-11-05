jest.mock('../../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ServiceUnavailableException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { LibraryAuditService } from '../../library-audit/library-audit.service';
import { PriceImportService } from './price-import.service';
import { createGrantsProvider, createPriceImportFake, type PriceImportFakeSeed } from './price-import.test-helpers';

/**
 * T06 precios — comportamiento del flujo de importación con la biblioteca DEDICADA, con dobles explícitos
 * (no es una prueba PostgreSQL): eventos atómicos con el dato, congelación de escrituras y errores de otro runtime.
 */
const LISTA_A = '00000000-0000-4000-8000-0000000000a1';
const ctx: AccessContext = { userId: 'fixture-actor', userName: 'Persona de prueba', roles: ['Admin Comercial'] };
const storageDir = path.join(os.tmpdir(), 'gs-t06-prices-library-test-storage');
const ALL = ['prices:save', 'prices:preview', 'prices:read', 'prices:apply', 'listas:read'];

function file(rows: unknown[][]): Express.Multer.File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'DPP_ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
  return { originalname: 'fixture-precios.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } as Express.Multer.File;
}

const seed = (): PriceImportFakeSeed => ({
  listas: [{ id: LISTA_A, code: 'LA', name: 'Lista Alfa' }],
  products: [{ id: 'product-a', sku: 'SKU-A', listaId: LISTA_A }],
  tariffs: [{ id: 'tariff-oro', code: 'DPP_ORO_IVA' }],
  prices: [{ productId: 'product-a', priceListId: 'tariff-oro', value: 90, listaId: LISTA_A }],
});

type Fake = ReturnType<typeof createPriceImportFake>;

/** Biblioteca dedicada simulada sobre el mismo fake: misma transacción, mismas reglas de congelación. */
function dedicated(fake: Fake, opts: { writesFrozen?: boolean; failEvent?: string } = {}) {
  const events: Array<Record<string, any>> = [];
  const library: any = {
    config: { mode: 'dedicated', writesFrozen: opts.writesFrozen === true },
    client: fake.prisma,
    assertWritesAllowed() {
      if (library.config.writesFrozen) throw new ServiceUnavailableException({ code: 'LIBRARY_WRITES_FROZEN', message: 'congelado' });
    },
    ownsTransaction: () => true,
    writeTransaction: async (work: (tx: unknown) => Promise<unknown>, options?: unknown) => {
      library.assertWritesAllowed();
      return fake.prisma.$transaction(work, options);
    },
  };
  const libraryAudit = {
    append: jest.fn(async (_tx: unknown, event: Record<string, any>) => {
      if (opts.failEvent && event.action === opts.failEvent) throw new Error('synthetic event failure');
      events.push(event);
      return { id: `event-${events.length}` };
    }),
  };
  return { library: library as BibliotecaPrismaService, libraryAudit: libraryAudit as unknown as LibraryAuditService, events, appendMock: libraryAudit.append };
}

describe('T06 precios — importación con biblioteca dedicada (dobles explícitos)', () => {
  let fake: Fake;
  let grants: ReturnType<typeof createGrantsProvider>;
  let acl: any;
  const build = (lib: ReturnType<typeof dedicated>) =>
    new PriceImportService(fake.prisma as PrismaService, acl as AclService, fake.audit as unknown as AuditService, grants as any, undefined, lib.library, lib.libraryAudit);
  let keySeq = 0;
  const save = (service: PriceImportService, rows: unknown[][]) => service.saveRevision(file(rows), `key-lib-${String(++keySeq).padStart(4, '0')}`, ctx);

  beforeAll(async () => {
    process.env.PRICE_IMPORT_STORAGE_DIR = storageDir;
    await fs.rm(storageDir, { recursive: true, force: true });
  });
  afterAll(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
    delete process.env.PRICE_IMPORT_STORAGE_DIR;
  });
  beforeEach(() => {
    fake = createPriceImportFake(seed());
    acl = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(false) };
    grants = createGrantsProvider();
    grants.grant(...ALL); // global panel grants (listas:read only satisfies the catalog dependency of prices:read)
  });

  it('guardar y aplicar registran eventos de biblioteca con el actor y NO escriben AuditLog histórico', async () => {
    const lib = dedicated(fake);
    const service = build(lib);
    const revision = await save(service, [['SKU-A', 100]]);
    const result = await service.applyRevision(revision.id, ctx);
    expect(result).toMatchObject({ status: 'APLICADA', appliedPrices: 1 });
    expect(lib.events.map((e) => e.action)).toEqual(['PRICE_IMPORT_SAVED', 'PRICE_IMPORT_APPLIED']);
    expect(lib.events[1]).toMatchObject({
      actor: { id: 'fixture-actor', name: 'Persona de prueba' }, entityType: 'PriceImportRevision', entityId: revision.id,
      summary: expect.objectContaining({ appliedPrices: 1, batchId: result.batchId }),
    });
    expect(fake.audit.log).not.toHaveBeenCalled();
    expect(fake.audit.logTx).not.toHaveBeenCalled();
    expect(fake.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
  });

  it('el evento de aplicación es atómico: si falla, no queda precio, historial ni reclamo de la revisión', async () => {
    const lib = dedicated(fake, { failEvent: 'PRICE_IMPORT_APPLIED' });
    const service = build(lib);
    const revision = await save(service, [['SKU-A', 100]]);
    await expect(service.applyRevision(revision.id, ctx)).rejects.toThrow('synthetic event failure');
    expect(String(fake.state.prices[0].value)).toBe('90');
    expect(fake.state.productChanges).toHaveLength(0);
    expect(fake.state.revisions[0].status).toBe('GUARDADA');
  });

  it('un fallo de serialización con la forma de OTRO runtime Prisma (sin instanceof) se reintenta', async () => {
    const lib = dedicated(fake);
    const service = build(lib);
    const revision = await save(service, [['SKU-A', 100]]);
    const foreign = Object.assign(new Error('write conflict'), { name: 'PrismaClientKnownRequestError', code: 'P2034' });
    const realTransaction = fake.prisma.$transaction.getMockImplementation()!;
    fake.prisma.$transaction.mockImplementationOnce(async () => { throw foreign; });
    fake.prisma.$transaction.mockImplementation(realTransaction);
    const result = await service.applyRevision(revision.id, ctx);
    expect(result).toMatchObject({ status: 'APLICADA', alreadyApplied: false });
    expect(fake.prisma.$transaction).toHaveBeenCalledTimes(3); // guardar + intento fallido + reintento
  });

  describe('congelación (LIBRARY_WRITES_FROZEN)', () => {
    it('guardar, descartar y aplicar se rechazan con 503 y no cambian datos ni eventos', async () => {
      const open = build(dedicated(fake));
      const revision = await save(open, [['SKU-A', 100]]);
      const frozen = dedicated(fake, { writesFrozen: true });
      const service = build(frozen);
      const before = { revisions: JSON.stringify(fake.state.revisions), prices: JSON.stringify(fake.state.prices), changes: fake.state.productChanges.length };
      await expect(save(service, [['SKU-A', 120]])).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LIBRARY_WRITES_FROZEN' }) });
      await expect(service.discardRevision(revision.id, ctx)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LIBRARY_WRITES_FROZEN' }) });
      await expect(service.applyRevision(revision.id, ctx)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LIBRARY_WRITES_FROZEN' }) });
      expect({ revisions: JSON.stringify(fake.state.revisions), prices: JSON.stringify(fake.state.prices), changes: fake.state.productChanges.length }).toEqual(before);
      expect(frozen.events).toHaveLength(0);
    });

    it('la vista previa sigue disponible y NO intenta escribir su evento', async () => {
      const frozen = dedicated(fake, { writesFrozen: true });
      const result = await build(frozen).preview(file([['SKU-A', 100]]), ctx);
      expect(result.summary.validRows).toBe(1);
      expect(frozen.appendMock).not.toHaveBeenCalled();
    });

    it('sin congelación la vista previa deja su evento de biblioteca', async () => {
      const lib = dedicated(fake);
      await build(lib).preview(file([['SKU-A', 100]]), ctx);
      expect(lib.events).toEqual([expect.objectContaining({ action: 'PRICE_IMPORT_PREVIEW', actor: { id: 'fixture-actor', name: 'Persona de prueba' } })]);
    });
  });

  it('en modo legacy no se crean eventos de biblioteca y se conserva el AuditLog histórico', async () => {
    const lib = dedicated(fake);
    (lib.library.config as any).mode = 'legacy';
    const service = build(lib);
    const revision = await save(service, [['SKU-A', 100]]);
    await service.applyRevision(revision.id, ctx);
    expect(lib.appendMock).not.toHaveBeenCalled();
    expect(fake.audit.logTx).toHaveBeenCalledWith(fake.prisma, expect.objectContaining({ action: 'price-import-apply' }));
  });
});
