import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BASE_ACCESS_ROLES } from './base-access';

/**
 * Paridad de roles internos: la lista del backend (`base-access.ts`) debe ser
 * igual a la que el frontend usa para mostrar la agenda propia. El frontend no
 * exporta la constante, así que se lee su texto fuente. Si el archivo no está
 * (p. ej. imagen Docker del backend), la comparación se omite.
 */
const FRONT = resolve(__dirname, '../../../../frontend/src/features/agenda/agenda-access.ts');

describe('BASE_ACCESS_ROLES (backend)', () => {
  it('es exactamente la lista de roles internos acordada', () => {
    expect([...BASE_ACCESS_ROLES]).toEqual(['Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta']);
  });

  (existsSync(FRONT) ? it : it.skip)('coincide con BASE_ACCESS_ROLES de frontend agenda-access.ts', () => {
    const match = /BASE_ACCESS_ROLES\s*=\s*\[([^\]]*)\]/.exec(readFileSync(FRONT, 'utf8'));
    expect(match).not.toBeNull();
    const frontRoles = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(frontRoles).toEqual([...BASE_ACCESS_ROLES]);
  });
});
