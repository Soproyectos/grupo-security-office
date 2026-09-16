import { create } from 'zustand'

/**
 * Estado en curso del constructor de cotizaciones (wizard de creación).
 * Solo guarda SELECCIONES del usuario (ids, fechas, notas) — nunca montos:
 * los montos los calcula siempre el backend tras crear la cotización.
 */
export interface BuilderCustomerSelection {
  id: string
  label: string
}

export interface BuilderListaSelection {
  id: string
  label: string
}

export type BuilderStep = 'customer' | 'lista' | 'review'

interface QuoteBuilderState {
  isOpen: boolean
  step: BuilderStep
  customer: BuilderCustomerSelection | null
  lista: BuilderListaSelection | null
  priceListId: string | null
  validUntil: string
  taxRate: string
  notes: string
  open: () => void
  close: () => void
  setStep: (step: BuilderStep) => void
  setCustomer: (customer: BuilderCustomerSelection | null) => void
  setLista: (lista: BuilderListaSelection | null) => void
  setPriceListId: (priceListId: string | null) => void
  setValidUntil: (validUntil: string) => void
  setTaxRate: (taxRate: string) => void
  setNotes: (notes: string) => void
  reset: () => void
}

const INITIAL_STATE = {
  isOpen: false,
  step: 'customer' as BuilderStep,
  customer: null,
  lista: null,
  priceListId: null,
  validUntil: '',
  taxRate: '19',
  notes: '',
}

export const useQuoteBuilderStore = create<QuoteBuilderState>((set) => ({
  ...INITIAL_STATE,
  open: () => set({ ...INITIAL_STATE, isOpen: true }),
  close: () => set({ isOpen: false }),
  setStep: (step) => set({ step }),
  setCustomer: (customer) => set({ customer }),
  setLista: (lista) => set({ lista }),
  setPriceListId: (priceListId) => set({ priceListId }),
  setValidUntil: (validUntil) => set({ validUntil }),
  setTaxRate: (taxRate) => set({ taxRate }),
  setNotes: (notes) => set({ notes }),
  reset: () => set({ ...INITIAL_STATE }),
}))
