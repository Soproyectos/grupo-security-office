import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal, Input, Select, Button, Alert } from '../../../components/ui'
import { fetchUsers } from '../../../services/users.service'
import { customerErrorMessage } from '../../../services/customers.service'
import type { ReassignCustomerPayload } from '../../../services/customers.service'
import type { Customer } from '../types/customer.types'

interface ReassignCustomerModalProps {
  open: boolean
  onClose: () => void
  customer: Customer | null
  onSubmit: (payload: ReassignCustomerPayload) => Promise<unknown>
  isSubmitting?: boolean
}

const MOTIVO_MAX = 500

/**
 * Reasignación de cartera (COM-02 §3): selector de responsable nuevo + motivo
 * opcional ≤500 (límite del `ReassignCustomerDto` del servidor).
 *
 * El directorio de usuarios es el que la app ya usa (`fetchUsers`, misma
 * clave `['users','owners']` que la columna Responsable → una sola petición).
 * F3 («consulta autorizada del responsable») sigue pendiente en el contrato:
 * aquí NO se inventa gating ni se oculta el listado.
 *
 * Los errores 400/403/404 se pintan con el mensaje del servidor tal cual
 * (403 de transición incluido: usuarios sin concesiones hasta D5). La
 * trazabilidad de auditoría (actor, antes/después) es del backend y NO se
 * muestra aquí — no se inventa pantalla de auditoría.
 */
export default function ReassignCustomerModal({
  open,
  onClose,
  customer,
  onSubmit,
  isSubmitting = false,
}: ReassignCustomerModalProps) {
  const [ownerId, setOwnerId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setOwnerId('')
      setMotivo('')
      setError(null)
    }
  }, [open, customer])

  const usersQuery = useQuery({
    queryKey: ['users', 'owners'],
    queryFn: () => fetchUsers(),
    enabled: open,
    retry: false,
  })

  const options = [
    { value: '', label: 'Selecciona un responsable' },
    ...(usersQuery.data ?? [])
      .filter((user) => user.isActive)
      .map((user) => ({ value: user.id, label: user.name || user.email })),
  ]

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ownerId) {
      setError('Selecciona el nuevo responsable.')
      return
    }
    setError(null)

    const motivoTrimmed = motivo.trim()
    try {
      await onSubmit({
        ownerId,
        ...(motivoTrimmed ? { motivo: motivoTrimmed } : {}),
      })
      onClose()
    } catch (err) {
      setError(customerErrorMessage(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? `Reasignar «${customer.name}»` : 'Reasignar responsable'}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="reassign-form" loading={isSubmitting}>
            Reasignar
          </Button>
        </>
      }
    >
      <form id="reassign-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {usersQuery.isError && (
          <Alert variant="warning">
            No se pudo cargar el directorio de usuarios; vuelve a intentarlo.
          </Alert>
        )}

        <Select
          label="Nuevo responsable"
          name="ownerId"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          options={options}
          required
        />

        <Input
          label="Motivo (opcional)"
          name="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={MOTIVO_MAX}
          placeholder="Ej. cambio de cartera por zona"
        />
      </form>
    </Modal>
  )
}
