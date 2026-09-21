import { useState, useEffect, useRef } from 'react'
import api from '../../../services/api'

export type MfaStage = 'verify' | 'enroll'

interface MfaChallengeProps {
  stage: MfaStage
  challengeToken: string
  /** Se invoca con el usuario autenticado cuando el segundo paso se completa. */
  onSuccess: (user: unknown, backupCodes?: string[]) => void
  onCancel: () => void
}

interface EnrollmentData {
  qrDataUrl: string
  secret: string
}

/**
 * Segundo paso del inicio de sesión (Fase S del hardening).
 *
 * Dos modos:
 *  - `verify`: el usuario ya tiene segundo factor y sólo introduce el código.
 *  - `enroll`: su rol exige segundo factor y aún no lo tiene. Se le muestra el
 *    QR y no obtiene sesión hasta confirmarlo con un código real, de modo que
 *    nadie queda fuera de su cuenta por haber activado un factor que su
 *    aplicación nunca llegó a registrar.
 */
export default function MfaChallenge({
  stage,
  challengeToken,
  onSuccess,
  onCancel,
}: MfaChallengeProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null)
  const [isLoadingQr, setIsLoadingQr] = useState(stage === 'enroll')
  const [showSecret, setShowSecret] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // En modo enrolamiento se pide el QR nada más entrar.
  useEffect(() => {
    if (stage !== 'enroll') return

    let cancelled = false

    api
      .post('/auth/mfa/enroll/start', { challengeToken })
      .then((res) => {
        if (!cancelled) setEnrollment(res.data)
      })
      .catch(() => {
        if (!cancelled) {
          setError('No fue posible generar el código QR. Vuelve a iniciar sesión.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingQr(false)
      })

    return () => {
      cancelled = true
    }
  }, [stage, challengeToken])

  useEffect(() => {
    inputRef.current?.focus()
  }, [enrollment])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (code.trim().length < 6) {
      setError('Ingresa el código completo.')
      return
    }

    setIsSubmitting(true)

    try {
      const endpoint =
        stage === 'enroll' ? '/auth/mfa/enroll/confirm' : '/auth/mfa/verify'

      const res = await api.post(endpoint, {
        challengeToken,
        code: code.trim().toUpperCase(),
      })

      onSuccess(res.data.user, res.data.backupCodes)
    } catch (err: any) {
      const status = err.response?.status

      if (!status) {
        setError('No fue posible conectar con el servidor.')
      } else if (status === 401 && err.response?.data?.message?.includes('expir')) {
        setError('La verificación expiró. Vuelve a iniciar sesión.')
      } else if ([400, 401].includes(status)) {
        setError('El código no es válido. Verifica la hora de tu dispositivo.')
      } else if (status === 429) {
        setError('Demasiados intentos. Espera unos minutos.')
      } else {
        setError(err.response?.data?.message || 'No fue posible verificar el código.')
      }

      setCode('')
      inputRef.current?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-neutral-800">
        {stage === 'enroll' ? 'Configura la verificación en dos pasos' : 'Verificación en dos pasos'}
      </h2>

      <p className="mt-2 text-sm text-neutral-600">
        {stage === 'enroll'
          ? 'Tu rol requiere un segundo factor de autenticación. Escanea el código con Google Authenticator, Authy o similar.'
          : 'Ingresa el código de 6 dígitos de tu aplicación de autenticación.'}
      </p>

      {stage === 'enroll' && (
        <div className="mt-6">
          {isLoadingQr ? (
            <div className="flex h-60 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50">
              <span className="text-sm text-neutral-500">Generando código…</span>
            </div>
          ) : enrollment ? (
            <div className="flex flex-col items-center gap-3">
              <img
                src={enrollment.qrDataUrl}
                alt="Código QR para configurar la verificación en dos pasos"
                className="rounded-xl border border-neutral-200 bg-white p-2"
                width={200}
                height={200}
              />

              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="text-xs font-medium text-security-600 hover:text-security-700"
              >
                {showSecret ? 'Ocultar clave' : '¿No puedes escanear? Ver clave'}
              </button>

              {showSecret && (
                <code className="select-all break-all rounded-lg bg-neutral-100 px-3 py-2 text-center font-mono text-xs text-neutral-700">
                  {enrollment.secret}
                </code>
              )}
            </div>
          ) : null}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="mfa-code" className="block text-sm font-medium text-neutral-700">
            Código de verificación
          </label>

          <input
            ref={inputRef}
            id="mfa-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              if (error) setError('')
            }}
            placeholder="000000"
            className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-center font-mono text-xl tracking-[0.3em] focus:border-security-500 focus:outline-none focus:ring-2 focus:ring-security-500/20"
            disabled={isSubmitting || isLoadingQr}
          />

          <p className="mt-2 text-xs text-neutral-500">
            También puedes usar uno de tus códigos de respaldo.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || isLoadingQr}
          className="w-full rounded-xl bg-security-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-security-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Verificando…' : stage === 'enroll' ? 'Activar y continuar' : 'Verificar'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2 text-sm font-medium text-neutral-600 hover:text-neutral-800"
        >
          Volver al inicio de sesión
        </button>
      </form>
    </div>
  )
}

interface BackupCodesProps {
  codes: string[]
  onContinue: () => void
}

/**
 * Los códigos de respaldo se muestran una única vez: en la base de datos sólo
 * queda su hash, así que ni el sistema ni un administrador pueden recuperarlos
 * después.
 */
export function BackupCodes({ codes, onContinue }: BackupCodesProps) {
  const [confirmed, setConfirmed] = useState(false)

  const handleDownload = () => {
    const content = [
      'Códigos de respaldo — Grupo Security',
      'Cada código sirve UNA sola vez. Guárdalos en un lugar seguro.',
      '',
      ...codes,
    ].join('\n')

    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'codigos-respaldo-grupo-security.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-neutral-800">Guarda tus códigos de respaldo</h2>

      <p className="mt-2 text-sm text-neutral-600">
        Úsalos si pierdes acceso a tu aplicación de autenticación. Cada uno sirve
        una sola vez. <strong>No volverán a mostrarse.</strong>
      </p>

      <ul className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        {codes.map((c) => (
          <li key={c} className="select-all text-center font-mono text-sm text-neutral-800">
            {c}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={handleDownload}
        className="mt-4 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
      >
        Descargar como archivo
      </button>

      <label className="mt-5 flex items-start gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-security-500 focus:ring-security-500"
        />
        Ya los guardé en un lugar seguro
      </label>

      <button
        type="button"
        disabled={!confirmed}
        onClick={onContinue}
        className="mt-4 w-full rounded-xl bg-security-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-security-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Continuar
      </button>
    </div>
  )
}
