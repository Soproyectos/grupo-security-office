import { useCallback, useEffect, useState } from 'react'
import { Button, Input } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  createProviderProfile,
  deleteProviderProfile,
  listProviderProfiles,
  recognizeProviderProfile,
  resolveProviderReferences,
  setProviderEquivalences,
  updateProviderProfile,
  type ProviderProfile,
  type ProviderProfileInput,
  type ProviderRecognition,
  type ResolvedReference,
} from '../../services/price-import.service'
import {
  PROVIDER_SEPARATORS,
  PROVIDER_TARIFFS,
  PROVIDER_THOUSANDS,
  canEditProviderProfiles,
  canManageProviderProfiles,
  hasFormErrors,
  parseHeaders,
  recognitionMessage,
  summarizeResolution,
  validateProfileForm,
} from './provider-profiles.utils'

const EMPTY_FORM: ProviderProfileInput = {
  providerName: '',
  sheet: 'PRECIOS',
  headerRow: 1,
  thousandsSeparator: '.',
  decimalSeparator: ',',
  currency: 'COP',
  tariffs: ['DPP_ORO_IVA'],
  expectedColumns: [],
}

/**
 * IMP-07B (07B) — Perfiles de proveedor: formato del archivo de cada
 * proveedor y equivalencias referencia externa → producto. Se reutiliza el
 * perfil cuando el mismo proveedor vuelve a mandar el archivo (sin remapear) y
 * se exige revisarlo si cambia el encabezado o aparece un proveedor nuevo.
 */
export default function ProviderProfilesSection() {
  const [profiles, setProfiles] = useState<ProviderProfile[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderProfileInput>(EMPTY_FORM)
  const [headersText, setHeadersText] = useState('')
  const [recognition, setRecognition] = useState<ProviderRecognition | null>(null)
  const [equivText, setEquivText] = useState('')
  const [referencesText, setReferencesText] = useState('')
  const [resolution, setResolution] = useState<ResolvedReference[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const canEdit = canEditProviderProfiles()

  const load = useCallback(async () => {
    try {
      setProfiles(await listProviderProfiles())
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos cargar los perfiles de proveedor.'))
    }
  }, [])

  useEffect(() => {
    if (canManageProviderProfiles()) void load()
  }, [load])

  if (!canManageProviderProfiles()) return null

  function patch(next: Partial<ProviderProfileInput>) {
    setForm((current) => ({ ...current, ...next }))
  }

  function toggleTariff(code: string) {
    setForm((current) => ({
      ...current,
      tariffs: current.tariffs.includes(code)
        ? current.tariffs.filter((t) => t !== code)
        : [...current.tariffs, code],
    }))
  }

  function startEdit(profile: ProviderProfile) {
    setEditingId(profile.id)
    setForm({
      providerName: profile.providerName,
      sheet: profile.sheet,
      headerRow: profile.headerRow,
      thousandsSeparator: profile.thousandsSeparator,
      decimalSeparator: profile.decimalSeparator,
      currency: profile.currency,
      tariffs: profile.tariffs,
      expectedColumns: profile.expectedColumns,
    })
    setHeadersText(profile.expectedColumns.join(', '))
    setEquivText(profile.equivalences.map((e) => `${e.externalRef} = ${e.productId}`).join('\n'))
    setReferencesText('')
    setResolution([])
    setNotice('')
    setError('')
  }

  function resetForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setHeadersText('')
    setEquivText('')
    setReferencesText('')
    setResolution([])
    setRecognition(null)
    setNotice('')
    setError('')
  }

  async function submit() {
    const input: ProviderProfileInput = { ...form, expectedColumns: parseHeaders(headersText) }
    const errors = validateProfileForm(input)
    if (hasFormErrors(errors)) {
      setError(Object.values(errors).join(' '))
      setNotice('')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const saved = editingId
        ? await updateProviderProfile(editingId, input)
        : await createProviderProfile(input)
      setProfiles((current) => {
        const rest = current.filter((p) => p.id !== saved.id)
        return [...rest, saved].sort((a, b) => a.providerName.localeCompare(b.providerName))
      })
      setEditingId(saved.id)
      setNotice(
        editingId
          ? `Perfil de «${saved.providerName}» guardado (v${saved.version}).`
          : `Perfil de «${saved.providerName}» creado (v${saved.version}).`,
      )
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos guardar el perfil del proveedor.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(profile: ProviderProfile) {
    if (!window.confirm(`¿Retirar el perfil de «${profile.providerName}»? No borra precios ni productos.`)) return
    setBusy(true)
    setError('')
    try {
      await deleteProviderProfile(profile.id)
      setProfiles((current) => current.filter((p) => p.id !== profile.id))
      if (editingId === profile.id) resetForm()
      setNotice(`Perfil de «${profile.providerName}» retirado.`)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos retirar el perfil.'))
    } finally {
      setBusy(false)
    }
  }

  async function recognize() {
    const providerName = form.providerName.trim()
    if (!providerName) {
      setError('Indica el proveedor para reconocerlo.')
      return
    }
    setBusy(true)
    setError('')
    try {
      setRecognition(await recognizeProviderProfile(providerName, parseHeaders(headersText)))
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos reconocer el proveedor.'))
    } finally {
      setBusy(false)
    }
  }

  async function saveEquivalences() {
    if (!editingId) {
      setError('Guarda primero el perfil para poder registrar equivalencias.')
      return
    }
    const equivalences = equivText
      .split('\n')
      .map((line) => line.split('='))
      .filter((parts) => parts.length >= 2)
      .map((parts) => ({ externalRef: (parts[0] ?? '').trim(), productId: parts.slice(1).join('=').trim() }))
      .filter((item) => item.externalRef !== '' && item.productId !== '')
    setBusy(true)
    setError('')
    try {
      const saved = await setProviderEquivalences(editingId, equivalences)
      setProfiles((current) => current.map((p) => (p.id === saved.id ? saved : p)))
      setNotice(`Equivalencias actualizadas (${saved.equivalences.length}).`)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos guardar las equivalencias.'))
    } finally {
      setBusy(false)
    }
  }

  async function resolve() {
    if (!editingId) {
      setError('Guarda primero el perfil para comprobar referencias.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const references = parseHeaders(referencesText)
      const result = await resolveProviderReferences(editingId, references)
      setResolution(result.resolution)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No pudimos comprobar las referencias.'))
    } finally {
      setBusy(false)
    }
  }

  const currentSummary = summarizeResolution(resolution)
  const message = recognition ? recognitionMessage(recognition) : null

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6" aria-label="Perfiles de proveedor">
      <h2 className="text-lg font-semibold text-security-800">Perfiles de proveedor</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Guarda el formato del archivo de cada proveedor (hoja, fila de encabezado, separadores de miles y
        decimales, tarifas y encabezados esperados). Cuando el mismo proveedor vuelve a mandar su archivo, el
        perfil se reutiliza sin volver a mapear; si cambia el encabezado, el perfil se revisa.
      </p>

      {notice && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input
          label="Proveedor"
          name="providerName"
          value={form.providerName}
          disabled={!canEdit || busy}
          onChange={(event) => patch({ providerName: event.target.value })}
        />
        <Input
          label="Hoja"
          name="sheet"
          value={form.sheet}
          disabled={!canEdit || busy}
          onChange={(event) => patch({ sheet: event.target.value })}
        />
        <Input
          label="Fila de encabezado"
          name="headerRow"
          type="number"
          value={String(form.headerRow)}
          disabled={!canEdit || busy}
          onChange={(event) => patch({ headerRow: Number(event.target.value) })}
        />
        <label className="space-y-1.5 text-sm font-medium text-neutral-800">
          Separador de miles
          <select
            name="thousandsSeparator"
            className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm"
            value={form.thousandsSeparator}
            disabled={!canEdit || busy}
            onChange={(event) => patch({ thousandsSeparator: event.target.value })}
          >
            {PROVIDER_THOUSANDS.map((value) => (
              <option key={value || 'none'} value={value}>
                {value === '' ? 'Sin separador' : value}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium text-neutral-800">
          Separador decimal
          <select
            name="decimalSeparator"
            className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm"
            value={form.decimalSeparator}
            disabled={!canEdit || busy}
            onChange={(event) => patch({ decimalSeparator: event.target.value })}
          >
            {PROVIDER_SEPARATORS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <Input label="Encabezados esperados (separados por coma)" name="expectedColumns" value={headersText} disabled={!canEdit || busy} onChange={(event) => setHeadersText(event.target.value)} />
      </div>

      <fieldset className="mt-3" disabled={!canEdit || busy}>
        <legend className="text-sm font-medium text-neutral-800">Tarifas del archivo</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {PROVIDER_TARIFFS.map((code) => (
            <label key={code} className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.tariffs.includes(code)} onChange={() => toggleTariff(code)} />
              {code}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" loading={busy} disabled={!canEdit || busy} onClick={submit}>
          {editingId ? 'Guardar perfil' : 'Crear perfil'}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={recognize}>
          Reconocer proveedor
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={resetForm}>
          Limpiar
        </Button>
      </div>

      {message && (
        <p
          role="status"
          className={`mt-3 rounded-lg border p-3 text-sm ${message.tone === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
        >
          {message.message}
        </p>
      )}

      {editingId && (
        <div className="mt-4 rounded-lg border border-neutral-200 p-3">
          <label htmlFor="provider-equivalences" className="block text-sm font-medium text-neutral-800">
            Equivalencias (una por línea: REFERENCIA = id de producto)
          </label>
          <textarea
            id="provider-equivalences"
            className="mt-1 h-24 w-full rounded-lg border border-neutral-300 p-2 font-mono text-xs"
            value={equivText}
            disabled={!canEdit || busy}
            onChange={(event) => setEquivText(event.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={!canEdit || busy} onClick={saveEquivalences}>
              Guardar equivalencias
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={resolve}>
              Comprobar referencias
            </Button>
          </div>
          <Input
            label="Referencias del archivo a comprobar (separadas por coma)"
            name="referenceCheck"
            className="mt-2"
            value={referencesText}
            disabled={busy}
            onChange={(event) => setReferencesText(event.target.value)}
          />
          {resolution.length > 0 && (
            <p className="mt-2 text-sm text-neutral-700">
              {currentSummary.resolved} referencia(s) con producto y {currentSummary.pending} pendiente(s) de mapeo
              {currentSummary.pendingRefs.length > 0 ? `: ${currentSummary.pendingRefs.join(', ')}` : '.'}
            </p>
          )}
        </div>
      )}

      <table className="mt-4 w-full text-left text-sm" aria-label="Perfiles guardados">
        <thead>
          <tr className="text-neutral-500">
            <th scope="col" className="py-1">Proveedor</th>
            <th scope="col" className="py-1">Versión</th>
            <th scope="col" className="py-1">Tarifas</th>
            <th scope="col" className="py-1">Equivalencias</th>
            <th scope="col" className="py-1">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => (
            <tr key={profile.id} className="border-t border-neutral-100">
              <td className="py-1">{profile.providerName}</td>
              <td className="py-1">v{profile.version}</td>
              <td className="py-1">{profile.tariffs.join(', ')}</td>
              <td className="py-1">{profile.equivalences.length}</td>
              <td className="py-1">
                <Button type="button" variant="secondary" disabled={!canEdit || busy} onClick={() => startEdit(profile)}>
                  Revisar
                </Button>{' '}
                <Button type="button" variant="secondary" disabled={!canEdit || busy} onClick={() => remove(profile)}>
                  Retirar
                </Button>
              </td>
            </tr>
          ))}
          {profiles.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-neutral-500">Todavía no hay perfiles de proveedor guardados.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
