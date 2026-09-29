import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import AccountMenu, { ACCOUNT_MENU_LINKS } from './AccountMenu'

/**
 * As the sibling suites did (`CoverageSelector.spec.tsx`, `mega-menu.spec.tsx`),
 * the suite asserts what the visitor sees on a server render
 * (`react-dom/server`) of the menu — inside a `MemoryRouter`, because the
 * internal link renders with react-router —: the trigger with its user icon
 * and label, the a11y attributes and the options that have a real
 * destination (the menu stays in the DOM hidden while closed). Events that
 * only exist in the browser (the `mousedown` and `keydown` listeners on
 * `document`, the click on the trigger and on the items) cannot run here and
 * are covered by reading the wiring in the component.
 */

function renderAccountMenu(): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AccountMenu)))
}

describe('disparador de Mi Cuenta', () => {
  it('muestra el ícono de usuario y la etiqueta cerrada', () => {
    const markup = renderAccountMenu()

    expect(markup).toContain('Mi Cuenta')
    expect(markup).toContain('aria-haspopup="menu"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('<svg')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('title="Mi cuenta"')
  })

  it('declara todas las opciones pero solo pinta las que tienen destino', () => {
    const markup = renderAccountMenu()
    const routed = ACCOUNT_MENU_LINKS.filter((link) => link.href !== undefined)

    expect(ACCOUNT_MENU_LINKS).toHaveLength(3)
    expect(routed.map((link) => link.label)).toEqual(['Ingresar'])
    expect(markup).toContain('role="menu"')
    expect(markup).toContain('aria-label="Mi Cuenta"')
    expect(markup.split('role="menuitem"').length - 1).toBe(routed.length)
  })

  it('apunta Ingresar al acceso y oculta las opciones sin ruta', () => {
    const markup = renderAccountMenu()

    expect(markup).toContain('href="/login"')
    expect(markup).toContain('>Ingresar<')
    expect(markup).not.toContain('Crear cuenta')
    expect(markup).not.toContain('/crear-cuenta')
    expect(markup).not.toContain('Rastrea tu pedido')
    expect(markup).not.toContain('/rastrea-tu-pedido')
  })

  it('mantiene el menú oculto mientras está cerrado', () => {
    const markup = renderAccountMenu()

    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('hidden')
  })
})
