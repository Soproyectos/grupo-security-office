import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '../../../stores/auth.store'
import { ProductInternalNotes, noteErrorMessage } from './ProductInternalNotes'
import { internalNoteKeys, type InternalNoteApi } from './sheet.service'

const notes: InternalNoteApi[] = [
  { id: 'n-2', text: 'Segunda nota ficticia\ncon salto de línea', authorName: 'Ana Prueba', createdAt: '2026-01-02T15:30:00.000Z', updatedAt: '2026-01-03T09:00:00.000Z', canEdit: true, version: 1 },
  { id: 'n-1', text: 'Primera nota ficticia', authorName: 'Beto Ejemplo', createdAt: '2026-01-01T10:00:00.000Z', updatedAt: null, canEdit: false, version: 0 },
]

interface Options {
  permissions?: string[]
  blocked?: boolean
  defaultEditing?: boolean
  defaultEditingNoteId?: string | null
  data?: InternalNoteApi[] | null
  error?: unknown
}

function renderNotes({ permissions = ['products:write', 'products:notes'], blocked = false, defaultEditing = false, defaultEditingNoteId = null, data: dataProp = notes, error }: Options = {}) {
  const session = { user: { id: 'u-1', name: 'Prueba', email: 'qa@example.invalid', roles: ['Consulta'], permissions }, isAuthenticated: true }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = internalNoteKeys.list('p-1')
  if (error !== undefined) {
    client.getQueryCache().build(client, { queryKey: key }).setState({ error, status: 'error', fetchStatus: 'idle', errorUpdateCount: 1, errorUpdatedAt: Date.now() } as never)
  } else if (dataProp) {
    client.setQueryData(key, dataProp)
  }
  return renderToStaticMarkup(<QueryClientProvider client={client}>
    <ProductInternalNotes productId="p-1" blocked={blocked} defaultEditing={defaultEditing} defaultEditingNoteId={defaultEditingNoteId} onDirtyChange={() => undefined} />
  </QueryClientProvider>)
}

describe('notas internas del producto (lista)', () => {
  it('muestra todas las notas, la más reciente arriba, con autor y fecha', () => {
    const html = renderNotes()
    expect(html).toContain('Ana Prueba')
    expect(html).toContain('Beto Ejemplo')
    expect(html.indexOf('Segunda nota ficticia')).toBeLessThan(html.indexOf('Primera nota ficticia'))
    expect(html).toContain('dateTime="2026-01-02T15:30:00.000Z"')
    expect(html).toContain('whitespace-pre-wrap break-words')
    expect(html.match(/data-testid="internal-note"/g)).toHaveLength(2)
  })

  it('indica la edición solo en la nota editada', () => {
    const html = renderNotes()
    expect(html.match(/Editada/g)).toHaveLength(1)
    expect(html).toContain('dateTime="2026-01-03T09:00:00.000Z"')
  })

  it('ofrece el botón Escribir nota arriba de la lista', () => {
    const html = renderNotes()
    expect(html).toMatch(/<button[^>]*min-h-\[44px\][^>]*>Escribir nota<\/button>/)
    expect(html.indexOf('Escribir nota')).toBeLessThan(html.indexOf('Ana Prueba'))
    expect(html).not.toContain('<textarea')
  })

  it('el botón Editar aparece solo en la nota con canEdit', () => {
    const html = renderNotes()
    expect(html.match(/>Editar<\/button>/g)).toHaveLength(1)
    const ownCard = html.slice(html.indexOf('Ana Prueba'), html.indexOf('Primera nota ficticia'))
    expect(ownCard).toContain('>Editar</button>')
    expect(html.slice(html.indexOf('Beto Ejemplo'))).not.toContain('>Editar</button>')
  })

  it('estado vacío: mensaje y botón Escribir nota visibles', () => {
    const html = renderNotes({ data: [] })
    expect(html).toContain('Aún no hay notas para este producto.')
    expect(html).toContain('>Escribir nota</button>')
  })

  it('abre el campo de nueva nota con etiqueta, contador y botones', () => {
    const html = renderNotes({ defaultEditing: true })
    expect(html).toContain('>Nueva nota</label>')
    expect(html).toContain('0 / 4000')
    expect(html).toContain('maxLength="4000"')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Guardar nota<\/button>/)
    expect(html).toContain('>Cancelar</button>')
  })

  it('abre una nota propia en modo edición con Guardar cambios', () => {
    const html = renderNotes({ defaultEditingNoteId: 'n-2' })
    expect(html).toContain('data-testid="internal-note-editing"')
    expect(html).toContain('>Guardar cambios</button>')
    expect(html).toContain('Segunda nota ficticia')
    expect(html).not.toContain('>Editar</button>')
  })

  it('bloqueado: deshabilita Escribir nota y Editar con el mensaje de la ficha pública', () => {
    const html = renderNotes({ blocked: true })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Escribir nota<\/button>/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Editar<\/button>/)
    expect(html).toContain('Guarda o descarta los cambios de la ficha pública antes de editar las notas.')
  })

  it('sin permisos de notas no pinta nada aunque queden datos en caché', () => {
    expect(renderNotes({ permissions: ['products:read', 'products:publish'] })).toBe('')
    expect(renderNotes({ permissions: ['products:write'] })).toBe('')
  })

  it('cargando: skeleton y texto de la operación', () => {
    const html = renderNotes({ data: null })
    expect(html).toContain('Cargando notas internas…')
    expect(html).toContain('animate-pulse')
  })

  it('el servidor responde 403: mensaje propio, sin controles ni textos genéricos', () => {
    const html = renderNotes({ error: { response: { status: 403, data: { message: 'Sin permiso products:write' } } } })
    expect(html).toContain('No tienes acceso a las notas internas.')
    expect(html).not.toContain('Sin permiso products:write')
    expect(html).not.toContain('Escribir nota')
  })

  it('error al cargar: mensaje y Reintentar', () => {
    const html = renderNotes({ error: { response: { status: 500 } } })
    expect(html).toContain('No se pudieron cargar las notas internas.')
    expect(html).toContain('>Reintentar</button>')
  })

  it('traduce los errores de guardado a español simple', () => {
    expect(noteErrorMessage({ response: { status: 403, data: { code: 'INTERNAL_NOTE_NOT_AUTHOR' } } })).toBe('Solo quien escribió la nota puede editarla.')
    expect(noteErrorMessage({ response: { status: 404, data: { code: 'INTERNAL_NOTE_NOT_FOUND' } } })).toContain('ya no existe')
    expect(noteErrorMessage({ response: { status: 400, data: { code: 'INTERNAL_NOTE_EMPTY' } } })).toBe('Escribe el texto de la nota.')
    expect(noteErrorMessage({ response: { status: 400, data: { code: 'INTERNAL_NOTE_TOO_LONG' } } })).toContain('4000')
    expect(noteErrorMessage(new Error('boom'))).toBe('No se pudo guardar la nota.')
    for (const status of [400, 403, 404]) expect(noteErrorMessage({ response: { status, data: { code: 'INTERNAL_NOTE_X' } } })).not.toMatch(/INTERNAL_/)
  })
})
