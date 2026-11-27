import { useEffect, useState } from 'react'
import { evaluatePassword, type PasswordContext } from '../utils/password-rules'
import { evaluateStaffPassword } from '../../../lib/staffPasswordStrength'

type Level = { label: string; color: string; segments: number }

const WEAK: Level = { label: 'Débil', color: 'var(--color-error)', segments: 1 }
const MEDIUM: Level = { label: 'Media', color: 'var(--color-warning)', segments: 2 }
const STRONG: Level = { label: 'Fuerte', color: 'var(--color-success)', segments: 3 }

/** Portal rule: «Fuerte» only when every requirement is met. */
export function passwordLevel(password: string, context?: PasswordContext): Level | null {
  if (!password) return null
  const rules = evaluatePassword(password, context)
  const met = rules.filter((rule) => rule.met).length
  if (met === rules.length) return STRONG
  return met >= 4 ? MEDIUM : WEAK
}

function Bar({ level }: { level: Level | null }) {
  return (
    <div aria-live="polite" className="flex items-center gap-3">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className="h-1.5 flex-1 rounded-full bg-surface-300 transition-colors duration-200"
            style={level && n <= level.segments ? { backgroundColor: level.color } : undefined}
          />
        ))}
      </div>
      <span className="min-w-28 text-right text-sm font-semibold text-ink-900">
        {level ? `Contraseña ${level.label.toLowerCase()}` : 'Escribe una contraseña'}
      </span>
    </div>
  )
}

/** Three-segment bar (red, orange, green) that always says the level in text too. */
export default function PasswordStrengthMeter({ password, context }: { password: string; context?: PasswordContext }) {
  return <Bar level={passwordLevel(password, context)} />
}

/**
 * Staff version: same measure the server uses (zxcvbn, 12-72 characters, stricter for Super Admin),
 * so «fuerte» means the server will accept it.
 */
export function StaffPasswordStrengthMeter({
  password, email, name, privileged,
}: { password: string; email?: string; name?: string; privileged?: boolean }) {
  const [level, setLevel] = useState<Level | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!password) {
      setLevel(null)
      return
    }
    void evaluateStaffPassword(password, { email, name, privileged }).then((result) => {
      if (cancelled) return
      if (result.meetsPolicy) setLevel(STRONG)
      else if (result.lengthOk && result.score >= 2) setLevel(MEDIUM)
      else setLevel(WEAK)
    })
    return () => { cancelled = true }
  }, [password, email, name, privileged])
  return <Bar level={level} />
}
