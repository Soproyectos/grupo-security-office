import { describe, expect, it } from 'vitest'
import { passwordLevel } from './PasswordStrengthMeter'

describe('passwordLevel', () => {
  it('has no level while empty', () => {
    expect(passwordLevel('')).toBeNull()
  })
  it('is weak for a short word', () => {
    expect(passwordLevel('abc')?.label).toBe('Débil')
  })
  it('is medium when some rules are missing', () => {
    expect(passwordLevel('camararojapuerta')?.label).toBe('Media')
  })
  it('is strong only when every rule is met', () => {
    expect(passwordLevel('Camara-Roja-Puerta-2026!')?.label).toBe('Fuerte')
  })
})
