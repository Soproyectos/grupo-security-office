import { describe, expect, it } from 'vitest'
import { quotesAccess } from './access'

/**
 * COM-03 frontend — criterio de visibilidad del editor de descuento.
 *
 * MISMO patrón que `features/customers/access.ts` y `features/users/access.ts`:
 * una función pura decide qué se OFRECE en la interfaz; el servidor sigue
 * siendo la autoridad (resuelve `quotes:discount` con `resolveAccess` por
 * petición y responde 403 con su mensaje, que la UI pinta).
 *
 * Criterio MÍNIMO documentado: hoy el único rol que `resolveAccess` exime
 * sin concesión es Super Admin (data-scope.ts, EXCEPCIÓN 1); nadie más recibe
 * `quotes:discount` por defecto (F1: ningún paquete la asigna). Punto de
 * extensión (D5/E6/F1): cuando el navegador reciba concesiones, esta función
 * las recibe como segundo argumento y `canEditDiscount` pasa a leer
 * `quotes:discount` con su alcance.
 */
describe('quotesAccess — editor de descuento (UX, no autoridad)', () => {
  it('Super Admin → sí se le ofrece editar descuento (única exención del resolver hoy)', () => {
    expect(quotesAccess({ roles: ['Super Admin'] }).canEditDiscount).toBe(true)
  })

  it('sin concesión visible el resto de roles → descuento SOLO LECTURA', () => {
    for (const roles of [
      ['Supervisor'],
      ['Admin Comercial'],
      ['Vendedor'],
      ['Operador'],
      ['Consulta'],
    ]) {
      expect(quotesAccess({ roles }).canEditDiscount).toBe(false)
    }
  })

  it('sin sesión → solo lectura (no se pinta un editor que el servidor rechazará)', () => {
    expect(quotesAccess(null).canEditDiscount).toBe(false)
    expect(quotesAccess(undefined).canEditDiscount).toBe(false)
    expect(quotesAccess({ roles: [] }).canEditDiscount).toBe(false)
  })

  it('la estructura queda lista para el punto de extensión a concesiones', () => {
    expect(quotesAccess({ roles: ['Vendedor'] })).toEqual({ canEditDiscount: false })
  })
})
