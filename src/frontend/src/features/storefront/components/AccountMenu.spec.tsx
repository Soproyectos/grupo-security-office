import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AccountMenu from './AccountMenu'

function renderAccountMenu(): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AccountMenu)))
}

describe('menú de cuenta del cliente', () => {
  it('muestra "Mi cuenta" como botón de menú cerrado', () => {
    const markup = renderAccountMenu()
    const button = markup.match(/<button[^>]*>/)?.[0]
    expect(button).toContain('aria-haspopup="true"')
    expect(button).toContain('aria-expanded="false"')
    expect(button).toContain('min-h-11')
    expect(markup).toContain('Mi cuenta')
  })

  it('ofrece ingresar y crear cuenta sin sesión', () => {
    const markup = renderAccountMenu()
    expect(markup).toMatch(/<a[^>]*href="\/clientes\/login"[^>]*>Ingresar<\/a>/)
    expect(markup).toMatch(/<a[^>]*href="\/clientes\/registro"[^>]*>Crear cuenta<\/a>/)
    expect(markup).not.toContain('Rastrea tu pedido')
  })

  it('mantiene el panel oculto mientras está cerrado', () => {
    expect(renderAccountMenu()).toMatch(/<div[^>]*id="storefront-account-menu"[^>]*hidden/)
  })

  it('sin QueryClientProvider ofrece Ingresar y Crear cuenta', () => {
    const markup = renderAccountMenu()
    expect(markup).toContain('Ingresar')
    expect(markup).toContain('Crear cuenta')
    expect(markup).not.toContain('Mi portal')
  })

  it('con sesión precargada ofrece Mi portal y Salir en lugar de Ingresar', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['customer-portal', 'session'], {
      id: 'acc-1',
      email: 'cliente@example.com',
      type: 'FINAL_CUSTOMER',
    })
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(AccountMenu)),
      ),
    )
    expect(markup).toMatch(/<a[^>]*href="\/clientes"[^>]*>Mi portal<\/a>/)
    expect(markup).toMatch(/<button[^>]*>Salir<\/button>/)
    expect(markup).not.toContain('Ingresar')
    expect(markup).toContain('Mi cuenta')
  })

  it('con QueryClientProvider pero sin sesión mantiene las opciones de visitante', () => {
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(MemoryRouter, null, createElement(AccountMenu)),
      ),
    )
    expect(markup).toContain('Ingresar')
    expect(markup).not.toContain('Salir')
  })
})
