import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { BulkPublishBar, type BulkPublishOutcome, type BulkPublishPhase } from './BulkPublishBar'
import { bulkProblemText } from './publication-model'

const noop = () => undefined

const render = (over: Partial<{ phase: BulkPublishPhase; selectedCount: number; selectableCount: number; outcome: BulkPublishOutcome | null; errorMessage: string | null }> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <BulkPublishBar
        phase="idle"
        selectedCount={0}
        selectableCount={5}
        outcome={null}
        errorMessage={null}
        onToggleAll={noop}
        onAskConfirm={noop}
        onCancelConfirm={noop}
        onConfirm={noop}
        onExit={noop}
        editPath={(id) => `/ficha/${id}`}
        {...over}
      />
    </MemoryRouter>,
  )

describe('BulkPublishBar', () => {
  it('sin selección: contador en cero y «Publicar seleccionados» desactivado', () => {
    const html = render()
    expect(html).toContain('Ninguno seleccionado')
    expect(html).toContain('Seleccionar todos los borradores de esta página (5)')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Publicar seleccionados<\/button>/)
  })

  it('con selección: cuenta, activa el botón y marca «todos» solo si están todos', () => {
    const some = render({ selectedCount: 2 })
    expect(some).toContain('2 seleccionados')
    expect(some).not.toMatch(/<button[^>]*disabled=""[^>]*>Publicar seleccionados<\/button>/)
    expect(some).not.toContain('checked=""')
    expect(render({ selectedCount: 5 })).toContain('checked=""')
  })

  it('pide confirmación con el número exacto y avisa que solo se publican los válidos', () => {
    const html = render({ phase: 'confirming', selectedCount: 3 })
    expect(html).toContain('Vas a validar y publicar <strong>3</strong> productos')
    expect(html).toContain('Solo se publicarán los que cumplan todos los requisitos')
    expect(html).toContain('>Validar y publicar</button>')
    expect(html).toContain('>Volver</button>')
  })

  it('mientras publica muestra el estado de carga', () => {
    const html = render({ phase: 'running', selectedCount: 4 })
    expect(html).toContain('Validando y publicando 4 productos')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Publicando…<\/button>/)
  })

  it('el resumen cuenta publicados y lista nombre, SKU y lo que falta de cada rechazado', () => {
    const html = render({
      phase: 'done',
      outcome: {
        requested: 3,
        applied: 1,
        rejected: [
          { id: 'a', sku: 'SKU-A', name: 'Cámara A', reason: 'x', problems: ['El producto no tiene al menos un precio vigente', 'El producto no tiene al menos una imagen'] },
          { id: 'b', sku: 'SKU-B', name: 'Cámara B', reason: 'x', problems: ['base.brand_present (identidad): Marca vacía'] },
        ],
      },
    })
    expect(html).toContain('Se publicó 1 producto de 3.')
    expect(html).toContain('2 quedaron sin publicar porque les falta algo.')
    expect(html).toContain('Cámara A')
    expect(html).toContain('SKU-A')
    expect(html).toContain('Falta un precio vigente.')
    expect(html).toContain('Falta al menos una imagen.')
    expect(html).toContain('Falta elegir la marca.')
    expect(html).toContain('href="/ficha/b"')
    expect(html).toContain('>Listo</button>')
  })

  it('si no se publicó nada lo dice claro; un error general se muestra como alerta', () => {
    const none = render({ phase: 'done', outcome: { requested: 1, applied: 0, rejected: [{ id: 'a', reason: 'Producto no encontrado' }] } })
    expect(none).toContain('No se publicó ningún producto.')
    expect(none).toContain('Producto no encontrado')
    const failed = render({ errorMessage: 'No tienes permiso para publicar productos.' })
    expect(failed).toContain('role="alert"')
    expect(failed).toContain('No tienes permiso para publicar productos.')
  })
})

describe('bulkProblemText', () => {
  it('traduce códigos del motor y frases del checklist a lenguaje simple', () => {
    expect(bulkProblemText('media.primary_image (multimedia): lo que sea')).toBe('Falta una imagen principal.')
    expect(bulkProblemText('offer.price_valid (oferta): x')).toBe('Falta un precio vigente y positivo.')
    expect(bulkProblemText('El producto no tiene al menos un precio vigente')).toBe('Falta un precio vigente.')
    expect(bulkProblemText('codigo.raro (sec): Mensaje del motor')).toBe('Mensaje del motor')
    expect(bulkProblemText('Producto no encontrado')).toBe('Producto no encontrado')
  })
})
