import { useEffect, useState, type FormEvent } from 'react'
import { Modal, Input, Select, Button, Alert } from '../../../components/ui'
import {
  customerErrorMessage,
  parseCustomerDuplicate,
  parseInvalidNitDv,
  type CustomerDuplicate,
} from '../../../services/customers.service'
import CustomerDuplicateNotice from './CustomerDuplicateNotice'
import MunicipalityPicker from '../../customer-portal/components/MunicipalityPicker'
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
  buildCustomerPayload,
  computeNitDv,
  documentTypeOptions,
  isMunicipalityCode,
  legacyCityOf,
  parseNitInput,
  toCustomerFormState,
  type CustomerFormState,
} from '../customer-form'

interface CustomerFormModalProps {
  open: boolean
  onClose: () => void
  customer?: Customer | null
  onSubmit: (payload: CustomerPayload) => Promise<unknown>
  isSubmitting?: boolean
  /** Opens the customer that already has the same document or email. */
  onOpenExisting?: (existing: { id: string; name: string }) => void
}

/**
 * El mensaje que se pinta: el del servidor tal cual si lo hay (400 de
 * validación, 403 de transición sin concesiones, 404) y si no uno claro por
 * estado — `customerErrorMessage` cubre tanto el error tipado del servicio como
 * un error axios crudo (POST de creación). El 409 de duplicado NO pasa por aquí:
 * se pinta junto a su campo.
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
  onOpenExisting,
}: CustomerFormModalProps) {
  // Start from the customer being edited so the city field mounts with its value.
  const [form, setForm] = useState<CustomerFormState>(() => toCustomerFormState(customer))
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<CustomerDuplicate | null>(null)
  // The server's message when the written NIT check digit does not match.
  const [nitDvError, setNitDvError] = useState<string | null>(null)

  // El modo decide el contrato: en edición NO se construye `status`
  // (COM-02 §3 — el PATCH general responde 400 status-not-allowed-in-general-edit).
  const mode: 'create' | 'edit' = customer ? 'edit' : 'create'

  useEffect(() => {
    if (open) {
      setForm(toCustomerFormState(customer))
      setError(null)
      setDuplicate(null)
      setNitDvError(null)
    }
  }, [open, customer])

  // Bring the person to the field the warning is about.
  useEffect(() => {
    if (duplicate) document.getElementById(duplicate.field)?.focus()
  }, [duplicate])
  useEffect(() => {
    if (nitDvError) document.getElementById('documentId')?.focus()
  }, [nitDvError])

  // Old customers kept their city as free text: it stays as it was unless a city is picked.
  const legacyCity = legacyCityOf(customer)

  const set = <K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    // The warning is about the rejected value: it goes away once that field changes.
    if (duplicate && key === duplicate.field) setDuplicate(null)
    // Same for the check digit warning: it is about the typed number and type.
    if (nitDvError && (key === 'documentId' || key === 'documentType')) setNitDvError(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setDuplicate(null)
    setNitDvError(null)

    try {
      await onSubmit(buildCustomerPayload(form, mode, legacyCity))
      onClose()
    } catch (err) {
      // What the advisor typed stays in the form: only the message changes.
      const found = parseCustomerDuplicate(err)
      const dvMessage = found ? null : parseInvalidNitDv(err)
      if (found) setDuplicate(found)
      else if (dvMessage) setNitDvError(dvMessage)
      else setError(errorMessage(err))
    }
  }

  const documentDuplicate = duplicate?.field === 'documentId' ? duplicate : null
  const emailDuplicate = duplicate?.field === 'email' ? duplicate : null

  // The check digit of a NIT is shown as help while typing. It never blocks saving:
  // the server decides, and writing the digit is optional.
  const nit = form.documentType === 'NIT' ? parseNitInput(form.documentId) : null
  const calculatedDv = nit ? computeNitDv(nit.base) : null
  const dvMismatch =
    nit !== null && calculatedDv !== null && nit.enteredDv !== null && nit.enteredDv !== calculatedDv
  const documentError = documentDuplicate?.message ?? nitDvError ?? undefined
  const showDvHelp = form.documentType === 'NIT' && !documentError
  const dvHelpId = 'documentId-dv-help'

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
          <Select
            label="Tipo de documento"
            name="documentType"
            value={form.documentType}
            onChange={(e) => set('documentType', e.target.value)}
            options={documentTypeOptions(form.documentType)}
          />
          <div className="space-y-1">
            <Input
              label="Número de documento"
              name="documentId"
              value={form.documentId}
              onChange={(e) => set('documentId', e.target.value)}
              placeholder="901123456-7"
              error={documentError}
              {...(showDvHelp ? { 'aria-describedby': dvHelpId } : {})}
            />
            {showDvHelp && (
              <div id={dvHelpId}>
                {/* The polite region stays mounted so screen readers announce each change. */}
                <p aria-live="polite" className="text-xs text-neutral-600">
                  {calculatedDv !== null && !dvMismatch
                    ? `Dígito de verificación: ${calculatedDv} (se calcula solo)`
                    : ''}
                </p>
                {dvMismatch && (
                  <p role="alert" className="text-sm text-brand-error">
                    El dígito de verificación no coincide. Para ese NIT debería ser {calculatedDv}.
                  </p>
                )}
              </div>
            )}
            {documentDuplicate && (
              <CustomerDuplicateNotice duplicate={documentDuplicate} onOpenExisting={onOpenExisting} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Input
              label="Email"
              name="email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="contacto@empresa.com"
              error={emailDuplicate?.message}
            />
            {emailDuplicate && (
              <CustomerDuplicateNotice duplicate={emailDuplicate} onOpenExisting={onOpenExisting} />
            )}
          </div>
          <Input
            label="Teléfono"
            name="phone"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+57 300 123 4567"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MunicipalityPicker
            variant="panel"
            required={false}
            label="Ciudad"
            placeholder="Escribe y elige una ciudad"
            hint="Elige una ciudad de la lista para dejar al cliente en su zona."
            value={isMunicipalityCode(form.city) ? form.city.trim() : ''}
            legacyText={form.city === legacyCity ? legacyCity : ''}
            onChange={(code) => set('city', code)}
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
