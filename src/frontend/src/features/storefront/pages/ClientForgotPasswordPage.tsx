import { useForm } from 'react-hook-form'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import TurnstileWidget, { type TurnstileHandle } from '../../customer-portal/components/TurnstileWidget'
import { CAPTCHA_FAILED_MESSAGE, CAPTCHA_PENDING_MESSAGE, isCaptchaError, turnstileSiteKey } from '../../customer-portal/utils/auth-errors'
import { useRequestPasswordReset } from '../../customer-portal/hooks/useRequestPasswordReset'

type ForgotPasswordForm = { email: string }

export default function ClientForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordForm>()
  const requestReset = useRequestPasswordReset()
  const navigate = useNavigate()
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaMissing, setCaptchaMissing] = useState(false)
  const captcha = useRef<TurnstileHandle>(null)

  const submit = handleSubmit(({ email }) => {
    if (turnstileSiteKey() && !captchaToken) { setCaptchaMissing(true); return }
    setCaptchaMissing(false)
    requestReset.mutate({ email, captchaToken: captchaToken || undefined }, {
      onSuccess: () => navigate('/clientes/recuperar/exitoso', { replace: true }),
      onSettled: () => captcha.current?.reset(),
    })
  })

  return (
    <StorefrontChrome search={false}>
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <section className="rounded-card border border-surface-200 bg-white px-6 py-8 sm:px-8">
          <Link to="/clientes/login" className="inline-flex min-h-11 items-center rounded-control text-sm font-semibold !text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500">
            ← Volver a iniciar sesión
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-ink-900">Recuperar contraseña</h1>
          <p className="mt-2 text-sm text-ink-600">
            Ingresa el correo electrónico de tu cuenta del portal de clientes.
          </p>

          <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="recovery-email" className="block text-sm font-medium">Correo electrónico</label>
              <input
                id="recovery-email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'recovery-email-error' : undefined}
                className="mt-1.5 min-h-12 w-full rounded-control border border-surface-300 bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500"
                {...register('email', {
                  setValueAs: (value: string) => value.trim(),
                  required: 'Ingresa tu correo',
                  pattern: { value: /^\S+@\S+\.\S+$/, message: 'Ingresa un correo válido' },
                })}
              />
              {errors.email && (
                <span id="recovery-email-error" className="mt-1 block text-xs text-security-600" role="alert">{errors.email.message}</span>
              )}
            </div>

            <TurnstileWidget ref={captcha} onToken={(token) => { setCaptchaToken(token); if (token) setCaptchaMissing(false) }} />
            {captchaMissing && <p role="alert" className="rounded-control bg-security-50 p-3 text-sm text-security-600">{CAPTCHA_PENDING_MESSAGE}</p>}

            {requestReset.isError && (
              <p role="alert" className="rounded-control bg-security-50 p-3 text-sm text-security-600">
                {isCaptchaError(requestReset.error) ? CAPTCHA_FAILED_MESSAGE : 'No pudimos procesar tu solicitud. Intenta de nuevo en unos minutos.'}
              </p>
            )}

            <button
              type="submit"
              disabled={requestReset.isPending}
              className="w-full py-3 px-4 bg-security-600 hover:bg-security-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-security-500/30 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-sm"
            >
              {requestReset.isPending ? 'Solicitando enlace…' : 'Solicitar enlace de recuperación'}
            </button>
          </form>
        </section>
      </main>
    </StorefrontChrome>
  )
}
