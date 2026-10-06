import { describe, expect, it } from 'vitest'
import { PERMISSION_GROUPS } from '../features/users/constants/permission-groups'

/**
 * Grupos de permisos que ofrece "Editar Rol" en la pestaña Roles y Permisos.
 *
 * El backend no tiene catálogo central de permisos: cada uno hay que añadirlo en
 * la matriz del seed, en el decorator del controller y aquí. Este spec es el
 * que avisa cuando se añade un permiso al seed y se olvida la pantalla.
 */
describe('PERMISSION_GROUPS', () => {
  it('incluye el grupo Tienda con los dos permisos de configuración', () => {
    const tienda = PERMISSION_GROUPS.find((group) => group.label === 'Tienda')

    expect(tienda).toBeDefined()
    expect(tienda?.permissions).toEqual(['storefront:read', 'storefront:write'])
  })

  it('no repite ningún permiso entre grupos', () => {
    const all = PERMISSION_GROUPS.flatMap((group) => group.permissions)

    expect(new Set(all).size).toBe(all.length)
  })

  it('mantiene los grupos previos', () => {
    expect(PERMISSION_GROUPS.map((group) => group.label)).toEqual([
      'Productos',
      'Categorías',
      'Marcas',
      'Precios',
      'Usuarios',
      'Auditoría',
      'Publicación',
      'Tienda',
    ])
  })
})