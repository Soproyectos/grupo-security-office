import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import GoogleSignInButton from '../components/GoogleSignInButton'
import PasswordField from '../../customer-portal/components/PasswordField'
import TurnstileWidget, { type TurnstileHandle } from '../../customer-portal/components/TurnstileWidget'
import { useCustomerPortalLogin } from '../../customer-portal/hooks/useCustomerPortal'
import { CAPTCHA_PENDING_MESSAGE, loginErrorMessage, turnstileSiteKey } from '../../customer-portal/utils/auth-errors'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

type LoginForm = { email: string; password: string }

export default function ClientLoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>()
  const login = useCustomerPortalLogin()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaMissing, setCaptchaMissing] = useState(false)
  const captcha = useRef<TurnstileHandle>(null)
  useEffect(() => {
    if (!login.isSuccess) return
    const returnTo = params.get('returnTo')
    navigate(returnTo?.startsWith('/clientes/') && !returnTo.startsWith('//') ? returnTo : '/clientes', { replace: true })
  }, [login.isSuccess, navigate, params])

  const submit = handleSubmit(({ email, password }) => {
    if (turnstileSiteKey() && !captchaToken) { setCaptchaMissing(true); return }
    setCaptchaMissing(false)
    login.mutate({ email, password, captchaToken: captchaToken || undefined }, { onSettled: () => captcha.current?.reset() })
  })

  return (
    <StorefrontChrome search={false}>
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <section className="rounded-card border border-surface-200 bg-white px-6 py-8 sm:px-8">
          <Link to="/tienda" className={`inline-flex min-h-11 items-center rounded-control text-sm font-semibold !text-security-600 ${FOCUS}`}>← Volver a la tienda</Link>
          <h1 className="mt-6 text-2xl font-bold text-ink-900">Inicia sesión</h1>
          <p className="mt-2 text-sm text-ink-600">Entra a tu cuenta y consulta el catálogo de Grupo Security.</p>
          {params.get('deleted') === '1' && <p role="status" className="mt-4 rounded-control bg-surface-100 p-3 text-sm text-ink-900">Tu cuenta fue eliminada. Puedes crear una nueva cuando quieras.</p>}
          <GoogleSignInButton failed={params.get('error') === 'google'} />
          <form className="mt-4 space-y-5" onSubmit={submit} noValidate>
            <label className="block text-sm font-medium">Correo electrónico
              <input type="email" autoComplete="email" className={`mt-1.5 min-h-12 w-full rounded-control border border-surface-300 bg-white px-3 ${FOCUS}`} {...register('email', { required: 'Ingresa tu correo', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Ingresa un correo válido' } })} />
              {errors.email && <span className="mt-1 block text-xs text-security-600" role="alert">{errors.email.message}</span>}
            </label>
            <PasswordField id="login-password" label="Contraseña" autoComplete="current-password" error={errors.password?.message} {...register('password', { required: 'Ingresa tu contraseña' })} />
            <TurnstileWidget ref={captcha} onToken={(token) => { setCaptchaToken(token); if (token) setCaptchaMissing(false) }} />
            {captchaMissing && <p role="alert" className="rounded-control bg-security-50 p-3 text-sm text-security-600">{CAPTCHA_PENDING_MESSAGE}</p>}
            {login.isError && <p role="alert" className="rounded-control bg-security-50 p-3 text-sm text-security-600">{loginErrorMessage(login.error)}</p>}
            <button disabled={login.isPending} className={`min-h-12 w-full rounded-control bg-security-600 px-5 text-sm font-bold text-white hover:bg-security-500 disabled:opacity-60 ${FOCUS}`}>{login.isPending ? 'Ingresando…' : 'Ingresar'}</button>
          </form>
          <Link to="/clientes/recuperar" className={`mt-2 inline-flex min-h-11 items-center rounded-control text-sm font-semibold !text-security-600 hover:underline ${FOCUS}`}>¿Olvidaste tu contraseña?</Link>
          <p className="mt-6 text-sm text-ink-600">¿Aún no tienes acceso? <Link to="/clientes/registro" className="font-bold !text-security-600">Crea tu cuenta</Link>.</p>
        </section>
      </main>
    </StorefrontChrome>
  )
}
