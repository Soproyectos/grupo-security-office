import { useState } from 'react'
import { Button, Alert } from '../../../components/ui'
import { getApiErrorMessage } from '../../../lib/apiError'
import { deleteProduct } from '../../../services/product-detail.service'
import type { Product } from '../types/product.types'
import PasswordField from '../../customer-portal/components/PasswordField'

interface BulkDeleteModalProps {
  open: boolean
  onClose: () => void
  products: Product[]
  onConfirm: () => void
  canManageListas: () => boolean
}

interface DeleteResult {
  id: string
  status: 'fulfilled' | 'rejected'
  reason?: string
  code?: string
  claveInvalid?: boolean
}

type Phase = 'confirm' | 'clave' | 'done'

export function BulkDeleteModal({
  open,
  onClose,
  products,
  onConfirm,
  canManageListas,
}: BulkDeleteModalProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [clave, setClave] = useState('')
  const [claveInvalid, setClaveInvalid] = useState(false)
  const [results, setResults] = useState<DeleteResult[]>([])
  const [phase, setPhase] = useState<Phase>('confirm')
  const [confirmed, setConfirmed] = useState(false)

  // Primera pasada: sin claves. Clasifica cada resultado por código de error.
  const executeDelete = async () => {
    if (!canManageListas()) {
      setError('No tienes permisos para eliminar productos.')
      return
    }
    if (!confirmed) {
      setError('Debes confirmar que deseas eliminar los productos.')
      return
    }

    setPending(true)
    setError(null)
    setNotice(null)
    setClaveInvalid(false)

    try {
      const allResults: DeleteResult[] = []
      let needsClave = false

      for (const product of products) {
        try {
          await deleteProduct(product.id)
          allResults.push({ id: product.id, status: 'fulfilled' })
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response?.status
          const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
          if (status === 409 && code === 'CLAVE_USUARIO_REQUERIDA') {
            allResults.push({ id: product.id, status: 'rejected', reason: 'Requiere su clave', code })
            needsClave = true
          } else if (status === 403 && code === 'CLAVE_USUARIO_INCORRECTA') {
            allResults.push({
              id: product.id,
              status: 'rejected',
              reason: 'Clave incorrecta',
              code,
              claveInvalid: true,
            })
          } else {
            allResults.push({ id: product.id, status: 'rejected', reason: getApiErrorMessage(err, 'Error desconocido') })
          }
        }
      }

      setResults(allResults)

      if (needsClave) {
        setPhase('clave')
        setNotice('Tienes clave de usuario configurada. Ingrésala para continuar con la eliminación.')
        return
      }

      finish(allResults)
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo completar la eliminación masiva.'))
    } finally {
      setPending(false)
    }
  }

  // Segunda pasada: con la clave del usuario (si se requirió).
  const handleRetryWithClave = async () => {
    if (!clave.trim()) {
      setError('La clave del usuario es obligatoria.')
      return
    }
    setPending(true)
    setError(null)
    setClaveInvalid(false)

    try {
      const current = [...results]

      for (let i = 0; i < current.length; i++) {
        const result = current[i]
        if (!result || result.status !== 'rejected' || result.code !== 'CLAVE_USUARIO_REQUERIDA') continue
        const product = products.find((p) => p.id === result.id)
        if (!product) continue

        try {
          await deleteProduct(product.id, { clave })
          current[i] = { id: product.id, status: 'fulfilled' }
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response?.status
          const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
          if (status === 403 && code === 'CLAVE_USUARIO_INCORRECTA') {
            current[i] = {
              id: product.id,
              status: 'rejected',
              reason: 'Clave incorrecta',
              code,
              claveInvalid: true,
            }
          } else {
            current[i] = { id: product.id, status: 'rejected', reason: getApiErrorMessage(err, 'Error desconocido') }
          }
        }
      }

      setResults([...current])

      // Si la clave fue incorrecta, queda en fase 'clave' para reintentar.
      if (current.some((r) => r.claveInvalid)) {
        setClaveInvalid(true)
        setError('Clave incorrecta. Inténtalo de nuevo.')
        return
      }

      finish(current)
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo completar la eliminación.'))
    } finally {
      setPending(false)
    }
  }

  const finish = (finalResults: DeleteResult[]) => {
    setPhase('done')
    const ok = finalResults.filter((r) => r.status === 'fulfilled').length
    const failed = finalResults.filter((r) => r.status === 'rejected').length
    setNotice(failed === 0 ? `${ok} producto(s) eliminados correctamente.` : `${ok} OK, ${failed} fallaron.`)
    onConfirm()
    setTimeout(() => {
      onClose()
      setPhase('confirm')
      setResults([])
      setClave('')
      setClaveInvalid(false)
      setConfirmed(false)
    }, 2000)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-lg font-condensed font-semibold text-neutral-800">Eliminar productos</h2>
          <button
            onClick={() => !pending && onClose()}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {phase === 'confirm' && (
            <>
              <p className="text-sm text-neutral-600">
                Se eliminarán <strong>{products.length}</strong> producto(s) seleccionado(s).
                Esta acción no se puede deshacer.
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[var(--color-primary)] cursor-pointer"
                  required
                  aria-required="true"
                />
                <span className="text-sm text-neutral-700">
                  Confirmo que deseo eliminar los {products.length} producto(s) seleccionado(s).
                </span>
              </label>
            </>
          )}

          {phase === 'clave' && (
            <>
              <p className="text-sm text-neutral-600">{notice}</p>
              <div>
                <PasswordField id="bulk-clave" label="Clave del usuario" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" placeholder="••••••" />
                {claveInvalid && (
                  <p className="text-xs text-red-600 mt-1.5">Clave incorrecta. Inténtalo de nuevo.</p>
                )}
              </div>
            </>
          )}

          {phase === 'done' && (
            <>
              <div className="space-y-2" role="status" aria-live="polite">
                <p className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2" role="alert">
                  {notice}
                </p>
                {results.length > 0 && (
                  <details className="text-sm text-neutral-600">
                    <summary className="cursor-pointer font-medium">Ver detalle por producto</summary>
                    <ul className="mt-2 space-y-1">
                      {results.map((r, i) => {
                        const product = products.find((p) => p.id === r.id) ?? products[i]
                        return (
                          <li key={i} className={`flex items-center gap-2 ${r.status === 'fulfilled' ? 'text-emerald-700' : 'text-red-700'}`}>
                            <span className="font-mono text-xs">{product?.sku ?? 'N/A'}</span>
                            <span>{r.status === 'fulfilled' ? 'Eliminado' : `Rechazado: ${r.reason}`}</span>
                            {r.claveInvalid && <span className="text-red-600">(clave incorrecta)</span>}
                          </li>
                        )
                      })}
                    </ul>
                  </details>
                )}
              </div>
            </>
          )}

          {(error || (notice && phase !== 'done')) && (
            <Alert variant={error ? 'error' : 'warning'}>{error || notice}</Alert>
          )}

          <div className="flex gap-3 justify-end pt-2">
            {phase === 'confirm' && (
              <>
                <Button variant="secondary" disabled={pending} onClick={onClose}>
                  Cancelar
                </Button>
                <Button variant="danger" loading={pending} onClick={executeDelete} disabled={!confirmed || pending}>
                  Eliminar
                </Button>
              </>
            )}

            {phase === 'clave' && (
              <>
                <Button variant="secondary" disabled={pending} onClick={() => setPhase('confirm')}>
                  Volver
                </Button>
                <Button variant="danger" loading={pending} onClick={handleRetryWithClave} disabled={!clave.trim()}>
                  Continuar
                </Button>
              </>
            )}

            {phase === 'done' && (
              <Button variant="primary" onClick={onClose}>
                Cerrar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}