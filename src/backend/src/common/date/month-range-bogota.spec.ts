import {
  monthRangeBogota,
  bogotaYearMonth,
  currentMonthRangeBogota,
  periodStartFromString,
} from './month-range-bogota';

describe('monthRangeBogota', () => {
  it('el mes arranca a las 00:00 Bogotá (= 05:00 UTC), no a medianoche UTC', () => {
    const { start, end } = monthRangeBogota(2026, 9);

    expect(start.toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-01T05:00:00.000Z');
  });

  it('un cierre el 31 a las 20:00 hora Bogotá cae en el mes que termina, no en el siguiente', () => {
    // 31 de agosto 20:00 Bogotá == 1 de septiembre 01:00 UTC.
    // Si el rango se calculara con medianoche UTC ya contaría como septiembre.
    const cierre = new Date('2026-09-01T01:00:00.000Z');

    const agosto = monthRangeBogota(2026, 8);
    const septiembre = monthRangeBogota(2026, 9);

    expect(cierre >= agosto.start && cierre < agosto.end).toBe(true);
    expect(cierre >= septiembre.start).toBe(false);
  });

  it('medianoche UTC del día 1 todavía es el mes anterior en Bogotá', () => {
    // 2026-09-01T00:00:00Z = 31 agosto 19:00 Bogotá.
    const t = new Date('2026-09-01T00:00:00.000Z');
    const agosto = monthRangeBogota(2026, 8);
    expect(t < agosto.end).toBe(true);
  });

  it('end es exclusivo: 00:00 Bogotá del día 1 ya pertenece al mes nuevo', () => {
    const septiembre = monthRangeBogota(2026, 9);
    expect(septiembre.start.getTime()).toBe(monthRangeBogota(2026, 8).end.getTime());
  });

  it('cruza de año correctamente (diciembre -> enero)', () => {
    const diciembre = monthRangeBogota(2026, 12);
    expect(diciembre.start.toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(diciembre.end.toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });

  it('rechaza meses fuera de 1..12', () => {
    expect(() => monthRangeBogota(2026, 0)).toThrow(RangeError);
    expect(() => monthRangeBogota(2026, 13)).toThrow(RangeError);
  });
});

describe('bogotaYearMonth', () => {
  it('el 31 a las 20:00 Bogotá reporta el mes que termina', () => {
    // 2026-09-01T01:00:00Z = 31 ago 20:00 Bogotá.
    expect(bogotaYearMonth(new Date('2026-09-01T01:00:00.000Z'))).toEqual({
      year: 2026,
      month: 8,
    });
  });

  it('las 05:00 UTC del día 1 ya son el mes nuevo', () => {
    expect(bogotaYearMonth(new Date('2026-09-01T05:00:00.000Z'))).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it('cruce de año: 31 dic 20:00 Bogotá sigue en diciembre pese a ser 1 ene UTC', () => {
    expect(bogotaYearMonth(new Date('2027-01-01T01:00:00.000Z'))).toEqual({
      year: 2026,
      month: 12,
    });
  });
});

describe('currentMonthRangeBogota', () => {
  it('un instante del 31 a las 20:00 Bogotá resuelve el rango del mes que termina', () => {
    // Mismo caso límite del issue #26, sobre el helper que usará el dashboard.
    const cierre = new Date('2026-09-01T01:00:00.000Z'); // 31 ago 20:00 Bogotá
    const rango = currentMonthRangeBogota(cierre);

    expect(rango.start.toISOString()).toBe('2026-08-01T05:00:00.000Z');
    expect(rango.end.toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(cierre >= rango.start && cierre < rango.end).toBe(true);
  });
});

describe('periodStartFromString', () => {
  it('normaliza YYYY-MM a medianoche UTC del día 1 (columna DATE)', () => {
    expect(periodStartFromString('2026-09').toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('rechaza formatos inválidos', () => {
    expect(() => periodStartFromString('2026/09')).toThrow(RangeError);
    expect(() => periodStartFromString('2026-13')).toThrow(RangeError);
    expect(() => periodStartFromString('09-2026')).toThrow(RangeError);
  });
});
