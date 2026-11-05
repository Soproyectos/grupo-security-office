import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth.store'
import type { LifecycleEvent, Product } from '../features/products/types/product.types'
import { visibleDetailTabs } from '../features/products/lib/product-detail-access'
import { PublishTab } from './ProductDetailPage'

const product = { id: 'p1', lifecycleStatus: 'DRAFT' } as Product
const allowed: LifecycleEvent[] = ['PUBLISH', 'UNPUBLISH', 'ARCHIVE', 'RESTORE']

function renderPublishTab(canPublish: boolean, canWrite: boolean) {
  return renderToStaticMarkup(
    <PublishTab
      product={product}
      allowed={allowed}
      canPublish={canPublish}
      canWrite={canWrite}
      pending={false}
      error={null}
      onDirect={() => undefined}
      onOpenAction={() => undefined}
      onDelete={() => undefined}
      scheduleActive={false}
      scheduledAt={null}
      onSchedule={() => undefined}
      onReprogram={() => undefined}
      onCancelSchedule={() => undefined}
    />,
  )
}

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null })
})

describe('permisos de detalle de Biblioteca', () => {
  it('la consulta es solo lectura incluso con permisos de actualización o publicación', () => {
    useAuthStore.getState().login({
      id: 'u1', email: 'u@example.invalid', name: 'Super Admin', roles: ['Super Admin'],
      permissions: ['products:write', 'products:delete', 'products:publish', 'prices:write', 'products:notes', 'audit:read'],
    })
    expect(visibleDetailTabs({ mode: 'read', canReadPrices: true }).map(({ id }) => id))
      .toEqual(['ficha', 'prices'])
    const html = renderPublishTab(false, false)
    expect(html).not.toContain('Publicar')
    expect(html).not.toContain('Archivar')
    expect(html).not.toContain('Restaurar')
    expect(html).not.toContain('Eliminar')
    expect(visibleDetailTabs({ mode: 'read', canReadPrices: false }).map(({ id }) => id)).toEqual(['ficha'])
  })

  it('el modo publicación muestra ficha y publicación, sin archivo, borrado ni auditoría', () => {
    useAuthStore.getState().login({ id: 'u1', email: 'u@example.invalid', name: 'Operador', roles: ['Operador'], permissions: ['products:publish'] })
    expect(visibleDetailTabs({ mode: 'publication', canReadPrices: true }).map(({ id }) => id))
      .toEqual(['ficha', 'publish'])

    const html = renderPublishTab(true, false)
    expect(html).toContain('Publicar')
    expect(html).toContain('Programar publicación')
    expect(html).not.toContain('Archivar')
    expect(html).not.toContain('Restaurar')
    expect(html).not.toContain('Eliminar')
  })

  it('ninguno de los modos de detalle expone auditoría ni stock', () => {
    for (const mode of ['read', 'publication'] as const) {
      const ids = visibleDetailTabs({ mode, canReadPrices: true }).map(({ id }) => id)
      expect(ids).not.toContain('audit')
      expect(ids).not.toContain('stock')
    }
  })
})
