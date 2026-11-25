import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import ChangeEmailForm from '../components/ChangeEmailForm'
import ChangePasswordForm from '../components/ChangePasswordForm'
import CreatePasswordForm, { PASSWORD_CREATED_MESSAGE } from '../components/CreatePasswordForm'
import DeleteAccountForm from '../components/DeleteAccountForm'
import LinkedAccountsSection from '../components/LinkedAccountsSection'
import { useRefreshPortalSession } from '../hooks/usePortalProfile'
import type { PortalAccount } from '../types/customer-portal.types'

function DeleteAccountSection({ account }: { account: PortalAccount }) {
  const [confirming, setConfirming] = useState(false)
  const start = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (confirming) heading.current?.focus()
  }, [confirming])

  function cancel() {
    setConfirming(false)
    requestAnimationFrame(() => start.current?.focus())
  }

  return (
    <section className="portal-account__panel space-y-3" aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading" ref={heading} tabIndex={-1} className="text-xl font-semibold">Eliminar mi cuenta</h2>
      <p className="text-sm text-ink-600">Perderás el acceso al portal. Grupo Security conservará los registros comerciales que deba mantener, como cotizaciones y pedidos.</p>
      {confirming ? (
        <DeleteAccountForm account={account} onCancel={cancel} />
      ) : (
        <button ref={start} type="button" className="portal-account__text-link" aria-expanded={false} onClick={() => setConfirming(true)}>
          Revisar cómo eliminar mi cuenta
        </button>
      )}
    </section>
  )
}

export default function CustomerSecurityPage() {
  const account = useOutletContext<PortalAccount>()
  const [params] = useSearchParams()
  const [passwordCreated, setPasswordCreated] = useState(false)
  const refresh = useRefreshPortalSession()
  const refreshedEmail = useRef(false)
  const emailChanged = params.get('email') === 'cambiado'

  useEffect(() => {
    if (emailChanged && !refreshedEmail.current) {
      refreshedEmail.current = true
      void refresh()
    }
  }, [emailChanged, refresh])

  return (
    <div className="space-y-5">
      <header>
        <h1 className="portal-account__title">Acceso y seguridad</h1>
        <p className="mt-2 text-ink-600">Elige cómo entrar y administra la seguridad de tu cuenta.</p>
      </header>
      {(emailChanged || passwordCreated) && (
        <p role="status" className="rounded-control bg-neutral-100 p-3 font-semibold">
          {emailChanged ? 'Tu correo se actualizó.' : PASSWORD_CREATED_MESSAGE}
        </p>
      )}
      <LinkedAccountsSection account={account} />
      {account.hasPassword === true ? (
        <>
          <ChangePasswordForm account={account} />
          <ChangeEmailForm account={account} />
        </>
      ) : account.hasPassword === false ? (
        <CreatePasswordForm account={account} onCreated={() => setPasswordCreated(true)} />
      ) : null}
      <DeleteAccountSection account={account} />
    </div>
  )
}
