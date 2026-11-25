export type PasswordRule =
  | 'LENGTH'
  | 'LOWERCASE'
  | 'UPPERCASE'
  | 'NUMBER'
  | 'SYMBOL'
  | 'NO_EMAIL'
  | 'NO_NAME'
  | 'NO_REPEATS';

/** Human-readable (Spanish) text per rule; shown to the person in the error message. */
export const PASSWORD_RULE_TEXT: Record<PasswordRule, string> = {
  LENGTH: 'entre 12 y 128 caracteres',
  LOWERCASE: 'al menos una minúscula',
  UPPERCASE: 'al menos una mayúscula',
  NUMBER: 'al menos un número',
  SYMBOL: 'al menos un símbolo',
  NO_EMAIL: 'no puede contener tu correo',
  NO_NAME: 'no puede contener tu nombre',
  NO_REPEATS: 'no puede tener 4 caracteres iguales seguidos',
};

const MIN_IDENTITY_PART = 4;

/**
 * Pure server-side password rules. Returns the rules that are NOT met
 * (empty list = valid). Email/name checks run only when those values are given.
 */
export function validatePortalPassword(
  password: string,
  identity: { email?: string | null; name?: string | null } = {},
): PasswordRule[] {
  const failed: PasswordRule[] = [];
  const value = typeof password === 'string' ? password : '';
  if (value.length < 12 || value.length > 128) failed.push('LENGTH');
  if (!/\p{Ll}/u.test(value)) failed.push('LOWERCASE');
  if (!/\p{Lu}/u.test(value)) failed.push('UPPERCASE');
  if (!/\d/.test(value)) failed.push('NUMBER');
  if (!/[^\p{L}\d]/u.test(value)) failed.push('SYMBOL');

  const lower = value.toLowerCase();
  const local = (identity.email ?? '').split('@')[0].trim().toLowerCase();
  if (local.length >= MIN_IDENTITY_PART && lower.includes(local)) failed.push('NO_EMAIL');

  const words = (identity.name ?? '')
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w.length >= MIN_IDENTITY_PART);
  if (words.some((w) => lower.includes(w))) failed.push('NO_NAME');

  if (/(.)\1{3}/su.test(value)) failed.push('NO_REPEATS');
  return failed;
}

export function weakPasswordMessage(failed: PasswordRule[]): string {
  return `La contraseña no cumple los requisitos: ${failed.map((r) => PASSWORD_RULE_TEXT[r]).join('; ')}.`;
}
