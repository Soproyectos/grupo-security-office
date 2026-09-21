import { MfaCryptoService, safeCompare } from './mfa-crypto.service';

// ---------------------------------------------------------------------------
// Escenarios cubiertos (S.2 del hardening):
// ✅ Ida y vuelta: lo cifrado se recupera intacto
// ✅ Dos cifrados del mismo texto son distintos (IV aleatorio)
// ✅ Un ciphertext manipulado falla al descifrar (autenticación GCM)
// ✅ Falta la clave → el módulo no arranca
// ✅ safeCompare distingue correctamente
// ---------------------------------------------------------------------------

const KEY = Buffer.alloc(32, 7).toString('base64');

function buildService(key?: string): MfaCryptoService {
  const config = { get: jest.fn().mockReturnValue(key) } as any;
  const service = new MfaCryptoService(config);
  service.onModuleInit();
  return service;
}

describe('MfaCryptoService', () => {
  it('recupera intacto el secreto cifrado', () => {
    const service = buildService(KEY);
    const secret = 'JBSWY3DPEHPK3PXP';

    expect(service.decrypt(service.encrypt(secret))).toBe(secret);
  });

  /**
   * Cada cifrado usa un IV aleatorio. Si dos secretos iguales produjeran el
   * mismo ciphertext, leer la tabla revelaría qué usuarios comparten secreto.
   */
  it('produce ciphertext distinto para el mismo texto', () => {
    const service = buildService(KEY);

    expect(service.encrypt('mismo')).not.toBe(service.encrypt('mismo'));
  });

  /**
   * GCM autentica además de cifrar: un secreto manipulado en la base de datos
   * falla al descifrar en vez de producir códigos silenciosamente incorrectos,
   * que serían mucho más difíciles de diagnosticar.
   */
  it('rechaza un ciphertext manipulado', () => {
    const service = buildService(KEY);
    const [iv, tag, data] = service.encrypt('secreto').split(':');

    const corrupted = Buffer.from(data, 'base64');
    corrupted[0] ^= 0xff;

    expect(() =>
      service.decrypt([iv, tag, corrupted.toString('base64')].join(':')),
    ).toThrow();
  });

  it('rechaza un payload con formato inválido', () => {
    const service = buildService(KEY);

    expect(() => service.decrypt('solo-una-parte')).toThrow(
      'Secreto MFA con formato inválido',
    );
  });

  /**
   * Sin clave, cifrar sería imposible y guardar el secreto en claro convertiría
   * el segundo factor en un adorno frente a una filtración de BD. Se falla al
   * arrancar, no en tiempo de uso.
   */
  it('no arranca sin MFA_ENCRYPTION_KEY', () => {
    expect(() => buildService(undefined)).toThrow(/MFA_ENCRYPTION_KEY/);
  });

  it('deriva una clave válida de una cadena que no sea base64 de 32 bytes', () => {
    const service = buildService('una-frase-larga-de-configuracion-cualquiera');

    expect(service.decrypt(service.encrypt('x'))).toBe('x');
  });
});

describe('safeCompare', () => {
  it('reconoce cadenas iguales', () => {
    expect(safeCompare('123456', '123456')).toBe(true);
  });

  it('distingue cadenas diferentes de igual longitud', () => {
    expect(safeCompare('123456', '654321')).toBe(false);
  });

  it('distingue cadenas de distinta longitud sin lanzar', () => {
    expect(safeCompare('123456', '1234')).toBe(false);
  });
});
