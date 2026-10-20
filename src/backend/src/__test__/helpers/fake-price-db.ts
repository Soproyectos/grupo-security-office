/**
 * Mini evaluador de filtros Prisma para pruebas de precios públicos.
 *
 * Un `price.findMany` mockeado con `mockResolvedValue` devuelve lo que se le
 * diga sin importar el `where`, así que no puede probar que una lista interna,
 * una lista inactiva o un precio vencido queden fuera. Este helper interpreta
 * el `where` real del servicio sobre una BD falsa con varias listas (incluidas
 * las internas) y devuelve solo lo que el filtro deja pasar, proyectado con el
 * `select` recibido. Cualquier operador no soportado lanza un error, para que
 * un cambio del `where` nunca pase en silencio.
 */
export interface FakePriceRow {
  productId: string;
  value: number | string | { toString(): string; valueOf(): string };
  currency?: string;
  validFrom?: Date | null;
  validUntil?: Date | null;
  list: {
    code: string;
    isActive?: boolean;
    validFrom?: Date | null;
    validUntil?: Date | null;
  };
}

function matches(target: any, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as any[]).every((c) => matches(target, c));
    if (key === 'OR') return (cond as any[]).some((c) => matches(target, c));

    const value = target[key];
    if (cond === null) return value === null || value === undefined;
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (typeof cond !== 'object') return value === cond;

    const operators = Object.keys(cond);
    if (operators.length === 1 && operators[0] === 'in') return (cond.in as any[]).includes(value);
    if (operators.length === 1 && operators[0] === 'lte') return value != null && value <= cond.lte;
    if (operators.length === 1 && operators[0] === 'gte') return value != null && value >= cond.gte;
    if (operators.some((op) => ['in', 'lte', 'gte', 'lt', 'gt', 'not', 'contains', 'equals'].includes(op))) {
      throw new Error(`Operador de filtro no soportado por FakePriceDb: ${operators.join(',')}`);
    }
    // Relación 1:1 anidada (p. ej. priceList).
    return value != null && matches(value, cond);
  });
}

/** Devuelve una implementación de `prisma.price.findMany` sobre las filas dadas. */
export function fakePriceFindMany(rows: FakePriceRow[]) {
  return async (args: { where: Record<string, any>; select?: Record<string, boolean> }) => {
    const table = rows.map((row) => ({
      productId: row.productId,
      value: row.value,
      currency: row.currency ?? 'COP',
      validFrom: row.validFrom ?? null,
      validUntil: row.validUntil ?? null,
      priceList: {
        code: row.list.code,
        isActive: row.list.isActive ?? true,
        validFrom: row.list.validFrom ?? null,
        validUntil: row.list.validUntil ?? null,
      },
    }));
    const selected = table.filter((row) => matches(row, args.where));
    if (!args.select) return selected;
    const keys = Object.keys(args.select).filter((key) => args.select![key]);
    return selected.map((row) => Object.fromEntries(keys.map((key) => [key, (row as any)[key]])));
  };
}
