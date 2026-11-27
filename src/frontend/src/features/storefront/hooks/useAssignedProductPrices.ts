import { useQueries } from '@tanstack/react-query'
import { useCustomerPortalSession } from '../../customer-portal/hooks/useCustomerPortal'
import { fetchAssignedCatalogPrices } from '../../../services/customer-portal.service'
import type { PublicPrice } from '../types/publicProduct'

const MAX_BATCH_SIZE = 50
const NONE = new Map<string, PublicPrice>()

/**
 * Precios de la tarifa del cliente con sesión. Sin sesión, con el perfil incompleto o sin precio para una
 * referencia, no devuelve nada y la tienda conserva el precio público (o «Cotizar»). El servidor calcula los valores.
 */
export function useAssignedProductPrices(ids: readonly string[]) {
  const session = useCustomerPortalSession()
  // A PENDING account is still in review: the server denies its prices, so it does not even ask.
  const account = session.isSuccess && session.data.profileComplete !== false && session.data.state !== 'PENDING' ? session.data : undefined
  // Only an ACTIVE account with a complete profile builds a quote list (the server enforces the rest).
  const quoteAccountId = account?.state === 'ACTIVE' ? account.id : undefined
  const unique = [...new Set(ids)].sort()
  const batches: string[][] = []
  for (let start = 0; start < unique.length; start += MAX_BATCH_SIZE) batches.push(unique.slice(start, start + MAX_BATCH_SIZE))
  const results = useQueries({
    queries: account ? batches.map((batch) => ({
      queryKey: ['customer-portal', 'assigned-prices', account.id, account.tier?.id ?? null, batch],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchAssignedCatalogPrices(batch, signal),
      staleTime: 30_000,
      retry: false,
    })) : [],
  })
  if (!account) return { signedIn: false, error: false, loading: false, prices: NONE, quoteAccountId: undefined as string | undefined }
  const prices = new Map<string, PublicPrice>()
  for (const result of results) {
    for (const { productId, currency, value } of result.data ?? []) {
      const amount = Number(value)
      if (Number.isFinite(amount)) prices.set(productId, { value: amount, currency })
    }
  }
  return { signedIn: true, error: results.some((r) => r.isError), loading: results.some((r) => r.isPending), prices, quoteAccountId }
}
