/**
 * The four branches of Grupo Security. Addresses are as published at
 * https://gruposecurity.co/contacto/ (verified 2026-11-03). Opening hours and
 * phone numbers are NOT published there: they were taken from each branch's
 * public Google Maps listing on 2026-11-04 and are not confirmed by the
 * business. Armenia's
 * listing showed a second, contradictory table (8 a. m.-5 p. m. without lunch
 * break); the main table, with the lunch break, was used. `phone` is each
 * branch's own line (10 digits, no country code); the sales WhatsApp lives in
 * constants/contact.ts and is a different thing.
 */
export interface BranchHours {
  /** Days in simple words, e.g. "Lun a vie". */
  days: string
  /** Hours or "Cerrado", e.g. "8 a. m.–12 p. m. y 1:30–5 p. m.". */
  hours: string
}

export interface Branch {
  city: string
  /** Address exactly as the contact page of the current site shows it. */
  address: string
  /** Optional phone of the branch, 10 digits without country code. */
  phone?: string
  /** Optional opening hours, one row per day group. */
  schedule?: BranchHours[]
}

export const BRANCHES: Branch[] = [
  {
    city: 'Pereira',
    address: 'Calle 16 #5-38 Pereira, Risaralda',
    phone: '3160275100',
    schedule: [{ days: 'Lun a vie', hours: '8:30 a. m.–5 p. m.' }, { days: 'Sáb', hours: '8:30 a. m.–12 p. m.' }, { days: 'Dom', hours: 'Cerrado' }],
  },
  {
    city: 'Armenia',
    address: 'Calle 22 #14-02, Armenia, Quindío',
    phone: '3107086360',
    schedule: [{ days: 'Lun a vie', hours: '8 a. m.–12 p. m. y 1:30–5 p. m.' }, { days: 'Sáb', hours: '8:30 a. m.–12 p. m.' }, { days: 'Dom', hours: 'Cerrado' }],
  },
  {
    city: 'Manizales',
    address: 'Cra. 25 # 68-63 Palermo Manizales, Caldas',
    phone: '3107084994',
    schedule: [{ days: 'Lun a vie', hours: '8 a. m.–12:30 p. m. y 2–5 p. m.' }, { days: 'Sáb', hours: '8:30 a. m.–12 p. m.' }, { days: 'Dom', hours: 'Cerrado' }],
  },
  {
    city: 'Cali',
    address: 'Cra. 8 #18-2, Centro, Cali, Valle del Cauca',
    phone: '3173653489',
    schedule: [{ days: 'Lun a vie', hours: '8:30 a. m.–12 p. m. y 1–5 p. m.' }, { days: 'Sáb', hours: '8:30 a. m.–12:30 p. m.' }, { days: 'Dom', hours: 'Cerrado' }],
  },
]

/** Readable phone, e.g. "316 027 5100". */
export function formatBranchPhone(phone: string): string {
  return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`
}

/** `tel:` link with the Colombian country code. */
export function branchPhoneHref(phone: string): string {
  return `tel:+57${phone}`
}

/** Google Maps search link for the branch address. */
export function branchDirectionsUrl(branch: Branch): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Grupo Security ${branch.address}`)}`
}
