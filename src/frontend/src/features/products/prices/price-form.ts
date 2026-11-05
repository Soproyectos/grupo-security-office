import { fromDatetimeLocal, toDatetimeLocal } from '../lib/lifecycle'
import type { Price, PricePayload, UpdatePricePayload } from '../../../services/prices.service'

export interface PriceFormValues {
  value: string
  currency: string
  priceListId: string
  validFrom: string
  validUntil: string
}

export function validatePriceForm(values: PriceFormValues, mode: 'create' | 'edit'): string | null {
  const value = Number(values.value)
  if (!values.value || !Number.isFinite(value) || value <= 0) return 'El valor debe ser mayor que 0.'
  if (!values.currency) return 'La moneda es requerida.'
  if (mode === 'create' && !values.priceListId) return 'Selecciona una tarifa.'
  if (values.validFrom && values.validUntil && values.validUntil <= values.validFrom) {
    return 'La fecha de fin debe ser posterior a la fecha de inicio.'
  }
  return null
}

export function buildCreatePricePayload(productId: string, values: PriceFormValues): PricePayload {
  return {
    productId,
    priceListId: values.priceListId,
    value: Number(values.value),
    currency: values.currency,
    ...(values.validFrom ? { validFrom: fromDatetimeLocal(values.validFrom) } : {}),
    ...(values.validUntil ? { validUntil: fromDatetimeLocal(values.validUntil) } : {}),
  }
}

export function priceDateToInput(value: string | null): string {
  return value ? toDatetimeLocal(value) : ''
}

export function buildUpdatePricePayload(price: Price, values: PriceFormValues): UpdatePricePayload {
  const from = priceDateToInput(price.validFrom)
  const until = priceDateToInput(price.validUntil)
  return {
    value: Number(values.value),
    currency: values.currency,
    validFrom: values.validFrom === from
      ? price.validFrom
      : values.validFrom ? fromDatetimeLocal(values.validFrom) : null,
    validUntil: values.validUntil === until
      ? price.validUntil
      : values.validUntil ? fromDatetimeLocal(values.validUntil) : null,
  }
}
