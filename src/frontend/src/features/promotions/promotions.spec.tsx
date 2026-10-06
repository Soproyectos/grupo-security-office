import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PromotionNotices } from './SalesPromotionsPanel'
import { canPublishPromotions, promotionStatus, promotionLocalTimeToIso, promotionInputTime, type ManagedPromotion } from './promotions.service'

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
