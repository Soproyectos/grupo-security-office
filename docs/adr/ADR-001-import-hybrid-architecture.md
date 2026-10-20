# ADR-001: Arquitectura Híbrida de Importación Masiva

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptada (implementada y verificada) |
| **Fecha** | 2026-07-27 |
| **Decisor** | Tech Lead + Producto |
| **Alcance** | Backend import pipeline, frontend wizard, Prisma schema |

---

## Contexto

El módulo de importación masiva de productos debía soportar archivos Excel reales de proveedores de seguridad electrónica (CCTV, alarmas, control de acceso). Los archivos del mundo real presentan:

- Headers con newlines, espacios, typos (`PRECIO_SIN_INSTALADOR`, `PRECIO DE INSTALADOR CON IVA`)
- Metadata en filas superiores (fechas, teléfonos, versiones)
- Sin categorías ni marcas — solo datos comerciales crudos
- Columnas variables por proveedor (84 columnas en el caso Hikvision)
- Headers duplicados (`INSTALADOR` aparece 3 veces)

**Problema:** La arquitectura anterior (column mapping 1:1) rechazaba el 100% de las filas porque esperaba category/brand mapeados y no toleraba columnas no reconocidas.

**Restricciones:**
- No modificar el esquema de categorías/marcas existente
- Mantener la trazabilidad de atributos importados
- No romper el flujo de importación existente para archivos ya funcionales
- Compatible con el wizard de 7 pasos existente

---

## Decisión

Implementar una arquitectura híbrida con 4 pilares:

### 1. Sanitización Multi-Capa

- `ExcelAdapter.cleanHeaders()`: colapsa newlines, filtra vacíos, deduplica
- `HeaderDetector.sanitizeHeaders()`: normaliza, aplica sinónimos, detecta typos (`preci` → `precio`)
- Defensa en profundidad: cada capa garantiza headers válidos independientemente

### 2. Detección Automática de Fila Header

- `findBestHeaderRow()`: scoring por fill ratio, text cells, penalización por gaps
- Fallback a primera fila si scoring < threshold
- Permite archivos con metadata en filas 0..N antes del header real

### 3. Campo `__extra` para Columnas No Reconocidas

- Columnas sin mapeo a system field se asignan a `__extra`
- Nombre legible preservado: `PRECIO_DE_INSTALADOR_CON_IVA`
- El usuario puede reasignar `__extra` a un system field durante el mapping
- `confirmMapping` desambigua por `targetField` (primera ocupación gana)

### 4. `extraAttributes Json?` en Product

- Almacena columnas adicionales como `Record<string, string | number>`
- Keys: UPPER_SNAKE_CASE, solo `[A-Z0-9_]`
- Límite: 50 entradas por producto
- Escritura solo desde import pipeline
- Reemplazo completo en re-import (no merge)

## Actualización de contrato — 2026-10-20

El flujo actual mantiene el SKU como único campo obligatorio. Nombre, descripción,
categoría, marca, especificaciones y precios pueden llegar después. Una fila que
solo trae SKU (con o sin precio) crea un producto `DRAFT`, inactivo y no visible,
marcado como pendiente de enriquecimiento. El detalle operativo y la limitación
actual de libros multihoja están en
[`docs/procedimientos/importacion-masiva-productos.md`](../procedimientos/importacion-masiva-productos.md).

---

## Implementación Realizada

### Backend (10 archivos modificados)

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | `+extraAttributes Json?` en Product (línea 65) |
| `prisma/migrations/20260727204400_...` | `ALTER TABLE products ADD COLUMN extraAttributes JSONB` |
| `import/sources/excel-adapter.ts` | Reescritura: arrays mode, auto-detect header row, scoring, cleanHeaders |
| `import/pipeline/header-detector.service.ts` | Sanitización, auto-detect, typo synonyms, `__extra: []` |
| `import/pipeline/column-mapper.service.ts` | unmapped→`__extra`, desambiguación por targetField |
| `import/pipeline/row-normalizer.service.ts` | `+normalizeExtras()`: UPPER_SNAKE_CASE, max 50, solo primitivos |
| `import/pipeline/row-validator.service.ts` | category/brand opcionales (sin CATEGORY_REQUIRED/BRAND_REQUIRED) |
| `import/pipeline/batch-executor.service.ts` | defaults "Sin categoría"/"Sin marca", escribe extraAttributes, audit enriquecido |
| `import/interfaces/column-mapping.ts` | `+'__extra'` a SystemField |
| `import/interfaces/import-context.ts` | `+extraAttributes` a NormalizedRow |

### Frontend (5 archivos modificados)

| Archivo | Cambio |
|---------|--------|
| `types/import.types.ts` | `+'__extra'` a SystemField |
| `components/MappingLine.tsx` | Label "Atributo adicional", badge purple, fondo `bg-purple-50` |
| `components/ImportStepMapping.tsx` | `REQUIRED_FIELDS = ['sku']`, resumen de mapeo, info box extras y aviso de pendientes |
| `components/ImportStepHeaders.tsx` | `+'__extra'` en SYSTEM_FIELD_LABELS |
| `utils/header-detection.ts` | `+'__extra': []` en FIELD_SYNONYMS |

---

## Pipeline de Importación (6 etapas)

```
1. PARSE ─── ExcelAdapter: arrays mode, auto-detect header row, cleanHeaders
     │
2. DETECT ── HeaderDetector: sanitize, matching con sinónimos, unmappedHeaders
     │
3. MAP ───── ColumnMapper: unmapped→__extra, desambiguación
     │
4. VALIDATE ─ RowValidator: sku requerido; nombre, category y brand opcionales
     │
5. NORMALIZE ─ RowNormalizer: parsea precios, recolecta extras en extraAttributes
     │
6. EXECUTE ── BatchExecutor: batches de 50, $transaction, defaults, audit
```

---

## Datos de Verificación (Archivo Real)

| Métrica | Valor |
|---------|-------|
| Archivo | `LISTA HIKVISION TURBO GRUPO.xlsx` (84 columnas, 584 filas) |
| Filas válidas | 209/211 |
| Productos creados | 209 |
| Errores | 0 |
| Tiempo | 3.8 segundos |
| Listas de precio | 7 por producto |
| extraAttributes | 10+ columnas guardadas |
| Tests unitarios | 45/45 passing |
| Frontend compilation | Sin errores TypeScript |

### Categorías/marcas creadas automáticamente
- `"Sin categoría"` / `"Sin marca"` — resueltas por `BatchExecutor.resolveCategory()` y `resolveBrand()`

### Atributos extra guardados (ejemplo Hikvision)
`ORO`, `PLATINO`, `DPP_PLATINO2`, `DPP_ORO2`, `PRECIO_SUGERIDO_INSTALADOR`, `PRECIO_DE_INSTALADOR_CON_IVA`, etc.

---

## Hallazgos de Auditoría

### Bugs conocidos (pre-existentes, no introducidos por esta iteración)

| ID | Severidad | Descripción |
|----|-----------|-------------|
| H-1 | **Alta** | `NormalizedRow.isUpdate` siempre `false` — preview reporta `toUpdate: 0` siempre. El BatchExecutor sí detecta SKUs existentes y actualiza, pero el preview no refleja esto. |
| H-2 | **Media** | `findBestHeaderRow()` retorna índice relativo al array sintético `[headers, ...sampleRowsKeys]`, no el índice absoluto en el archivo. Semánticamente incorrecto pero no afecta funcionalidad actual. |

### Código muerto / inconsistencias menores

| ID | Severidad | Descripción |
|----|-----------|-------------|
| H-3 | **Baja** | `HeaderDetectionConfig` define `headerRowIndex`, `sampleRows`, `allowCustomHeaderRow` — ninguno es consumido por `HeaderDetectorService.detect()`. |
| H-4 | **Baja** | `normalizeExtras()` firma dice `string | number | boolean` pero solo produce `string | number`. El tipo `boolean` nunca se genera en runtime. |
| H-5 | **Baja** | `resolveCategory()` y `resolveBrand()` reciben `tx: any` en vez de `Prisma.TransactionClient`. Pierde type-safety. |
| H-6 | **Baja** | `SYSTEM_FIELD_LABELS` está duplicado en `MappingLine.tsx` e `ImportStepHeaders.tsx`. Candidato a extraer a archivo compartido. |

---

## Consecuencias

### Positivas
- Archivos reales de proveedores se importan sin errores (antes: 0/212, ahora: 209/211)
- Columnas adicionales preservadas en `extraAttributes` para uso futuro
- Wizard de mapeo tolerante a headers sucios, duplicados, con typos
- Categorías/marcas opcionales — no bloquean importación
- Trazabilidad completa en audit log

### Negativas / Deuda técnica
- `isUpdate` en preview no refleja realidad (H-1) — usuario ve "209 crear" cuando algunos pueden ser updates
- Código defensivo duplicado entre ExcelAdapter y HeaderDetector (H-4)
- `extraAttributes` sin índice GIN (aceptable en Phase 1, necesario si se busca por atributos)
- Re-import reemplaza `extraAttributes` completo (no merge) — usuario debe reenviar todas las columnas extra
- Promoción de atributo extra a campo canónico es manual (requiere migración Prisma + refactor pipeline)

---

## Limitaciones

1. **confirmMapping deduplica por targetField** — múltiples `__extra` en overrides se colapsan a uno
2. **Sin índice GIN** en `extraAttributes` — aceptable para volumen actual (~200-5000 productos)
3. **Promoción manual** — mover un atributo de extra a canónico requiere migración de esquema
4. **Re-import reemplaza** — no merge de `extraAttributes` existentes
5. **Preview engañoso** — `toUpdate` siempre 0 por H-1

---

## Siguientes Fases

| Fase | Descripción | Prioridad |
|------|-------------|-----------|
| **Hotfix H-1** | Corregir `NormalizedRow.isUpdate` para que el preview refleje SKUs existentes | Alta |
| **Limpieza H-3** | Eliminar campos muertos de `HeaderDetectionConfig` | Baja |
| **Refactor H-6** | Extraer `SYSTEM_FIELD_LABELS` a archivo compartido | Baja |
| **Type-safety H-5** | Reemplazar `tx: any` por `Prisma.TransactionClient` | Baja |
| **Índice GIN** | Agregar `CREATE INDEX USING GIN` en `extraAttributes` cuando volumen lo justifique | Futuro |
| **Merge strategy** | Estrategia de merge para re-import (opcional) | Futuro |
| **UI extraAttributes** | Visible en catálogo admin, editable, exportable | Futuro |
| **ERP Yéminus** | Integración — pendiente confirmación de API | Futuro |

---

## Criterios de Aceptación (verificados)

- [x] Archivo Hikvision (84 cols, 584 filas) importa sin rechazo de columnas
- [x] Headers con newlines, typos, metadata se procesan correctamente
- [x] Categorías/marcas opcionales — defaults "Sin categoría"/"Sin marca" se crean
- [x] `extraAttributes` se guarda con todas las columnas no mapeadas
- [x] 7 listas de precios creadas por producto
- [x] 45/45 tests unitarios pasando
- [x] Frontend compila sin errores TypeScript
- [x] Audit log registra columnsMapped, columnsExtra, columnsSkipped

---

## Archivos Relacionados

- `src/backend/prisma/schema.prisma` — Modelo Product con `extraAttributes`
- `src/backend/src/modules/products/import/` — Pipeline completo
- `src/frontend/src/features/products/import/` — Wizard de importación
- `LISTA HIKVISION TURBO GRUPO.xlsx` — Archivo de prueba real
