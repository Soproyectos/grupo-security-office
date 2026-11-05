import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KeySpecsForm, type KeySpecsFormProps } from './KeySpecsSection'
import { MissingKeySpecsPanel } from './MissingKeySpecsPanel'
import { baselineDraft, buildLayout, emptyDraft } from '../lib/key-specs'
import type { KeySpecItem } from '../types/key-specs.types'

const item = (specKey: string, dataType: KeySpecItem['dataType'], patch: Partial<KeySpecItem> = {}): KeySpecItem => ({
  specKey,
  label: `Dato ${specKey}`,
  dataType,
  unit: null,
  options: [],
  template: { status: 'APPROVED', isRequired: false, sortOrder: 1 },
  outsideTemplate: false,
  working: null,
  published: null,
  ...patch,
})

const stored = (patch: Partial<NonNullable<KeySpecItem['working']>>) => ({
  valueText: null,
  valueNumber: null,
  valueBoolean: null,
  optionKeys: [],
  ...patch,
})

const items: KeySpecItem[] = [
  item('modelo', 'TEXT', { template: { status: 'APPROVED', isRequired: true, sortOrder: 1 } }),
  item('potencia', 'NUMBER', { unit: 'W', template: { status: 'APPROVED', isRequired: false, sortOrder: 2 }, working: stored({ valueNumber: 0 }) }),
  item('poe', 'BOOLEAN', { template: { status: 'APPROVED', isRequired: false, sortOrder: 3 }, working: stored({ valueBoolean: false }) }),
  item('color', 'OPTION', {
    template: { status: 'PROPOSED', isRequired: true, sortOrder: 4 },
    options: [
      { key: 'negro', label: 'Negro', isActive: true },
      { key: 'viejo', label: 'Viejo', isActive: false },
    ],
  }),
  item('puertos', 'MULTI_OPTION', {
    template: { status: 'APPROVED', isRequired: false, sortOrder: 5 },
    options: [
      { key: 'rj45', label: 'RJ45', isActive: true },
      { key: 'sfp', label: 'SFP', isActive: true },
    ],
  }),
  item('lente', 'TEXT', { template: null, outsideTemplate: true, working: stored({ valueText: '2.8 mm' }) }),
  item('vacio', 'TEXT', { template: { status: 'APPROVED', isRequired: false, sortOrder: 6 }, working: stored({ state: 'not_applicable', storedState: 'NOT_APPLICABLE' }) }),
]

const layout = buildLayout(items, {
  subcategoryId: 's1',
  entries: [{ specKey: 'modelo', label: 'Modelo', dataType: 'TEXT', unit: null, status: 'APPROVED', isRequired: true, requiredReason: 'Lo exigen las licitaciones', sortOrder: 1 }],
})

const props: KeySpecsFormProps = {
  layout,
  drafts: {},
  localErrors: {},
  results: null,
  missing: [],
  dirtyCount: 0,
  onDraftChange: () => undefined,
  onSave: () => undefined,
  onDiscard: () => undefined,
}

const render = (patch: Partial<KeySpecsFormProps> = {}) => renderToStaticMarkup(<KeySpecsForm {...props} {...patch} />)

describe('KeySpecsForm', () => {
  it('renders one control per data type, in template order', () => {
    const html = render()
    expect(html.indexOf('Dato modelo')).toBeLessThan(html.indexOf('Dato potencia'))
    expect(html.indexOf('Dato potencia')).toBeLessThan(html.indexOf('Dato puertos'))
    expect(html).toMatch(/<input type="text" aria-label="Dato modelo"/)
    expect(html).toMatch(/aria-label="Dato potencia"[^>]*value="0"/)
    expect(html).toContain('>W</span>')
    expect(html).toContain('role="radiogroup" aria-label="Dato poe"')
    expect(html).toMatch(/<select aria-label="Dato color"/)
    expect(html).toContain('role="group" aria-label="Dato puertos"')
    expect(html.match(/type="checkbox"/g)).toHaveLength(2)
  })

  it('shows zero and "No" as chosen values, not as empty', () => {
    const html = render()
    expect(html).toMatch(/aria-label="Dato potencia"[^>]*value="0"/)
    const poe = html.slice(html.indexOf('data-testid="key-spec-poe"'), html.indexOf('data-testid="key-spec-color"'))
    expect(poe).toMatch(/name="keyspec-poe-bool" class="h-4 w-4"\/>Sí/)
    expect(poe).toMatch(/name="keyspec-poe-bool" class="h-4 w-4" checked=""\/>No/)
  })

  it('marks required with its justification and proposed apart', () => {
    const html = render()
    expect(html).toContain('title="Lo exigen las licitaciones"')
    expect(html).toContain('Propuesto')
    const color = html.slice(html.indexOf('data-testid="key-spec-color"'), html.indexOf('data-testid="key-spec-puertos"'))
    expect(color).not.toContain('Obligatorio')
  })

  it('offers the three states and "Quitar valor" only where there is something to remove', () => {
    const html = render()
    expect(html.match(/>Con valor</g)?.length).toBe(6)
    expect(html).toContain('No aplica')
    expect(html).toContain('Desconocido')
    const modelo = html.slice(html.indexOf('data-testid="key-spec-modelo"'), html.indexOf('data-testid="key-spec-potencia"'))
    expect(modelo).not.toContain('Quitar valor')
    const potencia = html.slice(html.indexOf('data-testid="key-spec-potencia"'), html.indexOf('data-testid="key-spec-poe"'))
    expect(potencia).toContain('Quitar valor')
    expect(html).toContain('Este dato no aplica a este producto.')
  })

  it('does not offer inactive options that are not selected', () => {
    const html = render()
    expect(html).toContain('>Negro<')
    expect(html).not.toContain('>Viejo<')
  })

  it('lists values outside the template apart and never drops them', () => {
    const html = render()
    expect(html).toContain('Requieren revisión')
    expect(html).toContain('Dato lente</span>: 2.8 mm')
    expect(html.indexOf('Requieren revisión')).toBeGreaterThan(html.indexOf('Dato vacio'))
  })

  it('shows the save button disabled without changes and enabled with them', () => {
    expect(render()).toMatch(/<button[^>]*\sdisabled=""[^>]*>Guardar datos clave/)
    expect(render()).toContain('Sin cambios pendientes')
    const dirty = render({ dirtyCount: 2 })
    expect(dirty).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Guardar datos clave/)
    expect(dirty).toContain('2 datos sin guardar')
  })

  it('has no save controls when read-only', () => {
    const html = render({ readOnly: true, dirtyCount: 1 })
    expect(html).not.toContain('Guardar datos clave')
    expect(html).not.toContain('Quitar valor')
  })

  it('shows the per-entry result and keeps the rejected message under its field', () => {
    const html = render({
      results: [
        { specKey: 'modelo', outcome: 'saved' },
        { specKey: 'potencia', outcome: 'rejected', code: 'number_out_of_range', message: 'English text from the server' },
        { specKey: 'poe', outcome: 'unchanged' },
      ],
    })
    expect(html).toContain('Se guardaron 1 y 1 no se pudo guardar')
    expect(html).toContain('Dato modelo</span>: guardado')
    expect(html).toContain('El número es demasiado grande.')
    expect(html).not.toContain('number_out_of_range')
    expect(html).not.toContain('English text from the server')
    const potencia = html.slice(html.indexOf('data-testid="key-spec-potencia"'), html.indexOf('data-testid="key-spec-poe"'))
    expect(potencia).toContain('role="alert"')
  })

  it('shows a local number problem under the field', () => {
    const html = render({ localErrors: { potencia: 'Escribe un número, por ejemplo 12 o 3,5.' } })
    expect(html).toContain('Escribe un número, por ejemplo 12 o 3,5.')
  })

  it('shows an empty state when the template has no data', () => {
    const html = render({ layout: { rows: [], review: [] } })
    expect(html).toContain('todavía no tiene datos clave definidos')
    expect(html).not.toContain('Guardar datos clave')
  })

  it('uses an edited draft instead of the stored value', () => {
    const edited = { ...baselineDraft(items[1]!), number: '15' }
    expect(render({ drafts: { potencia: edited } })).toMatch(/aria-label="Dato potencia"[^>]*value="15"/)
    expect(emptyDraft().mode).toBe('value')
  })
})

describe('MissingKeySpecsPanel', () => {
  it('lists each missing item with a link to its field', () => {
    const html = renderToStaticMarkup(
      <MissingKeySpecsPanel
        missing={[
          { specKey: 'modelo', label: 'Modelo', code: 'missing_required' },
          { specKey: 'poe', label: 'PoE', code: 'explicit_unknown' },
        ]}
      />,
    )
    expect(html).toContain('Faltan 2 datos')
    expect(html).toContain('href="#keyspec-modelo"')
    expect(html).toContain('href="#keyspec-poe"')
    expect(html).toContain('Falta este dato obligatorio.')
    expect(html).toContain('Está marcado como «Desconocido»')
  })

  it('says nothing is missing and invents no requirements', () => {
    const html = renderToStaticMarkup(<MissingKeySpecsPanel missing={[]} />)
    expect(html).toContain('No faltan datos obligatorios.')
    expect(html).not.toMatch(/firmware|documento/i)
  })
})
