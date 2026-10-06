import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth.store'
import {
  EMAIL_ERROR,
  PHONE_ERROR,
  validateStorefrontContact,
  type StorefrontContactPayload,
} from '../services/storefront-contact.service'
import StorefrontSettingsPage from './StorefrontSettingsPage'

/**
 * El repo no tiene entorno DOM ni `@testing-library`, así que —como el resto de
 * suites del storefront— se afirma sobre un render de servidor
 * (`react-dom/server`) de la página real dentro de su `QueryClientProvider`: el
 * markup lleva el gate de permisos, los grupos, los valores cargados y los avisos.
 *
 * Lo que sólo existe con eventos (pulsar «Guardar») se cubre por la otra vía del
 * repo: se toma la `mutationFn` que la página le pasó a `useMutation` y se
 * invoca con el payload del formulario, de modo que lo probado es el cableado
 * real de la página hacia el servicio y no una réplica.
 */

const serviceMock = vi.hoisted(() => ({
  fetchStorefrontContact: vi.fn(),
  updateStorefrontContact: vi.fn(),
}))

vi.mock('../services/storefront-contact.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/storefront-contact.service')>()),
  fetchStorefrontContact: serviceMock.fetchStorefrontContact,
  updateStorefrontContact: serviceMock.updateStorefrontContact,
}))

type MutationOptions = {
  mutationFn: (payload: StorefrontContactPayload) => Promise<unknown>
}

const mutationMock = vi.hoisted(() => ({
  options: null as MutationOptions | null,
  mutate: vi.fn(),
  state: {
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null as unknown,
  },
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useMutation: (options: MutationOptions) => {
      mutationMock.options = options
      return { ...mutationMock.state, mutate: mutationMock.mutate }
    },
  }
})

const CONTACT = {
  nationalPhone: '576011234567',
  whatsappPhone: '576011234567',
  salesPhone: '5761234567',
  email: 'serviciocliente@gruposecurity.example',
  businessHoursShort: 'lun a sáb 7:00 a. m. a 7:00 p. m.',
  businessHoursFull:
    'lunes a sábado de 7:00 a.m. a 7:00 p. m. · domingos y festivos de 8:00 a.m. a 2:00 p. m.',
  sellWithUsMessage: 'Hola, quiero información para vender mis productos con Grupo Security.',
}

function signIn(permissions: string[]) {
  useAuthStore.setState({
    user: {
      id: 'user-1',
      email: 'supervisor@gruposecurity.example',
      name: 'Supervisor',
      roles: ['Super Admin'],
      permissions,
    },
    isAuthenticated: true,
  })
}

/**
 * La clave está en la página (no se exporta: `react-refresh` avisa de los
 * archivos que exportan algo además del componente). Si las dos se desincronizaran
 * la suite falla en vez de pasar en falso: la página no encontraría el dato y
 * se quedaría en «Cargando…».
 */
const CONTACT_QUERY_KEY = ['storefront', 'contact']

function renderPage(): string {
  const client = new QueryClient({
    // Sin `retryOnMount` un query en error se pone a refetch en el render, y el
    // render de servidor no puede resolverlo.
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  })
  client.setQueryData(CONTACT_QUERY_KEY, CONTACT)

  return renderPageWith(client)
}

/** Igual, pero con la carga ya fallida: el `fetch` no corre en un render de servidor. */
function renderFailingPage(message: string): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  })
  const error = Object.assign(new Error('Request failed with status code 403'), {
    response: { data: { message } },
  })
  client
    .getQueryCache()
    .build(client, {
      queryKey: CONTACT_QUERY_KEY,
      queryFn: serviceMock.fetchStorefrontContact,
    })
    .setState({ status: 'error', error, fetchStatus: 'idle' })

  return renderPageWith(client)
}

function renderPageWith(client: QueryClient): string {
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(StorefrontSettingsPage)),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mutationMock.options = null
  mutationMock.state = { isPending: false, isError: false, isSuccess: false, error: null }
})

describe('acceso a la configuración de la tienda', () => {
  it('sin permiso de tienda muestra la sección restringida y no el formulario', () => {
    signIn(['products:read'])

    const markup = renderPage()

    expect(markup).toContain('No tienes permisos para ver esta sección')
    expect(markup).not.toContain('Configuración de la tienda')
    expect(markup).not.toContain('name="nationalPhone"')
  })

  it('con permiso de escritura sí muestra el formulario', () => {
    signIn(['storefront:read', 'storefront:write'])

    const markup = renderPage()

    expect(markup).not.toContain('No tienes permisos para ver esta sección')
    expect(markup).toContain('Configuración de la tienda')
    expect(markup).toContain('name="nationalPhone"')
  })
})

describe('formulario de contacto', () => {
  it('muestra los tres grupos y los valores que trae la API', () => {
    signIn(['storefront:read', 'storefront:write'])

    const markup = renderPage()

    expect(markup).toContain('Teléfonos y WhatsApp')
    expect(markup).toContain('Correo y horarios')
    expect(markup).toContain('Mensajes prellenados')
    expect(markup).toContain('Horario breve (barra superior)')
    expect(markup).toContain('Horario completo (pie de página)')
    expect(markup).toContain('Déjalo vacío para usar la línea nacional.')
    expect(markup).toContain(`value="${CONTACT.nationalPhone}"`)
    expect(markup).toContain(`value="${CONTACT.email}"`)
    expect(markup).toContain(`>${CONTACT.sellWithUsMessage}</textarea>`)
  })

  it('sin permiso de escritura deja los campos deshabilitados, avisa y oculta el botón', () => {
    signIn(['storefront:read'])

    const markup = renderPage()

    expect(markup).toContain('Solo lectura')
    expect(markup).toContain('necesitas el permiso de escritura')
    expect(markup).toMatch(/<input(?=[^>]*name="nationalPhone")(?=[^>]*\sdisabled="")/)
    expect(markup).toMatch(/<input[^>]*\sdisabled=""/g)
    expect(markup).toMatch(/<textarea[^>]*\sdisabled=""/)
    expect(markup).toContain(`value="${CONTACT.nationalPhone}"`)
    expect(markup).not.toContain('Guardar cambios')
  })

  it('con permiso de escritura deja los campos editables', () => {
    signIn(['storefront:write'])

    const markup = renderPage()

    expect(markup).not.toMatch(/<input[^>]*\sdisabled=""/)
    expect(markup).not.toMatch(/<textarea[^>]*\sdisabled=""/)
    expect(markup).toContain('Guardar cambios')
  })
})

describe('guardado', () => {
  it('envía al servicio el payload que devuelve el formulario', async () => {
    signIn(['storefront:read', 'storefront:write'])
    serviceMock.updateStorefrontContact.mockResolvedValue(CONTACT)
    renderPage()

    const payload: StorefrontContactPayload = {
      nationalPhone: '576011234567',
      whatsappPhone: undefined,
      salesPhone: undefined,
      email: 'serviciocliente@gruposecurity.example',
      businessHoursShort: 'lun a sáb 7:00 a. m. a 7:00 p. m.',
      businessHoursFull: CONTACT.businessHoursFull,
      sellWithUsMessage: CONTACT.sellWithUsMessage,
    }
    await mutationMock.options?.mutationFn(payload)

    expect(serviceMock.updateStorefrontContact).toHaveBeenCalledWith(payload)
  })

  it('tras guardar avisa que los cambios quedaron guardados', () => {
    signIn(['storefront:read', 'storefront:write'])
    mutationMock.state.isSuccess = true

    const markup = renderPage()

    expect(markup).toContain('Cambios guardados.')
    expect(markup).toContain('role="status"')
  })

  it('si el servidor responde con error, muestra el mensaje del backend', () => {
    signIn(['storefront:read', 'storefront:write'])
    mutationMock.state.isError = true
    mutationMock.state.error = {
      response: { data: { message: 'El teléfono debe estar en E.164 sin + ni espacios (7 a 15 dígitos)' } },
    }

    const markup = renderPage()

    expect(markup).toContain('role="alert"')
    expect(markup).toContain(PHONE_ERROR)
  })

  it('si la carga falla, avisa y no muestra el formulario', () => {
    signIn(['storefront:read', 'storefront:write'])

    const markup = renderFailingPage('No hay datos de contacto de la tienda configurados')

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('No hay datos de contacto de la tienda configurados')
    expect(markup).not.toContain('name="nationalPhone"')
  })
})

describe('validación en cliente', () => {
  const valid: StorefrontContactPayload = {
    nationalPhone: '576011234567',
    whatsappPhone: '',
    salesPhone: '',
    email: 'serviciocliente@gruposecurity.example',
    businessHoursShort: 'lun a sáb',
    businessHoursFull: 'lunes a sábado',
    sellWithUsMessage: 'Hola',
  }

  it('acepta un registro válido con los teléfonos opcionales vacíos', () => {
    expect(validateStorefrontContact(valid)).toEqual({})
  })

  it('rechaza un teléfono que no está en E.164', () => {
    expect(validateStorefrontContact({ ...valid, nationalPhone: '+57 601 123 4567' })).toEqual({
      nationalPhone: PHONE_ERROR,
    })
    expect(validateStorefrontContact({ ...valid, salesPhone: '601' })).toEqual({
      salesPhone: PHONE_ERROR,
    })
  })

  it('exige la línea nacional', () => {
    expect(validateStorefrontContact({ ...valid, nationalPhone: '' })).toEqual({
      nationalPhone: PHONE_ERROR,
    })
  })

  it('rechaza un correo sin formato válido', () => {
    expect(validateStorefrontContact({ ...valid, email: 'serviciocliente@' })).toEqual({
      email: EMAIL_ERROR,
    })
  })
})