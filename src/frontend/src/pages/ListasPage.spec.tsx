import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ListasPage, { DeleteConfirmModal } from './ListasPage'
import { useAuthStore } from '../stores/auth.store'
import { LISTA_DELETE_CONSERVATION_NOTICE, type Lista } from '../services/listas.service'

/**
 * CAT-01 frontend — ListasPage (render de servidor con caché sembrada; el
 * repo no tiene entorno DOM, patrón de AgendaCalendarPage). Lo que se
 * acredita aquí:
 *
 * ✅ ACEPTACIÓN (a): el diálogo de eliminación muestra el aviso
 *    conservacionista («Los productos, imágenes y precios se conservan; la
 *    lista desaparece.») y ya NO afirma que los productos se eliminarán.
 * ✅ Estados visibles: archivada (badge + restaurar), viva (archivar) y
 *    «En eliminación» (PENDING_DELETION que el servidor ya devuelve).
 * ✅ ACEPTACIÓN (b): ninguna UI de mover productos entre listas.
 * ✅ El recorrido de errores 400/403/409 del borrado vive en
 *    listas.service.spec.ts (motivo 409 «tal cual»); el pintado del banner
 *    es interacción, queda para QA-01 en navegador.
 */

const USER = 'user-1'

function login(roles: string[]) {
  const session = {
    isAuthenticated: true,
    user: { id: USER, name: 'Usuario de prueba', email: 'user@example.invalid', roles, permissions: [] },
  }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}

function lista(over: Partial<Lista> = {}): Lista {
  return {
    id: `l-${Math.random().toString(36).slice(2, 8)}`,
    code: 'L-1',
    name: 'Lista de prueba',
    description: null,
    currency: 'COP',
    isActive: true,
    archivedAt: null,
    productCount: 2,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    ...over,
  }
}

const ACTIVA = lista({ id: 'l-activa', code: 'L-ACT', name: 'Lista Mayorista' })
const ARCHIVADA = lista({
  id: 'l-arch',
  code: 'L-ARCH',
  name: 'Lista Archivada',
  isActive: false,
  archivedAt: '2026-10-10T12:00:00.000Z',
})
const PENDIENTE = lista({
  id: 'l-pend',
  code: 'L-PEND',
  name: 'Lista En Eliminacion',
  deletionStatus: 'PENDING_DELETION',
})

function seeded(listas: Lista[]) {
  const client = new QueryClient()
  client.setQueryData(['listas'], listas)
  return client
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ListasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderConfirmModal(listas: Lista[], ids: string[]) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DeleteConfirmModal listas={listas} ids={ids} onClose={() => {}} onConfirm={() => {}} />
    </MemoryRouter>,
  )
}

const occurrences = (html: string, text: string) => html.split(text).length - 1

beforeEach(() => {
  login(['Super Admin'])
})

describe('estados visibles de la lista (archivada / viva / en eliminación)', () => {
  it('una lista archivada muestra «Archivado» y el botón «Restaurar Lista»', () => {
    const html = render(seeded([ACTIVA, ARCHIVADA]))

    expect(html).toContain('Archivado')
    expect(html).toContain('aria-label="Restaurar Lista"')
    expect(html).toContain('Lista Archivada')
  })

  it('una lista viva muestra el botón «Archivar Lista» y no el de restaurar', () => {
    const html = render(seeded([ACTIVA, ARCHIVADA]))

    expect(html).toContain('aria-label="Archivar Lista"')
    expect(occurrences(html, 'aria-label="Restaurar Lista"')).toBe(1)
  })

  it('una lista con eliminación pendiente expone la señal «En eliminación»', () => {
    const html = render(seeded([ACTIVA, PENDIENTE]))

    expect(html).toContain('En eliminación')
    expect(occurrences(html, 'En eliminación')).toBe(1)
  })

  it('pinta el recuento de resultados con las listas sembradas', () => {
    const html = render(seeded([ACTIVA, ARCHIVADA, PENDIENTE]))

    expect(html).toContain('3 resultado(s)')
  })
})

describe('ACEPTACIÓN (a) — diálogo de eliminación conservacionista', () => {
  it('muestra el aviso de que productos, imágenes y precios se conservan', () => {
    const html = renderConfirmModal([ACTIVA], ['l-activa'])

    expect(html).toContain('Confirmar eliminación')
    expect(html).toContain(LISTA_DELETE_CONSERVATION_NOTICE)
    expect(html).toContain('Los productos, imágenes y precios se conservan')
  })

  it('ya NO afirma que los productos y datos asociados se eliminarán', () => {
    const html = renderConfirmModal([ACTIVA], ['l-activa'])

    expect(html).not.toContain('Todos los productos y datos asociados se eliminarán')
    expect(html).not.toContain('elimina las listas y sus datos asociados')
  })

  it('conserva la confirmación explícita: casilla + botón deshabilitado hasta marcar', () => {
    const html = renderConfirmModal([ACTIVA, ARCHIVADA], ['l-activa', 'l-arch'])

    expect(occurrences(html, 'type="checkbox"')).toBe(1)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Eliminar definitivamente/)
    expect(html).toContain('Lista Mayorista, Lista Archivada')
  })
})

describe('ACEPTACIÓN (b) — sin UI de mover productos entre listas', () => {
  it('el listado no ofrece ninguna lista destino ni acción de mover producto', () => {
    const html = render(seeded([ACTIVA]))

    expect(html).not.toContain('Lista destino')
    expect(html).not.toContain('lista destino')
    expect(html).not.toContain('Mover a otra lista')
    expect(html).not.toContain('Mover producto')
    expect(html).not.toContain('Cambiar de lista')
  })
})
