/**
 * Node of the public category tree served by `GET /api/public/categories/menu`.
 * The backend only exposes whitelisted fields and caps the depth at 3 levels,
 * so `children` always arrives as an array (empty on leaves).
 */
export interface MenuCategory {
  id: string
  name: string
  slug: string
  imageUrl: string | null
  iconUrl: string | null
  isFeatured: boolean
  sortOrder: number
  children: MenuCategory[]
}

export type CategoryMenuStatus = 'loading' | 'ready' | 'error'
