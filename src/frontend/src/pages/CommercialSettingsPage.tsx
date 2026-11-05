import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  fetchBrands,
  createBrand,
  updateBrand,
  toggleBrandActive,
  deleteBrand,
  type Category,
  type Brand,
  type CategoryPayload,
  type BrandPayload,
} from '../services/settings.service'
import {
  fetchPriceLists,
  createPriceList,
  updatePriceList,
  togglePriceListActive,
  deletePriceList,
  type PriceList,
  type PriceListPayload,
} from '../services/prices.service'
import {
  canDeleteBrands,
  canDeleteCategories,
  canDeletePrices,
  canViewAudit,
  hasPermission,
  hasRole,
} from '../lib/rbac'
import { ROLES } from '../lib/roles'
import { getApiErrorMessage } from '../lib/apiError'
import { Button } from '../components/ui'
import { categoryRows } from './category-tree'

type TabKey = 'categories' | 'brands' | 'priceLists' | 'history'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'categories', label: 'Categorías y subcategorías' },
  { key: 'brands', label: 'Marcas' },
  { key: 'priceLists', label: 'Tarifas' },
  { key: 'history', label: 'Historial' },
]

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function errorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

const fieldClass =
  'w-full px-3 py-2.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm'

const actionButtonClass =
  'p-2 text-neutral-400 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]'

const dangerButtonClass =
  'p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]'

function SettingsModalShell({
  title,
  onClose,
  children,
  maxWidth = 'max-w-lg',
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  maxWidth?: string
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl w-full ${maxWidth} shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain`}>
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-lg font-condensed font-semibold text-neutral-800">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors" aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm" role="alert">
      {message}
    </div>
  )
}

export default function CommercialSettingsPage() {
  const [tab, setTab] = useState<TabKey>('categories')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-condensed font-bold text-security-800">Configuración comercial</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Categorías, marcas, tarifas e historial de auditoría
        </p>
      </div>

      <div className="flex items-center overflow-x-auto border-b border-neutral-200 scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2.5 text-sm font-condensed font-semibold whitespace-nowrap transition-all tracking-wider border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
              tab === t.key
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'categories' && <CategoriesTab />}
      {tab === 'brands' && <BrandsTab />}
      {tab === 'priceLists' && <PriceListsTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  )
}

function TableShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-condensed font-semibold text-neutral-800">{title}</h2>
          <p className="text-sm text-neutral-500">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">{children}</div>
    </div>
  )
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-neutral-400">
        {message}
      </td>
    </tr>
  )
}

/* ------------------------------ Categorías ------------------------------ */

function CategoriesTab() {
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [search, setSearch] = useState('')

  const canEdit = hasPermission('categories:write')
  const canDelete = canDeleteCategories()

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] })

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      invalidate()
      setActionError(null)
    },
    onError: (err) => {
      const status = errorStatus(err)
      setActionError(
        status === 409
          ? 'No se puede eliminar: la categoría tiene productos o subcategorías asociados.'
          : getApiErrorMessage(err, 'No se pudo eliminar la categoría')
      )
    },
  })

  const openCreate = () => {
    setActionError(null)
    setEditing(null)
    setShowModal(true)
  }

  return (
    <TableShell
      title="Categorías y subcategorías"
      subtitle="Organiza los productos en categorías principales y subcategorías."
      action={
        canEdit && (
          <Button
            variant="primary"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }
            onClick={openCreate}
          >
            Nueva categoría
          </Button>
        )
      }
    >
      {actionError && (
        <div className="flex items-start gap-3 p-3.5 border-b text-sm bg-red-50 border-red-200 text-red-800" role="alert">
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="p-0.5 rounded hover:bg-red-100/60" aria-label="Cerrar" />
        </div>
      )}
      <div className="border-b border-neutral-200 p-3">
        <label className="sr-only" htmlFor="category-search">Buscar categoría</label>
        <input id="category-search" className={fieldClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar categoría o subcategoría" />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Slug</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Productos</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {isLoading ? (
              <EmptyRow colSpan={5} message="Cargando..." />
            ) : !categories || categories.length === 0 ? (
              <EmptyRow colSpan={5} message="No hay categorías" />
            ) : (
              categoryRows(categories, search).map((cat) => (
                <tr key={cat.id} className="hover:bg-neutral-50 transition-colors">
                  <td className={`px-6 py-4 text-sm font-medium text-neutral-800 ${cat.parentId ? 'pl-12' : ''}`}>
                    <span className="block text-xs font-normal text-neutral-500">{cat.parentId ? `Subcategoría · ${cat.parent?.name ?? categories.find((item) => item.id === cat.parentId)?.name ?? 'Categoría principal'}` : 'Categoría'}</span>
                    {cat.name}
                  </td>
                  <td className="px-6 py-4 text-xs font-mono text-neutral-500">{cat.slug}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">{(cat.productCount ?? 0) + categories.filter((child) => child.parentId === cat.id).reduce((sum, child) => sum + (child.productCount ?? 0), 0)} <span className="text-xs text-neutral-500">{cat.parentId ? 'productos directos' : 'en categoría y subcategorías'}</span></td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
                      cat.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {cat.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => {
                            setActionError(null)
                            setEditing(cat)
                            setShowModal(true)
                          }}
                          className={actionButtonClass}
                          title="Editar categoría"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Eliminar la categoría "${cat.name}"?`)) {
                              removeMutation.mutate(cat.id)
                            }
                          }}
                          className={dangerButtonClass}
                          title="Eliminar categoría"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <CategoryModal
          category={editing}
          categories={categories ?? []}
          onClose={() => {
            setShowModal(false)
            setEditing(null)
          }}
          onSaved={() => {
            invalidate()
            setShowModal(false)
            setEditing(null)
          }}
          onError={(err) => setActionError(getApiErrorMessage(err, 'No se pudo guardar la categoría'))}
        />
      )}
    </TableShell>
  )
}

function CategoryModal({
  category,
  categories,
  onClose,
  onSaved,
  onError,
}: {
  category?: Category | null
  categories: Category[]
  onClose: () => void
  onSaved: () => void
  onError: (error: unknown) => void
}) {
  const isEditing = Boolean(category)
  const [name, setName] = useState(category?.name ?? '')
  const [slug, setSlug] = useState(category?.slug ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [isActive, setIsActive] = useState(category?.isActive ?? true)
  const [parentId, setParentId] = useState(category?.parentId ?? '')
  const [slugTouched, setSlugTouched] = useState(isEditing)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const payload: CategoryPayload = {
        name: name.trim(),
        slug: slug.trim() || slugify(name),
        description: description.trim() || null,
        isActive,
        parentId: parentId || null,
      }
      return isEditing && category ? updateCategory(category.id, payload) : createCategory(payload)
    },
    onSuccess: onSaved,
    onError: (err) => {
      setError(getApiErrorMessage(err, 'No se pudo guardar la categoría'))
      onError(err)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres')
      return
    }
    mutation.mutate()
  }

  return (
    <SettingsModalShell title={isEditing ? (category?.parentId ? 'Editar subcategoría' : 'Editar categoría') : 'Nueva categoría o subcategoría'} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-4">
        <FormError message={error} />
        <div>
          <label htmlFor="cat-parent" className="block text-sm font-medium text-neutral-800 mb-1.5">Tipo</label>
          <select id="cat-parent" value={parentId} onChange={(event) => setParentId(event.target.value)} className={fieldClass}>
            <option value="">Categoría principal</option>
            {categories.filter((item) => !item.parentId && item.id !== category?.id && (category?.parentId || !isEditing || !categories.some((child) => child.parentId === category?.id))).map((item) => <option key={item.id} value={item.id}>Subcategoría de {item.name}</option>)}
          </select>
          {isEditing && !category?.parentId && categories.some((child) => child.parentId === category?.id) && <p className="mt-1 text-xs text-neutral-500">Esta categoría tiene subcategorías y no puede convertirse en subcategoría.</p>}
        </div>
        <div>
          <label htmlFor="cat-name" className="block text-sm font-medium text-neutral-800 mb-1.5">Nombre</label>
          <input
            id="cat-name"
            type="text"
            value={name}
            onChange={(e) => {
              const value = e.target.value
              setName(value)
              if (!slugTouched) setSlug(slugify(value))
            }}
            className={fieldClass}
            required
            minLength={2}
          />
        </div>
        <div>
          <label htmlFor="cat-slug" className="block text-sm font-medium text-neutral-800 mb-1.5">Slug</label>
          <input
            id="cat-slug"
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value)
              setSlugTouched(true)
            }}
            className={fieldClass}
            required
            minLength={2}
            placeholder="se-genera-desde-el-nombre"
          />
        </div>
        <div>
          <label htmlFor="cat-description" className="block text-sm font-medium text-neutral-800 mb-1.5">Descripción</label>
          <textarea
            id="cat-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${fieldClass} resize-none`}
            rows={3}
          />
        </div>
        {isEditing && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-primary)] cursor-pointer"
              />
              Categoría activa
            </label>
          </div>
        )}
        <div className="flex gap-3 justify-end pt-4 border-t border-neutral-200">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>{isEditing ? 'Actualizar' : 'Crear'}</Button>
        </div>
      </form>
    </SettingsModalShell>
  )
}

/* -------------------------------- Marcas -------------------------------- */

function BrandsTab() {
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Brand | null>(null)

  const canEdit = hasPermission('brands:write')
  const canDelete = canDeleteBrands()

  const { data: brands, isLoading } = useQuery({
    queryKey: ['brands'],
    queryFn: fetchBrands,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['brands'] })

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteBrand(id),
    onSuccess: () => {
      invalidate()
      setActionError(null)
    },
    onError: (err) => {
      const status = errorStatus(err)
      setActionError(
        status === 409
          ? 'No se puede eliminar: la marca tiene productos asociados.'
          : getApiErrorMessage(err, 'No se pudo eliminar la marca')
      )
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => toggleBrandActive(id),
    onSuccess: () => {
      invalidate()
      setActionError(null)
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'No se pudo cambiar el estado de la marca')),
  })

  const openCreate = () => {
    setActionError(null)
    setEditing(null)
    setShowModal(true)
  }

  return (
    <TableShell
      title="Marcas"
      subtitle="Fabricantes o marcas de los productos. Las que no existan se crean automáticamente durante la importación."
      action={
        canEdit && (
          <Button
            variant="primary"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }
            onClick={openCreate}
          >
            Nueva Marca
          </Button>
        )
      }
    >
      {actionError && (
        <div className="flex items-start gap-3 p-3.5 border-b text-sm bg-red-50 border-red-200 text-red-800" role="alert">
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="p-0.5 rounded hover:bg-red-100/60" aria-label="Cerrar" />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Slug</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Productos</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {isLoading ? (
              <EmptyRow colSpan={5} message="Cargando..." />
            ) : !brands || brands.length === 0 ? (
              <EmptyRow colSpan={5} message="No hay marcas" />
            ) : (
              brands.map((brand) => (
                <tr key={brand.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-neutral-800">{brand.name}</td>
                  <td className="px-6 py-4 text-xs font-mono text-neutral-500">{brand.slug}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">{brand.productCount ?? 0}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
                      brand.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {brand.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => {
                            setActionError(null)
                            setEditing(brand)
                            setShowModal(true)
                          }}
                          className={actionButtonClass}
                          title="Editar marca"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => toggleMutation.mutate(brand.id)}
                          className={actionButtonClass}
                          title={brand.isActive ? 'Desactivar marca' : 'Activar marca'}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            {brand.isActive ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636M12 3a9 9 0 019 9 9 9 0 01-9 9 9 9 0 01-9-9 9 9 0 019-9z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z" />
                            )}
                          </svg>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Eliminar la marca "${brand.name}"?`)) {
                              removeMutation.mutate(brand.id)
                            }
                          }}
                          className={dangerButtonClass}
                          title="Eliminar marca"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <BrandModal
          brand={editing}
          onClose={() => {
            setShowModal(false)
            setEditing(null)
          }}
          onSaved={() => {
            invalidate()
            setShowModal(false)
            setEditing(null)
          }}
          onError={(err) => setActionError(getApiErrorMessage(err, 'No se pudo guardar la marca'))}
        />
      )}
    </TableShell>
  )
}

function BrandModal({
  brand,
  onClose,
  onSaved,
  onError,
}: {
  brand?: Brand | null
  onClose: () => void
  onSaved: () => void
  onError: (error: unknown) => void
}) {
  const isEditing = Boolean(brand)
  const [name, setName] = useState(brand?.name ?? '')
  const [slug, setSlug] = useState(brand?.slug ?? '')
  const [description, setDescription] = useState(brand?.description ?? '')
  const [isActive, setIsActive] = useState(brand?.isActive ?? true)
  const [slugTouched, setSlugTouched] = useState(isEditing)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const payload: BrandPayload = {
        name: name.trim(),
        slug: slug.trim() || slugify(name),
        description: description.trim() || null,
        isActive,
      }
      return isEditing && brand ? updateBrand(brand.id, payload) : createBrand(payload)
    },
    onSuccess: onSaved,
    onError: (err) => {
      setError(getApiErrorMessage(err, 'No se pudo guardar la marca'))
      onError(err)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres')
      return
    }
    mutation.mutate()
  }

  return (
    <SettingsModalShell title={isEditing ? 'Editar Marca' : 'Nueva Marca'} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-4">
        <FormError message={error} />
        <div>
          <label htmlFor="brand-name" className="block text-sm font-medium text-neutral-800 mb-1.5">Nombre</label>
          <input
            id="brand-name"
            type="text"
            value={name}
            onChange={(e) => {
              const value = e.target.value
              setName(value)
              if (!slugTouched) setSlug(slugify(value))
            }}
            className={fieldClass}
            required
            minLength={2}
          />
        </div>
        <div>
          <label htmlFor="brand-slug" className="block text-sm font-medium text-neutral-800 mb-1.5">Slug</label>
          <input
            id="brand-slug"
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value)
              setSlugTouched(true)
            }}
            className={fieldClass}
            required
            minLength={2}
            placeholder="se-genera-desde-el-nombre"
          />
        </div>
        <div>
          <label htmlFor="brand-description" className="block text-sm font-medium text-neutral-800 mb-1.5">Descripción</label>
          <textarea
            id="brand-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${fieldClass} resize-none`}
            rows={3}
          />
        </div>
        {isEditing && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-primary)] cursor-pointer"
              />
              Marca activa
            </label>
          </div>
        )}
        <div className="flex gap-3 justify-end pt-4 border-t border-neutral-200">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>{isEditing ? 'Actualizar' : 'Crear'}</Button>
        </div>
      </form>
    </SettingsModalShell>
  )
}

/* -------------------------------- Tarifas -------------------------------- */

const CURRENCIES = ['COP', 'USD', 'EUR'] as const

function PriceListsTab() {
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PriceList | null>(null)

  const canEdit = hasPermission('prices:write')
  const canDelete = canDeletePrices()

  const { data: priceLists, isLoading } = useQuery({
    queryKey: ['price-lists'],
    queryFn: fetchPriceLists,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['price-lists'] })

  const removeMutation = useMutation({
    mutationFn: (id: string) => deletePriceList(id),
    onSuccess: () => {
      invalidate()
      setActionError(null)
    },
    onError: (err) => {
      const status = errorStatus(err)
      setActionError(
        status === 409
          ? 'No se puede eliminar: la tarifa tiene precios asociados.'
          : getApiErrorMessage(err, 'No se pudo eliminar la tarifa')
      )
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => togglePriceListActive(id),
    onSuccess: () => {
      invalidate()
      setActionError(null)
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'No se pudo cambiar el estado de la tarifa')),
  })

  const openCreate = () => {
    setActionError(null)
    setEditing(null)
    setShowModal(true)
  }

  return (
    <TableShell
      title="Tarifas"
      subtitle="Listas de precios (metadato de tarifa) usadas para tipificar precios de productos."
      action={
        canEdit && (
          <Button
            variant="primary"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            }
            onClick={openCreate}
          >
            Nueva Tarifa
          </Button>
        )
      }
    >
      {actionError && (
        <div className="flex items-start gap-3 p-3.5 border-b text-sm bg-red-50 border-red-200 text-red-800" role="alert">
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="p-0.5 rounded hover:bg-red-100/60" aria-label="Cerrar" />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Código</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Moneda</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Precios</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {isLoading ? (
              <EmptyRow colSpan={6} message="Cargando..." />
            ) : !priceLists || priceLists.length === 0 ? (
              <EmptyRow colSpan={6} message="No hay tarifas" />
            ) : (
              priceLists.map((list) => (
                <tr key={list.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-neutral-800">{list.name}</td>
                  <td className="px-6 py-4 text-xs font-mono text-neutral-500">{list.code}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">{list.currency}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">{list.priceCount ?? 0}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
                      list.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {list.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => {
                            setActionError(null)
                            setEditing(list)
                            setShowModal(true)
                          }}
                          className={actionButtonClass}
                          title="Editar tarifa"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => toggleMutation.mutate(list.id)}
                          className={actionButtonClass}
                          title={list.isActive ? 'Desactivar tarifa' : 'Activar tarifa'}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            {list.isActive ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636M12 3a9 9 0 019 9 9 9 0 01-9 9 9 9 0 01-9-9 9 9 0 019-9z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z" />
                            )}
                          </svg>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Eliminar la tarifa "${list.name}"?`)) {
                              removeMutation.mutate(list.id)
                            }
                          }}
                          className={dangerButtonClass}
                          title="Eliminar tarifa"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <PriceListModal
          priceList={editing}
          onClose={() => {
            setShowModal(false)
            setEditing(null)
          }}
          onSaved={() => {
            invalidate()
            setShowModal(false)
            setEditing(null)
          }}
          onError={(err) => setActionError(getApiErrorMessage(err, 'No se pudo guardar la tarifa'))}
        />
      )}
    </TableShell>
  )
}

function PriceListModal({
  priceList,
  onClose,
  onSaved,
  onError,
}: {
  priceList?: PriceList | null
  onClose: () => void
  onSaved: () => void
  onError: (error: unknown) => void
}) {
  const isEditing = Boolean(priceList)
  const [name, setName] = useState(priceList?.name ?? '')
  const [code, setCode] = useState(priceList?.code ?? '')
  const [currency, setCurrency] = useState(priceList?.currency ?? 'COP')
  const [validFrom, setValidFrom] = useState(priceList?.validFrom ? priceList.validFrom.slice(0, 10) : '')
  const [validUntil, setValidUntil] = useState(priceList?.validUntil ? priceList.validUntil.slice(0, 10) : '')
  const [isActive, setIsActive] = useState(priceList?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const payload: PriceListPayload = {
        name: name.trim(),
        code: code.trim(),
        currency,
        isActive,
        validFrom: validFrom || null,
        validUntil: validUntil || null,
      }
      return isEditing && priceList ? updatePriceList(priceList.id, payload) : createPriceList(payload)
    },
    onSuccess: onSaved,
    onError: (err) => {
      setError(getApiErrorMessage(err, 'No se pudo guardar la tarifa'))
      onError(err)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2 || code.trim().length < 2) {
      setError('El nombre y el código deben tener al menos 2 caracteres')
      return
    }
    if (validFrom && validUntil && validFrom > validUntil) {
      setError('La fecha de inicio no puede ser posterior a la de fin')
      return
    }
    mutation.mutate()
  }

  return (
    <SettingsModalShell title={isEditing ? 'Editar Tarifa' : 'Nueva Tarifa'} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-4">
        <FormError message={error} />
        <div>
          <label htmlFor="pl-name" className="block text-sm font-medium text-neutral-800 mb-1.5">Nombre</label>
          <input
            id="pl-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
            required
            minLength={2}
          />
        </div>
        <div>
          <label htmlFor="pl-code" className="block text-sm font-medium text-neutral-800 mb-1.5">Código</label>
          <input
            id="pl-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={fieldClass}
            required
            minLength={2}
            disabled={isEditing}
            aria-disabled={isEditing}
          />
          {isEditing && <p className="text-xs text-neutral-400 mt-1">El código no puede modificarse.</p>}
        </div>
        <div>
          <label htmlFor="pl-currency" className="block text-sm font-medium text-neutral-800 mb-1.5">Moneda</label>
          <select
            id="pl-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={fieldClass}
            required
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="pl-valid-from" className="block text-sm font-medium text-neutral-800 mb-1.5">Vigencia desde</label>
            <input
              id="pl-valid-from"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="pl-valid-until" className="block text-sm font-medium text-neutral-800 mb-1.5">Vigencia hasta</label>
            <input
              id="pl-valid-until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
        {isEditing && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-primary)] cursor-pointer"
              />
              Tarifa activa
            </label>
          </div>
        )}
        <div className="flex gap-3 justify-end pt-4 border-t border-neutral-200">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>{isEditing ? 'Actualizar' : 'Crear'}</Button>
        </div>
      </form>
    </SettingsModalShell>
  )
}

/* ------------------------------- Historial ------------------------------- */

interface AuditLogEntry {
  id: string
  action: string
  entity: string
  entityId: string
  createdAt: string
  user?: { id: string; name: string; email: string } | null
}

interface AuditResponse {
  data: AuditLogEntry[]
  meta?: { total: number; skip: number; take: number }
}

const AUDIT_ENTITIES = [
  { value: 'Product', label: 'Productos' },
  { value: 'Category', label: 'Categorías' },
  { value: 'Brand', label: 'Marcas' },
  { value: 'User', label: 'Usuarios' },
  { value: 'Price', label: 'Precios' },
  { value: 'PriceList', label: 'Tarifas' },
  { value: 'Lista', label: 'Listas' },
]

const AUDIT_ACTIONS = [
  { value: 'CREATE', label: 'Crear' },
  { value: 'UPDATE', label: 'Actualizar' },
  { value: 'DELETE', label: 'Eliminar' },
]

const HISTORY_PAGE_SIZE = 20

function formatAuditTimestamp(value: string | Date): string {
  const date = new Date(value)
  return `${date.toLocaleString()}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

function HistoryTab() {
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [userId, setUserId] = useState('')
  const [page, setPage] = useState(1)

  const canReadAudit = canViewAudit()
  const isSuperAdmin = hasRole(ROLES.SUPER_ADMIN)

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users?take=100')
      return (res.data as { data?: { id: string; name: string; email: string }[] }).data ?? []
    },
    enabled: isSuperAdmin,
  })

  const logsQuery = useQuery({
    queryKey: ['audit-settings', entity, action, userId, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('skip', String((page - 1) * HISTORY_PAGE_SIZE))
      params.set('take', String(HISTORY_PAGE_SIZE))
      if (entity) params.set('entity', entity)
      if (action) params.set('action', action)
      if (userId) params.set('userId', userId)
      const res = await api.get(`/audit?${params}`)
      return res.data as AuditResponse
    },
    enabled: canReadAudit,
  })

  if (!canReadAudit) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <svg className="w-12 h-12 text-neutral-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-neutral-500 font-medium">Sin acceso al historial de auditoría</p>
        <p className="text-neutral-400 text-sm mt-1">Solo Super Admin, Supervisor y Admin Comercial pueden consultarlo.</p>
      </div>
    )
  }

  const logs = logsQuery.data?.data ?? []
  const total = logsQuery.data?.meta?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-3 bg-white rounded-xl border border-neutral-200 p-4">
        <select
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm bg-white"
        >
          <option value="">Todas las entidades</option>
          {AUDIT_ENTITIES.map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm bg-white"
        >
          <option value="">Todas las acciones</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        {isSuperAdmin && (
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm bg-white"
          >
            <option value="">Todos los usuarios</option>
            {(usersQuery.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Fecha</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Usuario</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Acción</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Entidad</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {logsQuery.isLoading ? (
                <EmptyRow colSpan={5} message="Cargando..." />
              ) : logs.length === 0 ? (
                <EmptyRow colSpan={5} message="No hay registros" />
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-3 py-1.5 text-xs text-neutral-500 whitespace-nowrap">{formatAuditTimestamp(log.createdAt)}</td>
                    <td className="px-3 py-1.5 text-xs text-neutral-800">{log.user?.name ?? 'Sistema'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
                        log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' :
                        log.action === 'UPDATE' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-neutral-600">{log.entity}</td>
                    <td className="px-3 py-1.5 text-xs font-mono text-neutral-500">{log.entityId?.substring(0, 8)}...</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-neutral-500">{total} registro(s)</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <span className="text-sm text-neutral-600">
              Página {page} de {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
