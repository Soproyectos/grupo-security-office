import { useState, type FormEvent } from 'react'
import PasswordField from './PasswordField'
import { useChangePortalEmail } from '../hooks/usePortalProfile'
import { changeEmailErrorMessage } from '../utils/auth-errors'
import type { PortalAccount } from '../types/customer-portal.types'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
export const EMAIL_LINK_SENT_MESSAGE = 'Te enviamos un enlace al correo nuevo. Tu correo actual no cambia hasta que lo abras. Si no lo ves, revisa spam.'

/** «Cambiar correo» section of Mis datos. The link goes to the new address; the server never says if it is taken. */
export default function ChangeEmailForm({ account }: { account: PortalAccount }) {
  const [newEmail, setNewEmail] = useState('')
  const [current, setCurrent] = useState('')
  const [localError, setLocalError] = useState('')
  const [done, setDone] = useState(false)
  const change = useChangePortalEmail()
  const serverError = change.isError ? changeEmailErrorMessage(change.error) : ''
  const message = localError || serverError

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (change.isPending) return
    setDone(false)
    const email = newEmail.trim()
    if (!email || !email.includes('@')) return setLocalError('Escribe el correo nuevo completo, por ejemplo nombre@empresa.com.')
    if (email.toLowerCase() === account.email.toLowerCase()) return setLocalError('Ese ya es tu correo actual. Escribe uno distinto.')
    if (!current) return setLocalError('Escribe tu contraseña actual.')
    setLocalError('')
    change.mutate({ newEmail: email, currentPassword: current }, {
      onSuccess: () => { setNewEmail(''); setCurrent(''); setDone(true) },
    })
  }

  return (
    <section className="space-y-3 rounded-card border border-surface-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Cambiar correo</h2>
      <p className="text-sm text-ink-600">Tu correo actual: <span className="font-semibold text-ink-900">{account.email}</span></p>
      <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
        <div>
          <label htmlFor="change-email-new" className="block text-sm font-medium">Correo nuevo</label>
          <input id="change-email-new" name="newEmail" type="email" autoComplete="off" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className={`mt-1.5 min-h-12 w-full rounded-control border border-surface-300 bg-white px-3 ${FOCUS}`} />
        </div>
        <PasswordField id="change-email-password" name="currentPassword" label="Contraseña actual" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
        {message && <p role="alert" className="text-sm text-security-600">{message}</p>}
        {done && !message && <p role="status" className="text-sm text-ink-900">{EMAIL_LINK_SENT_MESSAGE}</p>}
        <button type="submit" disabled={change.isPending} className={`min-h-11 rounded-control bg-security-600 px-4 text-sm font-semibold text-white hover:bg-security-500 disabled:opacity-60 ${FOCUS}`}>{change.isPending ? 'Enviando…' : 'Enviar enlace al correo nuevo'}</button>
      </form>
    </section>
  )
}
