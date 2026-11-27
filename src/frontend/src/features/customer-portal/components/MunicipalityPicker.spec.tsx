import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import MunicipalityPicker from './MunicipalityPicker'
import { filterMunicipalities, municipalityLabel } from '../utils/municipality'
import type { PortalMunicipality } from '../types/customer-portal.types'

const LIST: PortalMunicipality[] = [
  { code: '66001', name: 'Pereira', departmentCode: '66', department: 'Risaralda' },
  { code: '11001', name: 'Bogotá, D.C.', departmentCode: '11', department: 'Bogotá, D.C.' },
  { code: '05001', name: 'Medellín', departmentCode: '05', department: 'Antioquia' },
  { code: '05088', name: 'Bello', departmentCode: '05', department: 'Antioquia' },
]

const queryMock = vi.hoisted(() => ({ data: undefined as unknown, isPending: false, isError: false, refetch: vi.fn() }))
vi.mock('../hooks/usePortalQuotes', () => ({ useMunicipalities: () => queryMock }))

function render(props: Partial<Parameters<typeof MunicipalityPicker>[0]> = {}): string {
  return renderToStaticMarkup(createElement(MunicipalityPicker, { value: '', onChange: vi.fn(), ...props }))
}

describe('MunicipalityPicker', () => {
  it('es un combobox con etiqueta «Ciudad», obligatorio y con la lista cerrada', () => {
    queryMock.data = LIST
    queryMock.isPending = false
    queryMock.isError = false
    const markup = render()
    expect(markup).toContain('>Ciudad</label>')
    expect(markup).toContain('role="combobox"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-autocomplete="list"')
    expect(markup).toContain('role="listbox"')
    expect(markup).toContain('required')
  })

  it('muestra la ciudad elegida como «Pereira · Risaralda»', () => {
    queryMock.data = LIST
    expect(render({ value: '66001' })).toContain('value="Pereira · Risaralda"')
  })

  it('mientras carga la lista avisa y bloquea el campo', () => {
    queryMock.data = undefined
    queryMock.isPending = true
    const markup = render()
    expect(markup).toContain('Cargando ciudades')
    expect(markup).toContain('disabled')
  })

  it('si la lista falla, ofrece intentar de nuevo', () => {
    queryMock.data = undefined
    queryMock.isPending = false
    queryMock.isError = true
    expect(render()).toContain('Intentar de nuevo')
  })

  it('marca el campo como inválido cuando falta la ciudad', () => {
    queryMock.data = LIST
    queryMock.isError = false
    expect(render({ invalid: true })).toContain('aria-invalid="true"')
  })
})

describe('filterMunicipalities', () => {
  it('busca sin tildes ni mayúsculas, por nombre o departamento', () => {
    expect(filterMunicipalities(LIST, 'bogota').map((m) => m.code)).toEqual(['11001'])
    expect(filterMunicipalities(LIST, 'medellin antioquia').map((m) => m.code)).toEqual(['05001'])
    expect(filterMunicipalities(LIST, 'risaralda').map((m) => m.code)).toEqual(['66001'])
  })

  it('pone primero los nombres que empiezan con lo escrito y respeta el límite', () => {
    expect(filterMunicipalities(LIST, 'be')[0]?.name).toBe('Bello')
    expect(filterMunicipalities(LIST, '', 2)).toHaveLength(2)
  })

  it('sin coincidencias devuelve una lista vacía', () => {
    expect(filterMunicipalities(LIST, 'zzz')).toEqual([])
  })

  it('arma la etiqueta con el departamento', () => {
    expect(municipalityLabel(LIST[0]!)).toBe('Pereira · Risaralda')
  })
})
