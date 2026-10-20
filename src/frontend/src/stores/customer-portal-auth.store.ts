import { create } from 'zustand'
import type { PortalAccount } from '../features/customer-portal/types/customer-portal.types'

interface CustomerPortalAuthState {
  account: PortalAccount | null
  hydrated: boolean
  setAccount: (account: PortalAccount | null) => void
  setHydrated: () => void
}

export const useCustomerPortalAuthStore = create<CustomerPortalAuthState>((set) => ({
  account: null,
  hydrated: false,
  setAccount: (account) => set({ account }),
  setHydrated: () => set({ hydrated: true }),
}))
