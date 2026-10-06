import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SalesGoalSummary } from './SalesGoalCard'
import type { PersonalSalesGoal } from './sales-goal.service'

const goal: PersonalSalesGoal = {
  period: '2026-10', target: { amount: '10000000', currency: 'COP' },
  invoiced: { amount: '6000000', currency: 'COP', mixedCurrency: false },
  remaining: { amount: '4000000', currency: 'COP' }, progressPercent: 60,
}
describe('personal monthly sales goal', () => {
  it('shows the assigned target, actual invoiced sales and progress', () => {
    const html = renderToStaticMarkup(<SalesGoalSummary goal={goal} />)
    expect(html).toContain('Mi meta de ventas mensual')
    expect(html).toContain('octubre de 2026')
    expect(html).toContain('10.000.000')
    expect(html).toContain('6.000.000')
    expect(html).toContain('4.000.000')
    expect(html).toContain('aria-valuenow="60"')
    expect(html).toContain('60% de avance')
    expect(html).not.toContain('/commercial')
  })
  it('explains an unassigned target without claiming zero progress', () => {
    const html = renderToStaticMarkup(<SalesGoalSummary goal={{ ...goal, target: null, remaining: null, progressPercent: null }} />)
    expect(html).toContain('Sin meta asignada')
    expect(html).toContain('Supervisor o Super Admin')
    expect(html).not.toContain('progressbar')
  })
  it('shows progress beyond 100% while capping the accessible bar', () => {
    const html = renderToStaticMarkup(<SalesGoalSummary goal={{ ...goal, progressPercent: 125, remaining: { amount: '0', currency: 'COP' } }} />)
    expect(html).toContain('125% de avance')
    expect(html).toContain('Meta alcanzada')
    expect(html).toContain('aria-valuenow="100"')
  })
  it('does not show a percentage for a zero goal', () => {
    const html = renderToStaticMarkup(<SalesGoalSummary goal={{ ...goal, target: { amount: '0', currency: 'COP' }, progressPercent: null }} />)
    expect(html).toContain('La meta es cero')
    expect(html).not.toContain('progressbar')
  })
  it('warns about mixed currency instead of inventing a combined result', () => {
    const html = renderToStaticMarkup(<SalesGoalSummary goal={{ ...goal, invoiced: { ...goal.invoiced, mixedCurrency: true }, remaining: null, progressPercent: null }} />)
    expect(html).toContain('Hay facturas en otras monedas')
    expect(html).not.toContain('progressbar')
  })
})
