import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  BibliotecaFicha,
  buildCreateData,
  buildImageRows,
  buildReport,
  buildUpdateData,
  fichaVitrinaName,
  isIdempotentSkip,
  isNameTruncated,
  loadFichas,
  matchProducts,
  resolveBrands,
  resolveCategories,
  resolveEntityId,
  validateFicha,
} from './import-biblioteca.logic';

describe('import-biblioteca.logic', () => {
  const makeFicha = (overrides: Partial<BibliotecaFicha> = {}): BibliotecaFicha => ({
    referencia: 'REF-1',
    nombre_vitrina: { valor: 'Cámara IP Turbo 4MP' },
    estado: 'verificado',
    ...overrides,
  });

  describe('validateFicha', () => {
    it('rechaza entradas que no son un objeto JSON', () => {
      expect(validateFicha(null)).toBe('no es un objeto JSON');
      expect(validateFicha('texto')).toBe('no es un objeto JSON');
      expect(validateFicha(42)).toBe('no es un objeto JSON');
    });

    it('rechaza fichas sin referencia o sin nombre_vitrina.valor', () => {
      expect(validateFicha({ nombre_vitrina: { valor: 'N' }, estado: 'verificado' })).toBe(
        'falta "referencia" (string no vacío)',
      );
      expect(
        validateFicha({ referencia: '   ', nombre_vitrina: { valor: 'N' }, estado: 'verificado' }),
      ).toBe('falta "referencia" (string no vacío)');

      const sinVitrina = makeFicha();
      delete (sinVitrina as Record<string, unknown>).nombre_vitrina;
      expect(validateFicha(sinVitrina)).toBe('falta "nombre_vitrina.valor" (string no vacío)');
      expect(
        validateFicha({ referencia: 'R', nombre_vitrina: { valor: '' }, estado: 'verificado' }),
      ).toBe('falta "nombre_vitrina.valor" (string no vacío)');
    });

    it('rechaza fichas con estado inválido', () => {
      expect(validateFicha(makeFicha({ estado: 'bogus' } as Partial<BibliotecaFicha>))).toContain(
        '"estado" ausente o inválido',
      );
      const sinEstado = makeFicha();
      delete (sinEstado as Record<string, unknown>).estado;
      expect(validateFicha(sinEstado)).toContain('"estado" ausente o inválido');
    });

    it('acepta una ficha válida devolviendo null', () => {
      expect(validateFicha(makeFicha({ estado: 'parcial' }))).toBeNull();
      expect(validateFicha(makeFicha({ estado: 'no_encontrado' }))).toBeNull();
    });
  });

  describe('loadFichas', () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblioteca-test-'));
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const writeJson = (name: string, content: unknown) =>
      fs.writeFileSync(path.join(dir, name), JSON.stringify(content));

    it('carga las fichas válidas y registra las inválidas', () => {
      writeJson('a-ref-1.json', makeFicha({ referencia: 'REF-1' }));
      writeJson('b-ref-2.json', makeFicha({ referencia: 'REF-2', estado: 'parcial' }));
      writeJson('c-mala.json', {
        referencia: 'REF-3',
        nombre_vitrina: { valor: 'Nombre' },
        estado: 'bogus',
      });
      fs.writeFileSync(path.join(dir, 'notas.txt'), 'no es json');

      const result = loadFichas(dir);

      expect(result.valid).toHaveLength(2);
      expect(result.valid.map((f) => f.referencia)).toEqual(['REF-1', 'REF-2']);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].file).toBe('c-mala.json');
      expect(result.invalid[0].referencia).toBe('REF-3');
      expect(result.invalid[0].reason).toContain('"estado" ausente o inválido');
    });

    it('excluye los artefactos del propio flujo (reportes/backups) aunque contengan JSON válido', () => {
      writeJson('a-ref-1.json', makeFicha({ referencia: 'REF-1' }));
      writeJson('import-report-20260922-0000.json', makeFicha({ referencia: 'REPORT-1' }));
      writeJson('backup-identidad-20260922-0000.json', makeFicha({ referencia: 'BACKUP-1' }));

      const result = loadFichas(dir);

      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].referencia).toBe('REF-1');
      expect(result.invalid).toHaveLength(0);
      const names = [...result.valid.map((f) => f.referencia), ...result.invalid.map((i) => i.file)];
      expect(names).not.toContain('REPORT-1');
      expect(names).not.toContain('BACKUP-1');
    });
  });

  describe('resolveCategories / resolveEntityId', () => {
    const existingCategories = [
      { id: 'cat-turbo', name: 'CAMARAS TURBO' },
      { id: 'cat-cable', name: 'Cableado Categoria 6a' },
      { id: 'cat-default', name: 'Sin categoría' },
    ];
    const fichas = [
      makeFicha({ referencia: 'R1', categoria: { valor: 'Camaras Turbo' } }),
      makeFicha({ referencia: 'R2', categoria: { valor: 'Cableado Categoría 6A' } }),
      makeFicha({ referencia: 'R3', categoria: { valor: 'Alarmas Nueva' } }),
      makeFicha({ referencia: 'R4', categoria: { valor: 'alarmas nueva' } }),
      makeFicha({ referencia: 'R5' }),
    ];

    it('matchea categorías existentes ignorando acentos y casing', () => {
      const res = resolveCategories(fichas, existingCategories);

      expect(res.matched.get('camaras turbo')).toBe('cat-turbo');
      expect(res.matched.get('cableado categoria 6a')).toBe('cat-cable');
    });

    it('acumula categorías nuevas sin duplicados y asigna el default a las fichas sin categoria', () => {
      const res = resolveCategories(fichas, existingCategories);

      expect(res.toCreate).toEqual(['Alarmas Nueva']);
      expect(res.defaultId).toBe('cat-default');
      expect(resolveEntityId(undefined, res, new Map())).toBe('cat-default');
      expect(resolveEntityId('Alarmas Nueva', res, new Map([['alarmas nueva', 'cat-nueva']]))).toBe(
        'cat-nueva',
      );

      const sinDefault = resolveCategories(fichas, [
        { id: 'cat-turbo', name: 'CAMARAS TURBO' },
      ]);
      expect(sinDefault.defaultId).toBeNull();
      expect(resolveEntityId(undefined, sinDefault, new Map())).toBeNull();
    });
  });

  describe('resolveBrands', () => {
    it('aplica el mismo matching para marcas y usa "Sin marca" como default', () => {
      const fichas = [
        makeFicha({ referencia: 'R1', marca: { valor: 'Hikvision' } }),
        makeFicha({ referencia: 'R2', marca: { valor: 'Truvision' } }),
        makeFicha({ referencia: 'R3' }),
      ];
      const res = resolveBrands(fichas, [
        { id: 'br-hik', name: 'HIKVISION' },
        { id: 'br-def', name: 'Sin marca' },
      ]);

      expect(res.matched.get('hikvision')).toBe('br-hik');
      expect(res.toCreate).toEqual(['Truvision']);
      expect(res.defaultId).toBe('br-def');
      expect(resolveEntityId(undefined, res, new Map())).toBe('br-def');
    });
  });

  describe('matchProducts', () => {
    it('matchea por SKU case-insensitive y manda el resto a creates conservando la referencia', () => {
      const fichas = [
        makeFicha({ referencia: 'ABC-1' }),
        makeFicha({ referencia: 'XYZ-9' }),
      ];
      const { updates, creates } = matchProducts(fichas, ['abc-1', '  QRS-5 ']);

      expect(updates).toHaveLength(1);
      expect(updates[0].sku).toBe('abc-1');
      expect(updates[0].ficha.referencia).toBe('ABC-1');
      expect(creates).toHaveLength(1);
      expect(creates[0].referencia).toBe('XYZ-9');
    });
  });

  describe('buildUpdateData', () => {
    const now = new Date('2026-09-22T00:00:00.000Z');

    it('construye la identidad curada con bloqueo y timestamps de la corrida', () => {
      const ficha = makeFicha({
        descripcion: { valor: 'Descripción completa del producto' },
      });
      const data = buildUpdateData(ficha, 'cat-1', 'br-1', now);

      expect(data.name).toBe('Cámara IP Turbo 4MP');
      expect(data.description).toBe('Descripción completa del producto');
      expect(data.categoryId).toBe('cat-1');
      expect(data.brandId).toBe('br-1');
      expect(data.nameSource).toBe('curado');
      expect(data.nameLockedAt).toBe(now);
      expect(data.lastSeenAt).toBe(now);
    });

    it('preserva las claves existentes de extraAttributes y añade el bloque biblioteca', () => {
      const ficha = makeFicha({
        nombre_vitrina: { valor: 'Nombre', origen: 'web' },
        fuentes_consultadas: ['fuente-1'],
      });
      const merged = buildUpdateData(ficha, 'cat-1', 'br-1', now, { PLATINO: 23 }).extraAttributes;

      expect(merged.PLATINO).toBe(23);
      expect(merged.biblioteca).toMatchObject({
        estado: 'verificado',
        origen: 'web',
        fuentes_consultadas: ['fuente-1'],
      });
      expect(merged.biblioteca).not.toHaveProperty('razon');

      const conRazon = makeFicha({
        nombre_vitrina: { valor: 'Nombre', origen: 'curador', razon: 'confirma proveedor' },
      });
      const data = buildUpdateData(conRazon, 'cat-1', 'br-1', now);
      expect(data.extraAttributes.biblioteca).toMatchObject({ razon: 'confirma proveedor' });
    });
  });

  describe('buildCreateData', () => {
    it('crea con sku=referencia, isActive=false y bloque biblioteca', () => {
      const now = new Date('2026-09-22T00:00:00.000Z');
      const ficha = makeFicha({ referencia: ' NUEVA-9 ' });
      const data = buildCreateData(ficha, 'cat-1', 'br-1', now);

      expect(data.sku).toBe('NUEVA-9');
      expect(data.isActive).toBe(false);
      expect(data.nameSource).toBe('curado');
      expect(data.extraAttributes.biblioteca).toMatchObject({ estado: 'verificado' });
    });
  });

  describe('fichaVitrinaName / isNameTruncated', () => {
    it('trunca nombres de vitrina largos al presupuesto de 70 y respeta los cortos', () => {
      const larga = makeFicha({ nombre_vitrina: { valor: 'A'.repeat(100) } });
      expect(fichaVitrinaName(larga).length).toBeLessThanOrEqual(70);
      expect(isNameTruncated(larga)).toBe(true);

      const corta = makeFicha({ nombre_vitrina: { valor: 'Cámara IP Turbo 4MP' } });
      expect(fichaVitrinaName(corta)).toBe('Cámara IP Turbo 4MP');
      expect(isNameTruncated(corta)).toBe(false);
    });
  });

  describe('buildImageRows', () => {
    it('sin imagen no genera filas; con imagen genera una fila PRINCIPAL', () => {
      expect(buildImageRows(makeFicha())).toEqual([]);

      const ficha = makeFicha({
        nombre_vitrina: { valor: 'Cámara IP Turbo 4MP' },
        imagen: { valor: ' https://img.example/1.jpg ' },
      });
      const rows = buildImageRows(ficha);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        url: 'https://img.example/1.jpg',
        type: 'PRINCIPAL',
        isPrimary: true,
        alt: 'Cámara IP Turbo 4MP',
      });
    });
  });

  describe('isIdempotentSkip', () => {
    const ficha = makeFicha({ descripcion: { valor: 'Descripción' } });

    it('skip solo cuando está bloqueado y name/description coinciden exactamente', () => {
      const locked = {
        name: 'Cámara IP Turbo 4MP',
        description: 'Descripción',
        nameLockedAt: new Date('2026-09-22T00:00:00.000Z'),
      };
      expect(isIdempotentSkip(locked, ficha)).toBe(true);

      expect(isIdempotentSkip({ ...locked, nameLockedAt: null }, ficha)).toBe(false);
      expect(isIdempotentSkip({ ...locked, name: 'Otro nombre' }, ficha)).toBe(false);
      expect(isIdempotentSkip({ ...locked, description: 'Distinta' }, ficha)).toBe(false);
    });
  });

  describe('buildReport', () => {
    it('agrupa totales por acción y buckets por estado, incluyendo inválidas e imágenes', () => {
      const now = new Date('2026-09-22T00:00:00.000Z');
      const entries = [
        { ficha: makeFicha({ referencia: 'R1', estado: 'verificado' }), action: 'update' as const },
        { ficha: makeFicha({ referencia: 'R2', estado: 'verificado' }), action: 'skip' as const },
        { ficha: makeFicha({ referencia: 'R3', estado: 'parcial' }), action: 'create' as const },
        {
          ficha: makeFicha({ referencia: 'R4', estado: 'no_encontrado' }),
          action: 'error' as const,
        },
      ];
      const report = buildReport({
        mode: 'dry-run',
        now,
        entries,
        invalid: [{ file: 'mala.json', reason: 'falta "referencia"' }],
        categoriesToCreate: ['Alarmas'],
        brandsToCreate: ['Truvision'],
        images: 2,
        namesTruncated: 1,
        categoriesCreated: 1,
        brandsCreated: 1,
        rowErrors: [{ sku: 'R4', error: 'fallo de fila' }],
      });

      expect(report.mode).toBe('dry-run');
      expect(report.generatedAt).toBe(now.toISOString());
      expect(report.totals).toMatchObject({
        fichasFiles: 5,
        valid: 4,
        invalid: 1,
        updates: 1,
        creates: 1,
        skipped: 1,
        errors: 1,
        images: 2,
        namesTruncated: 1,
      });
      expect(report.perEstado.verificado).toMatchObject({ updates: 1, skipped: 1, total: 2 });
      expect(report.perEstado.parcial).toMatchObject({ creates: 1, total: 1 });
      expect(report.perEstado.no_encontrado).toMatchObject({ errors: 1, total: 1 });
      expect(report.categoriesToCreate).toEqual(['Alarmas']);
      expect(report.brandsToCreate).toEqual(['Truvision']);
      expect(report.invalidFichas).toHaveLength(1);
      expect(report.rowErrors).toEqual([{ sku: 'R4', error: 'fallo de fila' }]);
    });
  });
});
