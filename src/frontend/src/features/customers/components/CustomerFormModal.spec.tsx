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

function render(customer: Customer | null) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
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
