import {
  buildBreadcrumb,
  collectCategoryIds,
  sanitizeDatasheets,
  sanitizeTechnicalSpecs,
  CategoryNode,
} from './public-catalog.helpers';

const tree: CategoryNode[] = [
  { id: 'cctv', name: 'CCTV', slug: 'cctv', parentId: null },
  { id: 'domos', name: 'Domos', slug: 'domos', parentId: 'cctv' },
  { id: 'ptz', name: 'PTZ', slug: 'ptz', parentId: 'domos' },
  { id: 'acceso', name: 'Acceso', slug: 'acceso', parentId: null },
  { id: 'off', name: 'Oculta', slug: 'oculta', parentId: null, isActive: false },
  { id: 'off-child', name: 'Hija de oculta', slug: 'hija-de-oculta', parentId: 'off' },
];

describe('collectCategoryIds', () => {
  it('incluye la categoría y todas sus descendientes', () => {
    expect(collectCategoryIds(tree, 'cctv').sort()).toEqual(['cctv', 'domos', 'ptz']);
    expect(collectCategoryIds(tree, 'domos').sort()).toEqual(['domos', 'ptz']);
    expect(collectCategoryIds(tree, 'ptz')).toEqual(['ptz']);
  });

  it('devuelve vacío para un slug desconocido', () => {
    expect(collectCategoryIds(tree, 'no-existe')).toEqual([]);
  });

  it('una categoría inactiva y su subárbol quedan ocultos', () => {
    expect(collectCategoryIds(tree, 'oculta')).toEqual([]);
    expect(collectCategoryIds(tree, 'hija-de-oculta')).toEqual(['off-child']);
  });

  it('omite subcategorías inactivas dentro de un subárbol activo', () => {
    const withInactiveChild: CategoryNode[] = [
      ...tree,
      { id: 'domos-off', name: 'Domos off', slug: 'domos-off', parentId: 'cctv', isActive: false },
    ];
    expect(collectCategoryIds(withInactiveChild, 'cctv').sort()).toEqual(['cctv', 'domos', 'ptz']);
  });

  it('es seguro ante ciclos en el árbol', () => {
    const cyclic: CategoryNode[] = [
      { id: 'a', slug: 'a', parentId: 'b' },
      { id: 'b', slug: 'b', parentId: 'a' },
    ];
    expect(collectCategoryIds(cyclic, 'a').sort()).toEqual(['a', 'b']);
  });
});

describe('buildBreadcrumb', () => {
  it('devuelve los ancestros con la raíz primero, sin la categoría misma', () => {
    expect(buildBreadcrumb(tree, 'domos')).toEqual([
      { name: 'CCTV', slug: 'cctv' },
      { name: 'Domos', slug: 'domos' },
    ]);
    expect(buildBreadcrumb(tree, 'cctv')).toEqual([{ name: 'CCTV', slug: 'cctv' }]);
  });

  it('es vacío para una categoría raíz (sin padre)', () => {
    expect(buildBreadcrumb(tree, null)).toEqual([]);
  });

  it('se detiene ante un padre inexistente o un ciclo', () => {
    expect(buildBreadcrumb(tree, 'fantasma')).toEqual([]);
    const cyclic: CategoryNode[] = [
      { id: 'a', name: 'A', slug: 'a', parentId: 'b' },
      { id: 'b', name: 'B', slug: 'b', parentId: 'a' },
    ];
    expect(buildBreadcrumb(cyclic, 'a')).toEqual([
      { name: 'B', slug: 'b' },
      { name: 'A', slug: 'a' },
    ]);
  });
});

describe('sanitizeTechnicalSpecs', () => {
  it('conserva solo key, value y unit, y descarta type, options y required', () => {
    const result = sanitizeTechnicalSpecs([
      { key: 'resolucion', type: 'SELECT', unit: 'MP', options: ['2MP', '4MP'], required: true, value: '4' },
    ]);

    expect(result).toEqual([{ key: 'resolucion', value: '4', unit: 'MP' }]);
    expect(Object.keys(result[0]).sort()).toEqual(['key', 'unit', 'value']);
  });

  it('omite entradas sin valor (vacío, nulo, espacios, arreglo vacío)', () => {
    const result = sanitizeTechnicalSpecs([
      { key: 'a', type: 'TEXT', value: '' },
      { key: 'b', type: 'TEXT', value: '   ' },
      { key: 'c', type: 'TEXT', value: null },
      { key: 'd', type: 'TEXT' },
      { key: 'e', type: 'SELECT', value: [] },
      { key: 'ok', type: 'TEXT', value: 'sí hay' },
    ]);

    expect(result).toEqual([{ key: 'ok', value: 'sí hay', unit: null }]);
  });

  it('presenta números, booleanos y listas como texto', () => {
    const result = sanitizeTechnicalSpecs([
      { key: 'canales', type: 'NUMBER', value: 8 },
      { key: 'cero', type: 'NUMBER', value: 0 },
      { key: 'poe', type: 'BOOLEAN', value: true },
      { key: 'sin-poe', type: 'BOOLEAN', value: false },
      { key: 'codecs', type: 'SELECT', value: ['H.264', ' ', 'H.265'] },
    ]);

    expect(result).toEqual([
      { key: 'canales', value: '8', unit: null },
      { key: 'cero', value: '0', unit: null },
      { key: 'poe', value: 'Sí', unit: null },
      { key: 'sin-poe', value: 'No', unit: null },
      { key: 'codecs', value: 'H.264, H.265', unit: null },
    ]);
  });

  it('descarta entradas malformadas y valores no presentables', () => {
    expect(sanitizeTechnicalSpecs(null)).toEqual([]);
    expect(sanitizeTechnicalSpecs({ resolucion: '4MP' })).toEqual([]);
    expect(
      sanitizeTechnicalSpecs([
        null,
        'texto',
        [],
        { value: 'sin key' },
        { key: '  ', value: 'key vacía' },
        { key: 'objeto', value: { nested: true } },
        { key: 'nan', value: Number.NaN },
      ]),
    ).toEqual([]);
  });
});

describe('sanitizeDatasheets', () => {
  it('acepta fichas por type o por name, con URL http(s) o del sitio', () => {
    const result = sanitizeDatasheets([
      { name: 'Ficha técnica DS-2CD', url: 'https://cdn.hikvision.com/ds.html', type: 'documento' },
      { name: 'Manual', url: 'http://example.com/x', type: 'datasheet' },
      { name: 'Hoja de datos', url: '/uploads/hoja' },
      { name: 'Especificaciones', url: 'https://example.com/e', type: 'Ficha Técnica' },
      { name: 'Otra', url: 'https://example.com/o', type: 'ficha' },
    ]);

    expect(result.map((doc) => doc.url)).toEqual([
      'https://cdn.hikvision.com/ds.html',
      'http://example.com/x',
      '/uploads/hoja',
      'https://example.com/e',
      'https://example.com/o',
    ]);
  });

  it('acepta cualquier URL .pdf, también con query o hash', () => {
    const result = sanitizeDatasheets([
      { name: 'ficha-tecnica.pdf', url: '/api/files/abc/ficha-tecnica.pdf' },
      { name: 'Catálogo', url: 'https://example.com/cat.PDF?v=2#p=3' },
    ]);

    expect(result).toEqual([
      { name: 'ficha-tecnica.pdf', url: '/api/files/abc/ficha-tecnica.pdf' },
      { name: 'Catálogo', url: 'https://example.com/cat.PDF?v=2#p=3' },
    ]);
  });

  it('descarta documentos que no son fichas técnicas', () => {
    const result = sanitizeDatasheets([
      { name: 'Certificado de garantía', url: 'https://example.com/garantia.docx', type: 'certificado' },
      { name: 'Foto de instalación', url: '/uploads/foto.jpg' },
      { name: 'Ficha comercial', url: 'https://example.com/comercial' },
    ]);

    expect(result).toEqual([]);
  });

  it('descarta URL que no son http(s) ni del sitio', () => {
    const result = sanitizeDatasheets([
      { name: 'Ficha técnica', url: 'javascript:alert(1)' },
      { name: 'Ficha técnica', url: 'JaVaScRiPt:alert(1)//.pdf' },
      { name: 'Ficha técnica', url: 'data:application/pdf;base64,AAAA' },
      { name: 'Ficha técnica', url: 'file:///etc/passwd.pdf' },
      { name: 'Ficha técnica', url: 'ftp://example.com/f.pdf' },
      { name: 'Ficha técnica', url: '//evil.example.com/f.pdf' },
      { name: 'Ficha técnica', url: '/\\evil.example.com/f.pdf' },
      { name: 'Ficha técnica', url: 'https://user:pass@example.com/f.pdf' },
      { name: 'Ficha técnica', url: 'ficha.pdf' },
      { name: 'Ficha técnica', url: '   ' },
      { name: 'Ficha técnica', url: 42 },
      { name: 'Ficha técnica' },
      { name: 'Ficha técnica', url: 'https://example.com/a\nb.pdf' },
    ]);

    expect(result).toEqual([]);
  });

  it('devuelve solo name y url y usa un nombre por defecto si falta', () => {
    const result = sanitizeDatasheets([
      { url: 'https://example.com/f.pdf', size: 1234, type: 'pdf', secret: 'x' },
    ]);

    expect(result).toEqual([{ name: 'Ficha técnica', url: 'https://example.com/f.pdf' }]);
  });

  it('tolera entradas malformadas y valores que no son arreglo', () => {
    expect(sanitizeDatasheets(null)).toEqual([]);
    expect(sanitizeDatasheets({ url: 'https://example.com/f.pdf' })).toEqual([]);
    expect(sanitizeDatasheets([null, 'x', 3, []])).toEqual([]);
  });
});
