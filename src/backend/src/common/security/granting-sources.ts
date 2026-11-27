import type { Prisma } from '@prisma/client';
import { LIBRARY_SELECTION_TEMPLATE_ID } from './library-selection';

/**
 * Which access sources grant access.
 *
 * The old "work packages" no longer exist: the Super Admin assigns every
 * action one by one. Rows that an old package left in `AccessSource` /
 * `AccessGrant` are NOT deleted (no data migration), but they must never grant
 * anything again, so every place that reads the effective grants of a user
 * filters with this condition. Only two kinds of source count:
 *
 * - `manual`: the actions the Super Admin ticked in "Asignar paneles".
 * - the Library checkbox selection (`template` + `biblioteca-seleccion`): it is
 *   also a direct, action-by-action choice of the Super Admin, not a package.
 *
 * Any other `template` source is a leftover of a removed package and is
 * ignored. `scripts/purge-package-access-sources.mjs` can delete them for good.
 */
export const GRANTING_SOURCE_WHERE = {
  OR: [
    { kind: 'manual' },
    { kind: 'template', templateId: LIBRARY_SELECTION_TEMPLATE_ID },
  ],
} satisfies Prisma.AccessSourceWhereInput;

/** In-memory twin of {@link GRANTING_SOURCE_WHERE}. */
export function isGrantingSource(
  source: { kind: string; templateId: string | null } | null | undefined,
): boolean {
  if (!source) return false;
  return source.kind === 'manual'
    || (source.kind === 'template' && source.templateId === LIBRARY_SELECTION_TEMPLATE_ID);
}
