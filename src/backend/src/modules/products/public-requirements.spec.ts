import {
  buildPublicRequirementFacets,
  buildPublicRequirementFacetsResult,
  parseRequirementFilter,
  productMatchesRequirements,
  validateRequirementFilters,
  type RequirementProduct,
} from './public-requirements';
import { applyRevisionLens, applySheetSnapshot } from './public-revision-lens';

describe('public requirement facets', () => {
  it('uses the published snapshot and respects explicitly empty published groups', () => {
    const live = {
      id: 'product', categorySlug: 'camaras', publicRevisionId: 'revision',
      technicalSpecs: [{ key: 'Resolución', value: '8 MP' }],
      catalogSpecGroups: [{ title: 'Imagen', items: [{ label: 'Lente', value: 'Dato de borrador' }] }],
    };
    const contents = new Map<string, Record<string, unknown>>([['revision', {
      technicalSpecs: [{ key: 'Resolución', value: '4 MP' }], catalogSpecGroups: [],
    }]]);
    const published = applySheetSnapshot(applyRevisionLens(live, contents), contents);
    const facets = buildPublicRequirementFacets('camaras', [published]);
    expect(facets.map((facet) => facet.specKey)).toEqual(['resolucion']);
    expect(productMatchesRequirements('camaras', published, ['resolucion:8 MP'])).toBe(false);
    expect(productMatchesRequirements('camaras', published, ['resolucion:4 MP'])).toBe(true);
  });
  it('keeps different measurement units distinct when filtering', () => {
    const mm: RequirementProduct = { id: 'mm', categorySlug: 'camaras', technicalSpecs: [{ key: 'Distancia focal', value: 4, unit: 'mm' }] };
    const cm: RequirementProduct = { id: 'cm', categorySlug: 'camaras', technicalSpecs: [{ key: 'Distancia focal', value: 4, unit: 'cm' }] };
    expect(buildPublicRequirementFacets('camaras', [mm, cm])[0].values).toHaveLength(2);
    expect(productMatchesRequirements('camaras', mm, ['distancia_focal:4 mm'])).toBe(true);
    expect(productMatchesRequirements('camaras', cm, ['distancia_focal:4 mm'])).toBe(false);
  });
  it('uses only allowlisted values supplied by the public snapshot and never infers from names', () => {
    const products: RequirementProduct[] = [{
      id: 'p1',
      categorySlug: 'camaras-ip',
      technicalSpecs: [
        { key: 'Resolución', value: '4 MP', unit: null },
        { key: 'Unknown arbitrary', value: 'invented', unit: null },
      ],
      catalogSpecGroups: [{ title: 'Imagen', items: [{ label: 'Lente', value: '2.8 mm' }] }],
    }];
    const facets = buildPublicRequirementFacets('camaras', products);
    expect(facets.map(({ specKey }) => specKey)).toEqual(['resolucion', 'lente']);
    expect(facets.flatMap((facet) => facet.values.map((entry) => entry.value))).toEqual(['4 MP', '2.8 mm']);
    expect(buildPublicRequirementFacets('otra-familia', [{ id: 'p2', categorySlug: 'otra-familia', technicalSpecs: [{ key: 'Alcance', value: '100 m' }] }])).toEqual([]);
  });

  it('counts a repeated product value once and ignores empty, unknown, and overlong text', () => {
    const product: RequirementProduct = {
      id: 'p1',
      categorySlug: 'camaras',
      technicalSpecs: [
        { key: 'Alcance', value: '50 m' },
        { key: 'Alcance', value: '50 m' },
        { key: 'Lente', value: 'No aplica' },
        { key: 'Resolución', value: 'x'.repeat(121) },
      ],
      catalogSpecGroups: [{ title: 'Distancia', items: [{ label: 'Alcance', value: '50 m' }] }],
    };
    expect(buildPublicRequirementFacets('camaras', [product])).toEqual([{
      specKey: 'alcance', label: 'Alcance', unit: null, dataType: 'TEXT', values: [{ value: '50 m', label: '50 m', count: 1 }],
    }]);
  });

  it('parses exact canonical filters and applies all of them before pagination', () => {
    const product: RequirementProduct = {
      id: 'p1', categorySlug: 'camaras',
      technicalSpecs: [{ key: 'Resolución', value: '4 MP' }, { key: 'Alcance', value: '50:100 m' }],
    };
    expect(parseRequirementFilter('Resolución:4 MP')).toEqual({ specKey: 'resolucion', value: '4 MP' });
    expect(parseRequirementFilter('resolucion: 4 MP')).toBeNull();
    expect(parseRequirementFilter(`alcance:${'x'.repeat(600)}`)).toBeNull();
    expect(productMatchesRequirements('camaras', product, ['resolucion:4 MP', 'alcance:50:100 m'])).toBe(true);
    expect(productMatchesRequirements('camaras', product, ['resolucion:4 MP', 'alcance:50 m'])).toBe(false);
    expect(productMatchesRequirements('otra-familia', product, ['resolucion:4 MP'])).toBe(false);
  });

  it('separa protocolos exactos, cuenta una vez por ficha y conserva el valor publicado anterior', () => {
    const original = 'TCP/IP, HTTP; HTTPS, DHCP, HTTP/HTTPS, IPv4, ONVIF (perfiles S, G)';
    const alarm: RequirementProduct = {
      id: 'a', categorySlug: 'alarmas', technicalSpecs: [
        { key: 'Protocolos', value: original },
        { key: 'Network protocols', value: ['http', 'DHCP'] },
      ],
    };
    const httpOnly: RequirementProduct = {
      id: 'b', categorySlug: 'alarmas',
      catalogSpecGroups: [{ items: [{ label: 'Protocolo', value: 'HTTP' }] }],
    };
    const [facet] = buildPublicRequirementFacets('alarmas', [alarm, httpOnly]);
    expect(facet).toMatchObject({ specKey: 'protocolo', label: 'Protocolos' });
    expect(facet.values.map(({ value, count }) => [value, count])).toEqual([
      ['TCP', 1], ['HTTP', 2], ['HTTPS', 1], ['DHCP', 1], ['IPv4', 1], ['ONVIF', 1],
    ]);
    expect(productMatchesRequirements('alarmas', alarm, ['protocolo:TCP', 'protocolo:HTTPS'])).toBe(true);
    expect(productMatchesRequirements('alarmas', httpOnly, ['protocolo:HTTP', 'protocolo:HTTPS'])).toBe(false);
    expect(productMatchesRequirements('alarmas', alarm, ['protocol:' + original])).toBe(true);
    expect(buildPublicRequirementFacets('camaras', [alarm])[0].specKey).toBe('protocolo');
  });

  it('agrupa zonas por capacidad y combina alternativas con otros requisitos', () => {
    const primary = '48 (8 zonas integradas, máx. 4 PIRCAM cableadas)';
    const alarm: RequirementProduct = {
      id: 'a', categorySlug: 'alarmas',
      technicalSpecs: [{ key: 'Zonas', value: primary }, { key: 'Protocolo', value: 'TCP/IP, HTTPS' }],
    };
    const variants: RequirementProduct[] = [
      alarm, { id: 'b', categorySlug: 'alarmas', technicalSpecs: [{ key: 'Numero de zonas', value: 'hasta 48 zonas' }] },
      { id: 'c', categorySlug: 'alarmas', technicalSpecs: [{ key: 'zone_count', value: 64, unit: 'zonas' }] },
    ];
    const zones = buildPublicRequirementFacets('alarmas', variants).find(facet => facet.specKey === 'zonas');
    expect(zones?.values.map(({ value, count }) => [value, count])).toEqual([['48', 2], ['64', 1]]);
    expect(productMatchesRequirements('alarmas', alarm, ['zonas:48', 'zonas:64', 'protocolo:HTTPS'])).toBe(true);
    expect(productMatchesRequirements('alarmas', alarm, ['zonas:48', 'zonas:64', 'protocolo:DHCP'])).toBe(false);
    expect(productMatchesRequirements('alarmas', alarm, ['zonas:8'])).toBe(false);
    expect(productMatchesRequirements('alarmas', alarm, ['zonas:' + primary])).toBe(true);
  });

  it('supports every configured product family and normalizes catalog parameter labels', () => {
    const cases = [
      ['camaras', 'Resolución máxima', '4 MP', 'resolucion'],
      ['grabadores', 'Canales', '8', 'canales'],
      ['redes-y-wi-fi', 'Puertos', '8', 'puertos'],
      ['almacenamiento', 'Capacidad', '2 TB', 'capacidad'],
      ['energia', 'Voltaje', '12 V', 'voltaje'],
      ['alarmas', 'Particiones', '8', 'particiones'],
      ['audio', 'Canales', '2', 'canales'],
      ['cableado-estructurado', 'Categoría', '6A', 'categoria'],
      ['casa-inteligente', 'Protocolo', 'Zigbee', 'protocolo'],
      ['control-acceso', 'Credencial', 'MIFARE', 'credencial'],
      ['parqueaderos', 'Frecuencia', '433 MHz', 'frecuencia'],
      ['monitores', 'Resolución', '4K', 'resolucion'],
      ['cerrajeria', 'Material', 'Acero', 'material'],
    ] as const;
    for (const [categorySlug, label, value, specKey] of cases) {
      const facets = buildPublicRequirementFacets(categorySlug, [{
        id: categorySlug,
        categorySlug,
        catalogSpecGroups: [{ title: 'Título de grupo ignorado', items: [{ label, value }] }],
      }]);
      expect(facets[0]).toMatchObject({ specKey, label: specKey === 'protocolo' ? 'Protocolos' : label, values: [{ value, count: 1 }] });
    }
    expect(buildPublicRequirementFacets('camaras', [{ id: 'p1', categorySlug: 'camaras', catalogSpecGroups: [{ title: 'Imagen', items: [{ label: 'Tipo de lente', value: 'Varifocal' }, { label: 'Grado de protección', value: 'IP67' }] }] }]).map((facet) => facet.specKey)).toEqual(['lente', 'proteccion']);
  });
});

describe('atributos independientes de fichas publicadas', () => {
  it('cruza tensión, potencia de salida y TCP del mismo amplificador', () => {
    const product: RequirementProduct = { id: 'amp', categorySlug: 'audio-y-perifoneo', catalogSpecGroups: [{ items: [
      { label: 'Red: Protocolo de Red', value: 'TCP, HTTP, HTTPS' },
      { label: 'Potencia', value: '100 a 240 VAC' },
      { label: 'Potencia nominal', value: '500 W' },
      { label: 'Impedancia', value: '8Ω' }, { label: 'Impedancia', value: '8 Ω' },
    ] }] };
    const facets = buildPublicRequirementFacets('audio-y-perifoneo', [product]);
    expect(facets.find(f => f.specKey === 'potencia')).toBeUndefined();
    expect(facets.find(f => f.specKey === 'impedancia')?.values).toEqual([{ value: '8 Ω', label: '8 Ω', count: 1 }]);
    expect(productMatchesRequirements('audio-y-perifoneo', product, ['tension_entrada:100 a 240 VAC', 'potencia_salida:500 W', 'protocolo:TCP'])).toBe(true);
    expect(productMatchesRequirements('audio-y-perifoneo', product, ['potencia:100 a 240 VAC'])).toBe(true);
  });
  it('distingue tensión de salida de entrada y capacidades de personas de tarjetas', () => {
    const energy: RequirementProduct = { id: 'power', categorySlug: 'energia-y-electricidad', catalogSpecGroups: [{ items: [
      { label: 'Voltaje de entrada', value: '100-240 VAC' }, { label: 'Voltaje de salida', value: '12 VDC' },
    ] }] };
    expect(productMatchesRequirements(energy.categorySlug, energy, ['tension_salida:12 VDC'])).toBe(true);
    expect(productMatchesRequirements(energy.categorySlug, energy, ['tension_entrada:12 VDC'])).toBe(false);
    const access: RequirementProduct = { id: 'reader', categorySlug: 'control-de-acceso', technicalSpecs: [
      { key: 'Capacidad de usuarios', value: 1000 }, { key: 'Capacidad de tarjetas', value: 3000 },
    ] };
    expect(productMatchesRequirements(access.categorySlug, access, ['capacidad_usuarios:1000', 'capacidad_tarjetas:3000'])).toBe(true);
  });
});

describe('validateRequirementFilters', () => {
  it('no valida nada sin requisitos', () => {
    expect(validateRequirementFilters('alarmas', [])).toBeNull();
    expect(validateRequirementFilters('cctv-sin-familia', [])).toBeNull();
  });

  it('acepta requisitos válidos de una familia real', () => {
    expect(validateRequirementFilters('alarmas', ['zonas:16', 'protocolo:TCP'])).toBeNull();
    expect(validateRequirementFilters('audio', ['potencia_salida:500 W'])).toBeNull();
  });

  it('avisa cuando la categoría no tiene requisitos técnicos', () => {
    expect(validateRequirementFilters('cctv', ['zonas:16'])).toBe('La categoría «cctv» no tiene requisitos técnicos');
  });

  it('avisa cuando el requisito no tiene la forma clave:valor', () => {
    expect(validateRequirementFilters('alarmas', ['sin-dos-puntos'])).toBe('El requisito «sin-dos-puntos» no tiene la forma clave:valor');
    expect(validateRequirementFilters('alarmas', [':valor'])).toBe('El requisito «:valor» no tiene la forma clave:valor');
    expect(validateRequirementFilters('alarmas', ['clave:'])).toBe('El requisito «clave:» no tiene la forma clave:valor');
  });

  it('avisa cuando la clave no está permitida para la familia', () => {
    expect(validateRequirementFilters('alarmas', ['potencia_salida:500 W'])).toBe('El requisito «potencia_salida» no está disponible para esta categoría');
  });

  it('una clave inválida sigue sin coincidir con ningún producto (defensa en profundidad)', () => {
    const alarm: RequirementProduct = { id: 'a', categorySlug: 'alarmas', technicalSpecs: [{ key: 'Zonas', value: 16 }] };
    expect(productMatchesRequirements('alarmas', alarm, ['potencia_salida:500 W'])).toBe(false);
    expect(productMatchesRequirements('alarmas', alarm, ['zonas:16'])).toBe(true);
  });
});

describe('buildPublicRequirementFacetsResult', () => {
  const camaraKeys = [
    'resolucion_video', 'distancia_ir', 'compresion_video', 'resolucion', 'lente', 'distancia_focal',
    'vision_nocturna', 'alcance', 'analitica', 'sensor', 'compresion', 'proteccion', 'audio', 'alimentacion',
    'focal_length', 'ir_range', 'alcance_ir', 'image_sensor', 'night_vision', 'analytics', 'power',
  ];

  it('devuelve como máximo 20 facetas y marca truncated cuando había más', () => {
    const product: RequirementProduct = {
      id: 'p1',
      categorySlug: 'camaras',
      technicalSpecs: camaraKeys.map((key, index) => ({ key, value: `Valor ${index}` })),
    };
    const result = buildPublicRequirementFacetsResult('camaras', [product]);
    expect(result.facets).toHaveLength(20);
    expect(result.truncated).toBe(true);
    expect(buildPublicRequirementFacets('camaras', [product])).toHaveLength(20);
  });

  it('con 20 facetas o menos no marca truncated', () => {
    const product: RequirementProduct = {
      id: 'p1',
      categorySlug: 'camaras',
      technicalSpecs: camaraKeys.slice(0, 20).map((key, index) => ({ key, value: `Valor ${index}` })),
    };
    const result = buildPublicRequirementFacetsResult('camaras', [product]);
    expect(result.facets).toHaveLength(20);
    expect(result.truncated).toBe(false);
  });

  it('respeta un límite pequeño y avisa del recorte', () => {
    const product: RequirementProduct = {
      id: 'p1',
      categorySlug: 'camaras',
      technicalSpecs: [{ key: 'lente', value: 'Fijo' }, { key: 'sensor', value: '1/2.8' }, { key: 'audio', value: 'Sí' }],
    };
    const limited = buildPublicRequirementFacetsResult('camaras', [product], { limit: 2 });
    expect(limited.facets).toHaveLength(2);
    expect(limited.truncated).toBe(true);
  });

  it('con límite infinito no recorta ni marca truncated', () => {
    const product: RequirementProduct = {
      id: 'p1',
      categorySlug: 'camaras',
      technicalSpecs: camaraKeys.map((key, index) => ({ key, value: `Valor ${index}` })),
    };
    const result = buildPublicRequirementFacetsResult('camaras', [product], { limit: Number.POSITIVE_INFINITY });
    expect(result.facets).toHaveLength(camaraKeys.length);
    expect(result.truncated).toBe(false);
  });
});
