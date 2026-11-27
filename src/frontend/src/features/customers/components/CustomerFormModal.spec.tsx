import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CustomerFormModal from './CustomerFormModal'
import type { Customer } from '../types/customer.types'

/**
 * COM-02 frontend — `CustomerFormModal` (aceptación 1, lado cliente, UI).
 *
 * ✅ En EDICIÓN el selector «Estado» desaparece del formulario general: el
 *    PATCH del servidor rechaza `status` con 400 desde este incremento
 *    (COM-02 §11 «riesgo de transición») y F1 está pendiente, así que la
 *    interfaz NO promete cambiar estado — sólo informa de dónde ocurre hoy.
 * ✅ En CREACIÓN el selector se conserva (`CreateCustomerDto` lo admite).
 * ✅ Nunca hay control de responsable en la edición general: la
 *    reasignación es su propio modal/endpoint.
 */

const LEAD: Customer = {
  id: 'c-1',
  code: 'CL-0003',
  name: 'Cliente Spot COM02',
  documentType: null,
  documentId: null,
  email: 'spot@fixture.test',
  phone: null,
  city: null,
  address: null,
  status: 'LEAD',
  source: null,
  sourceDetail: null,
  ownerId: 'owner-admin',
  createdById: 'owner-admin',
  convertedAt: null,
  lastContactAt: null,
  notes: null,
  isActive: true,
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
}

const MUNICIPALITIES = [
  { code: '05001', name: 'Medellín', departmentCode: '05', department: 'Antioquia' },
  { code: '66001', name: 'Pereira', departmentCode: '66', department: 'Risaralda' },
]

function render(customer: Customer | null, withMunicipalities = false) {
  const client = new QueryClient()
  if (withMunicipalities) client.setQueryData(['public', 'municipalities'], MUNICIPALITIES)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <CustomerFormModal
        open
        onClose={() => {}}
        customer={customer}
        onSubmit={async () => {}}
      />
    </QueryClientProvider>,
  )
}

const selectNames = (html: string) =>
  [...html.matchAll(/<select[^>]*name="([^"]+)"/g)].map((match) => match[1])

describe('edición general (customer != null)', () => {
  const html = render(LEAD)

  it('NO ofrece el selector de estado (el PATCH general lo rechaza con 400)', () => {
    expect(selectNames(html)).not.toContain('status')
    expect(html).not.toMatch(/<select[^>]*name="status"/)
  })

  it('informa el estado actual y dónde se cambia, sin prometer cambiarlo aquí', () => {
    expect(html).toContain('Lead')
    expect(html).toContain('El estado no se modifica en la edición de contacto')
    expect(html).toContain('Convertir')
  })

  it('tampoco ofrece responsable (ownerId) en el formulario general', () => {
    expect(selectNames(html)).not.toContain('ownerId')
    expect(html).not.toContain('name="ownerId"')
    expect(html).not.toContain('Responsable')
  })

  it('conserva los campos de contacto/notas que sí son editables', () => {
    expect(html).toContain('name="name"')
    expect(html).toContain('name="email"')
    expect(html).toContain('name="phone"')
    expect(html).toContain('name="notes"')
  })
})

describe('creación (customer == null)', () => {
  const html = render(null)

  it('SÍ ofrece el selector de estado con LEAD por defecto', () => {
    expect(selectNames(html)).toContain('status')
    expect(html).toMatch(/<select[^>]*name="status"/)
  })

  it('se titula como creación', () => {
    expect(html).toContain('Nuevo cliente o lead')
  })
})

describe('ciudad con la lista DIVIPOLA', () => {
  it('en la creación la ciudad es un selector con búsqueda, no un campo de texto libre', () => {
    const html = render(null, true)
    expect(html).toContain('role="combobox"')
    expect(html).toContain('role="listbox"')
    expect(html).toContain('>Ciudad</label>')
    expect(html).toContain('Elige una ciudad de la lista')
  })

  it('la ciudad es opcional: el selector no la exige', () => {
    const html = render(null, true)
    expect(html).not.toMatch(/<input[^>]*role="combobox"[^>]*required/)
  })

  it('en la edición muestra la ciudad guardada como «Ciudad · Departamento»', () => {
    const html = render({ ...LEAD, city: '05001' }, true)
    expect(html).toContain('value="Medellín · Antioquia"')
  })

  it('un cliente antiguo con ciudad escrita a mano ve ese valor y puede editarse sin elegir otra', () => {
    const html = render({ ...LEAD, city: 'Bogotá' })
    expect(html).toContain('value="Bogotá"')
    expect(html).not.toMatch(/<input[^>]*role="combobox"[^>]*disabled=""/)
  })
})

describe('tipo de documento', () => {
  it('al crear viene NIT seleccionado y antes del número', () => {
    const html = render(null)
    expect(html).toMatch(/<select[^>]*name="documentType"/)
    expect(html).toMatch(/<option value="NIT" selected/)
    expect(html.indexOf('name="documentType"')).toBeLessThan(html.indexOf('name="documentId"'))
  })
})

describe('dígito de verificación del NIT', () => {
  const nitCustomer = (documentId: string, documentType = 'NIT'): Customer => ({
    ...LEAD,
    documentType,
    documentId,
  })

  it('muestra la ayuda con el dígito calculado, anunciada con aria-live polite', () => {
    const html = render(nitCustomer('901123456'))
    expect(html).toContain('Dígito de verificación: 1 (se calcula solo)')
    expect(html).toMatch(/<p[^>]*aria-live="polite"[^>]*>Dígito de verificación: 1/)
    expect(html).not.toContain('role="alert"')
  })

  it('acepta el NIT escrito con puntos y con su dígito correcto, sin aviso', () => {
    const html = render(nitCustomer('901.123.456-1'))
    expect(html).toContain('Dígito de verificación: 1 (se calcula solo)')
    expect(html).not.toContain('no coincide')
  })

  it('avisa con role alert cuando el dígito escrito no coincide, sin bloquear nada', () => {
    const html = render(nitCustomer('901123456-7'))
    expect(html).toMatch(/<p[^>]*role="alert"[^>]*>El dígito de verificación no coincide\. Para ese NIT debería ser (<!-- -->)?1(<!-- -->)?\./)
    expect(html).not.toContain('Dígito de verificación: 1 (se calcula solo)')
    // Nothing becomes required because of the check digit.
    expect(html).not.toMatch(/<input[^>]*name="documentId"[^>]*required/)
  })

  it('no muestra la ayuda cuando el tipo de documento no es NIT', () => {
    const html = render(nitCustomer('901123456', 'CC'))
    expect(html).not.toContain('Dígito de verificación')
  })

  it('no muestra dígito mientras el número está vacío', () => {
    const html = render(null)
    expect(html).not.toContain('(se calcula solo)')
    expect(html).toContain('aria-live="polite"')
  })
})
