import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import MunicipalityPicker from '../components/MunicipalityPicker'
import { useUpdatePortalProfile } from '../hooks/usePortalProfile'
import { INVALID_CITY_CODE, INVALID_CITY_MESSAGE, PRIVACY_POLICY_PATH, PRIVACY_REQUIRED_MESSAGE, readAuthError } from '../utils/auth-errors'
import type { PortalAccount, PortalProfileInput } from '../types/customer-portal.types'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
const INPUT = `mt-1 min-h-12 w-full rounded-control border border-surface-300 bg-white px-3 ${FOCUS}`

/** Form body, separated from the router so it can be rendered on its own. */
export function CompleteProfileForm({ account, onSaved }: { account: PortalAccount; onSaved?: () => void }) {
  const update = useUpdatePortalProfile()
  const needsPrivacy = !account.privacyAcceptedAt
  const incomplete = account.profileComplete === false
  const [companyName, setCompanyName] = useState(account.companyName ?? '')
  const [documentId, setDocumentId] = useState(account.documentId ?? '')
  const [phone, setPhone] = useState(account.phone ?? '')
  const [city, setCity] = useState(account.city?.code ?? '')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const busy = update.isPending

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const company = companyName.trim()
    if (company.length < 2) { setError('Escribe el nombre de tu empresa o nombre comercial.'); return }
    if (!city) { setError(INVALID_CITY_MESSAGE); return }
    if (needsPrivacy && !accepted) { setError(PRIVACY_REQUIRED_MESSAGE); return }
    setError('')
    const input: PortalProfileInput = {
      companyName: company,
      city,
      ...(documentId.trim() ? { documentId: documentId.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(needsPrivacy ? { acceptPrivacy: true as const } : {}),
    }
    update.mutate(input, {
      onSuccess: () => onSaved?.(),
      onError: (cause) => { const { code, message } = readAuthError(cause); setError(code === 'PRIVACY_NOT_ACCEPTED' ? PRIVACY_REQUIRED_MESSAGE : code === INVALID_CITY_CODE || message === INVALID_CITY_MESSAGE ? INVALID_CITY_MESSAGE : 'No pudimos guardar tus datos. Revisa los campos e inténtalo de nuevo.') },
    })
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="font-condensed text-3xl font-semibold">{incomplete ? 'Completa tus datos' : 'Editar mis datos'}</h1>
        <p className="mt-2 text-ink-600">Con estos datos podrás ver el catálogo y un asesor sabrá a quién atender.</p>
      </header>
      <form onSubmit={submit} noValidate className="space-y-4 rounded-card border border-surface-200 bg-white p-6">
        <label className="block text-sm font-medium">Empresa o nombre comercial
          <input name="companyName" required minLength={2} maxLength={160} autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} className={INPUT} />
        </label>
        <MunicipalityPicker value={city} onChange={setCity} initial={account.city ?? null} invalid={Boolean(error) && !city} />
        <label className="block text-sm font-medium">NIT o documento (opcional)
          <input name="documentId" maxLength={40} value={documentId} onChange={(event) => setDocumentId(event.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">Teléfono (opcional)
          <input name="phone" type="tel" maxLength={30} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={INPUT} />
        </label>
        {needsPrivacy && (
          <label className="flex min-h-11 items-start gap-3 text-sm text-ink-900">
            <input type="checkbox" name="acceptPrivacy" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className={`mt-0.5 h-5 w-5 shrink-0 accent-security-600 ${FOCUS}`} />
            <span>Acepto la <Link to={PRIVACY_POLICY_PATH} target="_blank" rel="noopener noreferrer" className={`font-semibold underline !text-security-600 ${FOCUS}`}>política de tratamiento de datos<span className="sr-only"> (se abre en otra pestaña)</span></Link></span>
          </label>
        )}
        {error && <p role="alert" className="rounded-control bg-security-50 p-3 text-sm text-security-600">{error}</p>}
        <button type="submit" disabled={busy} className={`min-h-12 w-full rounded-control bg-security-600 px-4 font-semibold text-white hover:bg-security-500 disabled:opacity-60 ${FOCUS}`}>{busy ? 'Guardando…' : 'Guardar mis datos'}</button>
        {!incomplete && <Link to="/clientes/perfil" className={`inline-flex min-h-11 items-center text-sm font-semibold !text-security-600 ${FOCUS}`}>Cancelar y volver a Mis datos</Link>}
      </form>
    </div>
  )
}

export default function CompleteProfilePage() {
  const account = useOutletContext<PortalAccount>()
  const navigate = useNavigate()
  return <CompleteProfileForm account={account} onSaved={() => navigate('/clientes', { replace: true })} />
}
