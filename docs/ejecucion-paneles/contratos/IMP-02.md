# IMP-02 — Descarga de plantilla vacía o con referencias autorizadas (paso: contrato)

**Fecha:** 2026-10-16 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Escribe únicamente `docs/ejecucion-paneles/contratos/IMP-02.md`; sin código, sin commits, **sin tocar `estado.json`/`tareas.json`**, servicios activos (3000/5173/5432) ni `opencode.json`.

**Modalidad — tanda continua (PROP):** propuesta para la auditoría final del coordinador; **no es una decisión aprobada**. El incidente de helpers (`resultados/TANDA-01-incidente-helper-db.md`) está **contenido, pendiente de auditoría**; esta implementación corre **exclusivamente en el entorno desechable** con `testdb.cjs`/URL inline y guards verificados. Sin conexiones ni escrituras en producción.

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha, textual):** «Concretar descarga vacía o con referencias autorizadas; seleccionar tarifas. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `BASE-02` (PROP), `IMP-01` (implementado_sin_auditar: preview integrado y verificado con e2e integral 14 checks).
- **Reglas (textuales):** (1) «Generar archivo nuevo sin filas comerciales del Excel editado por el usuario; no sobrescribir sus plantillas.» (2) «PRECIOS e INSTRUCCIONES, columnas exactas IVA; no ofrecer mapeo ni tarifas inventadas.» (3) «Descargar referencias/precios requiere acciones y alcance definidos; separar plantilla de exportación completa.»
- **Aceptación del paso:** los 2 textuales de `contrato`.

## 2. Estado actual (OBS — copia de revisión)

| Pieza | Estado | Evidencia |
|---|---|---|
| Preview (IMP-01) | `POST /api/prices/import/preview` integrado y verificado | `modules/prices/import/**` |
| `price-template.ts` | **SOLO LECTURA**: `readPriceTemplate(buffer)` valida hojas/encabezados/límites (103 líneas). **No genera archivos** | `rg write|build` → vacío |
| Endpoint de descarga | **NO existe** (el controller solo tiene `POST preview`) | `price-import.controller.ts` |
| Plantilla de referencia | `docs/plantillas/PLANTILLA-PRECIOS-GRUPO-SECURITY-v3.xlsx`: hojas `PRECIOS`+`INSTRUCCIONES`; fila 1 = `REFERENCIA, INSTALADOR_IVA, TIENDA_IVA, ORO_IVA, DPP_PLATINO_IVA, CLIENTE_FINAL_IVA`; 2000 filas preparadas vacías | lectura con `xlsx` |
| Generador de referencia | `docs/plantillas/generar_plantilla_precios.py` (162 líneas): transforma el archivo del usuario (limpia EJEMPLO/TARIFAS/CONTRATO). **Este paquete NO hace eso: genera un archivo NUEVO desde cero** (regla 1) | script + diseño |
| Tarifas canónicas | `PRICE_IMPORT_TARIFFS = [INSTALADOR_IVA, TIENDA_IVA, ORO_IVA, DPP_PLATINO_IVA, CLIENTE_FINAL_IVA]` (coinciden con la v3) | `price-import.types.ts:1-2` |
| Frontend | `features/price-import/` (preview integrado, 67/736 suite) **sin botón de descarga** | `rg download|descarga` → vacío |
| Diseño (IP) | `DISENO-IMPORTACION-PRECIOS-2026-10-14.md:39`: «Descargar plantilla permite elegir las tarifas… Ofrece 'Vacía' o 'Con las referencias de esta lista'; esta última puede incluir valores actuales como referencia si la persona tiene lectura/exportación… No se deja que un archivo elija otra lista destino o consiga acceso adicional» | reference de la ficha |

## 3. Descarga de plantilla (PROP)

| Elemento | PROP | Base |
|---|---|---|
| Endpoint | `GET /api/prices/import/template?listaId=<uuid>&mode=vacias\|referencias&tariffs=<csv opcional>` → XLSX, **archivo generado nuevo** (nombre `plantilla-precios-<code>-<fecha>.xlsx`). **Nunca** escribe ni sobrescribe el archivo del usuario (regla 1) | ficha goal; diseño `:39` |
| Hojas | Exactamente `PRECIOS` + `INSTRUCCIONES` (guía corta tipo v3; sin EJEMPLO/TARIFAS/CONTRATO) | regla 2; v3 |
| Columnas PRECIOS | Fila 1: `REFERENCIA` + tarifas IVA en orden de `PRICE_IMPORT_TARIFFS`, **solo las seleccionadas** (`tariffs` csv; default = las 5). Sin mapeo ni columnas inventadas; **`ORO_IVA` exacto, nunca alias `DPP_ORO_IVA`** (LEEME) | regla 2; acceptance 3 |
| mode=vacias | Solo encabezados + guía; 0 filas comerciales | diseño «Vacía» |
| mode=referencias | Encabezados + una fila por **SKU de ESA lista**. Con `prices:read` sobre la lista: incluye el precio actual de las tarifas seleccionadas **como referencia** (preview lo marcará `unchanged`); sin `prices:read`: solo referencias | diseño `:39`; regla 3 |
| Alcance/acciones | **Vacía:** `prices:preview` (o capa rol transicional D5, patrón IMP-01). **Con referencias/precios:** `prices:read` + `view_prices` vía `assertListaAccess` (patrón del preview). Lista ajena → **404**. **Exportación COMPLETA queda FUERA** | regla 3 |
| Selección de tarifas | `tariffs` ∈ `PRICE_IMPORT_TARIFFS`; desconocida → **400** | acceptance 3 |
| Auditoría | Evento `price-template-download` con `listaId`, `mode`, `tariffs`, `fileHash` del XLSX (sin SKUs ni precios) | patrón IMP-01 |

## 4. Aceptaciones por incremento (fichas textuales)

| Paso | Aceptación (ficha) | Acreditación prevista (PROP) |
|---|---|---|
| `backend` | «XLSX descargado se rellena y el preview actual lo acepta sin modificación de hojas.» · «Usuario no descarga referencias ni precios de otra lista.» · «ORO_IVA no se sustituye por DPP_ORO_IVA; columnas no seleccionadas se omiten.» | Spec: generar → rellenar (XLSX en el spec) → `readPriceTemplate`/`POST preview` aceptan (200, filas válidas) sin tocar hojas; `prices:read` solo de lista A → 404 para lista B y descarga = SOLO skus de A; `tariffs=ORO_IVA` → fila 1 = `REFERENCIA,ORO_IVA` exacto y sin `DPP_ORO_IVA` |
| `frontend` | mismos textuales | Botón «Descargar plantilla» (Vacía/Con referencias + casillas de tarifas, las 5 preseleccionadas); descarga del blob sin exponer otra lista; specs de render y service (mock api); CAT-01/preview preservados |

## 5. Errores (PROP)

`400` `listaId` inválido / `tariffs` desconocido / `mode` inválido · `401` sesión · `403` sin acción · `404` lista inexistente o ajena · la descarga **jamás** devuelve 200 con datos de otra lista.

## 6. Incrementos posteriores registrados (fichas textuales)

| Paso | Objetivo (ficha) | WritePaths (ficha) |
|---|---|---|
| IMP-02 `backend` | «Completar el alcance de servidor de este paso y sus pruebas…» | `modules/prices/import/**`, `access-catalog.ts`(+spec) |
| IMP-02 `frontend` | «Conectar la interfaz al contrato de servidor auditado…» | `features/price-import/**`, `services/price-import.service.ts`(+spec) |

**Solape:** `price-import/**` (IMP-01 integrado — ampliar, no reescribir; el `PriceImportPreviewPanel` ya existe), `access-catalog.ts` (ya tiene `prices:preview`/`prices:read`; no reescribir), `ListaDetailPage.tsx` NO es writePath aquí (si la descarga se coloca en el panel de revisión, no hace falta tocar la página).

## 7. Decisiones pendientes y bloqueos

| # | Decisión | Estado |
|---|---|---|
| P1 | ¿La descarga «con referencias» incluye precios actuales solo con `prices:read`, o también `prices:preview`? (PROP §3: solo `prices:read`) | Pendiente técnica del paso `backend` (reversible) |
| P2 | ¿La plantilla vacía requiere `prices:preview` o basta `listas:read`? (PROP §3: `prices:preview` con capa rol D5) | Pendiente técnica |
| B-IMP | Preview (IMP-01) ya integrado — sin bloqueo | Cerrado |
| D5/E6 | Guards/@Permissions y revalidación | Heredadas |
| Incidente helpers | CONTENIDO pendiente de auditoría; implementación solo en entorno desechable | registrado |

## 9. Criterios de aceptación del paso

1. ✅ Consistente con dependencias (`BASE-02` PROP, `IMP-01` implementado) y decisiones pendientes explícitas (§7).
2. ✅ Los 2 incrementos registrados con objetivo/archivos/aceptación textuales antes de delegar código (§6).
3. Reglas de ficha aterrizadas: archivo nuevo sin filas del usuario (§3), PRECIOS+INSTRUCCIONES exactas (§3), descarga con acciones/alcance y sin exportación completa (§3).
4. Advertencia modalidad tanda continua: PROP; QA-01 del coordinador.

## 10. Evidencia reproducible

```bash
node docs/ejecucion-paneles/preparar-tanda.mjs IMP-02 contrato
ls src/backend/src/modules/prices/import/                      # sin generador
rg -n "write|build" src/modules/prices/import/price-template.ts # vacío (solo lectura)
node -e "const X=require('xlsx');const w=X.readFile('docs/plantillas/PLANTILLA-PRECIOS-GRUPO-SECURITY-v3.xlsx');console.log(w.SheetNames)"  # PRECIOS, INSTRUCCIONES
```
