import { useQuery } from '@tanstack/react-query'
import { fetchQuote, fetchQuotes } from '../../../services/quotes.service'
import type { QuoteFilters } from '../types/quote.types'

interface UseQuotesOptions {
  filters: QuoteFilters
  page: number
  pageSize: number
}

export function useQuotes({ filters, page, pageSize }: UseQuotesOptions) {
  const quotesQuery = useQuery({
    queryKey: ['quotes', filters, page, pageSize],
    queryFn: () => fetchQuotes(filters, page, pageSize),
  })

  return {
    quotes: quotesQuery.data?.data ?? [],
    meta: quotesQuery.data?.meta,
    total: quotesQuery.data?.meta?.total ?? 0,
    totalPages: quotesQuery.data?.meta?.totalPages ?? 1,
    isLoading: quotesQuery.isLoading,
    error: quotesQuery.error,
  }
}

export function useQuote(id: string | undefined) {
  const quoteQuery = useQuery({
    queryKey: ['quotes', 'detail', id],
    queryFn: () => fetchQuote(id as string),
    enabled: Boolean(id),
  })

  return {
    quote: quoteQuery.data,
    isLoading: quoteQuery.isLoading,
    error: quoteQuery.error,
  }
}
