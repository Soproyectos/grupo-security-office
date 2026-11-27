import { describe, expect, it } from 'vitest'
import { customersAccess } from './access'

describe('customersAccess: manda la acción asignada, no el rol', () => {
  it('con customers:reassign se ofrece la columna Responsable y Reasignar', () => {
    expect(customersAccess(true)).toEqual({ showOwnerColumn: true, canReassign: true })
  })

  it('sin la acción no se ofrece nada, sea cual sea el rol', () => {
    expect(customersAccess(false)).toEqual({ showOwnerColumn: false, canReassign: false })
  })

  it('en la vista personal (mi cartera) no se ofrece aunque tenga la acción', () => {
    expect(customersAccess(true, true)).toEqual({ showOwnerColumn: false, canReassign: false })
  })

  it('solo expone las dos claves que consume la página', () => {
    expect(Object.keys(customersAccess(true)).sort()).toEqual(['canReassign', 'showOwnerColumn'])
  })
})
