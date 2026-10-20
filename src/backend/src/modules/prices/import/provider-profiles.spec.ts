/**
 * IMP-07B (07B) backend — perfiles de proveedor: permisos por acción, CRUD,
 * equivalencias, reconocimiento por encabezado y resolución de referencias.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PriceImportService } from './price-import.service';

const grantsFor = (actions: string[]) => ({
  grantsForUser: jest.fn().mockResolvedValue(actions.map((actionId, i) => ({ sourceId: `s${i}`, actionId, scope: 'global' }))),
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 'prof-1', providerName: 'Hikvision', sheet: 'PRECIOS', headerRow: 1,
  thousandsSeparator: '.', decimalSeparator: ',', currency: 'COP',
  tariffs: ['ORO_IVA'], expectedColumns: ['REFERENCIA', 'ORO_IVA'], version: 1,
  createdAt: new Date('2026-10-17T10:00:00Z'), updatedAt: new Date('2026-10-17T10:00:00Z'),
  equivalences: [], ...over,
});

const input = {
  providerName: 'Hikvision', sheet: 'PRECIOS', headerRow: 1,
  thousandsSeparator: '.', decimalSeparator: ',', currency: 'COP',
  tariffs: ['ORO_IVA'], expectedColumns: ['REFERENCIA', 'ORO_IVA'],
};

const READ = ['providers:read'];
const WRITE = ['providers:write', 'providers:read'];
const ctx = { userId: 'u-1', roles: ['Supervisor'] };

function build(grantsRows: string[]) {
  const prisma: any = {
    providerProfile: {
      findMany: jest.fn().mockResolvedValue([row()]),
      findUnique: jest.fn().mockResolvedValue(row()),
      create: jest.fn().mockResolvedValue(row()),
      update: jest.fn().mockResolvedValue(row()),
      delete: jest.fn().mockResolvedValue(row()),
    },
    providerEquivalence: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    product: { findMany: jest.fn().mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111' }]) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const audit: any = { log: jest.fn().mockResolvedValue({}) };
  const acl: any = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(false) };
  const service = new PriceImportService(prisma, acl, audit, grantsFor(grantsRows) as any);
  return { service, prisma, audit };
}

describe('IMP-07B — permisos por acción (providers:read / providers:write)', () => {
  it('sin providers:read, listar perfiles → 403', async () => {
    const { service } = build(['listas:read']);
    await expect(service.listProviderProfiles(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('con providers:read se listan; sin providers:write no se crea', async () => {
    const read = build(READ);
    await expect(read.service.listProviderProfiles(ctx)).resolves.toHaveLength(1);

    const readOnly = build(READ);
    await expect(readOnly.service.createProviderProfile(input, ctx)).rejects.toThrow(ForbiddenException);
  });
});

describe('IMP-07B — CRUD de perfiles', () => {
  it('crear: valida, audita y devuelve la vista', async () => {
    const { service, prisma, audit } = build(WRITE);
    prisma.providerProfile.findUnique.mockResolvedValue(null); // no existe todavía
    const view = await service.createProviderProfile(input, ctx);
    expect(view).toMatchObject({ id: 'prof-1', providerName: 'Hikvision', version: 1 });
    expect(prisma.providerProfile.create).toHaveBeenCalled();
    expect(audit.log.mock.calls[0][0]).toMatchObject({ action: 'provider-profile-create', entity: 'PROVIDER_PROFILE' });
  });

  it('crear con proveedor ya existente → 409 (no duplica)', async () => {
    const { service, prisma } = build(WRITE);
    prisma.providerProfile.findUnique.mockResolvedValue(row());
    await expect(service.createProviderProfile(input, ctx)).rejects.toThrow(ConflictException);
    expect(prisma.providerProfile.create).not.toHaveBeenCalled();
  });

  it('crear con tarifa desconocida → 400 sin tocar la BD', async () => {
    const { service, prisma } = build(WRITE);
    await expect(service.createProviderProfile({ ...input, tariffs: ['FANTASMA_IVA'] }, ctx)).rejects.toThrow(BadRequestException);
    expect(prisma.providerProfile.create).not.toHaveBeenCalled();
  });

  it('un cambio de estructura sube la versión; sin cambios NO', async () => {
    const changed = build(WRITE);
    await changed.service.updateProviderProfile('prof-1', { ...input, headerRow: 3 }, ctx);
    const changedData = changed.prisma.providerProfile.update.mock.calls[0][0].data;
    expect(changedData.version).toBe(2);

    const same = build(WRITE);
    same.prisma.providerProfile.findUnique.mockResolvedValue(row({ tariffs: ['ORO_IVA'] }));
    await same.service.updateProviderProfile('prof-1', input, ctx);
    const sameData = same.prisma.providerProfile.update.mock.calls[0][0].data;
    expect(sameData.version).toBe(1);
  });

  it('eliminar un perfil inexistente → 404', async () => {
    const { service, prisma } = build(WRITE);
    prisma.providerProfile.findUnique.mockResolvedValue(null);
    await expect(service.deleteProviderProfile('nope', ctx)).rejects.toThrow(NotFoundException);
  });
});

describe('IMP-07B — equivalencias', () => {
  it('reemplaza equivalencias y valida que el producto exista', async () => {
    const { service, prisma } = build(WRITE);
    prisma.providerProfile.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({
      equivalences: [{ externalRef: 'DS-2CD', productId: '11111111-1111-4111-8111-111111111111' }],
    }));
    const view = await service.setProviderEquivalences(
      'prof-1',
      [{ externalRef: 'DS-2CD', productId: '11111111-1111-4111-8111-111111111111' }],
      ctx,
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(view.equivalences).toEqual([{ externalRef: 'DS-2CD', productId: '11111111-1111-4111-8111-111111111111' }]);
  });

  it('producto inexistente → 400 sin escribir', async () => {
    const { service, prisma } = build(WRITE);
    prisma.product.findMany.mockResolvedValue([]);
    await expect(
      service.setProviderEquivalences('prof-1', [{ externalRef: 'X', productId: '22222222-2222-4222-8222-222222222222' }], ctx),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('referencia externa repetida → 400', async () => {
    const { service } = build(WRITE);
    await expect(
      service.setProviderEquivalences(
        'prof-1',
        [
          { externalRef: 'X', productId: '11111111-1111-4111-8111-111111111111' },
          { externalRef: 'X', productId: '11111111-1111-4111-8111-111111111111' },
        ],
        ctx,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('IMP-07B — reconocimiento y resolución (casos 1 y 2)', () => {
  it('proveedor desconocido → requiresReview (no hay mapeo guardado)', async () => {
    const { service, prisma } = build(READ);
    prisma.providerProfile.findUnique.mockResolvedValue(null);
    const view = await service.recognizeProviderProfile({ providerName: 'Nuevo', headers: ['REFERENCIA'] }, ctx);
    expect(view).toMatchObject({ found: false, requiresReview: true });
  });

  it('mismo proveedor repetido NO pide mapear de nuevo (caso 1)', async () => {
    const { service } = build(READ);
    const view = await service.recognizeProviderProfile({ providerName: 'Hikvision', headers: ['REFERENCIA', 'ORO_IVA'] }, ctx);
    expect(view).toMatchObject({ found: true, profileId: 'prof-1', matches: true, requiresReview: false, version: 1 });
  });

  it('encabezado cambiado exige revisar el perfil (caso 2)', async () => {
    const { service } = build(READ);
    const view = await service.recognizeProviderProfile({ providerName: 'Hikvision', headers: ['REFERENCIA', 'ORO_DPP'] }, ctx);
    expect(view).toMatchObject({ matches: false, requiresReview: true });
  });

  it('resolver referencias: conocida → producto, desconocida → pendiente (caso 2)', async () => {
    const { service, prisma } = build(READ);
    prisma.providerProfile.findUnique.mockResolvedValue(row({ equivalences: [{ externalRef: 'DS-2CD', productId: 'p-1' }] }));
    const { resolution } = await service.resolveProviderReferences('prof-1', ['DS-2CD', 'OTRA'], ctx);
    expect(resolution).toEqual([
      { externalRef: 'DS-2CD', productId: 'p-1', status: 'resolved' },
      { externalRef: 'OTRA', productId: null, status: 'pending' },
    ]);
  });
});
