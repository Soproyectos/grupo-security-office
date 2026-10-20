# IMP-06 — Conectar Aplicar e historial en la pantalla (paso: contrato)

**Fecha:** 2026-10-17 · **Copia de trabajo:** `/home/soporte/office_ai/gs-tanda-01` · **Alcance:** solo documentación. Escribe únicamente `docs/ejecucion-paneles/contratos/IMP-06.md`; sin código, sin commits, **sin tocar `estado.json`/`tareas.json`**, servicios de S3 ni `opencode.json`.

**Modalidad — tanda continua (PROP):** propuesta para la auditoría final; **no es decisión de negocio aprobada**. Verificación de interfaz sin navegador real (QA-01 del coordinador); datos solo en BDs desechables.

## 1. Meta, dependencias, reglas y casos (ficha textual)

- **Meta:** «Concretar comparador persistido, confirmación y resultado por fila. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn:** `IMP-05` (implementado) y `IMP-02` (implementado).
- **Reglas:** 1) «Revisar y Aplicar se muestran según acciones distintas; el servidor mantiene ambos controles.» 2) «Errores no se descartan silenciosamente; selección/exclusión explícita y cantidades pendientes.» 3) «Historial limitado a lista sin exigir auditoría global; no conservar el botón CSV como supuesta nueva plantilla.»
- **Casos:** 1) «Navegador: descargar, rellenar fixture, revisar, confirmar y consultar resultado tras recargar.» 2) «Doble clic/reenvío no duplica; conflicto muestra corrección sin falso éxito.» 3) «Usuario de listas opera sin Biblioteca; pantalla móvil conserva comparación ordenada.»
- **Incrementos:** `contrato`, `backend`, `frontend`.

## 2. Estado actual (OBS)

| Pieza | Estado | Evidencia |
|---|---|---|
| Descarga de plantilla | Hecha (IMP-02): `downloadPriceTemplate`/`parseTemplateFileName`/`saveTemplateDownload`, `DownloadTemplateSection` | `services/price-import.service.ts`, `features/price-import/**` |
| Preview (revisar) | Hecho (IMP-01/02): `PriceImportPreviewPanel`, `PriceImportPreviewResults`, `preview.utils`, `preview.spec.tsx`; pestaña `review` en `ListaDetailPage.tsx` | idem |
| Servidor de revisión | **Hecho (IMP-04)**: `POST/GET/GET/:id/GET/:id/file/DELETE revisions`; guardar (idempotencia), listar, detalle, descargar, descartar | `price-import.controller.ts` |
| Servidor de aplicar | **Hecho (IMP-05)**: `POST revisions/:id/apply` (transacción, versión esperada, idempotente); `appliedResult` en el detalle | idem |
| Acciones | `prices:preview`, `prices:read`, `prices:save`, `prices:apply` (todas LISTA_SCOPES) | `access-catalog.ts` |
| Gate de pestaña | `canReviewPrices()` = `hasPermission('prices:preview') || canManageListas()` | `ListaDetailPage.tsx` |

**Hueco:** el frontend **no** llama todavía a guardar/aplicar/historial: falta el flujo de 3 pasos (descargar → revisar+guardar → aplicar+historial) con gating por acción y manejo de conflicto.

## 3. Flujo de interfaz (PROP) — tres pasos en la pestaña «Revisar precios»

1. **Preparar**: descargar plantilla (vacías/referencias) **[IMP-02]**. Sustituye el botón CSV anterior; **no** se conserva como «nueva plantilla» (regla 3).
2. **Revisar y guardar**: subir `.xlsx` → `POST preview` (muestra resumen, filas, incidencias, redondeos) → botón **«Guardar revisión»** (acción `prices:save`) con clave de idempotencia generada en cliente (uuid) para que doble clic/reenvío **no duplique** (caso 2). El servidor **recalcula** (no confía en el navegador).
3. **Aplicar e historial**: lista de revisiones de la lista (`prices:read`) con su estado (`GUARDADA`/`APLICADA`/`DESCARTADA`); botón **«Aplicar»** (acción `prices:apply`) que llama `POST :id/apply`; muestra el `appliedResult` (filas/precios/tarifas) o, ante **409**, el `feedback` por fila (corrección concreta, **sin falso éxito**). Tras recargar, el historial y el resultado persisten (caso 1).

## 4. Acciones y gating (regla 1)

| Control | Acción exigida | Si falta |
|---|---|---|
| Descargar plantilla | `prices:preview` | botón oculto/deshabilitado |
| Revisar (preview) | `prices:preview` | pestaña oculta (gate actual) |
| Guardar revisión | `prices:save` | botón oculto; el servidor igualmente deniega |
| Historial (listar/detalle) | `prices:read` | sección oculta |
| Aplicar | `prices:apply` | botón oculto; el servidor deniega con 403 |

- **Revisar ≠ Aplicar** (regla 1): un usuario con `prices:save` y sin `prices:apply` prepara y deja el trabajo; otro con `prices:apply` lo termina (diseño §35). El gating de UI es **cosmético**: el servidor revalida por solicitud.
- Alcance: la pestaña opera sobre la lista de `ListaDetailPage`; el historial se limita a **esa lista** (regla 3), sin exigir auditoría global.

## 5. Errores y estado (regla 2)

- Incidencias del preview se muestran por fila/celda/motivo; **nunca** «todo actualizado» si quedan filas pendientes (se muestran las cantidades pendientes).
- Aplicar con filas en error → **409 `REVISION_HAS_ERRORS`** con `feedback` por fila; **no** aplica nada. La **exclusión explícita** de incidencias queda como incremento posterior (decisión N1); mientras tanto se comunica claramente.
- Conflicto entre revisar y aplicar → **409 `REVISION_CONFLICT`** con `feedback` (SKU · tarifa · esperado/actual); la UI muestra «corregir y reintentar», nunca éxito.
- 403/404/400 se muestran con el mensaje del servidor; sin estados de «éxito optimista».

## 6. Rutas de servidor usadas (sin cambios de contrato salvo lo mínimo)

`POST /api/prices/import/preview`, `GET /api/prices/import/template`, `POST/GET/GET/:id/GET/:id/file/DELETE /api/prices/import/revisions`, `POST /api/prices/import/revisions/:id/apply`. Si el paso `backend` de IMP-06 no necesita ampliación, se documenta como **no-op** con evidencia de los endpoints existentes (IMP-04/05) y se centra el trabajo en el `frontend`.

## 7. Incrementos (fichas textuales)

| Paso | Objetivo (ficha) | WritePaths | Aceptación |
|---|---|---|---|
| `contrato` | Comparador persistido, confirmación y resultado por fila | `contratos/IMP-06.md` | Contrato + incrementos registrados |
| `backend` | Completar alcance de servidor de este paso y sus pruebas | `modules/prices/import/**`, `access-catalog.ts`(+spec) | Endpoints de guardar/aplicar/historial disponibles; **no-op documentado** si ya cubierto |
| `frontend` | Conectar la interfaz al contrato de servidor; sin cambiar reglas desde el navegador | `features/price-import/**`, `services/price-import.service.ts`(+spec), `pages/ListaDetailPage.tsx`(+spec) | Casos 1, 2 y 3 (flujo, no-duplicación/conflicto, sin Biblioteca + móvil) |

## 8. Decisiones pendientes y bloqueos

| # | Decisión | Estado | Propuesta (reversible) |
|---|---|---|---|
| N1 | Exclusión expresa de filas con error en la UI | Pendiente | Fuera de este incremento: se comunica el pendiente; exclusión en incremento futuro |
| N2 | ¿Sección de historial separada o dentro de la pestaña? | Pendiente | Dentro de la pestaña «Revisar precios» (misma lista) |
| N3 | Botón CSV anterior | Pendiente | Se **retira** (regla 3); descarga solo vía plantilla |
| — | Navegador real / móvil | **QA-01 del coordinador** | Recorrido documentado para la auditoría |
| — | Perfiles de proveedor / exportación | **Fuera de alcance** | IMP-07 |

## 9. Criterios de aceptación del paso `contrato`
1. ✅ Consistente con dependencias (IMP-05/IMP-02 implementados) y decisiones explícitas (§8).
2. ✅ Incrementos `backend`/`frontend` registrados con writePaths y aceptación textuales (§7).
3. ✅ Reglas aterrizadas: Revisar≠Aplicar según acciones (§4); errores con cantidades pendientes y conflicto sin falso éxito (§5); historial limitado a lista y retiro del CSV (§3, §4).
4. ⚠ Modalidad PROP; auditoría final y QA-01 del coordinador.

## 10. Evidencia reproducible
```bash
rg -n "revisions|apply" src/backend/src/modules/prices/import/price-import.controller.ts
rg -n "prices:save|prices:apply|prices:read|prices:preview" src/backend/src/common/security/access-catalog.ts
rg -n "canReviewPrices|review" src/frontend/src/pages/ListaDetailPage.tsx
rg -n "downloadPriceTemplate|previewPriceImport" src/frontend/src/services/price-import.service.ts
```

## 11. Verificación del incremento `backend` — REUTILIZADO (no se declara completo sin comprobar)

Estado: **reutilizado** de los pasos `IMP-01`, `IMP-02`, `IMP-04` y `IMP-05`. No se añadió código de servidor nuevo en IMP-06; se **comprobaron** las seis aceptaciones exigidas con pruebas y e2e vivo sobre BD desechable.

| # | Aceptación exigida | Comprobación | Resultado |
|---|---|---|---|
| 1 | Revisar / guardar / aplicar con **permisos separados** | Petición sin `prices:preview` → 403 (IMP-01/02); sin `prices:save` → 403; sin `prices:apply` → 403; sin `prices:read` → 403 (historial) | ✅ specs deterministas |
| 2 | Se aplica **exactamente la revisión guardada** | `applyRevision` re-lee filas/precios de BD (no acepta nada del navegador); lee `(productId, priceListId)` y escribe el `roundedValue` guardado | ✅ e2e: `Price=123457.00` igual al guardado |
| 3 | `409` **explica qué cambió** y **no hay falso éxito** | `REVISION_CONFLICT`/`REVISION_HAS_ERRORS` con `feedback` por fila; se emite vía el filtro global sin tocarlo | ✅ e2e: `IMP05-SKU-1 · ORO_IVA: PRICE_CHANGED (esperado 123457, actual 999999)`; precio intacto |
| 4 | **Reintentar no duplica** cambios | Si `status='APLICADA'` devuelve `appliedResult` con `alreadyApplied:true` y no re-escribe; evento de éxito una sola vez | ✅ e2e: reintento sin `price.update`; `price-import-apply` x1 |
| 5 | **Historial y archivos respetan el acceso a la lista** | `listRevisions`/`getRevision`/`getRevisionFile` exigen `prices:read` **y** `assertListaAccess`; lista ajena → 403; archivo ausente → 404 | ✅ specs deterministas (3 pruebas) |
| 6 | Precios **manuales e importados con la misma regla COP** | Ambos usan `common/money` (IMP-03): manual = `normalizeCopInput` en `prices.service`; aplicar = `normalizeCopPrice(roundedValue).rounded` (defensa en profundidad) | ✅ misma política compartida |

**Endpoints reutilizados (sin cambios):** `POST /preview`, `GET /template`, `POST|GET|GET/:id|GET/:id/file|DELETE /revisions`, `POST /revisions/:id/apply`.

**Conclusión:** el incremento `backend` de IMP-06 **no requiere código nuevo**; queda documentado como **reutilizado** con las aceptaciones comprobadas (spec `price-import-revisions.spec.ts` **21/21**; e2e vivo IMP-04/05). El trabajo restante de IMP-06 es **solo `frontend`** (§3, §4).
