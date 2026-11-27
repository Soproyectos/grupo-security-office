import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMunicipalities, fetchMyQuote, fetchMyQuotes, sendPortalQuote } from '../../../services/portal-quotes.service'

const QUOTES_KEY = ['customer-portal', 'quotes'] as const

export function useMyQuotes() {
  return useQuery({ queryKey: QUOTES_KEY, queryFn: fetchMyQuotes, staleTime: 15_000, retry: false })
}

export function useMyQuote(id: string) {
  return useQuery({ queryKey: [...QUOTES_KEY, id], queryFn: () => fetchMyQuote(id), enabled: id !== '', staleTime: 15_000, retry: false })
}

export function useSendPortalQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: sendPortalQuote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUOTES_KEY }),
  })
}

/** The list never changes during a visit: cache it for the whole session. */
export function useMunicipalities() {
  return useQuery({ queryKey: ['public', 'municipalities'], queryFn: fetchMunicipalities, staleTime: Infinity, gcTime: Infinity, retry: 1 })
}
