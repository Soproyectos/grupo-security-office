import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import GoogleSignInButton from '../components/GoogleSignInButton'
import PasswordField from '../../customer-portal/components/PasswordField'
import PasswordChecklist from '../../customer-portal/components/PasswordChecklist'
import MunicipalityPicker from '../../customer-portal/components/MunicipalityPicker'
import TurnstileWidget, { type TurnstileHandle } from '../../customer-portal/components/TurnstileWidget'
import { useCustomerPortalSignup } from '../../customer-portal/hooks/useCustomerPortal'
import { isPasswordValid } from '../../customer-portal/utils/password-rules'
import { CAPTCHA_PENDING_MESSAGE, PRIVACY_POLICY_PATH, PRIVACY_REQUIRED_MESSAGE, readAuthError, signupErrorMessage, turnstileSiteKey, EMAIL_ALREADY_REGISTERED_CODE, INVALID_CITY_MESSAGE } from '../../customer-portal/utils/auth-errors'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
const INPUT = `mt-1 min-h-12 w-full rounded-control border border-surface-300 bg-white px-3 ${FOCUS}`

type Values = { contactName: string; companyName: string; city: string; email: string; documentId: string; phone: string; password: string; confirm: string }
const EMPTY: Values = { contactName: '', companyName: '', city: '', email: '', documentId: '', phone: '', password: '', confirm: '' }

const TEXT_FIELDS = [
  { name: 'contactName', label: 'Nombre de contacto', type: 'text', required: true, max: 120, min: 2, autoComplete: 'name' },
  { name: 'companyName', label: 'Empresa o nombre comercial', type: 'text', required: true, max: 160, min: 2, autoComplete: 'organization' },
  { name: 'email', label: 'Correo electrónico', type: 'email', required: true, max: 254, min: undefined, autoComplete: 'email' },
  { name: 'documentId', label: 'NIT o documento (opcional)', type: 'text', required: false, max: 40, min: 3, autoComplete: undefined },
  { name: 'phone', label: 'Teléfono (opcional)', type: 'tel', required: false, max: 30, min: 7, autoComplete: 'tel' },
] as const

export default function AccessRequestPage() {
  const [values, setValues] = useState<Values>(EMPTY)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const captcha = useRef<TurnstileHandle>(null)
  const signup = useCustomerPortalSignup()
  const busy = signup.isPending
  const alreadyRegistered = Boolean(error) && readAuthError(signup.error).code === EMAIL_ALREADY_REGISTERED_CODE
  const set = (name: keyof Values) => (value: string) => setValues((current) => ({ ...current, [name]: value }))

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values.city) { setError(INVALID_CITY_MESSAGE); return }
    if (!accepted) { setError(PRIVACY_REQUIRED_MESSAGE); return }
    if (!isPasswordValid(values.password, { email: values.email, name: values.contactName })) { setError('Tu contraseña aún no cumple todos los requisitos de la lista.'); return }
    if (values.password !== values.confirm) { setError('Las contraseñas no coinciden'); return }
    if (turnstileSiteKey() && !captchaToken) { setError(CAPTCHA_PENDING_MESSAGE); return }
    setError('')
    const documentId = values.documentId.trim()
    const phone = values.phone.trim()
    signup.mutate({
      payload: {
        name: values.contactName.trim(),
        email: values.email.trim(),
        password: values.password,
        companyName: values.companyName.trim(),
        city: values.city,
        ...(documentId ? { documentId } : {}),
        ...(phone ? { phone } : {}),
        acceptPrivacy: true,
      },
      captchaToken: captchaToken || undefined,
    }, {
      onError: (cause) => setError(signupErrorMessage(cause)),
      onSettled: () => captcha.current?.reset(),
    })
  }

  return (
    <StorefrontChrome search={false}>
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <section className="rounded-card border border-surface-200 bg-white p-6 sm:p-10">
          <Link to="/tienda" className={`inline-flex min-h-11 items-center rounded-control text-sm font-semibold !text-security-600 ${FOCUS}`}>← Volver a la tienda</Link>
          <h1 className="mt-6 font-condensed text-3xl font-semibold text-ink-900">Crea tu cuenta</h1>
          <p className="mt-3 text-sm text-ink-600">Empieza como Cliente final. Tu clasificación comercial podrá actualizarse después.</p>
          {signup.isSuccess ? (
            <div role="status" className="mt-6 space-y-3 rounded-control bg-surface-100 p-4 text-sm text-ink-900">
              <p className="font-semibold">Revisa tu correo</p>
              <p>Te enviamos un enlace para confirmar tu cuenta. Ábrelo para entrar al portal. Si no lo ves, mira en spam.</p>
              <Link to="/clientes/login" className={`inline-flex min-h-11 items-center font-semibold !text-security-600 ${FOCUS}`}>Ir a iniciar sesión</Link>
            </div>
          ) : (
            <>
              <GoogleSignInButton disabled={!accepted} disabledHint="Para usar Google, primero marca la casilla de la política de tratamiento de datos." />
              <form className="mt-4 space-y-4" onSubmit={submit} noValidate>
                {TEXT_FIELDS.map((field) => (
                  <label key={field.name} className="block text-sm font-medium">
                    {field.label}
                    <input
                      name={field.name}
                      type={field.type}
                      required={field.required}
                      maxLength={field.max}
                      minLength={field.min}
                      autoComplete={field.autoComplete}
                      value={values[field.name]}
                      onChange={(event) => set(field.name)(event.target.value)}
                      className={INPUT}
                    />
                  </label>
                ))}
                <MunicipalityPicker value={values.city} onChange={set('city')} invalid={Boolean(error) && !values.city} />
                <PasswordField id="signup-password" name="password" label="Contraseña" autoComplete="new-password" required minLength={12} maxLength={128} value={values.password} onChange={(event) => set('password')(event.target.value)} aria-describedby="signup-password-rules" />
                <PasswordChecklist id="signup-password-rules" password={values.password} context={{ email: values.email, name: values.contactName }} />
                <PasswordField id="signup-confirm" name="confirm" label="Confirmar contraseña" autoComplete="new-password" required maxLength={128} value={values.confirm} onChange={(event) => set('confirm')(event.target.value)} />
                <label className="flex min-h-11 items-start gap-3 text-sm text-ink-900">
                  <input type="checkbox" name="acceptPrivacy" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className={`mt-0.5 h-5 w-5 shrink-0 accent-security-600 ${FOCUS}`} />
                  <span>Acepto la <Link to={PRIVACY_POLICY_PATH} target="_blank" rel="noopener noreferrer" className={`font-semibold underline !text-security-600 ${FOCUS}`}>política de tratamiento de datos<span className="sr-only"> (se abre en otra pestaña)</span></Link></span>
                </label>
                <TurnstileWidget ref={captcha} onToken={setCaptchaToken} />
                {error && <div role="alert" className="rounded-control bg-security-50 p-3 text-sm text-security-600"><p>{error}</p>{alreadyRegistered && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Link to="/clientes/login" className={`inline-flex min-h-12 flex-1 items-center justify-center rounded-control bg-security-600 px-4 text-sm font-bold !text-white hover:bg-security-500 ${FOCUS}`}>Iniciar sesión</Link>
                    <Link to="/clientes/recuperar" className={`inline-flex min-h-12 flex-1 items-center justify-center rounded-control border border-security-600 bg-white px-4 text-sm font-bold !text-security-600 hover:bg-security-50 ${FOCUS}`}>Recuperar mi contraseña</Link>
                  </div>
                )}</div>}
                <button type="submit" disabled={busy} className={`min-h-12 w-full rounded-control bg-security-600 px-4 font-semibold text-white hover:bg-security-500 disabled:opacity-60 ${FOCUS}`}>{busy ? 'Creando cuenta…' : 'Crear mi cuenta'}</button>
                <p className="text-sm text-ink-600">¿Ya tienes cuenta? <Link to="/clientes/login" className={`font-semibold !text-security-600 ${FOCUS}`}>Ingresar</Link></p>
              </form>
            </>
          )}
        </section>
      </main>
    </StorefrontChrome>
  )
}
