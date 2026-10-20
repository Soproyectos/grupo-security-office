import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createCustomer,
  updateCustomer,
  convertCustomer,
  deleteCustomer,
  reassignCustomerInCache,
} from '../../../services/customers.service'
import type {
  CustomerEditPayload,
  ReassignCustomerInput,
} from '../../../services/customers.service'
import type { CustomerPayload } from '../types/customer.types'

export function useCustomerMutations() {
  const queryClient = useQueryClient()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['customers'], refetchType: 'all' })

  const create = useMutation({
    mutationFn: (payload: CustomerPayload) => createCustomer(payload),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CustomerEditPayload }) =>
      updateCustomer(id, payload),
    onSuccess: invalidate,
  })

  const convert = useMutation({
    mutationFn: (id: string) => convertCustomer(id),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: invalidate,
  })

  // El refetch lo hace el propio orquestador (solo con 200): un 403/404 no
  // invalida la caché, así que la fila sigue viendo lo que autoriza el servidor.
  const reassign = useMutation({
    mutationFn: (input: ReassignCustomerInput) => reassignCustomerInCache(queryClient, input),
  })

  return { create, update, convert, remove, reassign }
}
