import { detectKind, declaredMatchesDetected, sha256Hex } from './file-signature';

describe('detectKind (CAT-04 G1: tipo REAL por firma mágica)', () => {
  it('reconoce PNG, JPEG, GIF, WEBP por sus cabeceras', () => {
    expect(detectKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('IMAGE');
    expect(detectKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe('IMAGE');
    expect(detectKind(Buffer.from('GIF89a....', 'latin1'))).toBe('IMAGE');
    const webp = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBPVP8 ', 'latin1')]);
    expect(detectKind(webp)).toBe('IMAGE');
  });

  it('reconoce PDF y ZIP', () => {
    expect(detectKind(Buffer.from('%PDF-1.7 ...', 'latin1'))).toBe('PDF');
    expect(detectKind(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBe('ZIP');
  });

  it('UNKNOWN para basura o entrada corta (nunca se sube)', () => {
    expect(detectKind(Buffer.from('<script>alert(1)</script>'))).toBe('UNKNOWN');
    expect(detectKind(Buffer.alloc(2))).toBe('UNKNOWN');
    expect(detectKind(Buffer.alloc(0))).toBe('UNKNOWN');
  });
});

describe('declaredMatchesDetected (anti-falsificación de MIME)', () => {
  it('acepta parejas coherentes', () => {
    expect(declaredMatchesDetected('image/png', 'IMAGE')).toBe(true);
    expect(declaredMatchesDetected('image/jpeg', 'IMAGE')).toBe(true);
    expect(declaredMatchesDetected('application/pdf', 'PDF')).toBe(true);
    expect(declaredMatchesDetected('application/zip', 'ZIP')).toBe(true);
  });

  it('rechaza el resto — incluido UNKNOWN', () => {
    expect(declaredMatchesDetected('application/pdf', 'IMAGE')).toBe(false);
    expect(declaredMatchesDetected('image/png', 'PDF')).toBe(false);
    expect(declaredMatchesDetected('image/png', 'UNKNOWN')).toBe(false);
    expect(declaredMatchesDetected('', 'UNKNOWN')).toBe(false);
  });
});

describe('sha256Hex', () => {
  it('es estable y hex lowercase de 64', () => {
    const a = sha256Hex(Buffer.from('grupo-security'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(sha256Hex(Buffer.from('grupo-security')));
    expect(a).not.toBe(sha256Hex(Buffer.from('grupo-security!')));
  });
});
