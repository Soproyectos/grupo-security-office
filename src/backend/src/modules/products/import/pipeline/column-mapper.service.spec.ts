import { ColumnMapperService } from './column-mapper.service';
import { HeaderDetectionResult } from '../interfaces/column-mapping';
import { SystemField } from '../interfaces/column-mapping';

describe('ColumnMapperService', () => {
  let service: ColumnMapperService;

  beforeEach(() => {
    service = new ColumnMapperService();
  });

  describe('createFromDetection', () => {
    it('debe crear mapping desde detección automática', () => {
      const detection: HeaderDetectionResult = {
        headers: ['REFERENCIA', 'DESCRIPCION', 'Marca'],
        headerRowIndex: 0,
        suggestedMappings: [
          { sourceColumn: 'REFERENCIA', targetField: 'sku', isRequired: true, confidence: 1.0 },
          { sourceColumn: 'DESCRIPCION', targetField: 'name', isRequired: true, confidence: 1.0 },
          { sourceColumn: 'Marca', targetField: 'brand', isRequired: true, confidence: 1.0 },
        ],
        unmappedHeaders: [],
        overallConfidence: 1.0,
      };

      const mapping = service.createFromDetection(detection);

      expect(mapping.entries).toHaveLength(3);
      expect(mapping.confirmed).toBe(false);
      expect(mapping.entries.find((e) => e.targetField === 'sku')?.sourceColumn).toBe('REFERENCIA');
    });
  });

  describe('confirmMapping', () => {
    it('debe confirmar mapping con overrides manuales', () => {
      const currentMapping = {
        entries: [
          { sourceColumn: 'REFERENCIA', targetField: 'sku' as SystemField, isRequired: true, confidence: 1.0 },
          { sourceColumn: 'DESCRIPCION', targetField: 'name' as SystemField, isRequired: true, confidence: 1.0 },
        ],
        confirmed: false,
      };

      const confirmed = service.confirmMapping(currentMapping, [
        { sourceColumn: 'REFERENCIA', targetField: 'sku' },
      ]);

      expect(confirmed.confirmed).toBe(true);
      expect(confirmed.entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('validateMapping', () => {
    it('debe aceptar un mapping que solo trae SKU', () => {
      const mapping = {
        entries: [
          { sourceColumn: 'SKU', targetField: 'sku' as SystemField, isRequired: true, confidence: 1.0 },
        ],
        confirmed: true,
      };

      const missing = service.validateMapping(mapping);

      // El nombre puede completarse después.
      expect(missing).not.toContain('name');
      // sku está presente
      expect(missing).not.toContain('sku');
    });

    it('debe retornar vacío cuando todos los campos requeridos están presentes', () => {
      const mapping = {
        entries: [
          { sourceColumn: 'SKU', targetField: 'sku' as SystemField, isRequired: true, confidence: 1.0 },
          { sourceColumn: 'Nombre', targetField: 'name' as SystemField, isRequired: true, confidence: 1.0 },
        ],
        confirmed: true,
      };

      const missing = service.validateMapping(mapping);
      expect(missing).toHaveLength(0);
    });

    it('no debe marcar name como faltante cuando existe description (fallback por fila)', () => {
      const mapping = {
        entries: [
          { sourceColumn: 'REFERENCIA', targetField: 'sku' as SystemField, isRequired: true, confidence: 1.0 },
          { sourceColumn: 'DESCRIPCION', targetField: 'description' as SystemField, isRequired: false, confidence: 1.0 },
        ],
        confirmed: true,
      };

      const missing = service.validateMapping(mapping);
      expect(missing).not.toContain('name');
      expect(missing).toHaveLength(0);
    });

    it('debe aceptar ausencia de name y description para permitir SKU-only', () => {
      const mapping = {
        entries: [
          { sourceColumn: 'SKU', targetField: 'sku' as SystemField, isRequired: true, confidence: 1.0 },
        ],
        confirmed: true,
      };

      const missing = service.validateMapping(mapping);
      expect(missing).toEqual([]);
    });
  });

  describe('applyMapping', () => {
    it('debe aplicar mapping a fila de datos crudos', () => {
      const rawRow: Record<string, unknown> = {
        REFERENCIA: 'CAM-001',
        DESCRIPCION: 'Cámara IP',
        Marca: 'Hikvision',
      };

      const mapping = {
        entries: [
          { sourceColumn: 'REFERENCIA', targetField: 'sku' as SystemField, isRequired: true, confidence: 1.0 },
          { sourceColumn: 'DESCRIPCION', targetField: 'name' as SystemField, isRequired: true, confidence: 1.0 },
          { sourceColumn: 'Marca', targetField: 'brand' as SystemField, isRequired: true, confidence: 1.0 },
        ],
        confirmed: true,
      };

      const result = service.applyMapping(rawRow, mapping);

      expect(result.sku).toBe('CAM-001');
      expect(result.name).toBe('Cámara IP');
      expect(result.brand).toBe('Hikvision');
    });

    it('debe ignorar campos __skip', () => {
      const rawRow: Record<string, unknown> = {
        SKU: 'CAM-001',
        Basura: 'dato',
      };

      const mapping = {
        entries: [
          { sourceColumn: 'SKU', targetField: 'sku' as SystemField, isRequired: true, confidence: 1.0 },
          { sourceColumn: 'Basura', targetField: '__skip' as SystemField, isRequired: false, confidence: 0.5 },
        ],
        confirmed: true,
      };

      const result = service.applyMapping(rawRow, mapping);

      expect(result.sku).toBe('CAM-001');
      expect(result.__skip).toBeUndefined();
    });
  });

  describe('toPreset', () => {
    it('debe convertir mapping a formato de preset', () => {
      const mapping = {
        entries: [
          { sourceColumn: 'REFERENCIA', targetField: 'sku' as SystemField, isRequired: true, confidence: 1.0 },
        ],
        confirmed: true,
      };

      const preset = service.toPreset(mapping, 'Mi Preset', 'user-1');

      expect(preset.name).toBe('Mi Preset');
      expect(preset.userId).toBe('user-1');
      expect(preset.mappings).toHaveLength(1);
      expect(preset.mappings[0].sourceColumn).toBe('REFERENCIA');
      expect(preset.isDefault).toBe(false);
    });
  });
});
