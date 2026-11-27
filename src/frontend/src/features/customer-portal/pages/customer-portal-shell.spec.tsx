import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CustomerAccountPage, { CustomerPortalShell } from './CustomerAccountPage'
import CompleteProfilePage from './CompleteProfilePage'

/**
 * Static render of the portal layout: the shell wraps every /clientes/* route in
 * the common storefront chrome once, and each page contributes content for the
 * single <main> the shell owns. Hooks are fed through fixed values.
 */

const sessionMock = vi.hoisted(() => ({
  isPending: false,
  isSuccess: true,
  isError: false,
  data: undefined as unknown,
}))
const logoutMock = vi.hoisted(() => ({ isPending: false, isError: false, mutateAsync: vi.fn() }))
const profileMock = vi.hoisted(() => ({ isPending: false, isError: false, mutate: vi.fn() }))

vi.mock('../hooks/useCustomerPortal', () => ({
  useCustomerPortalSession: () => sessionMock,
  useCustomerPortalLogout: () => logoutMock,
}))
vi.mock('../hooks/usePortalProfile', () => ({
  useDeletePortalAccount: () => profileMock,
  useUpdatePortalProfile: () => profileMock,
  useCreatePortalPassword: () => profileMock,
  useChangePortalPassword: () => profileMock,
  useChangePortalEmail: () => profileMock,
  useRefreshPortalSession: () => vi.fn(),
}))

function renderPortal(path: string): string {
  const portal = createElement(
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
          createElement(Route, { path: 'completar-perfil', element: createElement(CompleteProfilePage) }),
        ),
      ),
  )
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, portal))
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
})

describe.each([
  ['/clientes', 'Bienvenido, Ana Pérez'],
  ['/clientes/perfil', 'Mis datos'],
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

  it('usa el menú superior para la cuenta y el cierre de sesión', () => {
    const markup = renderPortal(path)

    expect(markup).toContain('title="Ana Pérez"')
    expect(occurrences(markup, 'Cerrar sesión</button>')).toBe(1)
    expect(markup).toMatch(/id="storefront-account-menu"[^>]*hidden[^>]*>.*Cerrar sesión<\/button>/)
    expect(markup).toContain('aria-label="Mi cuenta de cliente"')
    expect(markup).toContain('>Inicio</a>')
    expect(markup).toContain('href="/clientes/perfil"')
  })
})

describe('inicio del portal', () => {
  const ready = { id: 'a1', email: 'ana@example.com', contactName: 'Ana Pérez', companyName: 'Seguridad SAS', type: 'CLIENT', state: 'ACTIVE', canQuote: true, profileComplete: true, tier: { id: 't1', name: 'ORO', isActive: true } }

  it('una cuenta lista ve sus pestañas de cotización, a su asesor y el botón al catálogo', () => {
    sessionMock.data = { ...ready, advisor: { name: 'Carlos Ruiz' } }
    const markup = renderPortal('/clientes')

    expect(markup).toContain('>Mi cotización</a>')
    expect(markup).toContain('>Mis cotizaciones</a>')
    expect(markup).not.toContain('>Catálogo</a>')
    expect(markup).toContain('Tu asesor')
    expect(markup).toContain('Carlos Ruiz')
    expect(markup).toContain('Escribir por WhatsApp')
    expect(markup).toContain('Tu cotización está vacía')
    expect(markup).toContain('href="/catalogo"')
    expect(markup).toContain('ORO')
  })

  it('una cuenta en revisión no ve pestañas de cotización y se le explica qué pasa', () => {
    sessionMock.data = { ...ready, state: 'PENDING', canQuote: false, advisor: null, tier: null }
    const markup = renderPortal('/clientes')

    expect(markup).not.toContain('>Mi cotización</a>')
    expect(markup).not.toContain('>Mis cotizaciones</a>')
    expect(markup).toContain('Tu cuenta está en revisión')
    expect(markup).toContain('Un asesor se hará cargo de tu cuenta pronto')
    expect(markup).toContain('Mientras tanto, mira el catálogo')
    expect(markup).not.toContain('Tu clasificación comercial')
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
