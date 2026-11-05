import api from './api'

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  parent?: { id: string; name: string } | null
  sortOrder: number
  isActive: boolean
  productCount?: number
  childrenCount?: number
  createdAt: string
  updatedAt: string
}

export interface Brand {
  id: string
  name: string
  slug: string
  logo: string | null
  description: string | null
  website: string | null
  isActive: boolean
  productCount?: number
  createdAt: string
  updatedAt: string
}

export interface CategoryPayload {
  name: string
  slug: string
  description?: string | null
  isActive?: boolean
  parentId?: string | null
}

export interface BrandPayload {
  name: string
  slug: string
  description?: string | null
  isActive?: boolean
}

function asList(res: unknown): any[] {
  if (Array.isArray(res)) return res
  if (res && typeof res === 'object' && Array.isArray((res as { data?: unknown }).data)) {
    return (res as { data: any[] }).data
  }
  return []
}

export const fetchCategories = async (): Promise<Category[]> => {
  const res = await api.get('/categories')
  return asList(res.data) as Category[]
}

export const createCategory = async (payload: CategoryPayload): Promise<Category> => {
  const res = await api.post('/categories', payload)
  return res.data as Category
}

export const updateCategory = async (id: string, payload: Partial<CategoryPayload>): Promise<Category> => {
  const res = await api.put(`/categories/${id}`, payload)
  return res.data as Category
}

export const deleteCategory = async (id: string): Promise<void> => {
  await api.delete(`/categories/${id}`)
}

export const fetchBrands = async (): Promise<Brand[]> => {
  const res = await api.get('/brands')
  return asList(res.data) as Brand[]
}

export const createBrand = async (payload: BrandPayload): Promise<Brand> => {
  const res = await api.post('/brands', payload)
  return res.data as Brand
}

export const updateBrand = async (id: string, payload: Partial<BrandPayload>): Promise<Brand> => {
  const res = await api.put(`/brands/${id}`, payload)
  return res.data as Brand
}

export const toggleBrandActive = async (id: string): Promise<Brand> => {
  const res = await api.patch(`/brands/${id}/toggle-active`)
  return res.data as Brand
}

export const deleteBrand = async (id: string): Promise<void> => {
  await api.delete(`/brands/${id}`)
}
