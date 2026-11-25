import { evaluatePassword, type PasswordContext } from '../utils/password-rules'

/** Live list of password requirements. Each line says «Cumplido» or «Falta» in text, not only in color. */
export default function PasswordChecklist({ password, context, id }: { password: string; context?: PasswordContext; id?: string }) {
  const rules = evaluatePassword(password, context)
  return (
    <div id={id} aria-live="polite" className="rounded-control bg-surface-100 p-3 text-sm text-ink-900">
      <p className="font-semibold">Tu contraseña debe tener:</p>
      <ul className="mt-2 space-y-1">
        {rules.map((rule) => (
          <li key={rule.id} data-met={rule.met} className={rule.met ? 'text-ink-900' : 'text-ink-700'}>
            <span className="font-semibold">{rule.met ? 'Cumplido: ' : 'Falta: '}</span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
