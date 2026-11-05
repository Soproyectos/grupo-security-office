/**
 * CAT-06 `frontend` — modelo puro + paneles presentacionales (render de
 * servidor, patrón de la tanda: sin DOM, sin red).
 */
import { describe, expect, it, vi } from 'vitest'
import {
  buildPublishSteps,
  describeBoardItem,
  describePublicationEvent,
  offeredAction,
  publicationBlockLines,
  viewBadge,
  type BoardItem,
  type PublishStepContext,
} from './publication-model'
import type { ValidationIssueView } from '../catalog-validation/validation-model'
import { fetchBoard, fetchPublicationHistory } from './publication-api'
import api from '../../services/api'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
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
      createElement(MemoryRouter, null, createElement(PublicationBoardPanel, {
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
      })),
    )
    expect(html).toContain('Pendientes')
    expect(html).toContain('revisión congelada')
    expect(html).toContain('Cámara Domo')
    expect(html).toContain('SKU-1')
    expect(html).toContain('Validada sin errores')
    expect(html).toContain('Revisar y publicar')
    expect(html).toContain('href="/catalog-management/publication/products/p-1"')
    expect(html).toContain('Buscar producto')
    expect(html).toContain('aria-label="Buscar SKU o nombre"')
  })

  it('la bandeja vacía no inventa filas y el error se muestra', () => {
    const empty = renderToStaticMarkup(
      createElement(PublicationBoardPanel, { view: 'historial', items: [], total: 0, page: 0, busy: false, error: null, search: '', onSearch: () => undefined, onView: () => undefined, onPage: () => undefined }),
    )
    expect(empty).toContain('No hay productos en esta vista')
    expect(empty).not.toContain('data-testid="board-item-')
    const err = renderToStaticMarkup(
      createElement(PublicationBoardPanel, { view: 'pendientes', items: [], total: 0, page: 0, busy: false, error: 'No se pudo cargar', search: '', onSearch: () => undefined, onView: () => undefined, onPage: () => undefined }),
    )
    expect(err).toContain('No se pudo cargar')
    expect(err).not.toContain('data-testid="board-empty"')
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

describe('buildPublishSteps (pasos para publicar)', () => {
  const ready: PublishStepContext = { check: 'current', unsavedChanges: false, pricesPending: false }
  const issue = (over: Partial<ValidationIssueView> & Pick<ValidationIssueView, 'code' | 'severity' | 'section'>): ValidationIssueView => ({
    field: undefined, message: 'Mensaje del servidor.', fix: 'Corrígelo.', ...over,
  })
  const name = issue({ code: 'base.name_useful', severity: 'error', section: 'identidad', field: 'name' })
  const brand = issue({ code: 'base.brand_present', severity: 'error', section: 'identidad', field: 'brand' })
  const category = issue({ code: 'base.category_valid', severity: 'error', section: 'identidad', field: 'categoryId' })
  const image = issue({ code: 'media.primary_image', severity: 'error', section: 'multimedia', field: 'images' })
  const price = issue({ code: 'offer.price_valid', severity: 'error', section: 'oferta', field: 'prices' })
  const datasheet = issue({ code: 'docs.datasheet_missing', severity: 'warning', section: 'documentos', field: 'resources' })
  const stock = issue({ code: 'stock.zero_info', severity: 'info', section: 'oferta', field: 'stock' })
  const externalImage = issue({ code: 'media.external_unverified', severity: 'warning', section: 'multimedia', field: 'images' })
  const statuses = (steps: ReturnType<typeof buildPublishSteps>) => steps.map((step) => step.status)

  it('todos listos: pasos 1 a 3 completos y el paso 4 activo sin faltas', () => {
    const steps = buildPublishSteps([], ready)
    expect(statuses(steps)).toEqual(['done', 'done', 'done', 'active'])
    expect(steps.map((step) => step.number)).toEqual([1, 2, 3, 4])
    expect(steps[3]?.missing).toEqual([])
    expect(steps[3]?.notices).toEqual([])
  })

  it('falta la marca: el paso 1 queda activo con la frase simple y el resto bloqueado', () => {
    const steps = buildPublishSteps([brand], ready)
    expect(statuses(steps)).toEqual(['active', 'blocked', 'blocked', 'blocked'])
    expect(steps[0]?.missing).toEqual([{ text: 'Falta elegir la marca.', fixSection: 'datos-generales' }])
  })

  it('falta el precio: el paso 3 queda activo y apunta a Precios', () => {
    const steps = buildPublishSteps([price], ready)
    expect(statuses(steps)).toEqual(['done', 'done', 'active', 'blocked'])
    expect(steps[2]?.missing).toEqual([{ text: 'Falta un precio vigente y positivo.', fixSection: 'precios' }])
  })

  it('falta la imagen principal: el paso 2 queda activo y apunta a Imágenes', () => {
    const steps = buildPublishSteps([image], ready)
    expect(statuses(steps)).toEqual(['done', 'active', 'blocked', 'blocked'])
    expect(steps[1]?.missing).toEqual([{ text: 'Falta una imagen principal.', fixSection: 'imagenes' }])
  })

  it('varios faltantes: solo el primero queda abierto con todas sus faltas', () => {
    const steps = buildPublishSteps([name, category, brand, price], ready)
    expect(statuses(steps)).toEqual(['active', 'blocked', 'blocked', 'blocked'])
    expect(steps[0]?.missing.map((item) => item.text)).toEqual([
      'Falta escribir un nombre útil.',
      'Falta elegir una categoría activa.',
      'Falta elegir la marca.',
    ])
    expect(steps[2]?.missing).toHaveLength(1)
  })

  it('avisos no bloqueantes no bloquean: el paso 4 queda activo y los muestra', () => {
    const steps = buildPublishSteps([datasheet, stock, externalImage], ready)
    expect(statuses(steps)).toEqual(['done', 'done', 'done', 'active'])
    expect(steps[3]?.missing).toEqual([])
    expect(steps[3]?.notices).toEqual([
      'Falta la ficha técnica en PDF.',
      'No hay stock: la tienda mostrará «Agotado».',
      'Una imagen usa un enlace externo que no se puede verificar.',
    ])
  })

  it('un archivo propio inexistente bloquea el paso 4 con el enlace a Recursos', () => {
    const file = issue({ code: 'media.file_exists', severity: 'error', section: 'documentos', field: 'resources' })
    const steps = buildPublishSteps([file], ready)
    expect(statuses(steps)).toEqual(['done', 'done', 'done', 'active'])
    expect(steps[3]?.missing).toEqual([
      { text: 'Un archivo no está en el almacén o no es del tipo esperado. Vuelve a subirlo o corrige su dirección.', fixSection: 'recursos' },
    ])
  })

  it('sin revisión vigente: el paso 1 pide comprobar y el resto queda bloqueado', () => {
    for (const check of ['none', 'unavailable', 'stale'] as const) {
      const steps = buildPublishSteps([brand], { ...ready, check })
      expect(statuses(steps)).toEqual(['active', 'blocked', 'blocked', 'blocked'])
      expect(steps[0]?.missing[0]?.fixSection).toBeNull()
    }
    expect(buildPublishSteps([], { ...ready, check: 'none' })[0]?.missing[0]?.text).toContain('Validar ficha')
  })

  it('cambios sin guardar y precios en curso bloquean el paso 4', () => {
    const unsaved = buildPublishSteps([], { ...ready, unsavedChanges: true })
    expect(statuses(unsaved)).toEqual(['done', 'done', 'done', 'active'])
    expect(unsaved[3]?.missing.map((item) => item.text)).toEqual(['Hay cambios sin guardar en la ficha.'])

    const pricing = buildPublishSteps([], { ...ready, pricesPending: true })
    expect(pricing[3]?.missing.map((item) => item.text)).toEqual(['Hay un cambio de precios en curso.'])
  })

  it('un código bloqueante desconocido no se oculta: cae en el paso 4 con el mensaje del servidor', () => {
    const unknown = issue({ code: 'attrs.warranty', severity: 'error', section: 'atributos', field: 'extraAttributes', message: 'Falta la garantía.' })
    const steps = buildPublishSteps([unknown], ready)
    expect(statuses(steps)).toEqual(['done', 'done', 'done', 'active'])
    expect(steps[3]?.missing).toEqual([{ text: 'Falta la garantía.', fixSection: 'descripcion' }])
  })
})
