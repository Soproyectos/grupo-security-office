import { describe, expect, it } from 'vitest'
import { customersAccess, REASSIGN_ROLES } from './access'

/**
 * COM-02 frontend — criterio de visibilidad de las acciones de cartera.
 *
 * ✅ ACEPTACIÓN 2 (lado cliente): la UI NO decide quién puede EDITAR equipo.
 *    El único gating por rol que existe hoy es para OFRECER la columna
 *    «Responsable» y el botón «Reasignar»; las filas que el servidor devuelve
 *    se pintan completas (sin ocultar datos ajenos) y el 403 del servidor es
 *    la fuente de verdad.
 * ✅ No se añade ningún gating nuevo de equipo: el objeto devuelto no contiene
 *    ninguna capacidad de edición por lectura de equipo.
 *
 * PUNTO DE EXTENSIÓN (patrón `features/users/access.ts` / `agenda-access.ts`):
 * cuando D5/E6 entreguen concesiones al navegador, `canReassign` pasa a leer
 * el grant `customers:reassign` y `showOwnerColumn` el alcance de
 * `customers:read`; el resto de la página solo consume estas dos claves.
 */

describe('customersAccess — criterio mínimo documentado', () => {
  it('Super Admin ve la columna de responsable y el botón de reasignar', () => {
    expect(customersAccess({ roles: ['Super Admin'] })).toEqual({
      showOwnerColumn: true,
      canReassign: true,
    })
  })

  it('Supervisor y Admin Comercial también (gestión de cartera)', () => {
    expect(customersAccess({ roles: ['Supervisor'] }).showOwnerColumn).toBe(true)
    expect(customersAccess({ roles: ['Supervisor'] }).canReassign).toBe(true)
    expect(customersAccess({ roles: ['Admin Comercial'] }).canReassign).toBe(true)
  })

  it('Vendedor, Consulta y Operador no se les ofrece reasignar', () => {
    expect(customersAccess({ roles: ['Vendedor'] })).toEqual({
      showOwnerColumn: false,
      canReassign: false,
    })
    expect(customersAccess({ roles: ['Consulta'] }).canReassign).toBe(false)
    expect(customersAccess({ roles: ['Operador'] }).canReassign).toBe(false)
  })

  it('sin identidad no se ofrece ninguna acción de gestión', () => {
    expect(customersAccess(null)).toEqual({ showOwnerColumn: false, canReassign: false })
    expect(customersAccess(undefined)).toEqual({ showOwnerColumn: false, canReassign: false })
    expect(customersAccess({})).toEqual({ showOwnerColumn: false, canReassign: false })
  })

  it('la vista personal («Mis clientes») conserva el criterio de hoy: sin columna ni reasignar', () => {
    expect(customersAccess({ roles: ['Super Admin'] }, true)).toEqual({
      showOwnerColumn: false,
      canReassign: false,
    })
  })

  it('NO deriva ninguna capacidad de edición de la lectura de equipo (aceptación 2)', () => {
    expect(Object.keys(customersAccess({ roles: ['Supervisor'] })).sort()).toEqual([
      'canReassign',
      'showOwnerColumn',
    ])
    expect(REASSIGN_ROLES).toContain('Super Admin')
    expect(REASSIGN_ROLES).not.toContain('Vendedor')
  })
})
