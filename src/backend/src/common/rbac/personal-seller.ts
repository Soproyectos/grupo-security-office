import { ROLE } from './roles.constants';

/** A seller's own portfolio never expands through supervisorId alone. */
export function isPersonalSeller(roles: readonly string[]): boolean {
  return roles.includes(ROLE.VENDEDOR) &&
    ![ROLE.SUPER_ADMIN, ROLE.ADMIN_COMERCIAL, ROLE.SUPERVISOR].some(role => roles.includes(role));
}
