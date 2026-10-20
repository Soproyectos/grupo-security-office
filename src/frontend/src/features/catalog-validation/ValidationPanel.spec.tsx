import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ValidationPanel, type ValidationPanelProps } from './ValidationPanel'
import type { ValidationReportView } from './validation-model'

const report: ValidationReportView = {
  productId: 'p-1',
  revisionId: 'rev-1',
  status: 'CON_PROBLEMAS',
  issues: [
    { code: 'media.primary_image', severity: 'error', field: 'images', section: 'multimedia', message: 'No hay imagen principal.', fix: 'Sube una imagen.' },
    { code: 'docs.datasheet_missing', severity: 'warning', field: 'resources', section: 'documentos', message: 'Sin ficha técnica (PDF).', fix: 'Añade un PDF.' },
  ],
  rulesVersion: 'cat05-r1',
  at: '2026-10-17T10:00:00.000Z',
}

const render = (over: Partial<ValidationPanelProps> = {}) =>
  renderToStaticMarkup(
    createElement(ValidationPanel, {
      report,
      canEditSheet: true,
      validating: false,
      error: null,
      onValidate: () => undefined,
      ...over,
    }),
  )

describe('ValidationPanel (CAT-05 frontend)', () => {
  it('pinta estado, versión de reglas, incidencia bloqueante primero y enlaces con permiso', () => {
    const html = render()
    expect(html).toContain('con problemas')
    expect(html).toContain('cat05-r1')
    expect(html).toContain('Volver a validar')
    const first = html.indexOf('Bloquea')
    expect(first).toBeGreaterThan(-1)
    expect(html.indexOf('Aviso')).toBeGreaterThan(first) // errores antes que avisos
    expect(html).toContain('href="#ficha-fotos"')
    expect(html).toContain('Ir a la sección')
  })

  it('sin permiso de ficha: las incidencias se ven SIN enlaces (no se habilita la acción)', () => {
    const html = render({ canEditSheet: false })
    expect(html).toContain('No hay imagen principal.')
    expect(html).not.toContain('Ir a la sección')
    expect(html).not.toContain('#ficha-fotos')
  })

  it('informe obsoleto muestra el aviso de recálculo (caso 3 de la ficha)', () => {
    const html = render({ report: { ...report, stale: true } })
    expect(html).toContain('obsoleto')
    expect(html).toContain('Vuelve a validar')
    expect(html).toContain('revisión pendiente')
  })

  it('sin informe: botón Validar y etiqueta sin revisar', () => {
    const html = render({ report: null })
    expect(html).toContain('sin revisar')
    expect(html).toContain('>Validar')
    expect(html).not.toContain('validation-issues')
  })

  it('error de validación visible; nunca afirma éxito sin informe', () => {
    const html = render({ report: null, error: 'Sin permiso products:validate' })
    expect(html).toContain('Sin permiso products:validate')
    expect(html).not.toContain('lista para publicar')
  })
})
