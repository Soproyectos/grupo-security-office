import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { get, post, patch, delete: del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
}))
vi.mock('../../services/api', () => ({ default: { get, post, patch, delete: del } }))

import PromotionManagerPage from './PromotionManagerPage'
import { useAuthStore } from '../../stores/auth.store'
import type { ManagedPromotion } from './promotions.service'

/**
 * COM-08 frontend — PromotionManagerPage (borrador vs publicado).
 *
 * ✅ A2 (cliente): crear prepara («Preparar aviso» → borrador), el borrador se
 *    etiqueta «Borrador» y ofrece «Publicar aviso» (acción explícita separada);
 *    publicado ofrece «Retirar»; los 403/409 del servidor se pintan (lógica de
 *    error ya presente — aquí acreditamos etiquetas y separación de acciones).
 * ✅ A1 (cliente): la lista pinta SOLO las filas que trae la API (sin vencidos
 *    ni ajenos inventados).
 * ✅ A3 (cliente): la página no importa storefront/slider ni precios.
 */

const SUPERVISOR = {
  id: 'sup-1', email: 'sup@example.invalid', name: 'Sup', roles: ['Supervisor'], permissions: [],
}

const MANAGE_KEY = ['promotions', 'manage', SUPERVISOR.id]

const DRAFT: ManagedPromotion = {
  id: 'p-draft', title: 'Aviso borrador COM08', message: 'Preparando el aviso.',
  startsAt: '2026-10-01T12:00:00Z', endsAt: '2026-10-25T12:00:00Z',
  isActive: true, audience: 'TEAM', publishedAt: null,
}
const PUBLISHED: ManagedPromotion = {
  id: 'p-live', title: 'Aviso publicado COM08', message: 'Ya visible.',
  startsAt: '2026-10-01T12:00:00Z', endsAt: '2026-10-25T12:00:00Z',
  isActive: true, audience: 'TEAM', publishedAt: '2026-10-02T10:00:00Z',
}
// La API jamás trae vencidos de OTRO equipo en `current`; en `manage` el editor
// solo ve los suyos: asertamos que la página no inventa filas ausentes.
const PAYLOAD = [DRAFT, PUBLISHED]

function render(actions: string[] = ['read', 'create', 'edit', 'publish', 'withdraw']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(MANAGE_KEY, PAYLOAD)
  client.setQueryData(['user-access', SUPERVISOR.id], {
    catalogVersion: 'panels-20261019-3', accessVersion: 1, sources: [], packages: [],
    grants: actions.map(action => ({
      sourceId: 'test-source', actionId: `commercialPromotions:${action}`, scope: 'team',
    })),
  })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PromotionManagerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PromotionManagerPage (COM-08)', () => {
  beforeEach(() => {
    get.mockReset(); post.mockReset(); patch.mockReset(); del.mockReset()
    const session = { isAuthenticated: true, user: SUPERVISOR }
    useAuthStore.setState(session as never)
    Object.assign(useAuthStore.getInitialState(), session)
    get.mockResolvedValue({ data: SUPERVISOR })
  })

  it('A2: el formulario prepara («Preparar aviso»), no promete publicar al crear', () => {
    const html = render()
    expect(html).toContain('Preparar aviso (borrador)')
    expect(html).toContain('Guardar borrador')
    // La etiqueta vieja que prometía publicar al crear ya no existe
    expect(html).not.toContain('Publicar promoción')
    expect(html).toContain('borrador')
  })

  it('A2: el borrador se etiqueta «Borrador» y ofrece «Publicar aviso»; el publicado ofrece «Retirar»', () => {
    const html = render()
    expect(html).toContain('Borrador')
    expect(html).toContain('Publicar aviso')
    expect(html).toContain('Retirar aviso')
    // Solo el borrador tiene botón de publicar (1 ocurrencia exacta)
    expect((html.match(/Publicar aviso/g) ?? []).length).toBe(1)
  })

  it('A1: la lista pinta SOLO las filas de la API — nada inventado', () => {
    const html = render()
    expect(html).toContain('Aviso borrador COM08')
    expect(html).toContain('Aviso publicado COM08')
    expect(html).not.toContain('Aviso vencido')
    expect(html).not.toContain('Aviso ajeno')
  })

  it('A3: la página no importa storefront, slider ni precios', async () => {
    const code = (await import('./PromotionManagerPage.tsx?raw')) as unknown as string
    expect(code).not.toContain('storefront')
    expect(code).not.toContain('HomeHero')
    expect(code).not.toContain('/prices')
  })

  it('el mismo cargo con solo lectura y publicación ve el borrador, sin controles de creación o edición', () => {
    const html = render(['read', 'publish'])
    expect(html).toContain('Aviso borrador COM08')
    expect(html).toContain('Publicar aviso')
    expect(html).not.toContain('Guardar borrador')
    expect(html).not.toContain('Editar aviso y flyer')
    expect(html).not.toContain('Retirar aviso')
  })
})
