import { useState, type FormEvent } from 'react'
import PasswordField from './PasswordField'
import PasswordChecklist from './PasswordChecklist'
import { useCreatePortalPassword, useRefreshPortalSession } from '../hooks/usePortalProfile'
import { createPasswordErrorMessage } from '../utils/auth-errors'
import { isPasswordValid } from '../utils/password-rules'
import type { PortalAccount } from '../types/customer-portal.types'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
export const PASSWORD_CREATED_MESSAGE = 'Listo. Ya puedes entrar también con tu correo y contraseña.'

/**
 * «Crear contraseña (opcional)» section of Mis datos, only for accounts that entered with Google.
 * When the session refreshes this section disappears, so the parent may take the success notice via onCreated.
 */
export default function CreatePasswordForm({ account, onCreated }: { account: PortalAccount; onCreated?: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState('')
  const [done, setDone] = useState(false)
  const create = useCreatePortalPassword()
  const refreshSession = useRefreshPortalSession()
  const context = { email: account.email, name: account.contactName }
  const serverError = create.isError ? createPasswordErrorMessage(create.error) : ''
  const message = localError || serverError

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (create.isPending) return
    setDone(false)
    if (!isPasswordValid(password, context)) return setLocalError('La contraseña no cumple todos los requisitos. Revisa la lista.')
    if (password !== confirm) return setLocalError('Las contraseñas no coinciden.')
    setLocalError('')
    create.mutate({ newPassword: password }, {
      onSuccess: () => { setPassword(''); setConfirm(''); setDone(true); onCreated?.(); void refreshSession() },
    })
  }

  return (
    <section className="space-y-3 rounded-card border border-surface-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Crear contraseña (opcional)</h2>
      <p className="text-sm text-ink-600">Con una contraseña podrás entrar también con tu correo y cambiar tu contraseña aquí. Tu correo de Google no cambia.</p>
      <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
        <PasswordField id="create-password-new" name="newPassword" label="Contraseña nueva" autoComplete="new-password" aria-describedby="create-password-rules" value={password} onChange={(event) => setPassword(event.target.value)} />
        <PasswordChecklist id="create-password-rules" password={password} context={context} />
        <PasswordField id="create-password-confirm" name="confirmPassword" label="Confirmar contraseña" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        {message && <p role="alert" className="text-sm text-security-600">{message}</p>}
        {done && !message && !onCreated && <p role="status" className="text-sm text-ink-900">{PASSWORD_CREATED_MESSAGE}</p>}
        <button type="submit" disabled={create.isPending} className={`min-h-11 rounded-control bg-security-600 px-4 text-sm font-semibold text-white hover:bg-security-500 disabled:opacity-60 ${FOCUS}`}>{create.isPending ? 'Creando…' : 'Crear contraseña'}</button>
      </form>
      <p className="text-sm text-ink-600">Tu correo lo administra Google.</p>
    </section>
  )
}
