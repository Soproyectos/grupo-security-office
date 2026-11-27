import raw = require('./co-municipalities.json');

export interface Municipality {
  code: string;
  name: string;
  departmentCode: string;
  department: string;
}

/** DIVIPOLA catalog (DANE). The JSON is imported (not read from disk) so the build copies it next to the code. */
const CATALOG = raw as unknown as { source: string; municipalities: Municipality[] };
const BY_CODE: ReadonlyMap<string, Municipality> = new Map(CATALOG.municipalities.map((m) => [m.code, m]));

/** True when `code` is a 5-digit DIVIPOLA municipality code that exists in the catalog. */
export function isValidCity(code: unknown): code is string {
  return typeof code === 'string' && BY_CODE.has(code);
}

export function findMunicipality(code: string | null | undefined): Municipality | null {
  return (code && BY_CODE.get(code)) || null;
}

export function listMunicipalities(): readonly Municipality[] {
  return CATALOG.municipalities;
}

export const CITY_INVALID_MESSAGE = 'Elige tu ciudad de la lista';
