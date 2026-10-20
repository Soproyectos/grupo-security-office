import { useEffect, useState, type FormEvent } from 'react'
import { Modal, Input, Select, Button, Alert } from '../../../components/ui'
import { customerErrorMessage } from '../../../services/customers.service'
import {
  CUSTOMER_SOURCES,
  CUSTOMER_SOURCE_LABELS,
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABELS,
} from '../types/customer.types'
import type {
  Customer,
  CustomerPayload,
  CustomerSource,
  CustomerStatus,
} from '../types/customer.types'
import {
  EMPTY_CUSTOMER_FORM,
  buildCustomerPayload,
  toCustomerFormState,
  type CustomerFormState,
} from '../customer-form'

interface CustomerFormModalProps {
  open: boolean
  onClose: () => void
  customer?: Customer | null
  onSubmit: (payload: CustomerPayload) => Promise<unknown>
  isSubmitting?: boolean
}

/**
 * El mensaje que se pinta: el del servidor tal cual si lo hay (400 de
 * validación, 403 de transición sin concesiones, 404, 409 de documento
 * duplicado) y si no uno claro por estado — `customerErrorMessage` cubre tanto
 * el error tipado del servicio como un error axios crudo (POST de creación).
 */
function errorMessage(err: unknown): string {
  return customerErrorMessage(err, 'No se pudo guardar el cliente')
}

export default function CustomerFormModal({
  open,
  onClose,
  customer,
  onSubmit,
  isSubmitting = false,
}: CustomerFormModalProps) {
  const [form, setForm] = useState<CustomerFormState>(EMPTY_CUSTOMER_FORM)
  const [error, setError] = useState<string | null>(null)

  // El modo decide el contrato: en edición NO se construye `status`
  // (COM-02 §3 — el PATCH general responde 400 status-not-allowed-in-general-edit).
  const mode: 'create' | 'edit' = customer ? 'edit' : 'create'

  useEffect(() => {
    if (open) {
      setForm(toCustomerFormState(customer))
      setError(null)
    }
  }, [open, customer])

  const set = <K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    try {
      await onSubmit(buildCustomerPayload(form, mode))
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? `Editar ${customer.name}` : 'Nuevo cliente o lead'}
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="customer-form" loading={isSubmitting}>
            {customer ? 'Guardar cambios' : 'Crear'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Input
          label="Nombre"
          name="name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          required
          placeholder="Seguridad Andina S.A.S."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Tipo de documento"
            name="documentType"
            value={form.documentType}
            onChange={(e) => set('documentType', e.target.value)}
            placeholder="NIT"
          />
          <Input
            label="Número de documento"
            name="documentId"
            value={form.documentId}
            onChange={(e) => set('documentId', e.target.value)}
            placeholder="901123456-7"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="contacto@empresa.com"
          />
          <Input
            label="Teléfono"
            name="phone"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+57 300 123 4567"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Ciudad"
            name="city"
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            placeholder="Bogotá"
          />
          <Input
            label="Dirección"
            name="address"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Cra 7 # 123-45"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {mode === 'create' ? (
            <Select
              label="Estado"
              name="status"
              value={form.status}
              onChange={(e) => set('status', e.target.value as CustomerStatus)}
              options={CUSTOMER_STATUSES.map((s) => ({
                value: s,
                label: CUSTOMER_STATUS_LABELS[s],
              }))}
            />
          ) : (
            // F1 pendiente en backend: NO se promete cambiar estado desde la
            // edición general; sólo se informa dónde ocurre hoy.
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-neutral-800">Estado</span>
              <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-700">
                {CUSTOMER_STATUS_LABELS[customer?.status ?? form.status]}
              </p>
              <p className="text-xs text-neutral-500">
                El estado no se modifica en la edición de contacto: se cambia con la acción
                «Convertir» (lead a cliente) o desactivando el registro.
              </p>
            </div>
          )}
          <Select
            label="Origen"
            name="source"
            value={form.source}
            onChange={(e) => set('source', e.target.value as '' | CustomerSource)}
            options={[
              { value: '', label: 'Sin origen' },
              ...CUSTOMER_SOURCES.map((s) => ({
                value: s,
                label: CUSTOMER_SOURCE_LABELS[s],
              })),
            ]}
          />
        </div>

        {form.source && (
          <Input
            label="Detalle del origen"
            name="sourceDetail"
            value={form.sourceDetail}
            onChange={(e) => set('sourceDetail', e.target.value)}
            placeholder="Ej. referido por cliente X, feria Y"
          />
        )}

        <div className="space-y-1.5">
          <label htmlFor="notes" className="block text-sm font-medium text-neutral-800">
            Notas
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-neutral-300 text-sm transition-all placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
          />
        </div>
      </form>
    </Modal>
  )
}
