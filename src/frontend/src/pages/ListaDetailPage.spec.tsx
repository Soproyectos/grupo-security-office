import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ListaDetailPage, { ConfiguracionTab } from './ListaDetailPage'
import { useAuthStore } from '../stores/auth.store'
import { LISTA_UNLINK_CONSERVATION_NOTICE, type Lista } from '../services/listas.service'

/**
 * CAT-01 frontend — recorrido de conservación en el detalle de Lista (render
 * de servidor con caché sembrada; el repo no tiene entorno DOM, patrón de
 * catalog-index-page / AgendaCalendarPage). Los clicks (confirmación y
 * llamada unlink) viven en listas.service.spec.ts; aquí se acredita lo que la
 * interfaz MUESTRA y lo que NO ofrece:
 *
 * ✅ ACEPTACIÓN (a): cada producto de la lista ofrece «Quitar de la lista»
 *    con aviso conservacionista (ficha/medios precios intactos, sin destino).
 * ✅ ACEPTACIÓN (b): no existe ninguna UI que mueva producto entre listas
 *    (el único «Mover» es de categoría y no ofrece lista destino).
 * ✅ El detalle solo pide/lista productos de ESA lista (query keyed por id).
 * ✅ (c) Archivar/Restaurar muestran el estado (badge «Archivada» + botón
 *    «Restaurar») en la pestaña de configuración.
 * ✅ «Botones y API concuerdan»: sin rol Super Admin/Admin Comercial no hay
 *    botón de desvincular (el backend exige esos roles en el PATCH unlink).
 */

const captured = vi.hoisted(() => ({ queries: [] as Array<{ key?: unknown; enabled?: boolean }> }))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const real = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...real,
    useQuery: (options: { queryKey?: readonly unknown[]; enabled?: boolean }) => {
      captured.queries.push({ key: options.queryKey?.[0], enabled: options.enabled })
      return (real.useQuery as unknown as (o: unknown) => unknown)(options)
    },
  }
})

const LISTA_ID = '22222222-2222-4222-8222-222222222222'
const PRODUCTO_ID = '11111111-1111-4111-8111-111111111111'

function login(roles: string[], permissions: string[] = []) {
  const session = {
    isAuthenticated: true,
    user: { id: 'user-1', name: 'Usuario de prueba', email: 'user@example.invalid', roles, permissions },
  }
  useAuthStore.setState(session)
  // zustand v5 usa `getInitialState()` como server snapshot: el render de
  // servidor (este repo no tiene entorno DOM) lee la sesión de ahí.
  Object.assign(useAuthStore.getInitialState(), session)
}

function lista(over: Partial<Lista> = {}): Lista {
  return {
    id: LISTA_ID,
    code: 'L-CAT01',
    name: 'Lista CAT-01',
    description: null,
    currency: 'COP',
    isActive: true,
    archivedAt: null,
    productCount: 1,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    ...over,
  }
}

function producto(over: Record<string, unknown> = {}) {
  return {
    id: PRODUCTO_ID,
    sku: 'T06C-SKU-1',
    name: 'Producto Fixture Vinculos',
    description: null,
    categoryId: 'cat-1',
    brandId: 'brand-1',
    listaId: LISTA_ID,
    technicalSpecs: null,
    isActive: true,
    isVisible: true,
    category: { id: 'cat-1', name: 'Cámaras IP', slug: 'camaras-ip' },
    brand: { id: 'brand-1', name: 'Marca Fixture', slug: 'marca-fixture' },
    images: [],
    prices: [
      {
        id: 'price-1',
        value: 999.5,
        currency: 'COP',
        validFrom: null,
        validUntil: null,
        priceList: { id: 'pl-1', name: 'Tarifa general', code: 'TG' },
      },
    ],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    ...over,
  }
}

function seeded(datos: { lista?: Lista; products?: unknown[] }) {
  const client = new QueryClient()
  client.setQueryData(['lista', LISTA_ID], datos.lista ?? lista())
  client.setQueryData(['lista-products', LISTA_ID], datos.products ?? [producto()])
  client.setQueryData(['categories'], [{ id: 'cat-1', name: 'Cámaras IP', slug: 'camaras-ip' }])
  client.setQueryData(['brands'], [{ id: 'brand-1', name: 'Marca Fixture', slug: 'marca-fixture' }])
  return client
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/commercial/lists/${LISTA_ID}`]}>
        <Routes>
          <Route path="/commercial/lists/:id" element={<ListaDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const occurrences = (html: string, text: string) => html.split(text).length - 1

beforeEach(() => {
  login(['Super Admin'])
  captured.queries.length = 0
})

describe('IMP-06 — la pestaña «Revisar precios» sustituye al botón CSV anterior', () => {
  it('el botón «Descargar plantilla» (CSV) ya no está en el detalle de la lista', () => {
    const html = render(seeded({}))

    expect(html).not.toContain('Descargar plantilla')
    expect(html).not.toContain('plantilla-lista-')
  })

  it('«Revisar precios» se ofrece con prices:preview y no con un rol operativo sin permiso', () => {
    login(['Operador'], ['prices:preview'])
    expect(render(seeded({}))).toContain('Revisar precios')

    login(['Operador'], [])
    expect(render(seeded({}))).not.toContain('Revisar precios')
  })

  it('con rol gestor (capa legada D5) la pestaña sigue disponible sin el permiso granular', () => {
    login(['Admin Comercial'], [])
    expect(render(seeded({}))).toContain('Revisar precios')
  })
})

describe('ACEPTACIÓN — «Quitar de la lista» (unlink) visible por producto', () => {
  it('cada producto de la tabla ofrece quitarlo de la lista', () => {
    const cliente = seeded({
      products: [producto(), producto({ id: '33333333-3333-4333-8333-333333333333', sku: 'OTRO-SKU', name: 'Segundo producto' })],
    })

    const html = render(cliente)

    expect(occurrences(html, 'Quitar de la lista')).toBe(2)
    expect(html).toContain('Producto Fixture Vinculos')
    expect(html).toContain('Segundo producto')
  })

  it('el botón de quitar lleva el aviso conservacionista (no borra ni mueve)', () => {
    const html = render(seeded({}))

    expect(html).toContain(`title="${LISTA_UNLINK_CONSERVATION_NOTICE}"`)
    expect(html).toContain('no se añade a otra lista')
    expect(html).toContain('ficha, imágenes y precios')
  })

  it('quien no es Super Admin/Admin Comercial no ve el botón (roles del backend)', () => {
    login(['Operador'])

    const html = render(seeded({}))

    expect(html).not.toContain('Quitar de la lista')
    // La lista sí se consulta en modo lectura.
    expect(html).toContain('Producto Fixture Vinculos')
  })
})

describe('ACEPTACIÓN — la UI no ofrece mover producto entre listas', () => {
  it('con categorías cargadas el único «Mover» no ofrece lista destino', () => {
    const html = render(seeded({}))

    // El mover de categorías existe (PUT { categoryId })…
    expect(html).toContain('>Mover</button>')
    // …pero no hay ninguna UI implícita de reasignación de lista:
    expect(html).not.toContain('Lista destino')
    expect(html).not.toContain('lista destino')
    expect(html).not.toContain('Mover a otra lista')
    expect(html).not.toContain('Cambiar de lista')
    expect(html).not.toContain('Categoría destino')
  })

  it('el detalle solo pide y lista los productos de ESA lista', () => {
    const html = render(seeded({}))

    const productosQueries = captured.queries.filter((q) => q.key === 'lista-products')
    expect(productosQueries).toHaveLength(1)
    expect(captured.queries.some((q) => q.key === 'products')).toBe(false)
    expect(html).toContain('T06C-SKU-1')
    expect(occurrences(html, 'Producto Fixture Vinculos')).toBeGreaterThan(0)
  })
})

describe('ACEPTACIÓN (c) — archivar/restaurar muestran el estado', () => {
  it('una lista archivada muestra el badge «Archivada» y el botón «Restaurar»', () => {
    const cliente = new QueryClient()
    const archivada = lista({ archivedAt: '2026-10-10T12:00:00.000Z', isActive: false })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={cliente}>
        <ConfiguracionTab lista={archivada} products={[]} listaId={LISTA_ID} canEdit />
      </QueryClientProvider>,
    )

    expect(html).toContain('Archivada')
    expect(html).toContain('Restaurar')
    expect(html).not.toContain('>Archivar</button>')
    expect(html).toMatch(/id="cfg-name"[^>]*disabled/)
  })

  it('una lista viva muestra «Activa» y el botón «Archivar»', () => {
    const cliente = new QueryClient()

    const html = renderToStaticMarkup(
      <QueryClientProvider client={cliente}>
        <ConfiguracionTab lista={lista()} products={[]} listaId={LISTA_ID} canEdit />
      </QueryClientProvider>,
    )

    expect(html).toContain('Activa')
    expect(html).toContain('>Archivar</button>')
    expect(html).not.toContain('Restaurar')
  })
})
