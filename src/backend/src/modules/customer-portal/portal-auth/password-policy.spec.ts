import { validatePortalPassword, weakPasswordMessage } from './password-policy';

const GOOD = 'Tr0ub4dor&Zebra!x';

describe('validatePortalPassword', () => {
  it('accepts a password that meets every rule', () => {
    expect(validatePortalPassword(GOOD, { email: 'ana.perez@acme.co', name: 'Ana Perez' })).toEqual([]);
  });
  it('rejects shorter than 12 and longer than 128', () => {
    expect(validatePortalPassword('Aa1!aaaaaaa')).toContain('LENGTH');
    expect(validatePortalPassword(`Aa1!${'b'.repeat(125)}`)).toContain('LENGTH');
    expect(validatePortalPassword(`Aa1!${'bcd'.repeat(41)}`.slice(0, 128))).not.toContain('LENGTH');
  });
  it('requires lowercase, uppercase, number and symbol', () => {
    expect(validatePortalPassword('ABCDEFGH1234!')).toContain('LOWERCASE');
    expect(validatePortalPassword('abcdefgh1234!')).toContain('UPPERCASE');
    expect(validatePortalPassword('Abcdefghijkl!')).toContain('NUMBER');
    expect(validatePortalPassword('Abcdefghijk12')).toContain('SYMBOL');
  });
  it('rejects the email local part (case-insensitive, >= 4 chars)', () => {
    expect(validatePortalPassword('xxMariaGomez9!xx', { email: 'MariaGomez@acme.co' })).toContain('NO_EMAIL');
    // local part shorter than 4 characters is ignored
    expect(validatePortalPassword(GOOD + 'abc', { email: 'abc@acme.co' })).not.toContain('NO_EMAIL');
  });
  it('rejects name words of >= 4 characters, ignoring case', () => {
    expect(validatePortalPassword('Xx-JULIANA-7q!zz', { name: 'Juliana Rojas' })).toContain('NO_NAME');
    expect(validatePortalPassword('Xx-Ana-Li-7q!zz1', { name: 'Ana Li' })).not.toContain('NO_NAME');
  });
  it('rejects 4 identical characters in a row', () => {
    expect(validatePortalPassword('Abcd1!aaaaXyzw')).toContain('NO_REPEATS');
    expect(validatePortalPassword('Abcd1!aaaXyzw9')).not.toContain('NO_REPEATS');
  });
  it('without identity only shape rules apply', () => {
    expect(validatePortalPassword(GOOD)).toEqual([]);
  });
  it('builds a Spanish message listing the failed rules', () => {
    const msg = weakPasswordMessage(['LENGTH', 'SYMBOL']);
    expect(msg).toContain('La contraseña no cumple los requisitos');
    expect(msg).toContain('12 y 128');
    expect(msg).toContain('símbolo');
  });
});
