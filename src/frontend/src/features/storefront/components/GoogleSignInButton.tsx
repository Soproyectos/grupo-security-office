import { useCustomerPortalGoogle } from '../../customer-portal/hooks/useCustomerPortal'

/** Botón grande «Entrar con Google» del portal de clientes. */
export default function GoogleSignInButton({ failed = false, disabled = false, disabledHint }: { failed?: boolean; disabled?: boolean; disabledHint?: string }) {
  const google = useCustomerPortalGoogle()
  const showError = failed || google.isError
  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => google.mutate()}
        disabled={google.isPending || disabled}
        aria-describedby={disabled && disabledHint ? 'google-signin-hint' : undefined}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-control border border-surface-300 bg-white px-5 text-sm font-bold text-ink-900 hover:bg-surface-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
        </svg>
        {google.isPending ? 'Abriendo Google…' : 'Entrar con Google'}
      </button>
      {disabled && disabledHint && <p id="google-signin-hint" className="mt-2 text-sm text-ink-700">{disabledHint}</p>}
      {showError && (
        <p role="alert" className="mt-3 rounded-control bg-security-50 p-3 text-sm text-security-600">
          No pudimos entrar con Google. Inténtalo de nuevo o usa tu correo y contraseña.
        </p>
      )}
      <p className="mt-5 text-center text-xs text-ink-600">o con tu correo</p>
    </div>
  )
}
