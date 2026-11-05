import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createBrand,
  createCategory,
  deleteBrand,
  deleteCategory,
  fetchBrands,
  fetchCategories,
  toggleBrandActive,
  updateBrand,
  type Brand,
  type Category,
} from '../../services/settings.service'
import { createPriceList, deletePriceList, fetchPriceLists, togglePriceListActive, type PriceList } from '../../services/prices.service'
import {
  createSubcategory,
  deleteSubcategory,
  fetchBrandUsage,
  fetchCategoryUsage,
  fetchPriceListUsage,
  fetchSubcategories,
  fetchSubcategoryUsage,
  mastersKeys,
  setCategoryActive,
  setSubcategoryActive,
  updateCategoryWithImpact,
  updatePriceListWithImpact,
  updateSubcategory,
  type MasterSubcategory,
} from './masters-api'
import MasterSection, { type FieldDef, type FormValues, type MasterAdapter } from './MasterSection'
import { TARIFF_CREATE_NOTICE, slugify } from './masters-rules'

const text = (values: FormValues, name: string) => (typeof values[name] === 'string' ? (values[name] as string).trim() : '')
const requireName = (values: FormValues) => (text(values, 'name').length < 2 ? 'Escribe un nombre de al menos 2 letras.' : null)

const plural = (n: number | undefined, one: string, many: string) => (n === undefined ? [] : [`${n} ${n === 1 ? one : many}`])

/** Active root categories (the only valid parents of a subcategory). */
const rootOptions = (categories: Category[], includeEmpty?: string) => [
  ...(includeEmpty ? [{ value: '', label: includeEmpty }] : []),
  ...categories.filter((category) => !category.parentId).map((category) => ({ value: category.id, label: category.name })),
]

// ---------------------------------------------------------------- categories

export function buildCategoriesAdapter(categories: Category[]): MasterAdapter<Category> {
  const nameOf = (id: string) => categories.find((category) => category.id === id)?.name
  return {
    queryKey: mastersKeys.categories,
    label: 'Categorías',
    singular: 'categoría',
    load: fetchCategories,
    toRow: (item) => ({
      id: item.id,
      name: item.name,
      active: item.isActive,
      detail: item.parent?.name ? `Dentro de «${item.parent.name}»` : 'Categoría principal',
      counts: [...plural(item.productCount, 'producto', 'productos'), ...plural(item.childrenCount, 'categoría hija', 'categorías hijas')],
    }),
    searchText: (item) => [item.name, item.parent?.name],
    fields: (item) => [
      { name: 'name', label: 'Nombre', kind: 'text', required: true, hint: item ? 'Cambiar el nombre conserva los productos y subcategorías asociados.' : undefined },
      { name: 'parentId', label: 'Categoría padre', kind: 'select', options: rootOptions(categories.filter((category) => category.id !== item?.id), 'Ninguna (categoría principal)') as FieldDef['options'] },
      { name: 'description', label: 'Descripción', kind: 'text' },
    ],
    initialValues: (item) => ({ name: item?.name ?? '', parentId: item?.parentId ?? '', description: item?.description ?? '' }),
    validate: requireName,
    create: (values) => createCategory({ name: text(values, 'name'), slug: slugify(text(values, 'name')), description: text(values, 'description') || null, parentId: text(values, 'parentId') || null }),
    update: (item, values, confirmImpact) => {
      const payload: Record<string, unknown> = { name: text(values, 'name'), description: text(values, 'description') || undefined }
      if ((text(values, 'parentId') || null) !== (item.parentId ?? null)) payload.parentId = text(values, 'parentId')
      return updateCategoryWithImpact(item.id, payload, confirmImpact)
    },
    setActive: (item, next) => setCategoryActive(item.id, next),
    remove: (item) => deleteCategory(item.id),
    usage: (item) => fetchCategoryUsage(item.id),
    resolveName: nameOf,
    alsoInvalidate: [mastersKeys.subcategories],
  }
}

export function CategoriesSection({ canWrite }: { canWrite: boolean }) {
  const list = useQuery({ queryKey: mastersKeys.categories, queryFn: fetchCategories, refetchOnWindowFocus: false })
  const adapter = useMemo(() => buildCategoriesAdapter(list.data ?? []), [list.data])
  return <MasterSection adapter={adapter} canWrite={canWrite} />
}

// ------------------------------------------------------------- subcategories

export function buildSubcategoriesAdapter(categories: Category[]): MasterAdapter<MasterSubcategory> {
  const nameOf = (id: string) => categories.find((category) => category.id === id)?.name
  return {
    queryKey: mastersKeys.subcategories,
    label: 'Subcategorías',
    singular: 'subcategoría',
    load: () => fetchSubcategories(),
    toRow: (item) => ({
      id: item.id,
      name: item.name,
      active: item.isActive,
      detail: `Dentro de «${item.category?.name ?? nameOf(item.categoryId) ?? 'categoría'}»`,
      counts: plural(item.productCount, 'producto', 'productos'),
    }),
    searchText: (item) => [item.name, item.category?.name, ...(item.searchTerms ?? [])],
    fields: (item) => [
      { name: 'name', label: 'Nombre', kind: 'text', required: true, hint: item ? 'Cambiar el nombre conserva los productos y el molde asociados.' : undefined },
      { name: 'categoryId', label: 'Categoría principal', kind: 'select', required: true, options: rootOptions(categories) },
    ],
    initialValues: (item) => ({ name: item?.name ?? '', categoryId: item?.categoryId ?? rootOptions(categories)[0]?.value ?? '' }),
    validate: (values) => requireName(values) ?? (text(values, 'categoryId') ? null : 'Elige la categoría principal.'),
    create: (values) => createSubcategory({ name: text(values, 'name'), categoryId: text(values, 'categoryId') }),
    update: (item, values, confirmImpact) => {
      const moved = text(values, 'categoryId') !== item.categoryId
      return updateSubcategory(item.id, {
        name: text(values, 'name'),
        ...(moved ? { categoryId: text(values, 'categoryId'), ...(confirmImpact ? { confirmImpact: true } : {}) } : {}),
      })
    },
    setActive: (item, next) => setSubcategoryActive(item.id, next),
    remove: (item) => deleteSubcategory(item.id),
    usage: (item) => fetchSubcategoryUsage(item.id),
    resolveName: nameOf,
  }
}

export function SubcategoriesSection({ canWrite }: { canWrite: boolean }) {
  const list = useQuery({ queryKey: mastersKeys.categories, queryFn: fetchCategories, refetchOnWindowFocus: false })
  const adapter = useMemo(() => buildSubcategoriesAdapter(list.data ?? []), [list.data])
  return <MasterSection adapter={adapter} canWrite={canWrite} />
}

// -------------------------------------------------------------------- brands

export const brandsAdapter: MasterAdapter<Brand> = {
  queryKey: mastersKeys.brands,
  label: 'Marcas',
  singular: 'marca',
  load: fetchBrands,
  toRow: (item) => ({ id: item.id, name: item.name, active: item.isActive, detail: item.website ?? undefined, counts: plural(item.productCount, 'producto', 'productos') }),
  searchText: (item) => [item.name, item.website],
  fields: (item) => [
    { name: 'name', label: 'Nombre', kind: 'text', required: true, hint: item ? 'Cambiar el nombre conserva los productos asociados.' : undefined },
    { name: 'website', label: 'Sitio web', kind: 'text' },
    { name: 'description', label: 'Descripción', kind: 'text' },
  ],
  initialValues: (item) => ({ name: item?.name ?? '', website: item?.website ?? '', description: item?.description ?? '' }),
  validate: requireName,
  create: (values) => createBrand({ name: text(values, 'name'), slug: slugify(text(values, 'name')), description: text(values, 'description') || null }),
  update: (item, values) => updateBrand(item.id, { name: text(values, 'name'), description: text(values, 'description') || null }),
  setActive: (item) => toggleBrandActive(item.id),
  remove: (item) => deleteBrand(item.id),
  usage: (item) => fetchBrandUsage(item.id),
}

export function BrandsSection({ canWrite }: { canWrite: boolean }) {
  return <MasterSection adapter={brandsAdapter} canWrite={canWrite} />
}

// ------------------------------------------------------------------- tariffs

const CURRENCIES = ['COP', 'USD', 'EUR'].map((value) => ({ value, label: value }))

export const tariffsAdapter: MasterAdapter<PriceList> = {
  queryKey: mastersKeys.tariffs,
  label: 'Tarifas',
  singular: 'tarifa',
  load: fetchPriceLists,
  toRow: (item) => ({ id: item.id, name: item.name, active: item.isActive, detail: `${item.code} · ${item.currency}`, counts: plural(item.priceCount, 'precio', 'precios') }),
  searchText: (item) => [item.name, item.code],
  fields: (item) => [
    { name: 'name', label: 'Nombre', kind: 'text', required: true },
    { name: 'code', label: 'Código', kind: 'text', required: true, disabled: !!item, hint: item ? undefined : 'Identifica la tarifa en listados e importaciones.' },
    { name: 'currency', label: 'Moneda', kind: 'select', options: CURRENCIES, hint: item ? 'Cambiar la moneda de una tarifa con precios pide confirmación.' : undefined },
  ],
  initialValues: (item) => ({ name: item?.name ?? '', code: item?.code ?? '', currency: item?.currency ?? 'COP' }),
  validate: (values) => requireName(values) ?? (text(values, 'code').length < 2 ? 'Escribe un código de al menos 2 caracteres.' : null),
  create: (values) => createPriceList({ name: text(values, 'name'), code: text(values, 'code'), currency: text(values, 'currency') || 'COP' }),
  update: (item, values, confirmImpact) => {
    const payload: Record<string, unknown> = { name: text(values, 'name') }
    if (text(values, 'currency') && text(values, 'currency') !== item.currency) payload.currency = text(values, 'currency')
    return updatePriceListWithImpact(item.id, payload, confirmImpact)
  },
  setActive: (item) => togglePriceListActive(item.id),
  remove: (item) => deletePriceList(item.id),
  usage: (item) => fetchPriceListUsage(item.id),
  createNote: TARIFF_CREATE_NOTICE,
}

export function TariffsSection({ canWrite }: { canWrite: boolean }) {
  return <MasterSection adapter={tariffsAdapter} canWrite={canWrite} />
}
