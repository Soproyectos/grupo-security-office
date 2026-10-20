import { describe, expect, it } from 'vitest'
import { formatCop } from './formatCop'

describe('formatCop', () => {
  it('agrupa los miles con punto y antepone el signo de pesos', () => {
    expect(formatCop(118259)).toBe('$ 118.259')
    expect(formatCop(219500000)).toBe('$ 219.500.000')
  })

  it('agrupa también los números de cuatro cifras', () => {
    expect(formatCop(4524)).toBe('$ 4.524')
  })

  it('redondea a pesos enteros, sin decimales', () => {
    expect(formatCop(118258.8)).toBe('$ 118.259')
    expect(formatCop(999.4)).toBe('$ 999')
    expect(formatCop(999.5)).toBe('$ 1.000')
  })

  it('no agrega separador por debajo de mil y soporta el cero', () => {
    expect(formatCop(0)).toBe('$ 0')
    expect(formatCop(850)).toBe('$ 850')
  })
})
