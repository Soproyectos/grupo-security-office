# IMP-03 — Unificar COP de carga y edición manual (paso: contrato)

**Fecha:** 2026-10-17 · **Copia de trabajo:** `/home/soporte/office_ai/gs-tanda-01` · **Alcance:** documentación del contrato y (paso `backend`) implementación en `modules/prices/**`, `products/dto/price-input.dto.ts`(+spec) y `common/money/**`. Sin commits/push/deploy; **sin tocar `estado.json`/`tareas.json`** ni los servicios activos de S3 (3000/5173/5432).

**Modalidad — tanda continua (PROP):** propuesta para la auditoría final del coordinador; **no es decisión de negocio aprobada**. El incidente de helpers (`resultados/TANDA-01-incidente-helper-db.md`) está **contenido, pendiente de auditoría**; toda verificación corre **exclusivamente en la base desechable** (`gs-tanda-db:54331`, URL inline + guard `testdb.cjs`). Sin conexiones ni escrituras en producción.

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha, textual):** «Concretar límite numérico, redondeo y validación común antes de aplicar. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `BASE-02` (PROP), `IMP-01` (implementado_sin_auditar: preview integrado y verificado con e2e integral).
- **Reglas (textuales):**
  1. «El contrato debe resolver la diferencia entre límite del preview y validadores manuales existentes.»
  2. «COP final entero con Decimal y HALF_UP; no migrar históricos ni imponer precisión COP a USD.»
  3. «La regla nueva con IVA no borra ni convierte tarifas históricas sin IVA.»
- **Casos (ficha, textuales):**
  1. «Mismo valor se acepta/redondea igual por API manual y plantilla.»
  2. «0.49, 0.50, negativos, límite y desbordamiento tras redondear.»
  3. «Factura/cotización histórica conserva importes capturados.»
- **Aceptación del paso:** los 2 textuales de `contrato` (consistencia + incrementos registrados).

## 2. Estado actual (OBS — copia de revisión)

| Pieza | Estado | Evidencia |
|---|---|---|
| Límite del preview | `maximum = new Prisma.Decimal('9999999999')` (10 dígitos enteros) y `ROUND_HALF_UP` a 0 decimales; exige `> 0`, `rounded ≠ 0`, `rounded ≤ maximum` | `modules/prices/import/price-template.ts:10,85-90` |
| Validación manual (API de precios) | `validatePrice()` **solo** rechaza `value < 0`; **no** redondea ni limita el máximo | `modules/prices/prices.service.ts:83-101` |
| DTO manual (API de precios) | `CreatePriceDto.value` / `UpdatePriceDto.value`: `@IsNumber() @Min(0)` (acepta 0 y decimales; sin máximo) | `modules/prices/dto/create-price.dto.ts:15-16`, `update-price.dto.ts:9-11` |
| DTO manual (ficha de producto) | `PriceInputDto.value`: `@IsNumber() @Min(0.01)` (rechaza 0/negativo; sin máximo ni redondeo) | `modules/products/dto/price-input.dto.ts:14-16` |
| Escritura inline | `products.service.upsertPrices()` escribe `price.value` **tal cual** (sin normalizar) | `products/products.service.ts:1782-1808` |
| Almacenamiento | `Price.value Decimal @db.Decimal(12,2)` (10 enteros + 2 decimales), `currency String @default("COP")` | `prisma/schema.prisma:376-381` |
| Historial capturado | `QuoteItem.unitPrice` + `priceCapturedAt` ya capturan el importe al momento de cotizar | `prisma/schema.prisma` (QuoteItem) |
| Lectura de precios | La lectura (`public-pricing`, `products`) sirve el valor **guardado** (puede venir con `.5` en COP histórico) | `public-pricing.service.spec.ts:71` (612243.5) |
| Diseño (IP) | «COP termina en pesos enteros mediante la misma política en carga, edición y API… no usar `parseFloat` como validación ni cálculos monetarios con aproximación binaria»; «el límite operativo final debe ser único en validadores, API y BD» | `DISENO-IMPORTACION-PRECIOS-2026-10-14.md:94,96,150` |

**Hueco central:** hay **tres** entradas manuales/automáticas a un precio COP que hoy **no comparten** límite, redondeo ni validación: (a) preview/plantilla (límite `9999999999`, HALF_UP, `>0`); (b) API de precios (`<0`, sin redondeo, sin máximo); (c) ficha de producto `PriceInputDto` (`<0.01`, sin redondeo, sin máximo). El mismo valor puede aceptarse o almacenarse distinto según la entrada.

## 3. Política COP única (PROP)

| Elemento | PROP | Base |
|---|---|---|
| Módulo canónico | `src/backend/src/common/money/` (nuevo): política pura, sin BD ni HTTP | regla 1; patrón `common/date` |
| Moneda | La política se aplica **solo cuando la moneda efectiva es `COP`**: `effective = dto.currency ?? tariff.currency ?? 'COP'` (creación) / `dto.currency ?? price.currency` (edición). Otras monedas (USD/EUR) **conservan su precisión** | regla 2 |
| Límite | Único: `COP_MAXIMUM = 9999999999` (10 enteros; coherente con `Decimal(12,2)`), aplicado **tras** redondear | regla 1; diseño `:96` |
| Redondeo | `Decimal.toDecimalPlaces(0, ROUND_HALF_UP)` — **exacto** (Decimal, nunca `parseFloat`/`toFixed` sobre binario) | diseño `:94` |
| Validación (antes y después de redondear) | `null`/`NaN`/`∞`/no numérico → error; `≤ 0` → error; `rounded = 0` → error; `rounded > COP_MAXIMUM` → error | diseño `:96`; acceptance 2 |
| Resultado | `{ raw: string, rounded: string, wasRounded: boolean }` (raw = valor recibido exacto; rounded = entero COP final) | diseño `:94` (mostrar recibido y redondeo) |
| Aplicación — preview | `readPriceTemplate` usa la política (mismo resultado y mismo `PRICE_OUT_OF_RANGE` para los valores de la acceptance 2) | regla 1; acceptance 1 |
| Aplicación — API de precios | `PricesService.createPrice/updatePrice` normalizan cuando la moneda efectiva es COP y persisten el **entero** con `.00` | regla 2; acceptance 1 |
| Aplicación — ficha de producto | `PriceInputDto` valida con la política (`@IsCopPrice`) y **redondea en la entrada** (`@RoundCopPrice`) porque `products.service` no es writePath de este paso; así el inline queda igual | acceptance 1 |
| Históricos | **No se migran** filas `Price`, `QuoteItem` ni `Invoice`; la política corre solo en la **escritura**; la lectura sigue sirviendo el valor guardado | regla 2; acceptance 3 |
| Tarifas sin IVA | No se crean ni renombran tarifas; `ORO_IVA` es exacto (no alias de `DPP_ORO_IVA`); la regla no borra tarifas históricas | regla 3 |

## 4. Errores (PROP)

`400` (`BadRequestException`) cuando el valor COP: no es finito / no numérico, `≤ 0`, redondea a `0`, o supera `9999999999` **después** de redondear. Mensaje claro con el valor recibido y el límite. Negativos y `0.01`-por-debajo siguen rechazados como hoy. `@IsNumber()` sigue rechazando `NaN`/`∞`/texto en el borde HTTP. Sin cambios de alcance/permisos (los guards/ACL existentes no se tocan).

## 5. Aceptaciones por incremento (fichas textuales)

| Paso | Aceptación (ficha) | Acreditación prevista (PROP) |
|---|---|---|
| `contrato` | Contrato consistente con dependencias y decisiones pendientes explícitas; incremento registrado antes de delegar | Este documento (§3, §7) |
| `backend` | «Mismo valor se acepta/redondea igual por API manual y plantilla.» · «0.49, 0.50, negativos, límite y desbordamiento tras redondear.» · «Factura/cotización histórica conserva importes capturados.» | Spec de la política (`0.49→error`, `0.50→1`, negativos→error, `9999999999`→aceptado, `9999999999.5→10000000000→error`); entrada idéntica por API de precios y por `readPriceTemplate`; spec del DTO inline; e2e en base desechable (mismo valor por `POST /prices` y por plantilla); check de que escribir un precio **no** altera `quote_items`/histórico |

## 6. Incrementos (fichas textuales)

| Paso | Objetivo (ficha) | WritePaths (ficha) |
|---|---|---|
| IMP-03 `backend` | «Completar el alcance de servidor de este paso y sus pruebas…» | `modules/prices/**`, `products/dto/price-input.dto.ts`(+spec), `common/money/**` |

**Solape:** `price-template.ts` (IMP-01/IMP-02: ampliar, no reescribir), `prices.service.ts` (existente: añadir normalización, conservar solapamiento/ACL/auditoría), `PriceInputDto` (cambiar solo el validador del `value`). **`products.service.ts` NO es writePath**: por eso el inline se normaliza en el DTO.

## 7. Decisiones pendientes y bloqueos

| # | Decisión | Estado | Propuesta técnica (reversible) |
|---|---|---|---|
| N1 | ¿Redondear ya los `Price` COP históricos con decimales? | **No** (regla 2: no migrar históricos) | Solo nuevas escrituras; migración futura requiere impacto del coordinador |
| N2 | ¿Qué límite para monedas no-COP? | Sin imposición COP | Se conserva el comportamiento actual (positivo, sin máximo COP) |
| N3 | ¿El inline de ficha redondea en el DTO o en el servicio? | DTO (único borde escribible por writePaths) | Documentado; `@IsCopPrice` + `@RoundCopPrice` |
| N4 | Precisión COP aplicada también a totales de cotización | Fuera de alcance (contrato propio) | No se toca |
| D5/E6 | Guards/@Permissions y revalidación por petición | Heredadas | Sin cambios |
| Incidente helpers | CONTENIDO pendiente de auditoría | registrado | Implementación solo en entorno desechable |

## 8. Criterios de aceptación del paso `contrato`

1. ✅ Consistente con dependencias (`BASE-02` PROP, `IMP-01` implementado) y decisiones pendientes explícitas (§7).
2. ✅ Incremento `backend` registrado con objetivo/archivos/aceptación textuales antes de implementar (§6).
3. ✅ Reglas de ficha aterrizadas: diferencia preview/manual resuelta (§2, §3), COP entero HALF_UP sin tocar USD ni históricos (§3), tarifas sin IVA intactas (§3).
4. Advertencia de modalidad: PROP; auditoría final y QA-01 del coordinador.

## 9. Evidencia reproducible

```bash
sed -n '83,101p' src/backend/src/modules/prices/prices.service.ts   # validatePrice: solo value < 0
sed -n '14,16p'  src/backend/src/modules/products/dto/price-input.dto.ts  # @Min(0.01), sin redondeo
sed -n '10p'     src/backend/src/modules/prices/import/price-template.ts  # maximum 9999999999
rg -n "value\s+Decimal" src/backend/prisma/schema.prisma            # Decimal(12,2)
```
