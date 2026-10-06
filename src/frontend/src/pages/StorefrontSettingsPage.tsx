import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Input, StatusPill } from '../components/ui'
import { getApiErrorMessage } from '../lib/apiError'
import { canEditStorefront, canViewStorefront } from '../lib/rbac'
import {
  fetchStorefrontContact,
  updateStorefrontContact,
  validateStorefrontContact,
  type ContactFormErrors,
  type StorefrontContact,
  type StorefrontContactPayload,
} from '../services/storefront-contact.service'

// Clave de la caché del contacto: única, porque el registro es un singleton.
const STOREFRONT_CONTACT_QUERY_KEY = ['storefront', 'contact']

function toForm(contact?: StorefrontContact): StorefrontContactPayload {
  return {
    nationalPhone: contact?.nationalPhone ?? '',
    whatsappPhone: contact?.whatsappPhone ?? '',
    salesPhone: contact?.salesPhone ?? '',
    email: contact?.email ?? '',
    businessHoursShort: contact?.businessHoursShort ?? '',
    businessHoursFull: contact?.businessHoursFull ?? '',
    sellWithUsMessage: contact?.sellWithUsMessage ?? '',
  }
}

/**
 * Un teléfono opcional vacío viaja como `undefined`, no como cadena: el backend
 * resuelve el WhatsApp con `||` pero `salesPhone` con `??`, así que mandar `''`
 * lo guardaría como una línea vacía en vez de dejarla en `null`.
 */
function toSendable(form: StorefrontContactPayload): StorefrontContactPayload {
  return {
    nationalPhone: form.nationalPhone.trim(),
    whatsappPhone: form.whatsappPhone?.trim() || undefined,
    salesPhone: form.salesPhone?.trim() || undefined,
    email: form.email.trim(),
    businessHoursShort: form.businessHoursShort.trim(),
    businessHoursFull: form.businessHoursFull.trim(),
    sellWithUsMessage: form.sellWithUsMessage.trim(),
  }
}

export default function StorefrontSettingsPage() {
  const canWrite = canEditStorefront()
  const queryClient = useQueryClient()

  // El borrador sólo existe mientras se edita: sin él los campos muestran lo
  // guardado, igual que las casillas de `DashboardGrants`.
  const [draft, setDraft] = useState<StorefrontContactPayload | null>(null)
  const [errors, setErrors] = useState<ContactFormErrors>({})

  const { data, isLoading, error } = useQuery({
    queryKey: STOREFRONT_CONTACT_QUERY_KEY,
    queryFn: fetchStorefrontContact,
    enabled: canViewStorefront(),
  })

  const mutation = useMutation({
    mutationFn: (payload: StorefrontContactPayload) => updateStorefrontContact(payload),
    onSuccess: () => {
      // Se invalida en vez de escribir a mano la caché para que la recarga
      // posterior traiga lo que el backend tenga de verdad (p. ej. el WhatsApp
      // ya derivado de la línea nacional).
      setDraft(null)
      setErrors({})
      queryClient.invalidateQueries({ queryKey: STOREFRONT_CONTACT_QUERY_KEY })
    },
  })

  const form = useMemo(() => draft ?? toForm(data), [draft, data])

  const setField = (field: keyof StorefrontContactPayload) => (value: string) =>
    setDraft({ ...form, [field]: value })

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = toSendable(form)
    const validation = validateStorefrontContact(payload)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return
    mutation.mutate(payload)
  }

  if (!canViewStorefront()) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-gray-500 font-medium">No tienes permisos para ver esta sección</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-page-title text-ink-900">Configuración de la tienda</h1>
          <p className="mt-1 text-caption text-ink-500">
            Datos de contacto que muestra la vitrina pública: barra superior, pie de página y
            canales de venta.
          </p>
        </div>
        {!canWrite && <StatusPill tone="warning">Solo lectura</StatusPill>}
      </div>

      {!canWrite && (
        <Alert variant="warning">
          Puedes ver los datos, pero para guardarlos necesitas el permiso de escritura
          (storefront:write).
        </Alert>
      )}

      {isLoading ? (
        <p className="text-caption text-ink-400">Cargando contacto…</p>
      ) : error ? (
        <Alert variant="error">
          {getApiErrorMessage(error, 'No se pudo cargar el contacto de la tienda')}
        </Alert>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <Card padding="lg">
            <fieldset className="flex flex-col gap-4">
              <legend className="text-panel-title text-ink-900">Teléfonos y WhatsApp</legend>
              <p className="-mt-3 text-caption text-ink-500">
                Los números se guardan en E.164, sin <code>+</code> ni espacios: es el formato del
                que se derivan los enlaces <code>tel:</code> y <code>wa.me</code>.
              </p>
              <Input
                name="nationalPhone"
                label="Línea nacional"
                inputMode="numeric"
                required
                disabled={!canWrite}
                value={form.nationalPhone}
                error={errors.nationalPhone}
                onChange={(e) => setField('nationalPhone')(e.target.value)}
              />
              <div>
                <Input
                  name="whatsappPhone"
                  label="WhatsApp"
                  inputMode="numeric"
                  disabled={!canWrite}
                  value={form.whatsappPhone ?? ''}
                  error={errors.whatsappPhone}
                  onChange={(e) => setField('whatsappPhone')(e.target.value)}
                />
                <p className="mt-1.5 text-caption text-ink-400">
                  Déjalo vacío para usar la línea nacional.
                </p>
              </div>
              <Input
                name="salesPhone"
                label="Línea de ventas"
                inputMode="numeric"
                disabled={!canWrite}
                value={form.salesPhone ?? ''}
                error={errors.salesPhone}
                onChange={(e) => setField('salesPhone')(e.target.value)}
              />
            </fieldset>
          </Card>

          <Card padding="lg">
            <fieldset className="flex flex-col gap-4">
              <legend className="text-panel-title text-ink-900">Correo y horarios</legend>
              <p className="-mt-3 text-caption text-ink-500">
                El horario breve va en la barra superior y el completo en el pie de página.
              </p>
              <Input
                name="email"
                type="email"
                label="Correo de servicio al cliente"
                required
                maxLength={180}
                disabled={!canWrite}
                value={form.email}
                error={errors.email}
                onChange={(e) => setField('email')(e.target.value)}
              />
              <Input
                name="businessHoursShort"
                label="Horario breve (barra superior)"
                required
                maxLength={120}
                disabled={!canWrite}
                value={form.businessHoursShort}
                onChange={(e) => setField('businessHoursShort')(e.target.value)}
              />
              <LongField
                id="storefront-business-hours-full"
                name="businessHoursFull"
                label="Horario completo (pie de página)"
                hint="Se muestra tal cual en el pie de la tienda."
                required
                maxLength={255}
                rows={2}
                disabled={!canWrite}
                value={form.businessHoursFull}
                onChange={(e) => setField('businessHoursFull')(e.target.value)}
              />
            </fieldset>
          </Card>

          <Card padding="lg">
            <fieldset className="flex flex-col gap-4">
              <legend className="text-panel-title text-ink-900">Mensajes prellenados</legend>
              <LongField
                id="storefront-sell-with-us"
                name="sellWithUsMessage"
                label="Mensaje de «Vende con nosotros»"
                hint="Se envía como texto prellenado al abrir WhatsApp desde ese botón."
                required
                maxLength={300}
                rows={3}
                disabled={!canWrite}
                value={form.sellWithUsMessage}
                onChange={(e) => setField('sellWithUsMessage')(e.target.value)}
              />
            </fieldset>
          </Card>

          {canWrite && (
            <div className="flex flex-col gap-3">
              {mutation.isError && (
                <Alert variant="error">
                  {getApiErrorMessage(
                    mutation.error,
                    'No se pudo guardar el contacto de la tienda',
                  )}
                </Alert>
              )}

              {mutation.isSuccess && (
                <p role="status" className="text-caption text-[var(--color-success)]">
                  Cambios guardados.
                </p>
              )}

              <div>
                <Button type="submit" loading={mutation.isPending}>
                  Guardar cambios
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

/** Campo de texto largo: las clases son las del `Input`, que no cubre `textarea`. */
function LongField({
  id,
  name,
  label,
  hint,
  value,
  rows,
  required,
  maxLength,
  disabled,
  onChange,
}: {
  id: string
  name: string
  label: string
  hint?: string
  value: string
  rows: number
  required?: boolean
  maxLength?: number
  disabled?: boolean
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption font-medium text-ink-700">{label}</span>
      <textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
        value={value}
        onChange={onChange}
        className="w-full rounded-control border border-surface-300 px-3 py-2 text-body-sm focus:border-[var(--color-primary)] focus:outline-none disabled:bg-surface-100 disabled:cursor-not-allowed"
      />
      {hint && <span className="text-caption text-ink-400">{hint}</span>}
    </label>
  )
}