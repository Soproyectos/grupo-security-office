import { describe, expect, it, vi } from 'vitest'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
import { renderToStaticMarkup } from 'react-dom/server'
import { PromotionNotices } from './SalesPromotionsPanel'
import { promotionStatus, promotionLocalTimeToIso, promotionInputTime, type ManagedPromotion } from './promotions.service'

const promotion: ManagedPromotion = {
  id: 'test-promotion', title: 'Promoción de prueba', message: 'Condiciones visibles\nSolo productos seleccionados.',
  startsAt: '2026-10-05T12:00:00Z', endsAt: '2026-10-10T23:00:00Z',
  isActive: true, audience: 'TEAM',
}
describe('promotion announcements', () => {
  it('al editar conserva la hora Colombia y permite volver a guardarla', () => {
    const input = promotionInputTime('2026-10-31T23:00:00.000Z')
    expect(input).toBe('2026-10-31T18:00')
    expect(promotionLocalTimeToIso(input)).toBe('2026-10-31T23:00:00.000Z')
  })
  it('presenta el flyer con texto alternativo junto a las condiciones', () => {
    const html = renderToStaticMarkup(<PromotionNotices promotions={[{ ...promotion, flyer: 'data:image/png;base64,test' }]} />)
    expect(html).toContain('alt="Flyer: Promoción de prueba"')
    expect(html).toContain('src="data:image/png;base64,test"')
    expect(html).toContain('Condiciones visibles')
  })

  it('converts local Colombia form times without depending on device timezone', () => {
    expect(promotionLocalTimeToIso('2026-10-05T09:00')).toBe('2026-10-05T14:00:00.000Z')
    expect(promotionLocalTimeToIso('2026-10-31T18:30:00')).toBe('2026-10-31T23:30:00.000Z')
  })
  it.each(['', 'invalid', '2026-10-05'])('rejects incomplete local dates: %s', value => {
    expect(() => promotionLocalTimeToIso(value)).toThrow()
  })

  it('muestra título, condiciones y vencimiento sin enviar al vendedor a Comercial', () => {
    const html = renderToStaticMarkup(<PromotionNotices promotions={[promotion]} />)
    expect(html).toContain('Promoción de prueba')
    expect(html).toContain('Condiciones visibles')
    expect(html).toContain('Vigente hasta')
    expect(html).toContain('hora Colombia')
    expect(html).not.toContain('/commercial')
  })
  it('explica que no hay promociones, sin mostrar ofertas inventadas', () => {
    expect(renderToStaticMarkup(<PromotionNotices promotions={[]} />)).toContain('No hay promociones vigentes publicadas para ti')
  })
  it('muestra el texto como texto y no ejecuta HTML de un aviso', () => {
    const html = renderToStaticMarkup(<PromotionNotices promotions={[{ ...promotion, message: '<script>alert(1)</script>' }]} />)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
  it.each(['Vendedor', 'Admin Comercial', 'Operador', 'Consulta'])('%s no tiene controles de publicación', role => {
    expect(canPublishPromotions([role])).toBe(false)
  })
  it.each(['Supervisor', 'Super Admin'])('%s puede publicar avisos', role => {
    expect(canPublishPromotions([role])).toBe(true)
  })
  it('distingue programada, vigente, vencida y retirada en los límites exactos', () => {
    expect(promotionStatus(promotion, Date.parse(promotion.startsAt) - 1)).toBe('Programada')
    expect(promotionStatus(promotion, Date.parse(promotion.startsAt))).toBe('Vigente')
    expect(promotionStatus(promotion, Date.parse(promotion.endsAt))).toBe('Vencida')
    expect(promotionStatus({ ...promotion, isActive: false }, Date.parse(promotion.startsAt))).toBe('Retirada')
  })
})

// ─── COM-08 frontend — borrador/publicación explícita/fuente honesta ───
describe('COM-08 — estados de borrador y publicación explícita', () => {
  const draft: ManagedPromotion = {
    id: 'draft-1', title: 'Borrador de prueba', message: 'Preparando…',
    startsAt: '2026-10-05T12:00:00Z', endsAt: '2026-10-20T23:00:00Z',
    isActive: true, audience: 'TEAM', publishedAt: null,
  }

  it('A2: promotionStatus muestra «Borrador» aunque la ventana ya esté activa (preparar no publica)', () => {
    expect(promotionStatus(draft, Date.parse('2026-10-10T12:00:00Z'))).toBe('Borrador')
    expect(promotionStatus({ ...draft, publishedAt: '2026-10-04T10:00:00Z' }, Date.parse('2026-10-10T12:00:00Z'))).toBe('Vigente')
  })

  it('A2: publishDraftPromotion hace PATCH a /promotions/:id/publish (misma sesión verificada)', async () => {
    const api = (await import('../../services/api')).default
    const { useAuthStore } = await import('../../stores/auth.store')
    const supervisor = { id: 'sup-fixture', email: 'sup@example.invalid', name: 'Sup', roles: ['Supervisor'], permissions: [] }
    useAuthStore.getState().login(supervisor)
    vi.mocked(api.get).mockResolvedValue({ data: supervisor })
    vi.mocked(api.patch).mockResolvedValue({ data: { id: 'draft-1', publishedAt: '2026-10-06T10:00:00Z' } })
    const { publishDraftPromotion } = await import('./promotions.service')
    const result = await publishDraftPromotion('draft-1')
    expect(api.patch).toHaveBeenCalledWith('/promotions/draft-1/publish')
    expect(result.publishedAt).toBe('2026-10-06T10:00:00Z')
  })

  it('A2: crear (POST) sigue al borrador — el servicio NO llama rutas de slider/storefront', async () => {
    const serviceSource = (await import('./promotions.service.ts?raw')).default
      ?? (await import('./promotions.service.ts?raw'))
    const code = typeof serviceSource === 'string' ? serviceSource : String(serviceSource)
    // Solo rutas /promotions* y /auth/profile (sesión); jamás storefront, HomeHero ni precios
    const paths = [...code.matchAll(/api\.(get|post|patch|delete)(?:\.resolvedValue)?[<(]?['"`]([^'"`]+)/g)]
      .map(m => m[2])
      .filter((p): p is string => typeof p === 'string')
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      expect(path === '/auth/profile' || path.startsWith('/promotions')).toBe(true)
    }
    expect(code).not.toContain('storefront')
    expect(code).not.toContain('HomeHero')
    expect(code).not.toContain('/prices')
  })
})
