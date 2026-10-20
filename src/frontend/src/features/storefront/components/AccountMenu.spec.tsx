import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import AccountMenu from './AccountMenu'

function renderAccountMenu(): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AccountMenu)))
}

describe('accesos de cuenta del cliente', () => {
  it('Mi Cuenta lleva directamente al registro', () => {
    const markup = renderAccountMenu()
    const registrationLink = markup.match(/<a[^>]*aria-label="Mi Cuenta: crear cuenta"[^>]*>/)?.[0]
    expect(registrationLink).toContain('href="/clientes/registro"')
    expect(markup).toContain('Mi Cuenta')
    expect(markup).toContain('Crear cuenta')
    expect(markup).not.toContain('aria-haspopup')
  })

  it('ofrece ingreso separado para clientes con cuenta', () => {
    const markup = renderAccountMenu()
    expect(markup).toMatch(/<a[^>]*href="\/clientes\/login"[^>]*>Ingresar<\/a>/)
    expect(markup).not.toContain('Rastrea tu pedido')
  })
})
