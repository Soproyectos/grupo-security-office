/**
 * CAT-06 `backend` — publicación de la revisión EXACTA y bandeja.
 * Cubre los tres casos de la ficha:
 *  1. programar congela una revisión y el scheduler publica ESA, no el borrador
 *     posterior (y al vencer re-ejecuta el motor);
 *  2. revisión/precio/regla cambiados antes de publicar → nueva comprobación
 *     (409 `publication-not-ready` con cero escritura);
 *  3. un fallo no deja mezcla (transacción revisión+producto) y el editor sin
 *     `products:publish` no publica (D5).
 */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ProductsService } from './products.service';

const ctxAdmin = { userId: 'u-1', roles: ['Super Admin'] };
const ctxComercial = { userId: 'u-2', roles: ['Admin Comercial'] };

const productRow = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  sku: 'SKU-1',
  name: 'Cámara Domo',
  catalogName: null,
  brandId: 'b-1',
  categoryId: 'c-1',
  // Con Lista para que el checklist comercial legacy pase (la prueba del motor
  // se ejerce aparte, sobre el estado que el mock de validación declare).
  listaId: 'L-1',
  lifecycleStatus: 'DRAFT',
  isActive: true,
  isVisible: false,
  publishStatus: null,
  publishAt: null,
  publishedAt: null,
  publicRevisionId: null,
  scheduledRevisionId: null,
  catalogPublished: false,
  ...over,
})

const okReport = { report: { revisionId: 'rev-9', status: 'LISTA_PARA_PUBLICAR' as const, issues: [] }, result: { status: 'LISTA_PARA_PUBLICAR' as const, issues: [] } }
const blockedReport = {
  report: {
    revisionId: 'rev-9',
    status: 'CON_PROBLEMAS' as const,
    issues: [
      { code: 'media.primary_image', severity: 'error', section: 'multimedia', message: 'No hay imagen principal.', fix: 'Sube una imagen.' },
      { code: 'docs.datasheet_missing', severity: 'warning', section: 'documentos', message: 'Sin PDF.', fix: 'Añade PDF.' },
    ],
  },
  result: { status: 'CON_PROBLEMAS' as const },
}

function build(opts: {
  product?: Record<string, unknown>;
  validation?: { runFresh: jest.Mock };
  revisions?: { markPendingFromLive: jest.Mock };
  grants?: { grantsForUser: jest.Mock };
} = {}) {
  const product = productRow(opts.product)
  const tx = {
    productRevision: { update: jest.fn().mockResolvedValue({}) },
    product: { update: jest.fn().mockResolvedValue(product) },
    productChange: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(product),
      findMany: jest.fn().mockResolvedValue([{ id: 'p-1', sku: product.sku, name: product.name }]),
      update: jest.fn().mockResolvedValue(product),
    },
    productRevision: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'rev-new' }),
    },
    publicationEvent: { create: jest.fn().mockResolvedValue({}) },
    lista: { findUnique: jest.fn().mockResolvedValue({ id: 'L-1', isActive: true, archivedAt: null, deletionStatus: null }) },
    price: { count: jest.fn().mockResolvedValue(1) },
    productImage: { count: jest.fn().mockResolvedValue(1) },
    stock: { findUnique: jest.fn().mockResolvedValue(null) },
    productChange: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const acl = {
    isListasAdmin: jest.fn().mockReturnValue(true),
    assertProductAccess: jest.fn().mockResolvedValue({ listaId: 'L-1' }),
    assertListaAccess: jest.fn().mockResolvedValue(undefined),
    getAllowedListaIds: jest.fn().mockResolvedValue(null),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const files = { store: jest.fn(), release: jest.fn().mockResolvedValue({ deleted: true }), deleteByUrl: jest.fn(), setVisibilityByUrl: jest.fn() };
  const validation = opts.validation ?? { runFresh: jest.fn().mockResolvedValue(okReport) };
  const revisions = opts.revisions ?? { markPendingFromLive: jest.fn().mockResolvedValue({ id: 'rev-9' }) };
  const service = new ProductsService(
    prisma as never,
    acl as never,
    audit as never,
    files as never,
    revisions as never,
    (opts.grants as never) ?? undefined,
    validation as never,
  );
  const events = () => prisma.publicationEvent.create.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data)
  return { service, prisma, tx, acl, audit, validation, revisions, events }
}

describe('CAT-06 P1/P2: publicar pinea la revisión exacta y re-valida con el motor', () => {
  it('PUBLISH válido: UNA transacción marca la revisión PUBLICADA y pinea publicRevisionId', async () => {
    const { service, prisma, tx, validation, events } = build()
    prisma.productRevision.findFirst.mockResolvedValue({ id: 'rev-9' })

    await service.transition('p-1', { event: 'PUBLISH' }, ctxAdmin)

    expect(validation.runFresh).toHaveBeenCalledWith('p-1')
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.productRevision.update).toHaveBeenCalledWith({
      where: { id: 'rev-9' },
      data: expect.objectContaining({ status: 'PUBLICADA' }),
    })
    expect(tx.product.update.mock.calls[0][0].data).toMatchObject({
      lifecycleStatus: 'PUBLISHED',
      publicRevisionId: 'rev-9',
      scheduledRevisionId: null,
    })
    expect(events()).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'PUBLISH', result: 'ok', revisionId: 'rev-9', actorId: 'u-1' })]),
    )
  })

  it('caso 2: resultado bloqueante → 409 publication-not-ready con feedback y CERO escritura', async () => {
    const { service, prisma, tx, events } = build({ validation: { runFresh: jest.fn().mockResolvedValue(blockedReport) } })

    let thrown: ConflictException | undefined
    try {
      await service.transition('p-1', { event: 'PUBLISH' }, ctxAdmin)
    } catch (e) {
      thrown = e as ConflictException
    }
    expect(thrown).toBeInstanceOf(ConflictException)
    const res = thrown!.getResponse() as Record<string, unknown>
    expect(res.code).toBe('publication-not-ready')
    expect((res.feedback as string[]).join(' ')).toContain('media.primary_image')
    // ni transacción ni updates — y el bloqueo SÍ queda en historia
    expect(tx.product.update).not.toHaveBeenCalled()
    expect(prisma.product.update).not.toHaveBeenCalled()
    expect(events()).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'PUBLISH', result: 'blocked', revisionId: 'rev-9' })]),
    )
  })

  it('caso 3 (editor sin publicar): con concesiones sin products:publish → 403 ANTES de tocar nada (D5)', async () => {
    const grants = { grantsForUser: jest.fn().mockResolvedValue([{ sourceId: 's1', actionId: 'products:read', scope: 'global' }]) }
    const { service, prisma, validation } = build({ grants })

    await expect(service.transition('p-1', { event: 'PUBLISH' }, ctxComercial)).rejects.toBeInstanceOf(ForbiddenException)
    expect(validation.runFresh).not.toHaveBeenCalled()
    expect(prisma.product.update).not.toHaveBeenCalled()
  })

  it('UNPUBLISH despinea (T1): publicRevisionId := null; la revisión publicada queda como historia', async () => {
    const { service, tx, events } = build({ product: { lifecycleStatus: 'PUBLISHED', publicRevisionId: 'rev-old', isActive: true, isVisible: true } })

    await service.transition('p-1', { event: 'UNPUBLISH', reason: 'retirada temporal' }, ctxAdmin)

    expect(tx.product.update.mock.calls[0][0].data).toMatchObject({
      lifecycleStatus: 'DRAFT',
      publicRevisionId: null,
      scheduledRevisionId: null,
    })
    expect(events()).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'UNPUBLISH', result: 'ok', revisionId: 'rev-old' })]),
    )
  })

  it('caso 1: el disparo de una programación publica la revisión CONGELADA, no el borrador posterior', async () => {
    const { service, prisma, tx, events } = build({
      product: { lifecycleStatus: 'DRAFT', scheduledRevisionId: 'rev-frozen', publishAt: new Date('2020-01-01') },
    })
    prisma.productRevision.findUnique.mockResolvedValue({ id: 'rev-frozen', productId: 'p-1' })

    const report = await service.processScheduledPublishes()

    expect(report.publishOk).toBe(1)
    expect(prisma.productRevision.findUnique).toHaveBeenCalledWith({ where: { id: 'rev-frozen' }, select: { id: true, productId: true } })
    expect(tx.productRevision.update).toHaveBeenCalledWith({ where: { id: 'rev-frozen' }, data: expect.objectContaining({ status: 'PUBLICADA' }) })
    expect(tx.product.update.mock.calls[0][0].data).toMatchObject({ publicRevisionId: 'rev-frozen', scheduledRevisionId: null })
    // el disparo se registra como SCHEDULE_PUBLISHED con actor null (scheduler)
    expect(events()).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'SCHEDULE_PUBLISHED', result: 'ok', actorId: null })]),
    )
  })

  it('caso 1 con congelada ya inexistente: fallback defensivo a la revisión de trabajo (nunca pinea null a ciegas)', async () => {
    const { service, prisma, tx } = build({
      product: { lifecycleStatus: 'DRAFT', scheduledRevisionId: 'rev-gone', publishAt: new Date('2020-01-01') },
      revisions: { markPendingFromLive: jest.fn().mockResolvedValue({ id: 'rev-live' }) },
    })
    prisma.productRevision.findUnique.mockResolvedValue(null)
    prisma.productRevision.findFirst.mockResolvedValue(null)

    const report = await service.processScheduledPublishes()

    expect(report.publishOk).toBe(1)
    expect(tx.productRevision.update).toHaveBeenCalledWith({ where: { id: 'rev-live' }, data: expect.objectContaining({ status: 'PUBLICADA' }) })
    expect(tx.product.update.mock.calls[0][0].data).toMatchObject({ publicRevisionId: 'rev-live' })
  })

  it('SCHEDULE_BLOCKED: si al vencer la validación bloquea, NO se publica y queda registrado (no falla en silencio)', async () => {
    const { service, tx, events } = build({
      product: { lifecycleStatus: 'DRAFT', publishAt: new Date('2020-01-01'), scheduledRevisionId: 'rev-1' },
      validation: { runFresh: jest.fn().mockResolvedValue(blockedReport) },
    })

    const report = await service.processScheduledPublishes()

    expect(report.publishOk).toBe(0)
    expect(report.publishFailed).toHaveLength(1)
    expect(tx.product.update).not.toHaveBeenCalled()
    expect(events()).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'SCHEDULE_BLOCKED', result: 'blocked', actorId: null })]),
    )
  })
})

describe('CAT-06 T3: programar exige validación vigente y congela la revisión', () => {
  it('schedulePublication con motor OK: persiste publishAt + scheduledRevisionId y registra SCHEDULE', async () => {
    const { service, prisma, tx, validation, events } = build({ product: { lifecycleStatus: 'DRAFT' } })
    prisma.productRevision.findFirst.mockResolvedValue({ id: 'rev-work' })

    await service.schedulePublication('p-1', { publishAt: new Date(Date.now() + 86400000).toISOString() }, ctxAdmin)

    expect(validation.runFresh).toHaveBeenCalled()
    expect(tx.product.update.mock.calls[0][0].data).toMatchObject({ scheduledRevisionId: 'rev-work' })
    expect(events()).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'SCHEDULE', result: 'ok', revisionId: 'rev-work', actorId: 'u-1' })]))
  })

  it('schedulePublication bloqueado: 409 y no se programa (ni publishAt ni pin)', async () => {
    const { service, prisma } = build({
      product: { lifecycleStatus: 'DRAFT' },
      validation: { runFresh: jest.fn().mockResolvedValue(blockedReport) },
    })

    await expect(
      service.schedulePublication('p-1', { publishAt: new Date(Date.now() + 86400000).toISOString() }, ctxAdmin),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.product.update).not.toHaveBeenCalled()
  })

  it('legacy publish(publishAt futuro) usa el MISMO servicio: gate + congelado', async () => {
    const { service, prisma, tx, validation } = build({ product: { lifecycleStatus: 'DRAFT' } })
    prisma.productRevision.findFirst.mockResolvedValue({ id: 'rev-fut' })

    await service.publish('p-1', { publishAt: new Date(Date.now() + 86400000).toISOString() }, ctxAdmin)

    expect(validation.runFresh).toHaveBeenCalled()
    expect(tx.product.update.mock.calls[0][0].data).toMatchObject({ lifecycleStatus: 'DRAFT', scheduledRevisionId: 'rev-fut' })
  })
})
