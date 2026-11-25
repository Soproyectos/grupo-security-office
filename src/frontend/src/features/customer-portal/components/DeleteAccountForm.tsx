import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import PasswordField from './PasswordField'
import { useDeletePortalAccount } from '../hooks/usePortalProfile'
import { readAuthError } from '../utils/auth-errors'
import type { PortalAccount } from '../types/customer-portal.types'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
export const DELETE_FALLBACK_ERROR = 'No pudimos eliminar tu cuenta. Inténtalo de nuevo en unos minutos.'

/** Inline confirmation to delete the account: password when the account has one, otherwise the email. */
export default function DeleteAccountForm({ account, onCancel }: { account: PortalAccount; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const remove = useDeletePortalAccount()
  const navigate = useNavigate()
  const withPassword = account.hasPassword === true
  const message = remove.isError ? readAuthError(remove.error).message || DELETE_FALLBACK_ERROR : ''

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!value || remove.isPending) return
    remove.mutate(withPassword ? { password: value } : { confirmEmail: value.trim() }, {
      onSuccess: () => navigate('/clientes/login?deleted=1', { replace: true }),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-control bg-surface-100 p-4">
      {withPassword ? (
        <PasswordField id="delete-account-password" name="password" label="Escribe tu contraseña para confirmar" autoComplete="current-password" value={value} onChange={(event) => setValue(event.target.value)} />
      ) : (
        <label className="block text-sm font-medium">Escribe tu correo para confirmar
          <input type="email" name="confirmEmail" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} className={`mt-1.5 min-h-12 w-full rounded-control border border-surface-300 bg-white px-3 ${FOCUS}`} />
        </label>
      )}
      {message && <p role="alert" className="text-sm text-security-600">{message}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!value || remove.isPending} className={`min-h-11 rounded-control bg-security-600 px-4 text-sm font-semibold text-white hover:bg-security-500 disabled:opacity-60 ${FOCUS}`}>{remove.isPending ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
        <button type="button" disabled={remove.isPending} onClick={onCancel} className={`min-h-11 rounded-control border border-surface-300 bg-white px-4 text-sm font-semibold text-ink-900 disabled:opacity-60 ${FOCUS}`}>Cancelar</button>
      </div>
    </form>
  )
}
