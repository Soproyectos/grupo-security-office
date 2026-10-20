/**
 * CAT-06 (P4) — bandeja: vistas por estado, alcance por Lista (mismo criterio
 * ACL del catálogo), búsqueda, paginación e historial por producto.
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
        { id: 'rev-9', productId: 'p-1', status: 'LISTA_PARA_PUBLICAR', rulesVersion: 'cat05-r1', validatedAt: new Date('2026-10-17T10:00:00Z'), issues: [{ severity: 'warning', code: 'docs.datasheet_missing' }, { severity: 'error', code: 'media.primary_image' }], version: 3 },
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
    expect(acl.getAllowedListaIds).toHaveBeenCalledWith('u-1', ['Super Admin'], 'view')
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

  it('problemas: busca por revisión CON_PROBLEMAS dentro del alcance', async () => {
    const { service, prisma, acl } = build({ listaIds: ['L-a'] })
    acl.isListasAdmin.mockReturnValue(false)
    await service.board('problemas', { userId: 'v-1', roles: ['Vendedor'] })
    const where = prisma.product.findMany.mock.calls[0][0].where
    expect(where.listaId).toEqual({ in: ['L-a'] })
    expect(where.revisions).toEqual({ some: { status: 'CON_PROBLEMAS' } })
  })

  it('historial: eventos recientes con total; no-admin solo ve productos de sus listas', async () => {
    const { service, prisma, acl } = build({ listaIds: [] })
    acl.isListasAdmin.mockReturnValue(false)
    const r = await service.board('historial', { userId: 'v-1', roles: ['Vendedor'] })
    expect(r.total).toBe(2)
    // sin listas visibles → no consulta eventos de productos ajenos
    const where = prisma.publicationEvent.findMany.mock.calls[0][0].where
    expect(where.productId).toEqual({ in: [] })
  })

  it('productHistory: exige ACL de lectura del producto y delega', async () => {
    const { service, acl } = build()
    await service.productHistory('p-1', ctx)
    expect(acl.assertProductAccess).toHaveBeenCalledWith('p-1', ctx, 'view')
  })

  it('productHistory: lo que el ACL niega, la bandeja no lo revela (404 del legado)', async () => {
    const { service, acl } = build()
    acl.assertProductAccess.mockRejectedValue(new ForbiddenException())
    await expect(service.productHistory('p-x', { userId: 'v-1', roles: ['Vendedor'] })).rejects.toBeInstanceOf(ForbiddenException)
  })
})
