/**
 * IMP-07B (07B) — núcleo puro del perfil de proveedor (contrato IMP-07 §4).
 */
import {
  profileMatchesHeaders,
  profileStructureChanged,
  resolveExternalReferences,
  validateProviderProfile,
  type NormalizedProviderProfile,
  type ProviderProfileInput,
} from './provider-profile';

const base: ProviderProfileInput = {
  providerName: 'Hikvision',
  sheet: 'PRECIOS',
  headerRow: 1,
  thousandsSeparator: '.',
  decimalSeparator: ',',
  currency: 'COP',
  tariffs: ['DPP_ORO_IVA', 'INSTALADOR_IVA'],
  expectedColumns: ['REFERENCIA', 'DPP_ORO_IVA', 'INSTALADOR_IVA'],
};

describe('validateProviderProfile (07B)', () => {
  it('normaliza: tarifas en orden canónico, moneda COP', () => {
    const result = validateProviderProfile({ ...base, tariffs: ['INSTALADOR_IVA', 'DPP_ORO_IVA'] });
    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({
      providerName: 'Hikvision',
      currency: 'COP',
      tariffs: ['INSTALADOR_IVA', 'DPP_ORO_IVA'], // orden PRICE_IMPORT_TARIFFS
      thousandsSeparator: '.',
      decimalSeparator: ',',
    });
  });

  it('recoge TODOS los errores a la vez', () => {
    const result = validateProviderProfile({
      providerName: '',
      sheet: '',
      headerRow: 0,
      thousandsSeparator: ',',
      decimalSeparator: ',',
      currency: 'USD',
      tariffs: ['FANTASMA_IVA'],
      expectedColumns: [],
    });
    expect(result.value).toBeNull();
    expect(result.errors.length).toBeGreaterThanOrEqual(6);
    expect(result.errors.join(' ')).toMatch(/proveedor|hoja|encabezado|separador|COP|tarifa/i);
  });

  it('rechaza separador de miles igual al decimal', () => {
    const result = validateProviderProfile({ ...base, thousandsSeparator: ',', decimalSeparator: ',' });
    expect(result.errors.join(' ')).toMatch(/no pueden ser el mismo/i);
  });

  it('rechaza encabezado vacío (huella necesaria para detectar cambios)', () => {
    const result = validateProviderProfile({ ...base, expectedColumns: ['  '] });
    expect(result.errors.join(' ')).toMatch(/encabezado esperado/i);
  });
});

describe('profileMatchesHeaders (07B) — detección de cambio de estructura', () => {
  it('coincide ignorando mayúsculas y espacios sobrantes', () => {
    expect(profileMatchesHeaders({ expectedColumns: ['referencia', 'DPP_ORO_IVA'] }, ['  Referencia ', 'dpp_oro_iva'])).toBe(true);
  });

  it('NO coincide si cambia el nombre, el orden o el número de columnas', () => {
    expect(profileMatchesHeaders({ expectedColumns: ['REFERENCIA', 'DPP_ORO_IVA'] }, ['REFERENCIA', 'ORO_DPP'])).toBe(false);
    expect(profileMatchesHeaders({ expectedColumns: ['REFERENCIA', 'DPP_ORO_IVA'] }, ['DPP_ORO_IVA', 'REFERENCIA'])).toBe(false);
    expect(profileMatchesHeaders({ expectedColumns: ['REFERENCIA', 'DPP_ORO_IVA'] }, ['REFERENCIA'])).toBe(false);
  });
});

describe('profileStructureChanged (07B)', () => {
  const current: NormalizedProviderProfile = {
    providerName: 'Hikvision', sheet: 'PRECIOS', headerRow: 1,
    thousandsSeparator: '.', decimalSeparator: ',', currency: 'COP',
    tariffs: ['INSTALADOR_IVA', 'DPP_ORO_IVA'], expectedColumns: ['REFERENCIA', 'DPP_ORO_IVA'],
  };

  it('sin cambios estructurales → false (no sube versión)', () => {
    expect(profileStructureChanged(current, { ...base, tariffs: ['DPP_ORO_IVA', 'INSTALADOR_IVA'], expectedColumns: ['referencia', 'dpp_oro_iva'] })).toBe(false);
  });

  it('un cambio de encabezado/fila/tarifas → true (exige revisión)', () => {
    expect(profileStructureChanged(current, { ...base, expectedColumns: ['REFERENCIA', 'ORO_DPP'] })).toBe(true);
    expect(profileStructureChanged(current, { ...base, headerRow: 3 })).toBe(true);
    expect(profileStructureChanged(current, { ...base, tariffs: ['DPP_ORO_IVA'] })).toBe(true);
  });
});

describe('resolveExternalReferences (07B) — referencia ambigua queda pendiente', () => {
  it('resuelve por equivalencia y deja pendiente lo desconocido', () => {
    const result = resolveExternalReferences(
      [{ externalRef: 'DS-2CD', productId: 'p-1' }],
      ['DS-2CD', 'DESCONOCIDA'],
    );
    expect(result).toEqual([
      { externalRef: 'DS-2CD', productId: 'p-1', status: 'resolved' },
      { externalRef: 'DESCONOCIDA', productId: null, status: 'pending' },
    ]);
  });

  it('ignora espacios y no resuelve referencias vacías', () => {
    const result = resolveExternalReferences([{ externalRef: ' DS-2CD ', productId: 'p-1' }], ['DS-2CD', '   ']);
    expect(result[0]).toMatchObject({ productId: 'p-1', status: 'resolved' });
    expect(result[1]).toMatchObject({ productId: null, status: 'pending' });
  });
});
