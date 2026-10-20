/**
 * CAT-05 `backend-api` — servicio de validación. Cubre: persistencia del
 * informe en la revisión de trabajo, 403 real con concesiones sin
 * `products:validate` (D5), obsolescencia tras editar, batch que respeta el
 * alcance por producto (`omitted` sin revelar) y no aborta el lote (`failed`),
 * topes de la selección y el límite duro de no escribir sobre PUBLICADA.
 */
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProductValidationService } from './validation.service';
import { ProductValidationController } from './validation.controller';
import { RULES_VERSION } from './validation-rules'

const ctx = { userId: 'u-1', roles: ['Admin Comercial'] }

const productRow = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  name: 'Cámara Domo 4K',
  catalogName: null,
  catalogBrand: null,
  brandId: 'b-1',
  catalogPublished: false,
  lifecycleStatus: 'DRAFT',
  listaId: null,
  category: { isActive: true, slug: 'domos' },
  images: [{ url: '/api/files/img-1', isPrimary: true }],
  catalogResources: [{ kind: 'DATASHEET', url: '/api/files/doc-1', requiresLicense: false }],
  stock: null,
  ...over,
})

const fullGrants = () => ({
  grantsForUser: jest.fn().mockResolvedValue([
    { sourceId: 's-r', actionId: 'products:read', scope: 'global' },
    { sourceId: 's-v', actionId: 'products:validate', scope: 'global' },
  ]),
});

function build(grants?: { grantsForUser: jest.Mock }, revisions?: { markPendingFromLive: jest.Mock }) {
  // ENMIENDA 2026-10-18: el harness por defecto otorga validate+read (camino estricto).
  grants = grants ?? fullGrants();
  const prisma = {
    product: { findUnique: jest.fn().mockResolvedValue(productRow()) },
    uploadedFile: { findMany: jest.fn().mockResolvedValue([{ id: 'img-1', detectedKind: 'IMAGE' }, { id: 'doc-1', detectedKind: 'PDF' }]) },
    lista: { findUnique: jest.fn() },
    price: { findMany: jest.fn().mockResolvedValue([]) },
    productRevision: {
      findFirst: jest.fn().mockResolvedValue({ id: 'rev-1' }),
      findUnique: jest.fn().mockResolvedValue({ status: 'REVISION_PENDIENTE' }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const acl = { assertProductAccess: jest.fn().mockResolvedValue({ listaId: null }) };
  const service = new ProductValidationService(
    prisma as never,
    acl as never,
    (grants as never) ?? undefined,
    (revisions as never) ?? undefined,
  );
  return { service, prisma, acl, grants, revisions };
}

const grantsOf = (actionIds: string[]) => ({
  grantsForUser: jest.fn().mockResolvedValue(
    actionIds.map((actionId, i) => ({ sourceId: `s${i}`, actionId, scope: 'global' })),
  ),
});

describe('ProductValidationService.validateOne', () => {
  it('sin borrador propio usa la revisión de trabajo y persiste el informe (status/issues/rulesVersion)', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(productRow({ images: [], catalogResources: [] }));

    const report = await service.validateOne('p-1', ctx);

    expect(report.revisionId).toBe('rev-1');
    expect(report.status).toBe('CON_PROBLEMAS'); // sin imagen principal → error
    expect(report.rulesVersion).toBe(RULES_VERSION);
    expect(report.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['media.primary_image', 'docs.datasheet_missing']),
    );
    expect(prisma.productRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rev-1' },
        data: expect.objectContaining({ rulesVersion: RULES_VERSION, status: 'CON_PROBLEMAS' }),
      }),
    );
  });

  it('producto sano (borrador, sin oferta pública): LISTA_PARA_PUBLICAR con el aviso del PDF si falta', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(productRow({ resources: undefined, catalogResources: [] }));

    const report = await service.validateOne('p-1', ctx);

    expect(report.status).toBe('LISTA_PARA_PUBLICAR');
    const datasheet = report.issues.find((i) => i.code === 'docs.datasheet_missing');
    expect(datasheet?.severity).toBe('warning'); // PDF ausente: aviso, nunca bloqueo
  });

  it('con concesiones sin products:validate → 403 y cero escrituras (D5)', async () => {
    const { service, prisma, acl } = build(grantsOf(['products:read']));
    prisma.product.findUnique.mockResolvedValue(productRow());

    await expect(service.validateOne('p-1', ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(acl.assertProductAccess).not.toHaveBeenCalled();
    expect(prisma.productRevision.update).not.toHaveBeenCalled();
  });

  it('producto inexistente → 404', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.validateOne('nope', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin borrador crea la revisión de trabajo con markPendingFromLive (mecanismo CAT-02)', async () => {
    const revisions = { markPendingFromLive: jest.fn().mockResolvedValue({ id: 'rev-new' }) };
    const { service, prisma } = build(undefined, revisions);
    prisma.product.findUnique.mockResolvedValue(productRow());
    prisma.productRevision.findFirst
      .mockResolvedValueOnce(null) // sin draft vigente
      .mockResolvedValueOnce({ id: 'rev-new' });

    const report = await service.validateOne('p-1', ctx);

    expect(revisions.markPendingFromLive).toHaveBeenCalledWith('p-1');
    expect(report.revisionId).toBe('rev-new');
  });

  it('ENMIENDA 2026-10-18: sin concesiones un rol normal no valida (403 antes de leer); Super Admin si (excepcion)', async () => {
    const { service, prisma } = build(grantsOf([]));
    prisma.product.findUnique.mockResolvedValue(productRow());
    await expect(service.validateOne('p-1', ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
    await expect(service.validateOne('p-1', { userId: 'u-1', roles: ['Super Admin'] })).resolves.toMatchObject({ status: 'LISTA_PARA_PUBLICAR' });
  });

  it('ENMIENDA: revocar la ultima concesion con el mismo JWT deniega la siguiente llamada', async () => {
    const g = fullGrants();
    const { service, prisma } = build(g);
    prisma.product.findUnique.mockResolvedValue(productRow());
    await service.validateOne('p-1', ctx); // permitido por concesion explicita
    g.grantsForUser.mockResolvedValue([]);
    await expect(service.validateOne('p-1', ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('jamás escribe sobre la revisión PUBLICADA (límite duro)', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());
    prisma.productRevision.findFirst.mockResolvedValue({ id: 'rev-pub' });
    prisma.productRevision.findUnique.mockResolvedValue({ status: 'PUBLICADA' });

    await service.validateOne('p-1', ctx);

    expect(prisma.productRevision.update).not.toHaveBeenCalled();
  });
});

describe('ProductValidationService.reportOf (V2: obsoleto tras editar)', () => {
  it('informe vigente sobre la revisión de trabajo actual → stale:false', async () => {
    const { service, prisma } = build();
    prisma.productRevision.findFirst
      .mockResolvedValueOnce({
        id: 'rev-1',
        status: 'CON_PROBLEMAS',
        rulesVersion: RULES_VERSION,
        issues: [{ code: 'media.primary_image', severity: 'error', section: 'multimedia', message: 'x', fix: 'y' }],
        validatedAt: new Date('2026-10-17T10:00:00Z'),
      })
      .mockResolvedValueOnce({ id: 'rev-1' });

    const report = await service.reportOf('p-1', ctx);
    expect(report).toMatchObject({ stale: false, status: 'CON_PROBLEMAS' });
  });

  it('informe antiguo (la revisión de trabajo cambió tras editar) → stale:true', async () => {
    const { service, prisma } = build();
    prisma.productRevision.findFirst
      .mockResolvedValueOnce({
        id: 'rev-vieja',
        status: 'LISTA_PARA_PUBLICAR',
        rulesVersion: RULES_VERSION,
        issues: [],
        validatedAt: new Date('2026-10-17T10:00:00Z'),
      })
      .mockResolvedValueOnce({ id: 'rev-nueva-pendiente' });

    const report = await service.reportOf('p-1', ctx);
    expect(report?.stale).toBe(true);
  });

  it('nunca validado → null', async () => {
    const { service, prisma } = build();
    prisma.productRevision.findFirst.mockResolvedValue(null);
    expect(await service.reportOf('p-1', ctx)).toBeNull();
  });

  it('rulesVersion antigua cuenta como obsoleto (cambiar una regla marca pendientes)', async () => {
    const { service, prisma } = build();
    prisma.productRevision.findFirst
      .mockResolvedValueOnce({ id: 'rev-1', status: 'LISTA_PARA_PUBLICAR', rulesVersion: 'cat05-r0', issues: [], validatedAt: new Date() })
      .mockResolvedValueOnce({ id: 'rev-1' });
    expect((await service.reportOf('p-1', ctx))?.stale).toBe(true);
  });
});

describe('ProductValidationService.validateBatch', () => {
  it('respetos: omitido sin revelar fuera de alcance; un fallo no aborta el lote', async () => {
    const { service, prisma } = build();
    // Per product the service looks it up twice: scope check (assertView) and assembly.
    const lookups: Record<string, number> = {};
    prisma.product.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      lookups[where.id] = (lookups[where.id] ?? 0) + 1;
      if (lookups[where.id] === 1) return where.id === 'B' ? null : { id: where.id, listaId: null }; // B: out of scope, nothing revealed
      return where.id === 'C' ? null : productRow(); // C: in scope but assembly fails
    });
    prisma.productRevision.findFirst.mockResolvedValue({ id: 'rev-x' });

    const r = await service.validateBatch(['A', 'B', 'C'], ctx);

    expect(r.examined).toBe(3);
    expect(r.omitted).toBe(1); // B — sin datos revelados
    expect(r.valid).toBe(1); // A sano
    expect(r.failed).toBe(1); // C
    expect(r.results.find((x) => x.productId === 'B')).toMatchObject({ outcome: 'omitted' });
    expect(r.results.find((x) => x.productId === 'C')).toMatchObject({ outcome: 'failed' });
  });

  it('rechaza selección vacía y sobre el tope de 200 con 400', async () => {
    const { service } = build();
    await expect(service.validateBatch([], ctx)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.validateBatch(Array.from({ length: 201 }, (_, i) => `p-${i}`), ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('403 sin products:validate cuando hay concesiones', async () => {
    const { service } = build(grantsOf(['products:read']));
    await expect(service.validateBatch(['p-1'], ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ProductValidationController (delegación y contexto)', () => {
  it('usa sub como identidad y delega en el servicio', async () => {
    const validation = {
      validateOne: jest.fn().mockResolvedValue({ ok: 1 }),
      validateBatch: jest.fn().mockResolvedValue({ ok: 2 }),
      reportOf: jest.fn().mockResolvedValue(null),
    };
    const board = { productHistory: jest.fn().mockResolvedValue([{ action: 'PUBLISH', result: 'ok' }]) };
    const controller = new ProductValidationController(validation as never, board as never);
    const user = { sub: 'u-9', roles: ['Supervisor'] };

    await controller.validate('p-1', user);
    await controller.batch({ productIds: ['p-1'] }, user);
    await controller.report('p-1', user);

    expect(validation.validateOne).toHaveBeenCalledWith('p-1', { userId: 'u-9', roles: ['Supervisor'] });
    expect(validation.validateBatch).toHaveBeenCalledWith(['p-1'], { userId: 'u-9', roles: ['Supervisor'] });
    await controller.history('p-1', user);
    expect(board.productHistory).toHaveBeenCalledWith('p-1', { userId: 'u-9', roles: ['Supervisor'] });
    expect(validation.reportOf).toHaveBeenCalledWith('p-1', { userId: 'u-9', roles: ['Supervisor'] });
  });
});
