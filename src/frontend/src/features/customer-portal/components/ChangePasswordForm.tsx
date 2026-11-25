import { useState, type FormEvent } from 'react'
import PasswordField from './PasswordField'
import PasswordChecklist from './PasswordChecklist'
import { useChangePortalPassword } from '../hooks/usePortalProfile'
import { changePasswordErrorMessage } from '../utils/auth-errors'
import { isPasswordValid } from '../utils/password-rules'
import type { PortalAccount } from '../types/customer-portal.types'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
export const PASSWORD_CHANGED_MESSAGE = 'Listo. Cambiamos tu contraseña y cerramos tus otras sesiones.'

/** «Cambiar contraseña» section of Mis datos. Only for accounts that have a password (not Google-only). */
export default function ChangePasswordForm({ account }: { account: PortalAccount }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState('')
  const [done, setDone] = useState(false)
  const change = useChangePortalPassword()
  const context = { email: account.email, name: account.contactName }
  const serverError = change.isError ? changePasswordErrorMessage(change.error) : ''
  const message = localError || serverError

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (change.isPending) return
    setDone(false)
    if (!current) return setLocalError('Escribe tu contraseña actual.')
    if (!isPasswordValid(next, context)) return setLocalError('La contraseña nueva no cumple todos los requisitos. Revisa la lista.')
    if (next !== confirm) return setLocalError('Las contraseñas nuevas no coinciden.')
    if (next === current) return setLocalError('La contraseña nueva debe ser distinta a la actual.')
    setLocalError('')
    change.mutate({ currentPassword: current, newPassword: next }, {
      onSuccess: () => { setCurrent(''); setNext(''); setConfirm(''); setDone(true) },
    })
  }

  return (
    <section className="space-y-3 rounded-card border border-surface-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
      <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
        <PasswordField id="change-password-current" name="currentPassword" label="Contraseña actual" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
        <PasswordField id="change-password-new" name="newPassword" label="Contraseña nueva" autoComplete="new-password" aria-describedby={done ? undefined : "change-password-rules"} value={next} onChange={(event) => { setDone(false); setNext(event.target.value) }} />
        {!done && <PasswordChecklist id="change-password-rules" password={next} context={context} />}
        <PasswordField id="change-password-confirm" name="confirmPassword" label="Confirmar contraseña nueva" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        {message && <p role="alert" className="text-sm text-security-600">{message}</p>}
        {done && !message && <p role="status" className="rounded-control bg-brand-success/10 p-3 text-sm font-semibold text-ink-900">{PASSWORD_CHANGED_MESSAGE}</p>}
        <button type="submit" disabled={change.isPending} className={`min-h-11 rounded-control bg-security-600 px-4 text-sm font-semibold text-white hover:bg-security-500 disabled:opacity-60 ${FOCUS}`}>{change.isPending ? 'Cambiando…' : 'Cambiar contraseña'}</button>
      </form>
    </section>
  )
}
