# COM-05 — Resumen e indicadores con fuente visible (paso: contrato)

**Fecha:** 2026-10-16 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso escribe únicamente `docs/ejecucion-paneles/contratos/COM-05.md`; no modifica código, base de datos ni servicios activos (3000/5173/5432), no ejecuta commits y **no edita `estado.json` ni `tareas.json`**.

**Modalidad — tanda continua (PROP):** conforme a `docs/ejecucion-paneles/TANDA-COMPLETA.md`, este contrato se propone para la auditoría final única del coordinador. **No es una decisión aprobada.**

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/lectura directa en la copia de revisión `gs-tanda-01` o en este checkout. |
| **IP** | Informe previo: lo afirma un documento anterior; no se re-ejecutó aquí. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha `COM-05 contrato`, textual):** «Concretar clientes/cotizaciones/pendientes y fuente real de facturación. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `COM-01`, `COM-04` — ambos `implementado_sin_auditar` en la copia; **no verificados** en `estado.json` (este paso no lo edita).
- **Reglas de la ficha (textuales):** (1) «Datos actuales con referencia manual de factura no se presentan como sincronización Yéminus.» (2) «Separar cero ventas de fuente todavía no conectada. No ejemplos ficticios en pantalla operativa.» (3) «No contar dos veces cotización ganada, pedido e invoice; métricas propias/equipo según acción.»
- **Aceptación del paso `contrato`:** «Contrato consistente con dependencias y decisiones pendientes explícitas.» + «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.»

## 2. Estado actual (OBS — copia de revisión)

### 2.1 Backend: `modules/dashboard/dashboard.service.ts` (770 líneas)

| Métrica | Cómo se calcula hoy | Evidencia |
|---|---|---|
| Facturación (`invoiced`) | Pedidos (`SalesOrder`) con `externalInvoiceNumber: { not: null }` en el rango (mes/Bogotá) — **criterio único** en los tres consumidores (`mySalesGoal`, workspace propio, equipo) | `:58-59`, `:152`, `:336`, `:505` |
| Meta (`target`) | `SalesTarget` por `(userId,period)` (upsert de COM-04) — **separada** de `invoiced`; `remaining = target - invoiced` solo cuando hay meta | `:60`, `:327-360`, `:452` |
| Cotizaciones | `myQuotes` como **contadores por estado** (borrador/enviada/negociacion/ganada/perdida) y `pipeline` = monto de **abiertas** (enviada/negociacion) — nunca sumado con `invoiced` | `:64-73`, `:63` |
| Equipo | `invoicedByUserId` agrupando por `ownerId` del pedido; totales suman SOLO `invoiced` de miembros | `:533-563`, `:622` |
| Doble conteo cotización+pedido+invoice | **No encontrado en código**: el único `+=` sobre facturación es `:622` (invoiced de miembros); `ganada` es contador, no monto. **Riesgo residual:** si una futura suma mezcla `pipeline` (abierto) con `invoiced`, sería doble conteo — el contrato lo prohíbe (§3) | `rg "ganada.*\+|invoiced.*\+"` → solo `:622` |

**Acceso (OBS `dashboard.controller.ts`):** casi todo con `@Roles(...ALL_ROLES)` (`sales-goal`, `me`, `insights/catalog`, `insights/top-customers`, `insights/sales-by-category`, `team/:userId`); **solo** `insights/users` lleva `@Permissions('users:read')`. La visibilidad legacy del dashboard usa packs `dashboard:pack:`/`dashboard:block:` (`user-permissions.service.ts:17,54-55`) revalidados por petición desde D3. **Sin `dashboard:read` ni `commercialInsights:read` en el catálogo actual** (acciones que el diseño nombra — §8 H1).

### 2.2 Frontend

- **`AssignedReportsPage.tsx` y `AssignedHome.tsx` NO existen** (`ls src/frontend/src/pages/`): los writePaths de `COM-05 frontend` los declaran a crear (mismo patrón que `AssignedTargetsPage` en COM-04).
- **`Dashboard.tsx` (739 líneas)** — «Mi resumen» actual del workspace admin: mezcla pendientes de publicación y bloques comerciales; accesible como índice `/`.
- **`SupervisorWorkspacePage.tsx` — prototipo con datos ficticios**: banner «Vista de prueba · vendedores, metas, facturas y seguimientos ficticios» (`:31`) y filas hardcodeadas (`:13` «FAC-PRUEBA-003 · Saldo ficticio de $840.000»). **IP** `COMPARACION:33` y **IP** `DISENO-COMERCIAL:117` («La pantalla de supervisor actual usa datos ficticios y debe conectarse a fuentes reales») coinciden con el OBS.
- No existe etiqueta de fuente en ninguna tarjeta (buscado: `manual|referencia|Yéminus|pendiente` en `Dashboard.tsx`/`AssignedTargetsPage.tsx` → sin coincidencias de fuente).

### 2.3 Diseño (IP — `DISENO-PANEL-COMERCIAL-2026-10-13.md`)

- `:15` «evitando contar la cotización y la factura como dos ventas»; `:161` «La facturación se cuenta por identificador único de factura de origen… No se suma otra vez por la cotización ganada ni por el pedido interno».
- `:89` la sincronización «debe mostrar cuándo se actualizó la información y si la conexión está pendiente»; `:111` el avance «se calcula sobre la fuente acordada de Yéminus, separado del volumen de oportunidades cotizadas».
- `:177` acciones de resumen: `dashboard:read`, `commercialInsights:read`, `teamInsights:read` «según el resumen que se asigne»; `:214` «El tablero distingue facturación real, cotizaciones y pedidos sin stock; no duplica importes»; `:218` «El supervisor muestra fuentes reales y no los datos del prototipo».
- **B1/COM-07:** la fuente Yéminus no está conectada (bloqueo externo registrado); no se inventa.

## 3. Métricas y fuentes (PROP)

| Métrica | Fuente hoy (honesto) | Etiqueta PROP en UI | Regla |
|---|---|---|---|
| Facturación del mes | `SalesOrder.externalInvoiceNumber` **referencia manual** de factura | «Facturado (referencia manual de factura)» + «Sincronización ERP: pendiente de conexión» | **Nunca** presentarla como «sincronización Yéminus» (regla 1); cuando COM-07 conecte la fuente, la etiqueta cambia con `sourceStatus` |
| Cero facturación | mismo criterio con monto 0 | **«0» + fuente visible** (diferente de «sin conexión») | «Cero ventas» ≠ «Fuente no conectada» (regla 2): la respuesta distingue `invoiced {amount, currency, source:'invoice-ref-manual', sourceStatus:'not-connected-erp'}` de un 0 con fuente activa |
| Cotizaciones (pipeline/ganada/perdidas) | contadores propios de `Quote` | «Cotizaciones — oportunidades, no facturación» | Nunca sumar con facturación (regla 3, `:161`) |
| Pedidos internos | `SalesOrder` | «Pedido interno (no es factura)» | `:15`; doble `ganada` → 1 pedido (COM-03 verificado) |
| Meta/avance | `SalesTarget` + facturación propia (COM-04) | campos separados ya verificados | No mezclar con pipeline |

**Correspondencia sin doble conteo (PROP):** `cotización(ganada) → 1 pedido interno → invoice (referencia manual hoy, id único ERP mañana)`; cada nivel es una métrica distinta con su tarjeta; la facturación solo cuenta el nivel invoice. Si en el futuro una factura se recibe dos veces, el criterio de unicidad es el identificador de factura (`:161`) — fuera de este paquete (B1/COM-07).

## 4. Alcance propios/equipo (PROP)

- **Acciones** (catálogo actual de la copia + §8 H1): `teamInsights:read` (`team`) para bloques de equipo; métricas propias accesibles con cualquier sesión propia; sin grants de equipo → **solo datos propios** (la regla de visibilidad por concesión de equipo aplica cuando COM-01/COM-05 la conecten: hoy `team/:userId` está tras `@Roles(...ALL_ROLES)` y solo el filtro de datos separa propios/equipo — OBS `:113-114`; la sustitución es D5, pendiente).
- **Sin datos ajenos:** el servidor agrupa por `ownerId`/miembros del equipo (jerarquía); una métrica de miembro ajeno sin `teamInsights:read` no debe entregarse — el paso `backend` añade la comprobación por acción (patrón COM-02/COM-04 `assertActionAllowed`) dentro de `dashboard/**`.
- La UI de equipo (AssignedHome/AssignedReports) pinta lo que el servidor entrega; 403/404 se muestran con el mensaje del servidor (patrón COM-02..04).

## 5. Casos de paquete (los 3 textuales) y su acreditación

| # | Caso (ficha) | Acreditación prevista (PROP) |
|---|---|---|
| 5.1 | «Ganada sin factura no sube facturación real.» | Spec de `dashboard.service`: pedido creado por `ganada` con `externalInvoiceNumber = null` → `invoiced.amount` **no cambia**; e2e: marcar ganada (COM-03) → `sales-goal`/`me` con `invoiced` idéntico antes/después. La métrica `myQuotes.ganada` sí cambia (es contador de oportunidades) y así se documenta. |
| 5.2 | «Rango/monedas/equipo no mezclan datos ajenos.» | Specs con fixtures: miembro de OTRO equipo con facturación alta no contamina los totales propios; rango de fechas excluye pedidos fuera de mes; monedas mezcladas → `mixedCurrency: true` sin suma engañosa (ya existe `mixedCurrency`, `:25,89` — asértalo). Acción `teamInsights:read` sin grant → sin bloque de equipo (403 o bloque omitido — decisión del paso backend, §8 H3). |
| 5.3 | «Sin fuente no aparece un cero que simule consulta ERP exitosa.» | La respuesta incluye la etiqueta de fuente/estado (§3) y la UI la pinta; spec + e2e: con ERP no conectado, la tarjeta muestra «0 · referencia manual · ERP pendiente» (o equivalente) — **no** un 0 con apariencia de sincronización. Datos ficticios: `SupervisorWorkspacePage` no puede seguir siendo la pantalla operativa del supervisor (§8 H4). |

## 6. Errores (PROP)

`401` sesión · `403` acción de equipo sin concesión (`teamInsights:read`) · `404` miembro inexistente/fuera de alcance · `400` rango/parámetros inválidos (si el paso backend acepta rango explícito) · respuestas de fuente: estado `sourceStatus` no es error.

## 7. Incrementos posteriores registrados (fichas, textuales) y solape

**Aceptación idéntica en backend y frontend (textual):** «Ganada sin factura no sube facturación real.» + «Rango/monedas/equipo no mezclan datos ajenos.» + «Sin fuente no aparece un cero que simule consulta ERP exitosa.»

| Incremento | Objetivo (ficha) | Archivos (ficha) |
|---|---|---|
| **COM-05 `backend`** | «Completar el alcance de servidor de este paso y sus pruebas…» | `src/backend/src/modules/dashboard/**` |
| **COM-05 `frontend`** | «Conectar la interfaz al contrato de servidor auditado y verificar su recorrido; sin cambiar reglas desde el navegador.» | `pages/AssignedReportsPage.tsx`(+spec), `pages/AssignedHome.tsx`(+spec), `services/dashboard-insights.service.ts`(+spec) |

**Solape:** `dashboard.service.ts` es también referencia de COM-04 (avance) y futura base de COM-07 (indicadores con ERP) — COM-07 tendrá sus propios writePaths; `dashboard-insights.service.ts` ya fue extendido en COM-04 (ampliar, no reescribir); `SupervisorWorkspacePage.tsx`/`SupervisorLayout`/`Header` **no** están en los writePaths (§8 H4).

## 8. Decisiones pendientes y bloqueos

| # | Decisión/bloqueo | Afecta | Estado |
|---|---|---|---|
| H1 | `dashboard:read` y `commercialInsights:read` (DISENO:177) **no existen** en el catálogo; solo `teamInsights:read` está | backend | **Pendiente** — ¿añadir acciones o usar las existentes? (decisión técnica del paso backend, registrada) |
| H2 | Sustituir `@Roles(...ALL_ROLES)` por acciones (D5) en `dashboard/**` | backend | **Pendiente — coordinador (D5)**; el paso backend puede añadir comprobación de acción EN el servicio sin tocar guards (patrón COM-02..04) |
| H3 | Comportamiento sin `teamInsights:read`: ¿403 o bloque de equipo omitido? | backend | Pendiente de elegir en el paso backend (más conservador: omitir bloque, no romper el resumen propio) |
| H4 | `SupervisorWorkspacePage` (ficticio) y su ruta en `App`/`SupervisorLayout` | frontend | **Pendiente**: los writePaths no incluyen esas rutas; el paso frontend debe decidir si `AssignedHome` sustituye la pestaña (requiere tocar rutas = desviación a reportar) o si se documenta el prototipo como «fuera de pantalla operativa» |
| H5 | Etiqueta/estado de fuente (estructura `sourceStatus`) — ¿respeta el contrato actual de `sales-goal`/`me` o se añade campo? | backend+frontend | Pendiente técnico (compatibilidad: añadir campo, no romper) |
| B1/COM-07 | Sincronización Yéminus real | ambas | **Bloqueado** (fuente externa); la etiqueta honesta existe precisamente para no esperarlo |
| D5/E6 | Guards/@Permissions y revalidación de grants en JWT | backend | Heredadas, sin tocar |
| F3 | Selector de equipo sin gating (`fetchUsers`) si la UI de equipo lo necesita | frontend | Heredado de COM-04 |

## 9. Criterios de aceptación del paso

1. ✅ Contrato consistente con dependencias (`COM-01`/`COM-04` completados en copia, no aceptados) y decisiones pendientes explícitas (§8: H1-H5, B1, D5/E6, F3).
2. ✅ Incrementos registrados con objetivo, archivos y aceptación propios antes de delegar código (§7, con fichas textuales).
3. Reglas de la ficha aterrizadas: §3 (fuente honesta), §3/§5.3 (cero ≠ sin fuente; sin ficticios), §3/§5.1 (sin doble conteo), §4 (métricas según acción).
4. Advertencia de modalidad tanda continua: PROP para auditoría final; QA-01 reservado al coordinador.

## 10. Evidencia reproducible

```bash
# Desde S3 (solo lectura) y la copia gs-tanda-01
node docs/ejecucion-paneles/preparar-tanda.mjs COM-05 contrato   # ficha
ls src/frontend/src/pages/ | rg -i "assigned|home|report"          # AssignedHome/Reports ausentes
rg -n "externalInvoiceNumber" src/backend/src/modules/dashboard/dashboard.service.ts  # :152 :336 :505
rg -n "@Roles|@Permissions" src/backend/src/modules/dashboard/dashboard.controller.ts
rg -n "Vista de prueba|ficticios" src/frontend/src/features/supervisor/SupervisorWorkspacePage.tsx  # :31
rg -n "dashboard:read|commercialInsights:read" src/backend/src/common/security/access-catalog.ts   # sin coincidencia
```
