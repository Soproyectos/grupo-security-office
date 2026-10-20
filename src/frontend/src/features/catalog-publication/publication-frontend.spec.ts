/**
 * CAT-06 `frontend` — modelo puro + paneles presentacionales (render de
 * servidor, patrón de la tanda: sin DOM, sin red).
 */
import { describe, expect, it, vi } from 'vitest'
import {
  describeBoardItem,
  describePublicationEvent,
  offeredAction,
  publicationBlockLines,
  viewBadge,
  type BoardItem,
} from './publication-model'
import { fetchBoard, fetchPublicationHistory } from './publication-api'
import api from '../../services/api'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicationBoardPanel } from './PublicationBoardPanel'
import { ProductPublicationPanel } from './ProductPublicationPanel'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))

const item = (over: Partial<BoardItem> = {}): BoardItem => ({
  id: 'p-1',
  sku: 'SKU-1',
  name: 'Cámara Domo',
  category: 'Domos',
  lifecycleStatus: 'DRAFT',
  publishAt: '2026-10-20T10:00:00.000Z',
  scheduledRevisionId: 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  publicRevisionId: null,
  workingRevision: { id: 'r-1', version: 2, status: 'LISTA_PARA_PUBLICAR', rulesVersion: 'cat05-r1', validatedAt: '2026-10-17T10:00:00Z', errorCount: 0, warningCount: 1 },
  ...over,
})

describe('viewBadge / offeredAction', () => {
  it('etiquetas por vista y acción según estado', () => {
    expect(viewBadge('problemas').label).toBe('con problemas')
    expect(offeredAction('DRAFT')).toBe('publicar')
    expect(offeredAction('PUBLISHED')).toBe('retirar')
    expect(offeredAction('ARCHIVED')).toBeNull()
  })
})

describe('describeBoardItem (sin inventar reglas)', () => {
  it('anuncio de congelado: se publicará la revisión congelada, no cambios posteriores', () => {
    const { schedule, published } = describeBoardItem(item())
    expect(schedule).toContain('revisión congelada')
    expect(schedule).toContain('no los cambios posteriores')
    expect(published).toBeNull()
  })

  it('sin congelada pero programado: se congelará al disparar (honesto, no promete pin)', () => {
    const { schedule } = describeBoardItem(item({ scheduledRevisionId: null }))
    expect(schedule).toContain('se congelará al disparar')
  })

  it('publicado muestra la revisión exacta en tienda y validación sin errores', () => {
    const r = describeBoardItem(item({ lifecycleStatus: 'PUBLISHED', publishAt: null, scheduledRevisionId: null, publicRevisionId: 'ffff1111-2222-4333-9444-555555555555' }))
    expect(r.published).toContain('ffff1111')
    expect(r.validation).toContain('sin errores')
    expect(r.validation).toContain('cat05-r1')
  })

  it('errores de validación bloquean y se anuncian', () => {
    const r = describeBoardItem(item({ workingRevision: { id: 'r', version: 1, status: 'CON_PROBLEMAS', rulesVersion: null, validatedAt: '2026-10-17T09:00:00Z', errorCount: 2, warningCount: 0 } }))
    expect(r.validation).toContain('2 errores')
    expect(r.validation).toContain('bloquean publicar')
  })

  it('sin informe: «Sin validar» (no «listo»)', () => {
    expect(describeBoardItem(item({ workingRevision: null })).validation).toBe('Sin validar')
    expect(describeBoardItem(item({ workingRevision: { ...item().workingRevision!, validatedAt: null } })).validation).toBe('Sin validar')
  })
})

describe('publicationBlockLines (409 del motor)', () => {
  const err = (status: number, data: unknown) => ({ response: { status, data } })

  it('extrae las líneas del feedback cuando es 409 de publicación', () => {
    const lines = publicationBlockLines(
      err(409, {
        message: 'Publicación bloqueada: la validación vigente tiene problemas bloqueantes (o quedó obsoleta al editar).',
        feedback: ['media.primary_image (multimedia): No hay imagen principal.', 'offer.price_valid (oferta): Sin precio válido.'],
      }),
    )
    expect(lines).toEqual(['media.primary_image (multimedia): No hay imagen principal.', 'offer.price_valid (oferta): Sin precio válido.'])
  })

  it('409 de OTRO conflicto (p. ej. slug) no se disfraza de publicación bloqueada', () => {
    expect(publicationBlockLines(err(409, { message: 'Ya existe otro producto con ese slug' }))).toBeNull()
  })

  it('otros estados devuelven null (el llamador usa el error genérico)', () => {
    expect(publicationBlockLines(err(403, { message: 'sin permiso' }))).toBeNull()
    expect(publicationBlockLines(new Error('network'))).toBeNull()
  })
})

describe('describePublicationEvent', () => {
  it('traduce la acción y marca el disparo del scheduler (actor null)', () => {
    const line = describePublicationEvent({ action: 'SCHEDULE_PUBLISHED', result: 'ok', revisionId: 'abcd1234-5678-4abc-9def-0123456789ab', actorId: null, createdAt: '2026-10-17T22:00:00Z' })
    expect(line).toContain('Disparo del scheduler')
    expect(line).toContain('scheduler')
    expect(line).toContain('abcd1234')
    expect(line).toContain('(ok)')
  })
})

describe('paneles (render de servidor)', () => {
  it('la bandeja pinta vistas, aviso de congelado y vacío honesto', () => {
    const html = renderToStaticMarkup(
      createElement(PublicationBoardPanel, {
        view: 'pendientes',
        items: [item()],
        total: 1,
        page: 0,
        busy: false,
        error: null,
        search: '',
        onSearch: () => undefined,
        onView: () => undefined,
        onPage: () => undefined,
      }),
    )
    expect(html).toContain('Pendientes')
    expect(html).toContain('revisión congelada')
    expect(html).toContain('Cámara Domo')
    expect(html).toContain('Validada sin errores')
  })

  it('la bandeja vacía no inventa filas y el error se muestra', () => {
    const empty = renderToStaticMarkup(
      createElement(PublicationBoardPanel, { view: 'historial', items: [], total: 0, page: 0, busy: false, error: null, search: '', onSearch: () => undefined, onView: () => undefined, onPage: () => undefined }),
    )
    expect(empty).toContain('Nada en esta vista')
    const err = renderToStaticMarkup(
      createElement(PublicationBoardPanel, { view: 'pendientes', items: [], total: 0, page: 0, busy: false, error: 'No se pudo cargar', search: '', onSearch: () => undefined, onView: () => undefined, onPage: () => undefined }),
    )
    expect(err).toContain('No se pudo cargar')
  })

  it('el historial del producto lista eventos o dice que no hay (sin inventar)', () => {
    const withEvents = renderToStaticMarkup(
      createElement(ProductPublicationPanel, {
        events: [{ action: 'PUBLISH', result: 'blocked', revisionId: null, actorId: 'u-1', createdAt: '2026-10-17T22:00:00Z' }],
        lines: ['media.primary_image (multimedia): No hay imagen principal.'],
      }),
    )
    expect(withEvents).toContain('Último intento bloqueado')
    expect(withEvents).toContain('media.primary_image')
    const none = renderToStaticMarkup(createElement(ProductPublicationPanel, { events: [], lines: null }))
    expect(none).toContain('Sin historial de publicación todavía')
  })
})

describe('publication-api', () => {
  it('bandeja: GET con view/search/page y unwrap del envoltorio', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { view: 'pendientes', page: 0, pageSize: 50, total: 0, items: [] } })
    const r = await fetchBoard('pendientes', { search: 'domo', page: 2 })
    expect(api.get).toHaveBeenCalledWith('/catalog/publication-board', { params: { view: 'pendientes', search: 'domo', page: 2 } })
    expect(r.total).toBe(0)
  })

  it('historial: null → lista vacía', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null })
    expect(await fetchPublicationHistory('p-1')).toEqual([])
    expect(api.get).toHaveBeenCalledWith('/products/p-1/publication-history')
  })
})
