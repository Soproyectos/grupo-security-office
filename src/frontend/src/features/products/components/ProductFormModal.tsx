import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { resolveAssetUrl } from '../../../services/api'
import type { Product, Category, Brand, ProductPayload } from '../types/product.types'
import { usePriceLists } from '../hooks/usePriceLists'
import { SpecEditor, type SpecField, deserializeSpecFields, serializeSpecFields } from './SpecEditor'

interface ProductFormModalProps {
  product: Product | null
  categories: Category[]
  brands: Brand[]
  listaId?: string
  onClose: () => void
  onSaved: () => void
}

type Tab = 'basic' | 'specs' | 'prices' | 'images'

interface PriceRow {
  value: string
  validFrom: string
  validUntil: string
}

const inputClass =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary text-sm'

const tabs: { id: Tab; label: string }[] = [
  { id: 'basic', label: 'Información' },
  { id: 'specs', label: 'Especificaciones' },
  { id: 'prices', label: 'Precios' },
  { id: 'images', label: 'Imágenes' },
]

function seedPrices(product: Product | null): Record<string, PriceRow> {
  const map: Record<string, PriceRow> = {}
  product?.prices?.forEach((p) => {
    map[p.priceList.id] = {
      value: String(p.value),
      validFrom: p.validFrom ? p.validFrom.slice(0, 10) : '',
      validUntil: p.validUntil ? p.validUntil.slice(0, 10) : '',
    }
  })
  return map
}

export default function ProductFormModal({
  product,
  categories,
  brands,
  listaId,
  onClose,
  onSaved,
}: ProductFormModalProps) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('basic')
const [form, setForm] = useState({
    sku: product?.sku || '',
    name: product?.name || '',
    description: product?.description || '',
    categoryId: product?.categoryId || '',
    brandId: product?.brandId || '',
    isActive: product?.isActive ?? true,
    isVisible: product?.isVisible ?? false,
  })
  const [technicalSpecs, setTechnicalSpecs] = useState<SpecField[]>(() =>
    deserializeSpecFields(product?.technicalSpecs ?? null)
  )
  const [extraAttributes, setExtraAttributes] = useState<SpecField[]>(() =>
    deserializeSpecFields(product?.extraAttributes ?? null)
  )
  const [specErrors, setSpecErrors] = useState<{
    technicalSpecs?: string
    extraAttributes?: string
  }>({})
  const [prices, setPrices] = useState<Record<string, PriceRow>>(() => seedPrices(product))
  const [draftChecked, setDraftChecked] = useState(false)
  const [priceGateError, setPriceGateError] = useState('')
  const [categoryError, setCategoryError] = useState('')

  const { priceLists, isLoading: isLoadingLists } = usePriceLists()

  const { data: productDetail } = useQuery({
    queryKey: ['product', product?.id],
    queryFn: async () => {
      const res = await api.get(`/products/${product!.id}`)
      return res.data as Product
    },
    enabled: !!product,
  })

  const images = productDetail?.images ?? product?.images ?? []

  const refreshProduct = () => {
    if (product?.id) {
      queryClient.invalidateQueries({ queryKey: ['product', product.id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    }
  }

  const uploadImage = useMutation({
    mutationFn: ({ file, isPrimary, type }: { file: File; isPrimary: boolean; type: string }) => {
      const fd = new FormData()
      fd.append('file', file, file.name)
      if (isPrimary) fd.append('isPrimary', 'true')
      fd.append('type', type)
      return api.post(`/products/${product!.id}/images`, fd)
    },
    onSuccess: refreshProduct,
  })

  const deleteImage = useMutation({
    mutationFn: (imageId: string) => api.delete(`/products/images/${imageId}`),
    onSuccess: refreshProduct,
  })

  const markPrimary = useMutation({
    mutationFn: (imageId: string) =>
      api.patch(`/products/images/${imageId}`, { isPrimary: true }),
    onSuccess: refreshProduct,
  })

  const updateImageType = useMutation({
    mutationFn: ({ imageId, type }: { imageId: string; type: string }) =>
      api.patch(`/products/images/${imageId}`, { type }),
    onSuccess: refreshProduct,
  })

  const [uploadImageType, setUploadImageType] = useState<'PORTADA' | 'LOGO' | 'PRINCIPAL' | 'COMPLEMENTARIA' | 'EXTRA'>('PRINCIPAL')
  const IMAGE_TYPES = ['PORTADA', 'LOGO', 'PRINCIPAL', 'COMPLEMENTARIA', 'EXTRA'] as const

  const [clave, setClave] = useState('')
  const [claveRequired, setClaveRequired] = useState(false)
  const [formError, setFormError] = useState<string>('')

  const mutation = useMutation({
    mutationFn: async (data: ProductPayload & { clave?: string }) => {
      if (product) {
        return api.put(`/products/${product.id}`, data)
      }
      return api.post('/products', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      onSaved()
    },
    onError: (err) => {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === 'CLAVE_USUARIO_REQUERIDA' || code === 'CLAVE_USUARIO_INCORRECTA') {
        setClaveRequired(true)
      } else {
        let message = 'No fue posible guardar el producto. Intenta nuevamente.'
        const apiErr = err as { response?: { data?: { message?: string | string[] } } }
        if (apiErr.response?.data?.message) {
          message = typeof apiErr.response.data.message === 'string'
            ? apiErr.response.data.message
            : apiErr.response.data.message.join('. ')
        }
        setFormError(message)
      }
    },
  })

  const buildPricesPayload = (): ProductPayload['prices'] =>
    priceLists
      .filter((list) => {
        const value = prices[list.id]?.value
        return value !== undefined && value.trim() !== ''
      })
      .map((list) => {
        const row = prices[list.id]
        return {
          priceListId: list.id,
          value: Number(row!.value),
          currency: list.currency,
          ...(row!.validFrom ? { validFrom: row!.validFrom } : {}),
          ...(row!.validUntil ? { validUntil: row!.validUntil } : {}),
        }
      })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    // Validate specs - check for empty keys, duplicates, and SELECT without options
    const validateSpecs = (fields: SpecField[], fieldName: string): string | undefined => {
      const keys = fields.map((f) => f.key.trim())
      if (keys.some((k) => !k)) return `${fieldName}: las claves no pueden estar vacías`
      if (new Set(keys).size !== keys.length) return `${fieldName}: claves duplicadas`
      const selectWithoutOptions = fields.find((f) => f.type === 'SELECT' && (!f.options || f.options.length === 0))
      if (selectWithoutOptions) return `${fieldName}: las listas SELECT requieren opciones`
      return undefined
    }

    const techError = validateSpecs(technicalSpecs, 'Especificaciones técnicas')
    const extraError = validateSpecs(extraAttributes, 'Atributos extra')
    if (techError || extraError) {
      setSpecErrors({
        technicalSpecs: techError,
        extraAttributes: extraError,
      })
      setTab('specs')
      return
    }
    setSpecErrors({})

    if (!product && !form.categoryId) {
      setCategoryError('La categoría es obligatoria para crear un producto.')
      setTab('basic')
      return
    }
    setCategoryError('')
    if (!product) {
      const hasPrice = (buildPricesPayload() ?? []).some((p) => p.value > 0)
      if (!hasPrice && !draftChecked) {
        setPriceGateError(
          'Debes asignar al menos un precio mayor a 0 o marcar "Guardar como borrador / pendiente de precio".'
        )
        setTab('prices')
        return
      }
    }
    setPriceGateError('')
    setFormError('')
    const payload: ProductPayload = {
      sku: form.sku,
      name: form.name,
      description: form.description,
      categoryId: form.categoryId,
      brandId: form.brandId || null,
      ...(product ? {} : { isActive: form.isActive }),
      ...(product ? {} : { isVisible: form.isVisible }),
      technicalSpecs: Object.keys(serializeSpecFields(technicalSpecs)).length ? serializeSpecFields(technicalSpecs) : undefined,
      extraAttributes: Object.keys(serializeSpecFields(extraAttributes)).length ? serializeSpecFields(extraAttributes) : undefined,
      prices: buildPricesPayload(),
    }
    if (!product) {
      payload.listaId = listaId
    }
    // La clave del usuario solo aplica en modificación (el backend la exige sólo
    // si el usuario tiene clave configurada).
    const body: ProductPayload & { clave?: string } = product
      ? { ...payload, clave: clave.trim() || undefined }
      : payload
    mutation.mutate(body)
  }

  const setPriceRow = (listId: string, patch: Partial<PriceRow>) => {
    setPrices((prev) => ({
      ...prev,
      [listId]: {
        value: '',
        validFrom: '',
        validUntil: '',
        ...prev[listId],
        ...patch,
      },
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 bg-security-700 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">
              {product ? 'Editar Producto' : 'Nuevo Producto'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-security-200 hover:text-white hover:bg-security-600 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 border-b border-gray-200 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-security-600 text-security-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {formError && (
            <p className="text-xs text-red-600 mb-3" role="alert">
              {formError}
            </p>
          )}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {tab === 'basic' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">SKU</label>
                    <input
                      type="text"
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={`${inputClass} resize-none`}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Categoría</label>
                    <select
                      value={form.categoryId}
                      onChange={(e) => {
                        setForm({ ...form, categoryId: e.target.value })
                        setCategoryError('')
                      }}
                      className={`${inputClass} ${categoryError ? 'border-red-400' : ''}`}
                      required
                    >
                      <option value="">Seleccionar...</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    {categoryError && (
                      <p className="text-xs text-red-600 mt-1" role="alert">
                        {categoryError}
                      </p>
                    )}
                    {!product && !categoryError && (
                      <p className="text-xs text-gray-400 mt-1">
                        Obligatoria al crear un producto.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Marca</label>
                    <select
                      value={form.brandId}
                      onChange={(e) => setForm({ ...form, brandId: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Sin marca todavía</option>
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      className="w-4 h-4 text-security-600 border-gray-300 rounded focus:ring-brand-primary/30 focus:border-brand-primary"
                    />
                    <span className="text-sm text-gray-700">Activo</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isVisible}
                      onChange={(e) => setForm({ ...form, isVisible: e.target.checked })}
                      className="w-4 h-4 text-security-600 border-gray-300 rounded focus:ring-brand-primary/30 focus:border-brand-primary"
                    />
                    <span className="text-sm text-gray-700">Visible</span>
                  </label>
                </div>
              </>
            )}

            {tab === 'specs' && (
              <div className="space-y-6">
                <SpecEditor
                  fields={technicalSpecs}
                  onChange={setTechnicalSpecs}
                  label="Especificaciones técnicas"
                  placeholder="Agrega especificaciones como resolución, lente, visión nocturna, etc."
                  validationError={specErrors.technicalSpecs}
                />
                <SpecEditor
                  fields={extraAttributes}
                  onChange={setExtraAttributes}
                  label="Atributos extra"
                  placeholder="Agrega atributos como garantía, peso, color, etc."
                  validationError={specErrors.extraAttributes}
                />
              </div>
            )}

            {tab === 'prices' && (
              <div>
                {isLoadingLists ? (
                  <p className="text-sm text-gray-400 py-6 text-center">Cargando listas de precios...</p>
                ) : priceLists.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">
                    No hay listas de precios. Créalas desde la sección de Precios.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <div
                      className="grid"
                      style={{ gridTemplateColumns: `minmax(120px, auto) repeat(${priceLists.length}, minmax(160px, 1fr))` }}
                    >
                      <div className="sticky left-0 z-10 bg-security-50">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200">
                          Lista
                        </div>
                      </div>
                      {priceLists.map((list) => (
                        <div key={list.id} className="min-w-0 border-b border-gray-200 px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-semibold text-gray-900">{list.name}</p>
                              {!list.isActive && (
                                <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded whitespace-nowrap">
                                  Inactiva
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-600 font-mono">{list.code}</span>
                          </div>
                        </div>
                      ))}

                      <div className="sticky left-0 z-10 bg-security-50">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200">
                          Moneda
                        </div>
                      </div>
                      {priceLists.map((list) => (
                        <div key={list.id} className="min-w-0 border-b border-gray-200 px-3 py-2">
                          <span className="text-sm text-gray-600">{list.currency}</span>
                        </div>
                      ))}

                      <div className="sticky left-0 z-10 bg-security-50">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200">
                          Valor
                        </div>
                      </div>
                      {priceLists.map((list) => {
                        const row = prices[list.id]
                        return (
                          <div key={list.id} className="min-w-0 border-b border-gray-200 px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row?.value ?? ''}
                              placeholder="0"
                              aria-label={`Precio en ${list.name}`}
                              onChange={(e) => setPriceRow(list.id, { value: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/40 focus:border-brand-primary text-sm relative focus:z-20"
                            />
                          </div>
                        )
                      })}

                      <div className="sticky left-0 z-10 bg-security-50">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200">
                          Desde
                        </div>
                      </div>
                      {priceLists.map((list) => {
                        const row = prices[list.id]
                        return (
                          <div key={list.id} className="min-w-0 border-b border-gray-200 px-3 py-2">
                            <input
                              type="date"
                              value={row?.validFrom ?? ''}
                              aria-label={`Vigencia desde en ${list.name}`}
                              onChange={(e) => setPriceRow(list.id, { validFrom: e.target.value })}
                              className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/40 focus:border-brand-primary text-xs relative focus:z-20"
                            />
                          </div>
                        )
                      })}

                      <div className="sticky left-0 z-10 bg-security-50">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200">
                          Hasta
                        </div>
                      </div>
                      {priceLists.map((list) => {
                        const row = prices[list.id]
                        return (
                          <div key={list.id} className="min-w-0 border-b border-gray-200 px-3 py-2">
                            <input
                              type="date"
                              value={row?.validUntil ?? ''}
                              aria-label={`Vigencia hasta en ${list.name}`}
                              onChange={(e) => setPriceRow(list.id, { validUntil: e.target.value })}
                              className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/40 focus:border-brand-primary text-xs relative focus:z-20"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {!product && (
                  <label className="flex items-center gap-2 mt-4 p-3 border border-dashed border-neutral-300 rounded-lg cursor-pointer hover:bg-neutral-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={draftChecked}
                      onChange={(e) => {
                        setDraftChecked(e.target.checked)
                        setPriceGateError('')
                      }}
                      className="w-4 h-4 text-security-600 border-gray-300 rounded focus:ring-brand-primary/30 focus:border-brand-primary"
                    />
                    <span className="text-sm text-gray-700">
                      Guardar como borrador / pendiente de precio
                    </span>
                  </label>
                )}
                {priceGateError && (
                  <p className="text-xs text-red-600 mt-2" role="alert">
                    {priceGateError}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-3">
                  Los precios se guardan junto con el producto.
                </p>
              </div>
            )}

            {tab === 'images' && (
              <div>
                {!product ? (
                  <div className="text-center py-10">
                    <svg
                      className="w-14 h-14 text-gray-300 mx-auto mb-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-sm text-gray-500 font-medium">
                      Guarda el producto primero para poder subir imágenes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                      <label className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors flex-1 sm:flex-none">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Subir imagen
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadImage.isPending}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file instanceof File) {
                              uploadImage.mutate({ file, isPrimary: images.length === 0, type: uploadImageType })
                            }
                            e.target.value = ''
                          }}
                        />
                      </label>
                      <select
                        value={uploadImageType}
                        onChange={(e) => setUploadImageType(e.target.value as typeof uploadImageType)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary text-sm bg-white min-w-[160px]"
                        aria-label="Tipo de imagen"
                      >
                        {IMAGE_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    {uploadImage.isPending && (
                      <p className="text-xs text-gray-400">Subiendo imagen...</p>
                    )}
                    {uploadImage.isError && (
                      <p className="text-xs text-red-600">Error al subir la imagen.</p>
                    )}

                    {images.length === 0 ? (
                      <p className="text-sm text-gray-400">No hay imágenes aún.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {images.map((img) => (
                          <div key={img.id} className="border border-gray-200 rounded-lg p-2">
                            <img
                              src={resolveAssetUrl(img.url)}
                              alt={img.alt ?? product.name}
                              className="w-full h-28 object-cover rounded-md bg-gray-100"
                            />
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                                {img.type ?? 'PRINCIPAL'}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={img.type ?? 'PRINCIPAL'}
                                  onChange={(e) => updateImageType.mutate({ imageId: img.id, type: e.target.value })}
                                  disabled={updateImageType.isPending}
                                  className="text-xs px-2 py-1 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
                                  aria-label="Cambiar tipo de imagen"
                                >
                                  {IMAGE_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={img.isPrimary || markPrimary.isPending}
                                  onClick={() => markPrimary.mutate(img.id)}
                                  className={`text-xs font-medium rounded px-2 py-1 transition-colors ${
                                    img.isPrimary
                                      ? 'bg-security-100 text-security-700 cursor-default'
                                      : 'text-gray-500 hover:text-security-600 hover:bg-security-50'
                                  }`}
                                >
                                  {img.isPrimary ? 'Principal' : 'Marcar principal'}
                                </button>
                                <button
                                  type="button"
                                  disabled={deleteImage.isPending}
                                  onClick={() => {
                                    if (confirm('¿Eliminar esta imagen?')) {
                                      deleteImage.mutate(img.id)
                                    }
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  title="Eliminar"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {product && claveRequired && (
            <div className="px-6 pt-4">
              <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                Clave del usuario
              </label>
              <input
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                autoComplete="current-password"
                placeholder="Ingresa tu clave para guardar los cambios"
                className={inputClass}
              />
              <p className="text-xs text-neutral-500 mt-1.5">
                Tu usuario tiene clave configurada. Ingrésala para confirmar la modificación.
              </p>
            </div>
          )}

          <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2.5 bg-security-500 text-white rounded-lg hover:bg-security-600 disabled:opacity-50 font-semibold transition-colors flex items-center gap-2"
            >
              {mutation.isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Guardando...
                </>
              ) : (
                'Guardar'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
