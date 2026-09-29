/** Share of uppercase letters from which a text counts as ALL CAPS. */
const MOSTLY_UPPERCASE_RATIO = 0.7

/** Below this many letters a text is too short to judge, so it is left alone. */
const MIN_LETTERS = 8

/**
 * Acronyms that keep their canonical spelling (keys are lowercase). Tokens
 * with a digit (`110V`, `4K`, `RJ45`) are kept as they come, so they need no
 * entry here.
 */
const ACRONYMS: Record<string, string> = {
  wifi: 'WiFi',
  poe: 'PoE',
  kva: 'kVA',
  kw: 'kW',
  ir: 'IR',
  hd: 'HD',
  dvr: 'DVR',
  nvr: 'NVR',
  xvr: 'XVR',
  ups: 'UPS',
  ip: 'IP',
  led: 'LED',
  lcd: 'LCD',
  usb: 'USB',
  cctv: 'CCTV',
  ptz: 'PTZ',
  hdmi: 'HDMI',
  bnc: 'BNC',
  utp: 'UTP',
  rfid: 'RFID',
  pir: 'PIR',
  ssd: 'SSD',
  hdd: 'HDD',
  va: 'VA',
  vac: 'VAC',
  vdc: 'VDC',
  awg: 'AWG',
  ac: 'AC',
  dc: 'DC',
  tv: 'TV',
  pc: 'PC',
}

const WORD_PARTS = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su
const SENTENCE_END = /[.!?:]$|\n$/

function isMostlyUppercase(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? []
  if (letters.length < MIN_LETTERS) return false

  const upper = letters.filter((letter) => letter === letter.toUpperCase() && letter !== letter.toLowerCase())
  return upper.length / letters.length >= MOSTLY_UPPERCASE_RATIO
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * Renders supplier ALL CAPS text in sentence case. A text that is not mostly
 * uppercase is returned untouched, so well written descriptions are never
 * altered. Tokens with digits (`110V`, `1080P`), the small acronym list above
 * and any `keep` words (brand names) are preserved.
 */
export function toSentenceCase(text: string, options: { keep?: string[] } = {}): string {
  if (!isMostlyUppercase(text)) return text

  const keep = new Map((options.keep ?? []).map((word) => [word.toLowerCase(), word]))
  let atSentenceStart = true

  return text
    .split(/(\s+)/)
    .map((token) => {
      if (token === '' || /^\s+$/.test(token)) {
        if (token.includes('\n')) atSentenceStart = true
        return token
      }

      const parts = WORD_PARTS.exec(token)
      const lead = parts?.[1] ?? ''
      const core = parts?.[2] ?? token
      const trail = parts?.[3] ?? ''
      const lower = core.toLowerCase()

      let word: string
      if (/\d/.test(core)) word = core
      else if (ACRONYMS[lower] !== undefined) word = ACRONYMS[lower]
      else if (keep.has(lower)) word = keep.get(lower) ?? lower
      else word = atSentenceStart ? capitalize(lower) : lower

      atSentenceStart = SENTENCE_END.test(token)
      return `${lead}${word}${trail}`
    })
    .join('')
}
