# Historial de decisiones del proyecto Grupo Security Office

Registro completo y narrativo de decisiones arquitectónicas, operativas y de gobernanza tomadas durante el desarrollo del proyecto. Para decisiones activas que condicionan trabajo futuro, ver `../../CLAUDE.md` sección "Decisiones vigentes".

## Riesgo operativo: subagentes devuelven reportes vacíos (2026-08-05)

### Propósito
Registrar un fallo intermitente del entorno de subagentes detectado durante la Fase 3c, para que las fases siguientes traten los reportes vacíos como NO VERIFICADO y nunca como trabajo completado.

### Hallazgo
Durante la Fase 3c (Asignaciones/ACL), **3 tasks delegados consecutivos retornaron vacíos sin evidencia alguna**:
1. `3c-FIX` (fix de ACL en `GET /api/catalogs/:id` y delete de usuarios con assignments).
2. `3c-D2` (re-validación QA de los fixes).
3. Re-intento de QA (validación de UI de Asignaciones).

Los reportes vacíos no implicaban que el trabajo estuviera hecho ni pendiente: eran silencios del entorno de subagentes.

### Mitigación aplicada (verificación manual directa)
Ante el silencio, el orquestador verificó con evidencia directa del repo y del entorno:
- **Fix**: `git status --short` + `git diff --stat` + lectura de las líneas clave (`catalogs.service.ts` findOne con ACL, `catalogs.controller.ts` con `@CurrentUser`, `users.service.ts` con `assignment.deleteMany`).
- **Tests**: `npm test` en `src/backend` → 235/235.
- **E2E real**: scripts `.cjs` temporales con `fetch` contra `http://localhost:3000` (login, crear catálogos/usuario/asignación, verificar 200/404/403, delete de usuario con assignment) — scripts borrados tras ejecución.
- **BD**: conteos reales vía PrismaClient (assignments=0, catálogos legítimos, usuarios legítimos, 197 productos, 1379 precios).

### Regla operativa para fases siguientes
- Un task delegado que devuelve **reporte vacío** se marca como **NO VERIFICADO** y no cierra la orden.
- Antes de cerrar: confirmar con evidencia (git diff, tests, E2E, estado BD) o relanzar la tarea con exigencia explícita de reporte en texto.
- El único `.cjs` legítimo del repo es `src/frontend/chrome-analyze.cjs` (QA visual, tracked); cualquier otro `.cjs` temporal debe borrarse tras su uso.

### Nota de trazabilidad (cierre Fase 3c)
Las órdenes **3c-C2** (devops: builds/migraciones/health) y **3c-D3** (QA: contrato `manage` + flujo asignaciones) se ejecutaron **antes** de la instrucción explícita del usuario de pausarlas. El usuario aceptó el desfase y las dio por válidas (resultados limpios: 5 migraciones sin drift, builds 0 errores, health 200; `manage`→201, `admin`→400, 409/403, BD limpia). No se re-ejecutaron para evitar duplicar trabajo.

## Migración de roles RBAC a los 5 roles finales (2026-08-03)

### Propósito
Reemplazar los roles legacy en inglés (`Admin`, `Gerente`, `Operator`, `Viewer`) por los 5 roles definitivos en español definidos por el negocio, sin tocar el schema Prisma (los roles son datos, no modelo).

### Contrato (fuente de verdad)
| Rol | Permisos |
|---|---|
| Super Admin | products:read/write/delete, categories:read/write, brands:read/write, prices:read/write, users:read/write/manage, audit:read, publish:manage |
| Supervisor | products:read, publish:manage, audit:read |
| Admin Comercial | products:read/write/delete, categories:read/write, brands:read/write, prices:read/write, publish:manage |
| Operador | products:read, categories:read, brands:read, prices:read |
| Consulta | products:read, categories:read, brands:read, prices:read |

### Cambios realizados
- **seed.ts**: upsert de los 5 roles con descripciones en español; permisos reemplazados por la matriz exacta en cada corrida (idempotente); migración de roles legacy con reasignación de usuarios y limpieza de `user_roles` (FK RESTRICT); admin `admin@grupo-security.com` asignado a **Super Admin**.
- **Controllers**: decoradores `@Roles` actualizados según la matriz (lectura → 5 roles; escritura → Super Admin + Admin Comercial; borrado/gestión usuarios/roles → Super Admin; auditoría → Super Admin + Supervisor).
- **DTOs, fixtures y specs**: nombres de roles actualizados a los nuevos; 171 tests pasando.

### Mapa de migración
Admin → Super Admin · Gerente → Admin Comercial · Operator → Operador · Viewer → Consulta (todos reasignados y luego eliminados).

## Dashboard.tsx Mejoras (2026-07-31)

### Propósito
Mejorar el dashboard principal de Grupo Security Office para mostrar productos tendencia dinámicamente desde la API, mejorando la experiencia de usuario, accesibilidad y mantenibilidad.

### Dependencias
- Frontend: React, TanStack React Query, React Router DOM, Tailwind CSS
- Backend: NestJS, Prisma, PostgreSQL

### Flujo de datos
1. **Backend**: Endpoint `/api/products/trending` (GET) devuelve productos visibles/activos de los últimos 30 días con caché de 5 minutos
2. **Frontend**: Servicio `trending.service.ts` consume el endpoint mediante `fetchTrendingProducts`
3. **Componente**: `Dashboard.tsx` usa `useQuery` para obtener y mostrar productos tendencia en un carrusel accesible

### Cambios realizados

**Backend (`src/backend/src/modules/products/`):**
- **products.service.ts**: Agregado método `findTrending` con caché de 5 minutos
- **products.controller.ts**: Agregado endpoint `/trending` con decorador `@Public()`

**Frontend (`src/frontend/src/`):**
- **services/trending.service.ts**: Servicio para consumir `/api/products/trending`
- **constants.ts**: Definidas constantes (`CAROUSEL_INTERVAL`, `TRENDING_PRODUCTS_LIMIT`)
- **pages/Dashboard.tsx**: Reescrito completamente con:
  - Consumo dinámico de productos tendencia vía API
  - Carrusel con rotación automática y navegación por teclado
  - Estados de loading y error con skeletons y mensajes amigables
  - Accesibilidad mejorada (ARIA labels, tabindex, keyboard navigation)
  - Indicadores de carrusel accesibles
- **src/frontend/src/components/ui/Card.tsx**: Rediseñado para incluir:
  - Sistema de variantes (primary, secondary, success, warning, error, info)
  - Estados hover y elevación mejorados
  - Uso de CSS variables para consistencia de diseño
- **src/frontend/src/index.css**: Rediseñado con:
  - Sistema completo de diseño CSS variables (colores, tipografía, espaciado)
  - Importación corregida de Google Fonts
  - Estilos base mejorados para accesibilidad y consistencia

### Mejores prácticas aplicadas
- **Caché**: Backend cachea resultados por 5 minutos para reducir carga de BD
- **Tipado**: Interfaces TypeScript para productos tendencia y banners
- **Accesibilidad**: ARIA labels, soporte de teclado, roles apropiados
- **Experiencia de usuario**: Skeleton loading, manejo de errores amigable
- **Mantenibilidad**: Constantes centralizadas, separación de preocupaciones, componentes reutilizables
- **Rendimiento**: Limitación de productos mostrados (5 por defecto), petición optimizada
- **Accesibilidad visual**: Contraste WCAG AA, foco visible, estados de error y loading

### Próximos pasos
1. Documentar endpoint en especificación de API abierta (Swagger/OpenAPI)
2. Añadir pruebas unitarias para servicio trending
3. Monitorear métricas de rendimiento del endpoint
4. Considerar filtros avanzados (por categoría, rango de precios, etc.)
5. Implementar pruebas de accesibilidad automatizadas

## Tanda 1C — Módulo suppliers: stock avanzado, PO flujo completo, panel compras, proveedor↔producto, reportes (2026-08-15)

### Propósito
Extender el módulo `suppliers` de la OLA 7A para cumplir los ítems 37-51 del checklist (trazabilidad de stock, flujo completo de órdenes de compra, panel de compras, asociación proveedor↔producto, promedio de evaluaciones y reportes), **sin tocar schema.prisma ni ejecutar migraciones** (agente A añade migración de publicación en paralelo).

### Decisiones sin migración (importante)
- **Movimientos de stock** (checklist 44): el modelo Stock no tiene campos JSONB. Los movimientos (`movement_in`/`movement_out`/`adjust`) se registran en **auditoría** (entidad `Stock`) con `newValues: { adjustmentType, reason, quantityAntes, quantityDespues, productId }` + `userId`/`createdAt` del AuditLog (trazabilidad completa). `PATCH /api/stock/:id` y `POST /api/products/:productId/stock` aceptan `adjustmentType?: 'in'|'out'|'adjust'` y `reason?`; `out` con stock negativo → 400.
- **minQuantity** (checklist 43): Stock no tiene columna `minQuantity` ni JSONB. Se acepta en create/update y se persiste en **auditoría** (acción `settings`, `newValues.minQuantity`). `GET /api/stock/alerts` recupera el último minQuantity por stock desde audit; sin configurar, alarma solo si `availableQty <= 0`.
- **Asociación proveedor↔producto** (checklist 37): sin migración, se materializa vía `PurchaseOrder.items` (JSONB). `GET /api/suppliers/:id/products` resuelve productos distinct desde los items de sus POs; `GET /api/products/:productId/suppliers` resuelve proveedores desde las POs que referencian el producto. No se añadió columna a Product.
- **stockStatus** (checklist 42): campo calculado en `products.service.ts` (`findAll`/`findOne`), NO se ocultan productos automáticamente (regla de negocio pendiente de decisión).

### Matriz de transiciones de PO y quién mueve cada estado
| De → A | Rol |
|---|---|
| solicitada → aprobada \| cancelada | escritura (Super Admin, Admin Comercial) |
| aprobada → en_transito \| cancelada | escritura |
| en_transito → recibida \| cancelada | escritura |
| recibida → cerrada | Super Admin |
| cerrada / cancelada (terminales) | — |
- Transición inválida → 400 "No se puede pasar de X a Y". Rol no autorizado → 403.
- Al pasar a **recibida**: suma `items[].quantity` al `availableQty` (`stock.upsert` por productId) y registra audit `movement_in` con `reason: 'orden de compra PO-XXXX'`.
- Historial por orden (checklist 49): cada cambio registra audit `status_change` con `oldValues{status}` y `newValues{status, movedByUserId, comment?}` (body acepta `comment?`). `GET /api/purchase-orders/:id` → `{ data: { ...po, history: [...] } }` (from audit).

### Panel de compras (checklist 50)
`GET /api/purchase-orders/dashboard` (5 roles) → `{ data: { openOrders, ordersByStatus, pendingSupplierEvaluations, expiringPrices, lowStock, recentOrders } }`:
- `openOrders`: PO no cerradas/canceladas (count).
- `ordersByStatus`: agrupación por status.
- `pendingSupplierEvaluations`: `{ count, suppliers }` — proveedores sin evaluación o con última > 90 días.
- `expiringPrices`: count de precios con `validUntil` en próximos 30 días.
- `lowStock`: count de stocks con `availableQty <= minQuantity` (o 0).
- `recentOrders`: últimas 5 PO con supplier y products resueltos desde items.

### Endpoints nuevos (todos en `suppliers.controller.ts`, módulo suppliers)
- `GET /api/stock/alerts?thresholdDays=` → `{ data: [...] }` (reasons `out_of_stock`/`below_min`/`no_recent_movement`).
- `GET /api/purchase-orders/dashboard` → panel de compras.
- `GET /api/purchase-orders/:id` → detalle con historial.
- `GET /api/suppliers/:id/products` → productos asociados vía POs.
- `GET /api/products/:productId/suppliers` → proveedores asociados vía POs.
- `GET /api/suppliers/alerts?minScore=60` → `{ data: [...] }` con `reason: 'bajo_score' | 'sin_evaluacion_reciente'`.
- `GET /api/suppliers/report?category=` → `{ data: { category, suppliers: [...], ranking } }` ordenado por averageScore desc.
- `GET /api/suppliers/:id` y listado ahora incluyen `averageScore` y (detalle) `lastEvaluationDate` (calculados).

### Auditoría (checklist 51/49/73)
Supplier (create/update/delete), SupplierEvaluation (create), Stock (create/update/delete/movements/settings) y PurchaseOrder (create/status_change/delete) registran audit. El PATCH de status usa acción `status_change` (antes `update`).

### Verificación
- `npm test` (src/backend): **393/393** (baseline 352 + 41 nuevos: movimientos, transiciones inválidas 400, 403 por rol, recibida actualiza stock, historial, dashboard, alerts, report, averageScore, stockStatus).
- `npm run build`: **0 errores**.
- No se reinició el backend ni se ejecutaron migraciones. No se tocaron `schema.prisma` ni `src/frontend/**`.

## Cierre FSM de ciclo de vida de Product (2026-08-20)

### Propósito
Registrar la implementación completa y validada de la FSM de ciclo de vida de Product, consolidando backend, frontend, scheduler y contratos, con baseline final y decisión de continuidad.

### Estado final
- **FSM implementada y validada** en rama `main` @ `258e5e1fdbfeebcd70b087969b2724f612788591`.
- **Baseline final**: 616 tests / 30 suites, build/lint 0 errores, 14 migraciones sin drift, 230 productos en BD.
- **Fuente de verdad**: `lifecycleStatus` (7 estados: DRAFT, READY, SCHEDULED, PUBLISHED, HIDDEN, DISCONTINUED, ARCHIVED).
- **Dual-write temporal**: columnas legacy (`isActive`, `isVisible`, `publishStatus`, `publishAt`, `unpublishAt`) mantenidas como espejo read-model; NO se ejecutan DROP COLUMN.

### Contratos confirmados
- **P4** — Eliminación física: Super Admin + Admin Comercial, ACL `manage`, confirmación explícita, clave maestra obligatoria si hay datos asociados (precios, imágenes, stock, auditoría, POs). Auditado.
- **P6** — Scheduler: `@nestjs/schedule` tick 1 min idempotente; publica SCHEDULED (`publishAt <= now` + checklist), despublica PUBLISHED (`unpublishAt <= now` + reason `'auto'`). Lazy read-repair mantenido como fallback.

### Entregables validados
- Backend: 616 tests, transición matrix 14 eventos, endpoints `transition`/`bulk-transition`, bloqueo PUT, dual-write, `allowedActions` por producto.
- Frontend: tipos, hooks, PublishTab real (sin hack 2099), bulk con `bulk-transition` (applied/rejected, `aria-live`), filtros por estado, contraste WCAG AA.
- QA: APROBADO CON OBSERVACIONES → H1/H2/H3 resueltas (create activo, contraste ≥4.5:1, master-key limpiada).
- Baseline: 616/30, build/lint 0, 14 migraciones, 230 productos, entorno vivo.

### Hallazgos menores (no bloqueantes, pendientes)
- Throttler 429 agresivo en login → proponer ajuste específico.
- `limit` no válido en `/api/products` (usa `skip`/`take`).
- Scripts residuales `check-*.cjs`/`qa_*.js` en `Temp/opencode` (19/08).
- Seed email: `admin@gruposecurity.co` vs docs `admin@grupo-security.com` → alinear en Etapa 8.1.

### Decisión de continuidad
**Etapa 8 (destructiva) CONGELADA**. Planificada iteración separada `feat/fsm-legacy-removal-prep`:
- **8.1** (no destructiva): inventario y migración de lecturas/escrituras a `lifecycleStatus` (import, trending, Listas, lazy repair, `allowedActions` en listado), dual-write mantenido, docs/tests actualizados, email canónico.
- **8.2** (destructiva, futura): búsqueda referencias cero, DROP COLUMN legacy, desactivar dual-write, QA regresión completa con rollback.

> **No se ejecutan migraciones destructivas ni DROP COLUMN en este cierre.**
