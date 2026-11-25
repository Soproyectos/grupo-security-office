import { isAxiosError } from 'axios'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import PasswordField from '../../customer-portal/components/PasswordField'
import PasswordChecklist from '../../customer-portal/components/PasswordChecklist'
import { isPasswordValid } from '../../customer-portal/utils/password-rules'
import { useResetPassword } from '../../customer-portal/hooks/useResetPassword'

type ResetPasswordForm = { password: string; confirmPassword: string }

export default function ClientResetPasswordPage() {
  const { register, handleSubmit, getValues, watch, formState: { errors } } = useForm<ResetPasswordForm>()
  const resetPassword = useResetPassword()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const token = params.get('token')

  const incompleteLink = !token && params.get('error') !== 'INVALID_TOKEN'
  const invalidLink = params.get('error') === 'INVALID_TOKEN'
    || (isAxiosError(resetPassword.error) && resetPassword.error.response?.status === 400 && resetPassword.error.response?.data?.code === 'INVALID_TOKEN')
  const submit = handleSubmit(({ password }) => {
    if (!token) return

    resetPassword.mutate({ token, password }, {
      onSuccess: () => navigate('/clientes/recuperar/satisfecho', { replace: true }),
    })
  })

  return (
    <StorefrontChrome search={false}>
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <section className="rounded-card border border-surface-200 bg-white px-6 py-8 sm:px-8">
          <Link to="/clientes/login" className="inline-flex min-h-11 items-center rounded-control text-sm font-semibold !text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500">
            ← Volver a iniciar sesión
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-ink-900">Restablecer contraseña</h1>

          {incompleteLink || invalidLink ? (
            <div className="mt-4">
              <p role="alert" className="text-sm text-ink-700">
                {incompleteLink
                  ? 'El enlace de recuperación está incompleto.'
                  : 'El enlace de recuperación ya no es válido.'}
              </p>
              <Link to="/clientes/recuperar" replace className="mt-4 inline-flex min-h-11 items-center rounded-control bg-security-600 px-5 py-3 text-sm font-semibold !text-white hover:bg-security-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500">
                Solicitar un nuevo enlace
              </Link>
            </div>
          ) : (
            <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
              <PasswordField
                id="recovery-password"
                label="Nueva contraseña"
                autoComplete="new-password"
                error={errors.password?.message}
                aria-describedby="recovery-password-rules"
                {...register('password', {
                  required: 'Ingresa una contraseña',
                  validate: (value) => isPasswordValid(value) || 'Tu contraseña aún no cumple todos los requisitos de la lista.',
                })}
              />
              <PasswordChecklist id="recovery-password-rules" password={watch('password') ?? ''} />
              <PasswordField
                id="recovery-password-confirmation"
                label="Confirmar contraseña"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword', {
                  required: 'Confirma tu contraseña',
                  validate: (value) => value === getValues('password') || 'Las contraseñas no coinciden',
                })}
              />

              {resetPassword.isError && (
                <p role="alert" className="rounded-control bg-security-50 p-3 text-sm text-security-600">
                  No pudimos actualizar tu contraseña. Intenta de nuevo en unos minutos.
                </p>
              )}

              <button
                type="submit"
                disabled={resetPassword.isPending}
                className="w-full py-3 px-4 bg-security-600 hover:bg-security-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-security-500/30 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-sm"
              >
                {resetPassword.isPending ? 'Restableciendo contraseña…' : 'Restablecer contraseña'}
              </button>
            </form>
          )}
        </section>
      </main>
    </StorefrontChrome>
  )
}
