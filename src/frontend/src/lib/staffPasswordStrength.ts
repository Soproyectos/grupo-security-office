/**
 * Live strength estimate for staff passwords. Mirrors the server policy
 * (src/backend/src/common/security/password-policy.service.ts): zxcvbn score,
 * 12-72 characters, and a higher minimum score for privileged accounts.
 * The dictionaries are large, so they load on first use only.
 */
export const STAFF_MIN_LENGTH = 12
export const STAFF_MAX_LENGTH = 72
const MIN_SCORE_DEFAULT = 3
const MIN_SCORE_PRIVILEGED = 4

const BUSINESS_TERMS = [
  'grupo', 'security', 'gruposecurity', 'seguridad', 'admin', 'administrador', 'compras',
  'supervisor', 'comercial', 'vendedor', 'operador', 'consulta', 'gruposecurity.co', 'colombia', 'bogota',
]

type Checker = (password: string, extra: string[]) => number
let checkerPromise: Promise<Checker> | null = null

function loadChecker(): Promise<Checker> {
  checkerPromise ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-es-es'),
  ]).then(([core, common, es]) => {
    const zxcvbn = new core.ZxcvbnFactory({
      dictionary: { ...common.dictionary, ...es.dictionary, userInputs: BUSINESS_TERMS },
      graphs: common.adjacencyGraphs,
      translations: es.translations,
      useLevenshteinDistance: true,
    })
    return (password, extra) => zxcvbn.check(password, extra).score
  })
  return checkerPromise
}

export type StaffStrength = { score: number; lengthOk: boolean; meetsPolicy: boolean }

export async function evaluateStaffPassword(
  password: string,
  opts: { privileged?: boolean; email?: string; name?: string } = {},
): Promise<StaffStrength> {
  const extra = [opts.email ?? '', opts.name ?? '']
    .filter(Boolean)
    .flatMap((input) => [input, ...input.split(/[\s@._-]+/)])
    .filter((token) => token.length > 2)
  const score = (await loadChecker())(password, extra)
  const lengthOk = password.length >= STAFF_MIN_LENGTH && password.length <= STAFF_MAX_LENGTH
  const minScore = opts.privileged ? MIN_SCORE_PRIVILEGED : MIN_SCORE_DEFAULT
  return { score, lengthOk, meetsPolicy: lengthOk && score >= minScore }
}
