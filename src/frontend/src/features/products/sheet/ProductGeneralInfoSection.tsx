import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../services/api'
import type { Brand, Category, Product } from '../types/product.types'
import { getApiErrorMessage } from '../../../lib/apiError'
import { Alert, Button } from '../../../components/ui'

const inputClass =
  'w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm'

interface GeneralInfoForm {
  sku: string
  name: string
  description: string
  categoryId: string
  brandId: string
}

const formOf = (product: Product): GeneralInfoForm => ({
  sku: product.sku,
  name: product.name,
  description: product.description ?? '',
  categoryId: product.categoryId,
  brandId: product.brandId,
})

const sameForm = (a: GeneralInfoForm, b: GeneralInfoForm) =>
  a.sku === b.sku &&
  a.name === b.name &&
  a.description === b.description &&
  a.categoryId === b.categoryId &&
  a.brandId === b.brandId

/** SKU, name, description, category and brand. Read-only in the global catalog view. */
export function ProductGeneralInfoSection({
  product,
  categories,
  brands,
  readOnly = false,
  onDirtyChange,
}: {
  product: Product
  categories: Category[]
  brands: Brand[]
  readOnly?: boolean
  onDirtyChange?: (dirty: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<GeneralInfoForm>(() => formOf(product))
  const [baseline, setBaseline] = useState<GeneralInfoForm>(() => formOf(product))
  const [error, setError] = useState('')
  const dirty = !sameForm(form, baseline)

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const mutation = useMutation({
    mutationFn: () => api.put(`/products/${product.id}`, form),
    onSuccess: () => {
      setBaseline(form)
      queryClient.invalidateQueries({ queryKey: ['product', product.id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('El nombre es requerido.')
      return
    }
    if (!form.sku.trim()) {
      setError('El SKU es requerido.')
      return
    }
    if (!form.categoryId || !form.brandId) {
      setError('Categoría y marca son requeridas.')
      return
    }
    setError('')
    mutation.mutate()
  }

  if (readOnly) {
    return (
      <div className="space-y-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">SKU</dt>
            <dd className="mt-1 text-neutral-800 font-mono">{product.sku}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Nombre</dt>
            <dd className="mt-1 text-neutral-800">{product.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Categoría</dt>
            <dd className="mt-1 text-neutral-800">{product.category?.name || 'Sin categoría'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Marca</dt>
            <dd className="mt-1 text-neutral-800">{product.brand?.name || 'Sin marca'}</dd>
          </div>
        </dl>
        <div>
          <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Descripción</dt>
          <dd className="mt-1 text-sm text-neutral-700">{product.description || 'Sin descripción'}</dd>
        </div>
        <p className="text-xs text-neutral-400">
          Esta vista de catálogo es de solo lectura. La edición se realiza desde su Lista comercial.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label="Información general del producto">
      {(error || mutation.isError) && (
        <Alert variant="error">{error || getApiErrorMessage(mutation.error, 'No se pudo guardar el producto.')}</Alert>
      )}
      {mutation.isSuccess && !dirty && <Alert variant="success">Producto actualizado correctamente.</Alert>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5" htmlFor="ficha-info-sku">
            SKU
          </label>
          <input
            id="ficha-info-sku"
            type="text"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            className={inputClass}
            required
          />
          <p className="text-xs text-neutral-400 mt-1">
            El SKU debe ser único. Si ya existe, se mostrará un aviso al guardar.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5" htmlFor="ficha-info-name">
            Nombre del producto
          </label>
          <input
            id="ficha-info-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
            required
          />
          <p className="text-xs text-neutral-400 mt-1">
            Nombre en la Lista y las cotizaciones. El nombre que ve el cliente en la ficha se edita en «Identidad».
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1.5" htmlFor="ficha-info-description">
          Descripción
        </label>
        <textarea
          id="ficha-info-description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className={`${inputClass} resize-none`}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5" htmlFor="ficha-info-category">
            Categoría
          </label>
          <select
            id="ficha-info-category"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className={inputClass}
          >
            <option value="">Seleccionar...</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5" htmlFor="ficha-info-brand">
            Marca
          </label>
          <select
            id="ficha-info-brand"
            value={form.brandId}
            onChange={(e) => setForm({ ...form, brandId: e.target.value })}
            className={inputClass}
          >
            <option value="">Seleccionar...</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-500" aria-live="polite">
          {dirty ? 'Hay cambios sin guardar en la información general.' : 'Sin cambios pendientes.'}
        </span>
        <Button type="submit" loading={mutation.isPending} disabled={!dirty}>
          Guardar información general
        </Button>
      </div>
    </form>
  )
}
