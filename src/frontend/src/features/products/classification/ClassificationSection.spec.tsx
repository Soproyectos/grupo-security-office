import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClassificationFields, SubcategoryChangeReview, type ClassificationFieldsProps } from './ClassificationSection'
import type { ClassificationRoot } from '../types/key-specs.types'

const tree: ClassificationRoot[] = [
  { id: 'r1', name: 'Video', slug: 'video', subcategories: [{ id: 's1', name: 'Cámaras IP', slug: 'camaras-ip' }, { id: 's2', name: 'NVR', slug: 'nvr' }] },
  { id: 'r2', name: 'Acceso', slug: 'acceso', subcategories: [{ id: 's3', name: 'Lectores', slug: 'lectores' }] },
]

const base: ClassificationFieldsProps = {
  tree,
  subcategoryId: 's3',
  brandId: 'b1',
  pendingId: null,
  onPick: () => undefined,
}

describe('ClassificationFields', () => {
  it('shows the derived root read-only and the subcategories grouped by root', () => {
    const html = renderToStaticMarkup(<ClassificationFields {...base} />)
    expect(html).toContain('data-testid="classification-root"')
    expect(html).toMatch(/data-testid="classification-root"[^>]*>\s*Acceso/)
    expect(html).toContain('<optgroup label="Video">')
    expect(html).toContain('<optgroup label="Acceso">')
    expect(html).toContain('Clasificado')
    expect(html).not.toContain('Por clasificar')
  })

  it('shows "Por clasificar" and what is missing when there is no subcategory or brand', () => {
    const html = renderToStaticMarkup(<ClassificationFields {...base} subcategoryId="" brandId="" fallbackRootName="Video" />)
    expect(html).toContain('Por clasificar')
    expect(html).toContain('Falta: subcategoría y marca')
    expect(html).toContain('Puedes guardar como borrador')
    expect(html).toMatch(/data-testid="classification-root"[^>]*>\s*Video/)
  })

  it('follows a pending pick for the derived root', () => {
    const html = renderToStaticMarkup(<ClassificationFields {...base} pendingId="s1" />)
    expect(html).toMatch(/data-testid="classification-root"[^>]*>\s*Video/)
  })

  it('keeps a saved subcategory that left the active tree selectable', () => {
    const html = renderToStaticMarkup(<ClassificationFields {...base} subcategoryId="gone" fallbackSubcategoryName="Antigua" />)
    expect(html).toContain('Antigua (ya no está activa)')
  })

  it('locks the select when the person cannot edit', () => {
    expect(renderToStaticMarkup(<ClassificationFields {...base} disabled />)).toMatch(/<select[^>]*\sdisabled=""/)
  })
})

describe('SubcategoryChangeReview', () => {
  const preview = {
    kept: [{ specKey: 'a', label: 'Resolución' }],
    needsReview: [{ specKey: 'b', label: 'Lente' }],
    newlyMissing: [{ specKey: 'c', label: 'Puertos', isRequired: true, status: 'APPROVED' as const }],
  }

  it('lists kept, review and new data with counts before the confirm button', () => {
    const html = renderToStaticMarkup(<SubcategoryChangeReview targetName="NVR" status="ready" preview={preview} onConfirm={() => undefined} onCancel={() => undefined} />)
    expect(html).toContain('Cambiar a «NVR»')
    expect(html).toContain('1 dato se conserva.')
    expect(html).toContain('1 dato queda por revisar (no se borra')
    expect(html).toContain('Resolución')
    expect(html).toContain('Lente')
    expect(html).toContain('Puertos')
    expect(html).toContain('obligatorio')
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Cambiar subcategoría/)
  })

  it('cannot be confirmed while the preview loads or when it failed', () => {
    for (const status of ['loading', 'error'] as const) {
      const html = renderToStaticMarkup(<SubcategoryChangeReview targetName="NVR" status={status} onConfirm={() => undefined} onCancel={() => undefined} />)
      expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Cambiar subcategoría/)
      expect(html).toContain('Cancelar')
    }
  })
})
