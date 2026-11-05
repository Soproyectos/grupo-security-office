/**
 * CAT-06 (P4) — bandeja: vistas por estado, búsqueda, paginación e historial por producto.
 * Sin Listas: la concesión global products:read (exigida por el controlador) ve todos los productos;
 * el servicio no filtra por Lista ni consulta el ACL de Lista.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PublicationBoardService } from './validation/publication-board.service';

const ctx = { userId: 'u-1', roles: ['Super Admin'] }

function build(opts: { listaIds?: string[] | null } = {}) {
  const products = [
    {
      id: 'p-1', sku: 'SKU-1', name: 'Cámara Domo', catalogName: 'Domo 4K', lifecycleStatus: 'PUBLISHED',
      publishAt: null, scheduledRevisionId: null, publicRevisionId: 'rev-9', publishedAt: new Date('2026-10-17'),
      listaId: 'L-1', category: { name: 'Domos' },
    },
  ]
  const prisma = {
    product: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue(products),
    },
    productRevision: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'rev-9', productId: 'p-1', status: 'LISTA_PARA_PUBLICAR', rulesVersion: 'cat05-r2', validatedAt: new Date('2026-10-17T10:00:00Z'), issues: [{ severity: 'warning', code: 'docs.datasheet_missing' }, { severity: 'error', code: 'media.primary_image' }], version: 3 },
      ]),
    },
    publicationEvent: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([
        { id: 'ev-1', productId: 'p-1', revisionId: 'rev-9', action: 'PUBLISH', result: 'ok', actorId: 'u-1', issues: null, createdAt: new Date() },
      ]),
    },
    assignment: { findMany: jest.fn().mockResolvedValue([]) },
    lista: { findMany: jest.fn().mockResolvedValue([]) },
  }
  const acl = {
    isListasAdmin: jest.fn().mockReturnValue(opts.listaIds === null || opts.listaIds === undefined),
    getAllowedListaIds: jest.fn().mockResolvedValue(opts.listaIds === undefined ? null : opts.listaIds),
    assertProductAccess: jest.fn().mockResolvedValue({ listaId: 'L-1' }),
  }
  const service = new PublicationBoardService(prisma as never, acl as never)
  return { service, prisma, acl }
}

describe('PublicationBoardService', () => {
  it('rechaza vistas no reconocidas (400, no 404: es un error del cliente)', async () => {
    const { service } = build()
    await expect(service.board('secreta', ctx)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('publicados: filtra PUBLISHED con publicRevisionId y enriquece con la revisión de trabajo', async () => {
    const { service, prisma, acl } = build()
    const r = await service.board('publicados', ctx)
    expect(acl.getAllowedListaIds).not.toHaveBeenCalled()
    const where = prisma.product.findMany.mock.calls[0][0].where
    expect(where.lifecycleStatus).toBe('PUBLISHED')
    expect(where.publicRevisionId).toEqual({ not: null })
    const items = r.items as Array<Record<string, unknown>>
    expect(items[0]).toMatchObject({
      id: 'p-1',
      name: 'Domo 4K', // el nombre de ficha manda en la bandeja
      workingRevision: expect.objectContaining({ id: 'rev-9', errorCount: 1, warningCount: 1 }),
    })
  })

  it('pendientes: DRAFT sin oferta y sin informe CON_PROBLEMAS (los obsoletos también son pendientes)', async () => {
    const { service, prisma } = build()
    prisma.product.findMany.mockResolvedValue([
      { id: 'p-2', sku: 'S2', name: 'n2', catalogName: null, lifecycleStatus: 'DRAFT', publishAt: new Date('2026-11-01'), scheduledRevisionId: 'rev-x', publicRevisionId: null, publishedAt: null, listaId: 'L-1', category: { name: 'Domos' } },
    ])
    prisma.productRevision.findMany.mockResolvedValue([])
    const r = await service.board('pendientes', ctx)
    const where = prisma.product.findMany.mock.calls[0][0].where
    expect(where.lifecycleStatus).toBe('DRAFT')
    expect(where.publicRevisionId).toBeNull()
    expect(where.revisions).toEqual({ none: { status: 'CON_PROBLEMAS' } })
    const item = (r.items as Array<Record<string, unknown>>)[0]
    expect(item.name).toBe('n2')
    expect(item.workingRevision).toBeNull()
  })

  it('problemas: busca por revisión CON_PROBLEMAS en todos los productos (un lector global, sin filtro por Lista)', async () => {
    const { service, prisma, acl } = build({ listaIds: ['L-a'] })
    await service.board('problemas', { userId: 'v-1', roles: ['Vendedor'] })
    const where = prisma.product.findMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty('listaId')
    expect(where.revisions).toEqual({ some: { status: 'CON_PROBLEMAS' } })
    expect(acl.getAllowedListaIds).not.toHaveBeenCalled()
  })

  it('historial: eventos recientes con total de todos los productos (sin acotar por Lista, sin consultar productos)', async () => {
    const { service, prisma, acl } = build({ listaIds: [] })
    const r = await service.board('historial', { userId: 'v-1', roles: ['Vendedor'] })
    expect(r.total).toBe(2)
    const where = prisma.publicationEvent.findMany.mock.calls[0][0].where
    expect(where).toEqual({})
    expect(prisma.product.findMany).not.toHaveBeenCalled()
    expect(acl.getAllowedListaIds).not.toHaveBeenCalled()
  })

  it('productHistory: delega sin ACL de Lista (la concesión products:read la exige el controlador)', async () => {
    const { service, acl, prisma } = build()
    const rows = await service.productHistory('p-1', ctx)
    expect(rows).toHaveLength(1)
    expect(acl.assertProductAccess).not.toHaveBeenCalled()
    expect(prisma.publicationEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { productId: 'p-1' } }))
  })

  it('productHistory: sin identidad se niega', async () => {
    const { service } = build()
    await expect(service.productHistory('p-x', { userId: undefined, roles: [] } as never)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
