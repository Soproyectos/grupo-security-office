import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'

export default function PasswordResetSuccessPage({ stage = 'reset' }: { stage?: 'requested' | 'reset' }) {
  const requested = stage === 'requested'

  return (
    <StorefrontChrome search={false}>
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <section className="rounded-card border border-surface-200 bg-white px-6 py-8 sm:px-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-security-100">
            <svg aria-hidden="true" className="h-8 w-8 text-security-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ink-900">{requested ? 'Revisa tu correo' : 'Contraseña actualizada'}</h1>
          <p className="mt-2 text-sm text-ink-600" role="status">
            {requested
              ? 'Si el correo corresponde a una cuenta habilitada, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de correo no deseado.'
              : 'Ya puedes iniciar sesión con tu nueva contraseña.'}
          </p>

          <Link
            to="/clientes/login"
            className="mt-6 inline-flex min-h-11 items-center rounded-control bg-security-600 px-5 py-3 text-sm font-semibold text-white hover:bg-security-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500"
          >
            Iniciar sesión
          </Link>

          <Link
            to="/tienda"
            className="mt-4 flex min-h-11 items-center justify-center rounded-control text-sm text-ink-700 hover:text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500"
          >
            Ir a la tienda
          </Link>
        </section>
      </main>
    </StorefrontChrome>
  )
}
