# IMP-07 — Perfiles de proveedor y exportación de listas

Paquete `IMP-07` (lane `imports`). Depende de `IMP-06` (✅ implementado). Referencia: `docs/DISENO-IMPORTACION-PRECIOS-2026-10-14.md` (§«Segunda etapa: formato guardado por proveedor», §39, §74-75, §92, §102, §114, §125, §158-166).

## 1. Objetivo y alcance

Añadir, sobre el motor exclusivo de precios ya existente (`modules/prices/import/**`, IMP-01..06):

- **Subentrega A — Exportación de listas (07A):** descargar un `.xlsx` con las referencias y los precios **vigentes** de una lista, limitado a los datos y tarifas **autorizados**. Reutiliza el ensamblado de la plantilla `mode=referencias` (IMP-02), que ya exige `prices:read` para incluir valores.
- **Subentrega B — Perfiles de proveedor (07B):** guardar **una vez** el formato de un proveedor recurrente (hoja, fila de encabezado, separadores, moneda, equivalencias referencia externa→producto y columnas de tarifas) y **reutilizarlo** en subidas posteriores, sin volver al mapeo obligatorio ni inferir columnas nuevas en silencio.

**Fuera de alcance:** escritura de identidad de producto, inferencia por fila, cálculo de márgenes desde costo, conversión de moneda automática, PDF/CSV (se conserva `.xlsx`), reconocimiento robusto basado solo en `ImportMapping`.

## 2. Reglas aplicables (fichas + diseño)

1. **Dos subentregas separadas** (`07A` exportación actual, `07B` perfiles), cada una con contrato propio en este documento antes de delegar código.
2. Un **perfil fija** proveedor, hoja, fila de encabezado, separadores (miles/decimal), moneda, equivalencias y tarifas; **cambio de estructura exige revisión** (no se adivina).
3. Ambas entradas usan el **motor exclusivo de precios**; **no** reactivar escritura de identidad ni inferencias por fila.
4. Precios **finales con IVA incluido**, COP enteros, redondeo `HALF_UP` (política única `common/money`, IMP-03). No sumar IVA ni convertir monedas.
5. Formato de proveedor: separadores y moneda **declarados por el perfil**, no heurísticas por fila. `1.234` no se interpreta a veces como 1234 y a veces como 1,234; `120000abc` se **rechaza completo** (no rescatar prefijo numérico).
6. **Equivalencia única**: referencia externa ambigua queda **pendiente**; dos equivalencias que apunten al mismo producto no permiten asignarlo a listas distintas (pertenencia comprobada sobre el producto).

## 3. Subentrega A — Exportación de listas (07A)

**Flujo:** En la lista → pestaña «Revisar precios» → botón **«Exportar precios (.xlsx)»**. El sistema arma un archivo NUEVO con las referencias de **ESA** lista y los precios vigentes de las tarifas seleccionadas; nunca parte de un archivo del usuario.

| Aspecto | Definición |
|---|---|
| Alcance | Solo referencias de la lista autorizada y solo tarifas seleccionadas |
| Datos incluidos | SKU + precio vigente por tarifa (COP, IVA incluido) |
| Datos excluidos | Productos de otras listas, tarifas no seleccionadas, datos de identidad que no autoriza el alcance |
| Permiso | `prices:read` (permite exportar); sin él, 403 |
| Aislamiento | `assertListaAccess(listaId, ctx, 'view_prices')` — lista ajena → 403 |
| Archivo | `.xlsx` hojas `PRECIOS`+`INSTRUCCIONES` (mismo contenedor de IMP-02), nombre `lista-<code>-<fecha>.xlsx` |
| Efectos | **Ninguno** sobre precios/identidad; se audita `price-list-export` (hash del archivo) |

**Errores:** `400` lista/tarifa inválida; `403` sin `prices:read` o lista ajena; `404` lista inexistente.

## 4. Subentrega B — Perfiles de proveedor (07B)

**Campos del perfil (versión 1):**

| Campo | Descripción |
|---|---|
| `providerName` | Proveedor (texto libre normalizado) |
| `sheet` | Nombre de la hoja a leer |
| `headerRow` | Fila del encabezado (entero ≥ 1) |
| `thousandsSeparator` | `.` o `,` o vacío |
| `decimalSeparator` | `.` o `,` |
| `currency` | Solo `COP` (IVA incluido) |
| `tariffs[]` | Columna → tarifa (`PRICE_IMPORT_TARIFFS`); sin columnas nuevas fuera de catálogo |
| `equivalences[]` | `externalRef` → `productId` (única por proveedor) |
| `expectedColumns` | Esquema esperado (huella de encabezados) para **detectar cambios** |
| `version` | Entero; incrementa al revisar la estructura |

**Flujo:** subir archivo de proveedor → el sistema **reconoce** el perfil por proveedor → propone precios tipados (usa separadores y moneda del perfil) → validación/normalización COP única → comparación → (a partir de aquí, el flujo de revisión/aplicación de IMP-04/05, sin cambios).

**Reglas de reconocimiento:**
- Mismo proveedor repetido **no pide mapear de nuevo** (caso 1).
- **Encabezado cambiado** respecto de `expectedColumns` → **no carga** en una tarifa parecida; se pide **revisar el perfil** y sube `version` (caso 2).
- **Referencia externa ambigua** (sin equivalencia única) → fila **pendiente**, no asignada (caso 2).

**Permisos:** `providers:read` (ver perfiles/equivalencias), `providers:write` (crear/editar/revisar; depende de `providers:read`). El uso del perfil al previsualizar sigue exigiendo las acciones de la subida (`prices:preview`/`prices:save`/`prices:apply`).

**Rutas propuestas (07B):**
- `GET /api/prices/import/profiles` (lista, `providers:read`)
- `GET /api/prices/import/profiles/:id` (`providers:read`, alcance probado)
- `POST /api/prices/import/profiles` (`providers:write`)
- `PUT /api/prices/import/profiles/:id` (`providers:write`, sube `version` si cambia estructura)
- `DELETE /api/prices/import/profiles/:id` (`providers:write`, no borra precios)
- `PUT /api/prices/import/profiles/:id/equivalences` (`providers:write`)

## 5. Matriz UI/API (ocultar es cosmético; el servidor revalida)

| Acción | Permiso | Sin permiso (UI) | Sin permiso (API) |
|---|---|---|---|
| Exportar precios | `prices:read` | botón oculto | `403` |
| Ver perfiles | `providers:read` | sección oculta | `403` |
| Crear/editar/revisar perfil | `providers:write` | acciones ocultas | `403` |
| Previsualizar/guardar/aplicar (con perfil) | `prices:preview`/`prices:save`/`prices:apply` | ver IMP-06 | `403` |

## 6. Rutas de servidor

- **07A (nueva):** `GET /api/prices/import/export?listaId=&tariffs=` (binario `.xlsx`, `@Res()` sin passthrough).
- **Reutilizadas (IMP-04/05/06):** `preview`, `template`, `revisions…`, `apply`.
- **07B (nuevas):** `profiles…` (§4).

## 7. Incrementos (fichas textuales)

| Paso | Objetivo | WritePaths | Aceptación |
|---|---|---|---|
| `contrato` | Este documento | `contratos/IMP-07.md` | Contrato + incrementos registrados |
| `backend` | Exportación (07A) + perfiles de proveedor (07B) y sus pruebas | `modules/prices/import/**`, `schema.prisma`, `migrations/**`, `common/security/access-catalog.ts`(+spec) | Casos 1, 2 y 3 |
| `frontend` | Botón de exportación y gestión de perfiles; sin reglas desde el navegador | `features/price-import/**`, `services/price-import.service.ts`(+spec) | Casos 1, 2 y 3 |

## 8. Decisiones pendientes y bloqueos

- Ninguna decisión de negocio no documentada bloquea `07A`/`07B` (el diseño fija campos, permisos y errores).
- Bloqueo **externo** vigente y ajeno a este paso: API Yéminus y Excel «Pedidos» saneado (COM-06/07). No afectan a IMP-07.
- Si al implementar `07B` apareciera una decisión no cubierta (p. ej. catálogo cerrado de proveedores), se registra como bloqueo con motivo y se prioriza `07A` (independiente).

## 9. Mapeo de casos (ficha)

| Caso | Dónde se cumple |
|---|---|
| 1. Mismo proveedor repetido no pide mapear de nuevo | 07B: perfil reconocido por proveedor reutiliza hoja/fila/separadores/tarifas/equivalencias |
| 2. Encabezado cambiado no carga en tarifa parecida; referencia ambigua queda pendiente | 07B: `expectedColumns` fuerza revisión (sube `version`); equivalencia no única → fila `pendiente` |
| 3. Exportar selección/toda la lista solo incluye datos/tarifas autorizados | 07A: `prices:read` + `assertListaAccess` + solo tarifas seleccionadas; `403` en lista ajena |

## 10. Evidencia reproducible

```bash
rg -n "export|profiles" src/backend/src/modules/prices/import/price-import.controller.ts
rg -n "providers:read|providers:write" src/backend/src/common/security/access-catalog.ts
rg -n "exportListaPrices|profiles" src/frontend/src/services/price-import.service.ts
rg -n "Exportar precios|Perfil" src/frontend/src/features/price-import/
```

## 11. Estado de implementación

- `contrato`: **hecho** (este documento).
- `backend` (07A exportación): ver §12.
- `backend` (07B perfiles): ver §13.
- `frontend` (07A + 07B): ver §14.
- `IMP-07` queda con sus dos subentregas implementadas, **pendiente de auditoría** (`implementado_sin_auditar`).

## 12. Verificación `backend` — 07A exportación

**Estado:** implementado (subentrega A). Endpoint `GET /api/prices/import/export` reutiliza el ensamblado de referencias de la plantilla (`collectListaReferences`), con permisos propios.

| Aceptación | Comprobación | Resultado |
|---|---|---|
| Solo tarifas autorizadas (caso 3) | `normalizeTariffs` + columnas exactas pedidas; sin tarifas extra | ✅ unit: encabezado `['REFERENCIA','ORO_IVA']`; e2e: ídem |
| Solo datos de ESA lista | `assertListaAccess(listaId, ctx, 'view_prices')`; `product.findMany({where:{listaId}})` | ✅ unit + e2e |
| Exige `prices:read` (no `prices:preview`) | `concede('prices:read')`; sin concesión → 403 | ✅ unit: 403 sin concesión; unit: exporta con solo `prices:read` |
| Tarifa desconocida → 400 | `normalizeTariffs` | ✅ unit + e2e (400) |
| Lista ajena → 403 | `assertListaAccess` rechaza | ✅ unit |
| Archivo NUEVO `.xlsx` (no el del usuario) | `buildPriceTemplate` (IMP-02) | ✅ e2e: hojas `PRECIOS`+`INSTRUCCIONES` |
| Auditoría sin SKUs ni precios | `price-list-export` con `fileHash` | ✅ unit |

**Pruebas:** backend `price-template-download.spec.ts` **19/19** (6 nuevas de exportación); e2e vivo `e2e-imp07.cjs` **8/8** en BD desechable (401 sin token; 200 + `content-type` + `lista-<code>-<fecha>.xlsx`; hojas y encabezado; 400 tarifa desconocida y `listaId` inválido). Solo lectura: no escribe precios/identidad.

## 13. Verificación `backend` — 07B perfiles

**Estado:** implementado (subentrega B). Esquema + migración `20261017140000_add_provider_profiles` (tablas `provider_profiles` y `provider_equivalences`), acciones `providers:read`/`providers:write` (global, `write` depende de `read`), CRUD, equivalencias, reconocimiento por encabezado y resolución de referencias. Rutas bajo `POST/GET/PUT/DELETE /api/prices/import/profiles*` y se registran en el controlador existente (`modules/prices/import/**`, writePath), sin tocar `prices.module.ts`.

| Aceptación (casos 1 y 2) | Comprobación | Resultado |
|---|---|---|
| Caso 1: mismo proveedor repetido no pide mapear de nuevo | `recognizeProviderProfile` → `matches=true`, `requiresReview=false` (reutiliza hoja/fila/separadores/tarifas del perfil) | ✅ unit + e2e |
| Caso 2: encabezado cambiado exige revisar | `profileMatchesHeaders` compara la huella `expectedColumns`; si difiere → `requiresReview=true`; al guardar, `version+1` | ✅ unit + e2e (v1→v2) |
| Caso 2: referencia ambigua queda pendiente | `resolveExternalReferences`: sin equivalencia única → `status:'pending'`, `productId:null` (no se adivina) | ✅ unit + e2e |
| Formato declarado, no heurístico | separadores de miles/decimal y moneda COP explícitos en el perfil; se rechaza miles = decimal | ✅ unit |
| Proveedor duplicado → 409 (no duplica perfiles) | `createProviderProfile` | ✅ unit + e2e |
| Equivalencia a producto inexistente → 400 sin escribir | `setProviderEquivalences` valida `product.findMany` | ✅ unit + e2e |
| Permisos separados y revalidados | `providers:read` para listar/reconocer/resolver; `providers:write`+`read` para crear/editar/borrar/equivalencias; sin concesión → 403 (Super Admin exento por `resolveAccess`) | ✅ unit + e2e (403 real con usuario sin concesión) |
| Auditoría sin precios | `provider-profile-create/update/delete/equivalences` (`entity=PROVIDER_PROFILE`) | ✅ unit |
| Alcance de la lista no se altera | no escribe `Product.listaId` ni `Price`; sólo perfiles y equivalencias | ✅ e2e: precios/productos intactos |

**Pruebas:** backend `provider-profile.spec.ts` **10/10** (núcleo puro) + `provider-profiles.spec.ts` **14/14** (servicio: permisos, CRUD, equivalencias, reconocimiento, resolución) + `access-catalog.spec.ts` (+1, 35/35); e2e vivo `e2e-imp07b.cjs` **17/17** en BD desechable (401 sin token; 403 con usuario sin `providers:read`/`providers:write`; 400 validación; 201 crear; 409 duplicado; reconocimiento casos 1 y 2; equivalencias y resolución; 404 tras borrar). Migración aplicada a las 7 BDs desechables.

## 14. Verificación `frontend`

**07A (hecho):** `exportListaPrices` en el servicio; `ExportListaSection` + `export-prices.utils` (`canExportPrices` = `prices:read` o capa legada) dentro de `features/price-import/**` (writePath de IMP-07), integrado en el panel de «Revisar precios».

- frontend: `price-import.service.spec.ts` (2 nuevas de exportación) y `export.spec.tsx` (3) → verde; `tsc` 0; `eslint` 0 errores/0 warnings.
- Sin permiso `prices:read` la sección no se muestra; con él aparece el botón; el servidor revalida de todos modos.

**07B (hecho):** `ProviderProfilesSection.tsx` (crear/revisar/retirar perfiles, reconocimiento y equivalencias) + `provider-profiles.utils.ts` (`canManageProviderProfiles`/`canEditProviderProfiles` por `providers:read`/`providers:write` con capa legada, validación en cliente espejo del servidor, `recognitionMessage`, `summarizeResolution`), integrada en el panel de «Revisar precios».

- frontend: `provider-profiles.spec.tsx` (10) + `price-import.service.spec.ts` (+5 de perfiles) → verde; `tsc` 0; `eslint` 0 errores/0 warnings; `vite build` OK.
- Sin `providers:read` la sección no se muestra; con sólo `providers:write` no se puede crear (se exige `read`); el servidor revalida cada acción.
