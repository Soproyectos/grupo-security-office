import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorefrontContact } from '../../../services/storefront-contact.service'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

vi.mock('../../../services/public-storefront-contact.service', () => ({
  fetchPublicStorefrontContact: fetchMock,
}))

// ---------------------------------------------------------------------------
// Escenarios cubiertos:
// ✅ Estado inicial `loading` sin tocar la red
// ✅ loading → ready con los datos que devuelve el servicio
// ✅ Caché de sesión: varios "montajes" del hook → una sola petición
// ✅ Error: publica `error` y deja los datos en null (hidratación = constantes)
// ✅ `retry()` descarta la caché y vuelve a pedir, tras `ready` y tras `error`
// ✅ Una respuesta vieja no pisa el intento vigente
// ✅ Un consumidor descargado deja de recibir notificaciones
// ✅ El hook de React expone el estado del store (render de servidor, sin effects)
// ✅ Hidratación: con datos del API se reemplazan los demo y los `href` de
//    teléfono/WhatsApp se derivan del E.164 dentro del render
// ✅ Sin datos (carga o error) devuelve las constantes de siempre
//
// El repo no tiene entorno DOM ni @testing-library, así que el hook se ejercita
// a través del store que consume (`useSyncExternalStore`) y con
// `renderToStaticMarkup`, igual que `useCategoryMenu.spec.ts`. Cada caso
// recarga el módulo para empezar con la caché limpia, como una sesión nueva.
// ---------------------------------------------------------------------------

const CONTACTO_API: StorefrontContact = {
  nationalPhone: '573101234567',
  whatsappPhone: '573009998877',
  salesPhone: '5764443322',
  email: 'tienda@gruposecurity.example',
  businessHoursShort: 'domingos de 9:00 a. m. a 1:00 p. m.',
  businessHoursFull: 'domingos de 9:00 a. m. a 1:00 p. m. · festivos con cita previa',
  sellWithUsMessage: 'Hola, quiero vender mis productos en la tienda.',
}

const OTRO_CONTACTO: StorefrontContact = {
  ...CONTACTO_API,
  nationalPhone: '57424445566',
  salesPhone: null,
  email: 'otro@gruposecurity.example',
}

type ContactStore = typeof import('./useStorefrontContact')

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function loadStore(): Promise<ContactStore> {
  vi.resetModules()
  return import('./useStorefrontContact')
}

describe('caché de sesión del contacto', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('arranca en loading sin pedir nada', async () => {
    const store = await loadStore()

    expect(store.getStorefrontContactSnapshot()).toEqual({ status: 'loading', data: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pasa de loading a ready cuando la petición resuelve', async () => {
    const store = await loadStore()
    const request = deferred<StorefrontContact>()
    fetchMock.mockReturnValue(request.promise)

    const estados: string[] = []
    store.subscribeStorefrontContact(() => estados.push(store.getStorefrontContactSnapshot().status))

    const loading = store.loadStorefrontContact()
    expect(store.getStorefrontContactSnapshot().status).toBe('loading')

    request.resolve(CONTACTO_API)
    await loading

    expect(store.getStorefrontContactSnapshot()).toEqual({ status: 'ready', data: CONTACTO_API })
    expect(estados).toEqual(['loading', 'ready'])
  })

  /**
   * La barra superior, el pie, los canales y la ficha de producto montan por
   * separado y leen el mismo store: la red se toca una sola vez por sesión.
   */
  it('varios consumidores en la misma sesión disparan una sola petición', async () => {
    const store = await loadStore()
    const request = deferred<StorefrontContact>()
    fetchMock.mockReturnValue(request.promise)

    const unsubscribeA = store.subscribeStorefrontContact(() => {})
    const unsubscribeB = store.subscribeStorefrontContact(() => {})

    const primera = store.loadStorefrontContact()
    const segunda = store.loadStorefrontContact()

    request.resolve(CONTACTO_API)
    await Promise.all([primera, segunda])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.getStorefrontContactSnapshot().status).toBe('ready')

    // Volver a montar con el contacto ya cacheado no vuelve a pedir.
    await store.loadStorefrontContact()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    unsubscribeA()
    unsubscribeB()
  })

  it('publica error y deja los datos en null cuando la petición falla', async () => {
    const store = await loadStore()
    fetchMock.mockRejectedValue(new Error('Request failed with status code 500'))

    await store.loadStorefrontContact()

    expect(store.getStorefrontContactSnapshot()).toEqual({ status: 'error', data: null })
  })

  it('retry() descarta la caché y vuelve a pedir tras un ready', async () => {
    const store = await loadStore()
    fetchMock.mockResolvedValueOnce(CONTACTO_API)
    await store.loadStorefrontContact()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const segunda = deferred<StorefrontContact>()
    fetchMock.mockReturnValueOnce(segunda.promise)
    store.retryStorefrontContact()

    expect(store.getStorefrontContactSnapshot()).toEqual({ status: 'loading', data: null })

    segunda.resolve(OTRO_CONTACTO)
    await store.loadStorefrontContact()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.getStorefrontContactSnapshot()).toEqual({ status: 'ready', data: OTRO_CONTACTO })
  })

  it('retry() tras un error vuelve a dejar el contacto listo', async () => {
    const store = await loadStore()
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await store.loadStorefrontContact()
    expect(store.getStorefrontContactSnapshot().status).toBe('error')

    fetchMock.mockResolvedValueOnce(CONTACTO_API)
    store.retryStorefrontContact()
    await store.loadStorefrontContact()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.getStorefrontContactSnapshot()).toEqual({ status: 'ready', data: CONTACTO_API })
  })

  it('una respuesta obsoleta no pisa el estado del intento vigente', async () => {
    const store = await loadStore()
    const lento = deferred<StorefrontContact>()
    const rapido = deferred<StorefrontContact>()
    fetchMock.mockReturnValueOnce(lento.promise).mockReturnValueOnce(rapido.promise)

    store.loadStorefrontContact()
    store.retryStorefrontContact()

    rapido.resolve(CONTACTO_API)
    await store.loadStorefrontContact()
    expect(store.getStorefrontContactSnapshot().status).toBe('ready')

    lento.resolve(OTRO_CONTACTO)
    await lento.promise
    await Promise.resolve()

    expect(store.getStorefrontContactSnapshot()).toEqual({ status: 'ready', data: CONTACTO_API })
  })

  it('un consumidor descargado deja de recibir notificaciones', async () => {
    const store = await loadStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribeStorefrontContact(listener)
    unsubscribe()

    fetchMock.mockResolvedValue(CONTACTO_API)
    await store.loadStorefrontContact()

    expect(listener).not.toHaveBeenCalled()
    expect(store.getStorefrontContactSnapshot().status).toBe('ready')
  })
})

describe('contacto hidratado que entrega el hook', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  /**
   * Render de servidor: `useEffect` no corre, así que el hook devuelve el
   * estado del store tal cual y no dispara la carga. React y el renderer se
   * importan en el mismo lote para que compartan el mismo dispatcher.
   */
  it('expone el estado sin pedir datos y con las constantes de siempre', async () => {
    vi.resetModules()
    const [store, server, react] = await Promise.all([
      import('./useStorefrontContact'),
      import('react-dom/server'),
      import('react'),
    ])

    function Probe() {
      const { status, contact } = store.useStorefrontContact()
      return react.createElement(
        'span',
        null,
        `${status}|${contact.nationalPhoneHref}|${contact.salesLineHref}|${contact.email}`,
      )
    }

    const markup = server.renderToStaticMarkup(react.createElement(Probe))

    expect(markup).toBe(
      '<span>loading|tel:+576011234567|tel:+5761234567|serviciocliente@gruposecurity.example</span>',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con el API caído devuelve las constantes demo, nunca una tienda en blanco', async () => {
    vi.resetModules()
    const [store, server, react] = await Promise.all([
      import('./useStorefrontContact'),
      import('react-dom/server'),
      import('react'),
    ])
    fetchMock.mockRejectedValue(new Error('network down'))
    await store.loadStorefrontContact()

    function Probe() {
      const { status, contact } = store.useStorefrontContact()
      return react.createElement(
        'span',
        null,
        [
          status,
          contact.nationalPhoneDisplay,
          contact.salesLineDisplay,
          contact.businessHoursShort,
          contact.whatsappUrl(),
        ].join('|'),
      )
    }

    const markup = server.renderToStaticMarkup(react.createElement(Probe))

    expect(markup).toContain('error|(601) 123 4567|(6) 123 4567|lun a sáb 7:00 a. m. a 7:00 p. m.|https://wa.me/576011234567')
  })

  it('con los datos del API reemplaza los demo y deriva href y display del E.164', async () => {
    vi.resetModules()
    const [store, server, react] = await Promise.all([
      import('./useStorefrontContact'),
      import('react-dom/server'),
      import('react'),
    ])
    fetchMock.mockResolvedValue(CONTACTO_API)
    await store.loadStorefrontContact()

    function Probe() {
      const { status, contact } = store.useStorefrontContact()
      return react.createElement(
        'span',
        null,
        [
          status,
          contact.nationalPhoneDisplay,
          contact.nationalPhoneHref,
          contact.salesLineDisplay,
          contact.salesLineHref,
          contact.email,
          contact.businessHours,
          contact.businessHoursShort,
          contact.sellWithUsMessage,
          contact.whatsappUrl(),
          contact.whatsappUrl('cotizar cámara'),
        ].join('|'),
      )
    }

    const markup = server.renderToStaticMarkup(react.createElement(Probe))

    expect(markup).toContain('ready')
    expect(markup).toContain('(310) 123 4567')
    expect(markup).toContain('tel:+573101234567')
    expect(markup).toContain('(6) 444 3322')
    expect(markup).toContain('tel:+5764443322')
    expect(markup).toContain(CONTACTO_API.email)
    expect(markup).toContain(CONTACTO_API.businessHoursFull)
    expect(markup).toContain(CONTACTO_API.businessHoursShort)
    expect(markup).toContain(CONTACTO_API.sellWithUsMessage)
    expect(markup).toContain('https://wa.me/573009998877')
    expect(markup).toContain(`https://wa.me/573009998877?text=${encodeURIComponent('cotizar cámara')}`)
    // Nada del demo anterior.
    expect(markup).not.toContain('tel:+576011234567')
    expect(markup).not.toContain('(601) 123 4567')
  })

  it('sin línea de ventas guardada expone null para que el consumidor no pinte la fila', async () => {
    vi.resetModules()
    const [store, server, react] = await Promise.all([
      import('./useStorefrontContact'),
      import('react-dom/server'),
      import('react'),
    ])
    fetchMock.mockResolvedValue({ ...CONTACTO_API, salesPhone: null })
    await store.loadStorefrontContact()

    function Probe() {
      const { contact } = store.useStorefrontContact()
      return react.createElement(
        'span',
        null,
        `${String(contact.salesLineHref)}|${String(contact.salesLineDisplay)}|${contact.nationalPhoneHref}`,
      )
    }

    const markup = server.renderToStaticMarkup(react.createElement(Probe))

    expect(markup).toBe('<span>null|null|tel:+573101234567</span>')
  })
})
