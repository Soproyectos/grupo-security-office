/** Same rules the server enforces for portal passwords. */
export type PasswordContext = { email?: string; name?: string }
export type PasswordRule = { id: string; label: string; met: boolean }

const MIN_LENGTH = 12
const MAX_LENGTH = 128

function letterCount(value: string): number {
  return (value.match(/\p{L}/gu) ?? []).length
}

function containsPersonalData(password: string, { email, name }: PasswordContext): boolean {
  const lower = password.toLowerCase()
  const local = (email ?? '').split('@')[0]?.trim().toLowerCase() ?? ''
  if (local && letterCount(local) >= 4 && lower.includes(local)) return true
  const words = (name ?? '').toLowerCase().split(/[^\p{L}]+/u).filter((word) => letterCount(word) >= 4)
  return words.some((word) => lower.includes(word))
}

export function evaluatePassword(password: string, context: PasswordContext = {}): PasswordRule[] {
  const length = Array.from(password).length
  const typed = password.length > 0
  return [
    { id: 'length', label: `Entre ${MIN_LENGTH} y ${MAX_LENGTH} caracteres`, met: length >= MIN_LENGTH && length <= MAX_LENGTH },
    { id: 'lower', label: 'Una letra minúscula', met: /\p{Ll}/u.test(password) },
    { id: 'upper', label: 'Una letra mayúscula', met: /\p{Lu}/u.test(password) },
    { id: 'number', label: 'Un número', met: /\d/.test(password) },
    { id: 'symbol', label: 'Un símbolo (por ejemplo ! ? # $)', met: /[^\p{L}\p{N}]/u.test(password) },
    { id: 'personal', label: 'Sin tu nombre ni la parte de tu correo antes de @', met: typed && !containsPersonalData(password, context) },
    { id: 'repeat', label: 'Sin 4 caracteres iguales seguidos', met: typed && !/(.)\1{3}/su.test(password) },
  ]
}

export function isPasswordValid(password: string, context: PasswordContext = {}): boolean {
  return evaluatePassword(password, context).every((rule) => rule.met)
}
