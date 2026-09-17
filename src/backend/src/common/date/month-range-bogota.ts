/**
 * Rango de mes calendario en America/Bogota como fechas UTC.
 *
 * America/Bogota es UTC-5 permanente (Colombia no tiene horario de verano),
 * así que el mes de las N horas entre las 00:00 y las 05:00 UTC del día 1 de
 * cada mes sigue perteneciendo al mes anterior: un cierre el día 31 a las
 * 20:00 hora Bogotá (= 01:00 UTC del día 1 del mes siguiente) debe contar en
 * el mes que termina, no en el que arranca. Calcular "este mes" con
 * `new Date().getMonth()` (que usa la zona del servidor) o con medianoche UTC
 * pierde exactamente esas 5 horas — el error que este helper existe para
 * evitar. Toda lógica de "mes actual" / "mes X" del backend debe pasar por
 * aquí (ver issue #26: metas comerciales, facturado del mes).
 *
 * Convención: `start` es INCLUSIVO y `end` es EXCLUSIVO (primer instante del
 * mes siguiente), pensado para `>= start AND < end` en queries.
 */

export interface MonthRange {
  /** Primer instante del mes en America/Bogota (inclusivo). */
  start: Date;
  /** Primer instante del mes siguiente en America/Bogota (exclusivo). */
  end: Date;
}

/** Offset fijo de America/Bogota respecto a UTC, en milisegundos (UTC-5, sin DST). */
export const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Rango del mes calendario (1..12) de `year` en America/Bogota.
 *
 * El inicio en hora local = medianoche Bogotá del día 1 = 05:00 UTC, y se
 * representa como `Date.UTC(year, month - 1, 1, 5)`; lo mismo para el fin.
 */
export function monthRangeBogota(year: number, month: number): MonthRange {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month debe ser un entero entre 1 y 12, recibido: ${month}`);
  }
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 5, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 1, 5, 0, 0, 0)),
  };
}

/**
 * Año y mes (1-12) en America/Bogota en los que cae un instante dado.
 * Útil para decidir "el mes actual" en Bogotá sin importar la zona del server:
 * la hora local Bogotá = UTC - 5h, así que se restan 5h al instante y se leen
 * año/mes en UTC.
 */
export function bogotaYearMonth(at: Date = new Date()): {
  year: number;
  month: number;
} {
  const shifted = new Date(at.getTime() - BOGOTA_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

/**
 * Rango del mes calendario en America/Bogota que contiene a `at` (por defecto,
 * ahora). Equivale a `monthRangeBogota(...bogotaYearMonth(at))`.
 */
export function currentMonthRangeBogota(at: Date = new Date()): MonthRange {
  const { year, month } = bogotaYearMonth(at);
  return monthRangeBogota(year, month);
}

/**
 * Fecha "día 1 del mes" para persistir `SalesTarget.period` (@db.Date) a
 * partir de un string `YYYY-MM`. Se guarda como medianoche UTC del día 1: la
 * columna es DATE (sin componente horaria), así que lo relevante es la fecha
 * calendario, no el instante.
 */
export function periodStartFromString(period: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) {
    throw new RangeError(
      `period debe tener formato YYYY-MM, recibido: ${period}`,
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new RangeError(`period con mes inválido: ${period}`);
  }
  return new Date(Date.UTC(year, month - 1, 1));
}
