import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import Input from '../../../components/ui/Input'
import Button from '../../../components/ui/Button'
import { submitAccessRequest } from '../../../services/access-requests.service'

const accessRequestSchema = z.object({
  companyName: z
    .string()
    .min(1, 'El nombre de la empresa es requerido')
    .max(120, 'El nombre no puede exceder 120 caracteres'),
  nit: z
    .string()
    .min(1, 'El NIT es requerido')
    .regex(/^[0-9]{5,12}(-[0-9])?$/, 'El NIT debe tener un formato válido'),
  contactName: z
    .string()
    .min(1, 'El nombre de contacto es requerido')
    .max(80, 'El nombre no puede exceder 80 caracteres'),
  email: z
    .string()
    .min(1, 'El email es requerido')
    .email('El email no es válido')
    .max(120, 'El email no puede exceder 120 caracteres'),
  phone: z
    .string()
    .min(1, 'El teléfono es requerido')
    .regex(
      /^[0-9+ ()-]{7,20}$/,
      'El teléfono debe tener un formato válido (7-20 caracteres)'
    ),
  customerType: z.enum(['INSTALLER', 'DISTRIBUTOR', 'END_COMPANY'], {
    error: 'Selecciona un tipo de cliente válido',
  }),
  website: z.string().optional(),
})

type AccessRequestFormData = z.infer<typeof accessRequestSchema>

export default function RequestAccess() {
  const navigate = useNavigate()
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error' | 'rate-limited'>(
    'idle'
  )
  const [errorMessage, setErrorMessage] = useState('')

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccessRequestFormData>({
    resolver: zodResolver(accessRequestSchema),
  })

  const onSubmit = async (data: AccessRequestFormData) => {
    try {
      setSubmitStatus('idle')
      setErrorMessage('')
      await submitAccessRequest({
        companyName: data.companyName,
        nit: data.nit,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        customerType: data.customerType,
        website: data.website,
      })
      setSubmitStatus('success')
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'status' in error.response &&
        error.response.status === 429
      ) {
        setSubmitStatus('rate-limited')
        setErrorMessage(
          'Demasiadas solicitudes, intenta más tarde'
        )
      } else {
        setSubmitStatus('error')
        setErrorMessage('Hubo un error al enviar tu solicitud. Intenta de nuevo.')
      }
    }
  }

  return (
    <div
      className="min-h-screen px-6 py-12"
      style={{ backgroundColor: '#F8FAFC' }}
    >
      <div className="w-full max-w-[640px] mx-auto">
        {/* Back link */}
        <button
          onClick={() => navigate('/tienda')}
          className="inline-flex items-center gap-1.5 text-ink-400 text-[12.5px] font-semibold hover:opacity-80 mb-5"
        >
          ← Volver a la tienda
        </button>

        {/* Form card */}
        <div
          className="bg-white rounded-[20px] p-10 border"
          style={{
            boxShadow: 'var(--shadow-sm)',
            borderColor: 'var(--color-border)',
          }}
        >
          {submitStatus === 'success' ? (
            <div className="text-center">
              <div className="mb-4">
                <svg
                  className="w-16 h-16 mx-auto mb-4 text-security-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-[24px] font-bold text-[#1A1A1A] mb-2">
                Solicitud enviada
              </h2>
              <p className="text-sm text-[#475569] mb-6">
                Un asesor comercial revisará tu solicitud en 1-2 días hábiles.
              </p>
              <button
                onClick={() => navigate('/tienda')}
                className="inline-block font-bold py-2 px-6 rounded-lg hover:opacity-90 text-white"
                style={{
                  backgroundColor: '#CE0203',
                  padding: '13px 24px',
                }}
              >
                Volver a la tienda
              </button>
            </div>
          ) : (
            <>
              <h1 className="m-0 mb-2 text-[24px] font-bold text-[#171717]">
                Solicita tu acceso como cliente
              </h1>
              <p className="m-0 mb-7 text-[13.5px] text-[#475569]">
                Cuéntanos sobre tu empresa y te asignaremos una Lista de
                precios y un asesor comercial.
              </p>

              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <Controller
                    name="companyName"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        label="Nombre de la empresa"
                        placeholder="Constructora Andina S.A.S."
                        error={errors.companyName?.message}
                      />
                    )}
                  />
                  <Controller
                    name="nit"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        label="NIT"
                        placeholder="900.123.456-7"
                        error={errors.nit?.message}
                      />
                    )}
                  />
                  <Controller
                    name="contactName"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        label="Nombre de contacto"
                        placeholder="Nombre completo"
                        error={errors.contactName?.message}
                      />
                    )}
                  />
                  <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        label="Correo corporativo"
                        type="email"
                        placeholder="contacto@tuempresa.com"
                        error={errors.email?.message}
                      />
                    )}
                  />
                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        label="Teléfono"
                        placeholder="(6) 123 4567"
                        error={errors.phone?.message}
                      />
                    )}
                  />
                  <div>
                    <label className="block text-sm font-medium text-neutral-800 mb-1.5">
                      Tipo de cliente
                    </label>
                    <select
                      {...register('customerType')}
                      className="w-full px-4 py-2.5 rounded-lg border border-neutral-300 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="INSTALLER">Instalador</option>
                      <option value="DISTRIBUTOR">Distribuidor</option>
                      <option value="END_COMPANY">Empresa final</option>
                    </select>
                    {errors.customerType && (
                      <p className="text-sm text-brand-error mt-1.5">
                        {errors.customerType.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Honeypot field - visually hidden */}
                <input
                  type="text"
                  {...register('website')}
                  style={{ display: 'none' }}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />

                {/* Error message */}
                {submitStatus === 'error' && (
                  <div className="mb-4 p-3 rounded-lg bg-brand-error-light border border-brand-error">
                    <p className="m-0 text-sm text-brand-error">{errorMessage}</p>
                  </div>
                )}

                {submitStatus === 'rate-limited' && (
                  <div className="mb-4 p-3 rounded-lg bg-brand-error-light border border-brand-error">
                    <p className="m-0 text-sm text-brand-error">{errorMessage}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  loading={isSubmitting}
                  className="w-full"
                  style={{ marginTop: '24px' }}
                >
                  Enviar solicitud
                </Button>
              </form>

              <p className="m-0 mt-3.5 text-[11.5px] text-ink-400 text-center">
                Un asesor comercial revisará tu solicitud en 1-2 días hábiles.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
