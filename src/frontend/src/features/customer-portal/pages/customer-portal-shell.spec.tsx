import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CustomerAccountPage, { CustomerPortalShell } from './CustomerAccountPage'
import ClientCatalogPage from './ClientCatalogPage'
import PortalProductDetailPage from './PortalProductDetailPage'

/**
 * Static render of the portal layout: the shell wraps every /clientes/* route in
 * the common storefront chrome once, and each page contributes content for the
 * single <main> the shell owns. Hooks are fed through fixed values.
 */

const sessionMock = vi.hoisted(() => ({
  isPending: false,
  isError: false,
  data: undefined as unknown,
}))
const logoutMock = vi.hoisted(() => ({ isPending: false, isError: false, mutate: vi.fn() }))
const productMock = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false }))

vi.mock('../hooks/useCustomerPortal', () => ({
  useCustomerPortalSession: () => sessionMock,
  useCustomerPortalLogout: () => logoutMock,
}))
vi.mock('../hooks/useCatalog', () => ({
  useCustomerCatalog: () => ({ data: undefined, isLoading: false, isError: false }),
  useCustomerCatalogProduct: () => productMock,
  usePublicCatalogProduct: () => productMock,
}))

function renderPortal(path: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          { path: '/clientes', element: createElement(CustomerPortalShell) },
          createElement(Route, { index: true, element: createElement(CustomerAccountPage) }),
          createElement(Route, { path: 'perfil', element: createElement(CustomerAccountPage, { profile: true }) }),
          createElement(Route, { path: 'productos', element: createElement(ClientCatalogPage) }),
          createElement(Route, {
            path: 'productos/:productId',
            element: createElement(PortalProductDetailPage, { privateCatalog: true }),
          }),
        ),
      ),
    ),
  )
}

function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

beforeEach(() => {
  sessionMock.isPending = false
  sessionMock.isError = false
  sessionMock.data = { id: 'a1', email: 'ana@example.com', contactName: 'Ana Pérez', companyName: 'Seguridad SAS', type: 'CLIENT' }
  logoutMock.isPending = false
  logoutMock.isError = false
  productMock.isLoading = false
  productMock.data = {
    id: 'p1', sku: 'CAM-4K', name: 'Cámara Domo 4K', description: null, image: null,
    brand: { name: 'Hikvision' }, price: null,
  }
})

describe.each([
  ['/clientes', 'Bienvenido, Ana Pérez'],
  ['/clientes/perfil', 'Mis datos'],
  ['/clientes/productos', 'Catálogo para clientes'],
  ['/clientes/productos/p1', 'Cámara Domo 4K'],
])('portal en %s', (path, title) => {
  it('tiene un solo <main>, un solo <h1> y la plantilla común', () => {
    const markup = renderPortal(path)

    expect(occurrences(markup, '<main')).toBe(1)
    expect(occurrences(markup, '<h1')).toBe(1)
    expect(markup).toContain(`${title}</h1>`)
    expect(occurrences(markup, 'aria-label="Grupo Security, inicio"')).toBe(1)
    expect(occurrences(markup, '<footer')).toBe(1)
    expect(markup).toContain('aria-label="Escríbenos por WhatsApp"')
    expect(markup).not.toContain('slate-')
  })

  it('conserva la sesión, el cierre de sesión y la navegación del portal', () => {
    const markup = renderPortal(path)

    expect(markup).toContain('Ana Pérez')
    expect(markup).toContain('Cerrar sesión</button>')
    expect(markup).toContain('aria-label="Mi cuenta de cliente"')
    expect(markup).toContain('href="/clientes/productos"')
    expect(markup).toContain('href="/clientes/perfil"')
  })
})

describe('estados del portal', () => {
  it('avisa que comprueba la cuenta, dentro de la plantilla y con un solo <main>', () => {
    sessionMock.isPending = true
    const markup = renderPortal('/clientes')

    expect(markup).toContain('Comprobando tu cuenta…')
    expect(occurrences(markup, '<main')).toBe(1)
    expect(markup).toContain('<footer')
  })

  it('avisa cuando falla el cierre de sesión', () => {
    logoutMock.isError = true

    expect(renderPortal('/clientes')).toContain('No se pudo cerrar sesión. Vuelve a intentarlo.')
  })

  it('no pinta el portal cuando la sesión falla (redirige al inicio de sesión)', () => {
    sessionMock.isError = true

    expect(renderPortal('/clientes')).not.toContain('<main')
  })
})
