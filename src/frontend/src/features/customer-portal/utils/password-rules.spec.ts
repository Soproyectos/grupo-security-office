import { describe, expect, it } from 'vitest'
import { evaluatePassword, isPasswordValid, type PasswordContext } from './password-rules'

const failedIds = (password: string, context: PasswordContext = {}) => evaluatePassword(password, context).filter((rule) => !rule.met).map((rule) => rule.id)

describe('password-rules', () => {
  it('acepta una clave que cumple todo', () => {
    expect(isPasswordValid('Cielo-Azul-2048!', { email: 'ana@example.com', name: 'Ana Pérez' })).toBe(true)
  })
  it('exige entre 12 y 128 caracteres', () => {
    expect(failedIds('Aa1!aaaaaaa')).toContain('length')
    expect(failedIds('Aa1!aaaaaaaX')).not.toContain('length')
    expect(failedIds(`Aa1!${'b'.repeat(125)}`)).toContain('length')
  })
  it('exige minúscula, mayúscula, número y símbolo', () => {
    expect(failedIds('ABCDEFGH1234!?')).toContain('lower')
    expect(failedIds('abcdefgh1234!?')).toContain('upper')
    expect(failedIds('Abcdefghijkl!?')).toContain('number')
    expect(failedIds('Abcdefghij1234')).toContain('symbol')
  })
  it('rechaza la parte del correo antes de @ si tiene 4 letras o más', () => {
    expect(failedIds('Xx-maria-9876!', { email: 'maria@example.com' })).toContain('personal')
    expect(failedIds('Xx-ana-98765!zz', { email: 'ana@example.com' })).not.toContain('personal')
  })
  it('rechaza palabras del nombre de 4 letras o más', () => {
    expect(failedIds('Pérez-2048-xyz!', { name: 'Ana Pérez' })).toContain('personal')
    expect(failedIds('Cielo-2048-xyz!', { name: 'Ana Li' })).not.toContain('personal')
  })
  it('rechaza 4 caracteres iguales seguidos', () => {
    expect(failedIds('Abcd1111-efgh!')).toContain('repeat')
    expect(failedIds('Abcd111-efgh!x')).not.toContain('repeat')
  })
  it('con la clave vacía todo está pendiente', () => {
    expect(evaluatePassword('').every((rule) => !rule.met)).toBe(true)
  })
})
