import { useQuery } from '@tanstack/react-query';
import { fetchProduct, ProductNotFoundError } from './productsApi';

export const productKeys = {
  all: ['products'] as const,
  detail: (idOrSlug: string) => [...productKeys.all, 'detail', idOrSlug] as const,
};

/** Carga la ficha de un producto (id o slug). Los datos cambian poco: se cachean 10 minutos. */
export function useProduct(idOrSlug: string) {
  return useQuery({
    queryKey: productKeys.detail(idOrSlug),
    queryFn: ({ signal }) => fetchProduct(idOrSlug, signal),
    enabled: idOrSlug.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: (failureCount, error) => !(error instanceof ProductNotFoundError) && failureCount < 2,
  });
}