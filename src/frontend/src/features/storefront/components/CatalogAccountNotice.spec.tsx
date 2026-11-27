import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import CatalogAccountNotice from './CatalogAccountNotice'

const sessionMock = vi.hoisted(() => ({ isSuccess: true, isError: false, data: undefined as unknown }))

vi.mock('../../customer-portal/hooks/useCustomerPortal', () => ({ useCustomerPortalSession: () => sessionMock }))

function render(path: string, withQueryClient = true): string {
  const notice = createElement(MemoryRouter, { initialEntries: [path] }, createElement(CatalogAccountNotice))
  return renderToStaticMarkup(withQueryClient ? createElement(QueryClientProvider, { client: new QueryClient() }, notice) : notice)
}

const base = { id: 'a1', state: 'ACTIVE', canQuote: true, profileComplete: true }

beforeEach(() => {
  sessionMock.isSuccess = true
  sessionMock.isError = false
  sessionMock.data = base
})

describe('aviso de cuenta en el catálogo', () => {
  it('avisa a la cuenta en revisión y la lleva a su portal', () => {
    sessionMock.data = { ...base, state: 'PENDING', canQuote: false }
    const markup = render('/catalogo')

    expect(markup).toContain('Tu cuenta está en revisión. Un asesor te contactará pronto. Mientras tanto ves los precios públicos.')
    expect(markup).toContain('href="/clientes"')
  })

  it('pide completar los datos cuando faltan', () => {
    sessionMock.data = { ...base, profileComplete: false }

    expect(render('/productos/camara')).toContain('href="/clientes/completar-perfil"')
  })

  it('explica que el asesor termina de configurar la cuenta, con punto final', () => {
    sessionMock.data = { ...base, canQuote: false }

    expect(render('/catalogo/categoria/camaras')).toContain('Tu asesor está terminando de configurar tu cuenta. Mientras tanto')
  })

  it('no muestra nada a una cuenta lista, a un visitante, fuera de la tienda ni sin proveedor de datos', () => {
    expect(render('/catalogo')).toBe('')
    sessionMock.data = undefined
    sessionMock.isSuccess = false
    expect(render('/catalogo')).toBe('')
    sessionMock.isSuccess = true
    sessionMock.data = { ...base, state: 'PENDING', canQuote: false }
    expect(render('/clientes')).toBe('')
    expect(render('/catalogo', false)).toBe('')
  })
})
