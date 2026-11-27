import type { PortalAccount } from '../types/customer-portal.types'

export const PENDING_ACCOUNT_MESSAGE = 'Tu cuenta está en revisión. Un asesor te contactará pronto.'
export const SETTING_UP_MESSAGE = 'Tu asesor está terminando de configurar tu cuenta'

/** What the person can do with quotes right now. The server decides; this only explains. */
export function quoteAccess(account: Pick<PortalAccount, 'state' | 'canQuote'>): 'pending' | 'setting-up' | 'ready' {
  if (account.state === 'PENDING') return 'pending'
  if (account.state === 'ACTIVE' && account.canQuote === false) return 'setting-up'
  return 'ready'
}

