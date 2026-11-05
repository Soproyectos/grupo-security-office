import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  classificationKeys,
  fetchClassificationTree,
  fetchKeySpecProjection,
  fetchKeySpecValues,
  fetchMissingKeySpecs,
  fetchSpecTemplate,
  fetchSubcategoryChangePreview,
  keySpecKeys,
  saveKeySpecValues,
} from '../api/keySpecsApi'
import type { KeySpecWriteEntry } from '../types/key-specs.types'

export function useClassificationTree(enabled = true) {
  return useQuery({
    queryKey: classificationKeys.tree,
    queryFn: fetchClassificationTree,
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useSpecTemplate(subcategoryId: string | null | undefined) {
  return useQuery({
    queryKey: keySpecKeys.template(subcategoryId ?? ''),
    queryFn: () => fetchSpecTemplate(subcategoryId as string),
    enabled: Boolean(subcategoryId),
    refetchOnWindowFocus: false,
  })
}

export function useKeySpecValues(productId: string) {
  return useQuery({
    queryKey: keySpecKeys.values(productId),
    queryFn: () => fetchKeySpecValues(productId),
    refetchOnWindowFocus: false,
  })
}

export function useMissingKeySpecs(productId: string) {
  return useQuery({
    queryKey: keySpecKeys.missing(productId),
    queryFn: () => fetchMissingKeySpecs(productId),
    refetchOnWindowFocus: false,
  })
}

export function useKeySpecProjection(productId: string, enabled = true) {
  return useQuery({
    queryKey: keySpecKeys.projection(productId),
    queryFn: () => fetchKeySpecProjection(productId),
    enabled,
    refetchOnWindowFocus: false,
  })
}

/** Preview of a subcategory change. Only runs when a target subcategory is given. */
export function useSubcategoryChangePreview(productId: string, subcategoryId: string | null) {
  return useQuery({
    queryKey: keySpecKeys.changePreview(productId, subcategoryId ?? ''),
    queryFn: () => fetchSubcategoryChangePreview(productId, subcategoryId as string),
    enabled: Boolean(subcategoryId),
    refetchOnWindowFocus: false,
    gcTime: 0,
  })
}

/** Saves key data entries and reloads values, missing items and the draft projection. */
export function useSaveKeySpecs(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entries: KeySpecWriteEntry[]) => saveKeySpecValues(productId, entries),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keySpecKeys.all(productId) }),
  })
}
