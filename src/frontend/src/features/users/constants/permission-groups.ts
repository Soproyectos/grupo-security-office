/**
 * Catálogo de permisos agrupados para la edición de roles.
 *
 * Vive fuera de `UsersPage.tsx` porque ese archivo es un componente y el
 * catálogo es un dato: exportarlo de un `.tsx` con componente hace que ESLint
 * marque `react-refresh/only-export-components`. Lo usa el modal de roles para
 * montar las casillas y el spec de la página para verificar que cada grupo
 * quede representado y que no haya permisos repetidos.
 */
export const PERMISSION_GROUPS: { label: string; permissions: string[] }[] = [
  { label: 'Productos', permissions: ['products:read', 'products:write', 'products:delete'] },
  { label: 'Categorías', permissions: ['categories:read', 'categories:write'] },
  { label: 'Marcas', permissions: ['brands:read', 'brands:write'] },
  { label: 'Precios', permissions: ['prices:read', 'prices:write'] },
  { label: 'Usuarios', permissions: ['users:read', 'users:write', 'users:manage'] },
  { label: 'Auditoría', permissions: ['audit:read'] },
  { label: 'Publicación', permissions: ['publish:manage'] },
  { label: 'Tienda', permissions: ['storefront:read', 'storefront:write'] },
]
