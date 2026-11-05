/**
 * Las notas internas de la ficha (`Product.catalogInternalNotes`) solo se entregan con el permiso de
 * panel `products:notes`. Esta utilidad devuelve una COPIA del valor sin esa clave en ningun nivel
 * (objetos planos y arreglos); no muta el original (p. ej. la cache de tendencias) y deja intactos
 * Date, Decimal y demas instancias.
 */
import type { AccessAssignmentsService } from './access-assignments.service';
import type { AccessContext } from '../acl/acl.service';
import { hasGlobalGrant } from './require-grant';

export const INTERNAL_NOTES_FIELD = 'catalogInternalNotes';
export const INTERNAL_NOTES_ACTION = 'products:notes';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function stripInternalNotes<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripInternalNotes(item)) as unknown as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === INTERNAL_NOTES_FIELD) continue;
    out[key] = stripInternalNotes(item);
  }
  return out as T;
}

/** Quita las notas internas salvo que el usuario tenga la concesion global `products:notes`. */
export async function redactInternalNotes<T>(
  grants: Pick<AccessAssignmentsService, 'grantsForUser'> | undefined,
  ctx: AccessContext | undefined,
  value: T,
): Promise<T> {
  if (await hasGlobalGrant(grants, INTERNAL_NOTES_ACTION, ctx)) return value;
  return stripInternalNotes(value);
}
