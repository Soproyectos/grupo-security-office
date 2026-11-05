import { BadRequestException } from '@nestjs/common';
import { getActionDefinition } from './access-catalog';

/**
 * Selección de casillas de Biblioteca (Productos / Fichas / Precios).
 *
 * Se guarda como UNA fuente `template` por usuario con este id reservado y
 * alcance global. No es un paquete del catálogo (no está en PACKAGE_TEMPLATES):
 * su contenido es la selección guardada.
 */
export const LIBRARY_SELECTION_TEMPLATE_ID = 'biblioteca-seleccion';

/** Acciones que pueden marcarse en las casillas. `products:publish` NO entra: es un complemento aparte. */
export const LIBRARY_SELECTION_ACTION_IDS: readonly string[] = Object.freeze([
  'products:read',
  'prices:read',
  'products:write',
  'products:validate',
  'products:notes',
  'products:delete',
  'prices:preview',
  'prices:save',
  'prices:apply',
  'providers:read',
  'providers:write',
  'imports:read',
  'imports:run',
  'masters:read',
  'masters:write',
  'products:approveSpecs',
]);

const ALLOWED = new Set(LIBRARY_SELECTION_ACTION_IDS);

/**
 * Valida la selección y devuelve su cierre de dependencias (según el catálogo),
 * sin duplicados y en orden estable. Nunca devuelve más que lo marcado más sus
 * dependencias directas o indirectas.
 */
export function closeLibrarySelection(actionIds: readonly string[]): string[] {
  const outside = actionIds.filter((id) => !ALLOWED.has(id));
  if (outside.length) {
    throw new BadRequestException(
      'La selección incluye permisos que no pertenecen a las pestañas de Biblioteca. Publicar en tienda se asigna aparte.',
    );
  }
  const closed = new Set<string>();
  const visit = (id: string): void => {
    if (closed.has(id)) return;
    closed.add(id);
    for (const dependency of getActionDefinition(id)?.dependencies ?? []) visit(dependency);
  };
  actionIds.forEach(visit);
  return LIBRARY_SELECTION_ACTION_IDS.filter((id) => closed.has(id));
}
