/**
 * Búsqueda de productos por texto (Biblioteca y catálogo público).
 *
 * Reglas (en orden de relevancia, `rank` menor = mejor):
 *   0  coincidencia exacta   → SKU, modelo, nombre, nombre de catálogo o referencia de fabricante
 *   1  empieza por el texto  → SKU, modelo, referencia (y nombres), sin distinguir mayúsculas
 *   2  contiene el texto     → SKU, modelo, referencia, nombres (y descripción si NO parece código)
 *   3  difusa (pg_trgm)      → solo si el texto no parece un código, o si un código no tuvo ninguna coincidencia
 *
 * "Parece un código" = trae guion, dígito, `/` o paréntesis (`DS-PW`, `2CD2047`, `DS-2CD2047G3-LI2UY/S(L)(RB)`).
 * Para un código la búsqueda es literal: nada de ruido difuso mientras haya coincidencias.
 *
 * `catalogManufacturerRefs` guarda los SKU de duplicados borrados: buscarlos lleva al producto que se conservó.
 *
 * Todo valor externo viaja como parámetro; el SQL generado aquí solo contiene texto fijo.
 * Sin LIKE: se usa `starts_with`/`POSITION`, así `%` y `_` en el texto no actúan como comodín.
 */

export const SEARCH_RANK = { exact: 0, prefix: 1, contains: 2, fuzzy: 3 } as const;

/** ¿El texto parece un SKU/modelo (guion, dígito, barra o paréntesis)? */
export function looksLikeCode(term: string): boolean {
  return /[-\d/()]/.test(term);
}

export interface ProductSearchSqlOptions {
  /** Parámetro posicional con el texto buscado, p. ej. `$1`. */
  param?: string;
  /** Alias de la tabla `products`. */
  alias?: string;
  /** `true` si el texto parece un código: la descripción no cuenta y no hay difusa mientras haya coincidencias. */
  codeLike: boolean;
  /**
   * Expresiones SQL de cada campo cuando no se lee la columna viva tal cual (p. ej. el catálogo público lee
   * el snapshot publicado: `COALESCE(r.content->>'sku', p.sku)`). `description: null` la excluye siempre.
   */
  columns?: Partial<Record<'sku' | 'model' | 'name' | 'catalogName' | 'description' | 'refs', string | null>>;
}

export interface ProductSearchSql {
  exact: string;
  prefix: string;
  contains: string;
  /** exact OR prefix OR contains: la parte literal, sin pg_trgm. */
  literal: string;
  /** Expresión CASE con el rank 0..2 de lo literal; 3 para el resto (difusa). */
  rank: string;
}

const ALNUM = `'[^A-Z0-9]'`;

export function buildProductSearchSql(opts: ProductSearchSqlOptions): ProductSearchSql {
  const t = opts.param ?? '$1';
  const a = opts.alias ?? 'p';
  const col = {
    sku: opts.columns?.sku ?? `${a}."sku"`,
    model: opts.columns?.model ?? `${a}."catalogModel"`,
    name: opts.columns?.name ?? `${a}."name"`,
    catalogName: opts.columns?.catalogName ?? `${a}."catalogName"`,
    description: opts.columns?.description === undefined ? `${a}."description"` : opts.columns.description,
    refs: opts.columns?.refs ?? `${a}."catalogManufacturerRefs"`,
  };
  const normTerm = `NULLIF(regexp_replace(upper(${t}), ${ALNUM}, '', 'g'), '')`;
  const lower = (expr: string) => `LOWER(COALESCE(${expr}, ''))`;
  const norm = (expr: string) => `regexp_replace(upper(COALESCE(${expr}, '')), ${ALNUM}, '', 'g')`;

  type Kind = 'exact' | 'prefix' | 'contains';
  const literal = (kind: Kind, expr: string) =>
    kind === 'exact' ? `${lower(expr)} = LOWER(${t})`
      : kind === 'prefix' ? `starts_with(${lower(expr)}, LOWER(${t}))`
        : `POSITION(LOWER(${t}) IN ${lower(expr)}) > 0`;
  // Los identificadores también se comparan sin puntuación: `DS2CD2047G3` encuentra `DS-2CD2047G3-LI2UY/S(L)`.
  const normalized = (kind: Kind, expr: string) =>
    kind === 'exact' ? `${norm(expr)} = ${normTerm}`
      : kind === 'prefix' ? `starts_with(${norm(expr)}, ${normTerm})`
        : `POSITION(${normTerm} IN ${norm(expr)}) > 0`;
  const identifier = (kind: Kind, expr: string) => `(${literal(kind, expr)} OR ${normalized(kind, expr)})`;
  const refs = (kind: Kind) =>
    `EXISTS (SELECT 1 FROM unnest(COALESCE(${col.refs}, ARRAY[]::text[])) AS mref(v) WHERE ${identifier(kind, 'mref.v')})`;

  const tier = (kind: Kind) => {
    const parts = [
      identifier(kind, col.sku),
      identifier(kind, col.model),
      refs(kind),
      literal(kind, col.name),
      literal(kind, col.catalogName),
    ];
    if (kind === 'contains' && !opts.codeLike && col.description) parts.push(literal(kind, col.description));
    return `(${parts.join(' OR ')})`;
  };

  const exact = tier('exact');
  const prefix = tier('prefix');
  const contains = tier('contains');
  return {
    exact,
    prefix,
    contains,
    literal: `(${exact} OR ${prefix} OR ${contains})`,
    rank: `CASE WHEN ${exact} THEN ${SEARCH_RANK.exact} WHEN ${prefix} THEN ${SEARCH_RANK.prefix} WHEN ${contains} THEN ${SEARCH_RANK.contains} ELSE ${SEARCH_RANK.fuzzy} END`,
  };
}
