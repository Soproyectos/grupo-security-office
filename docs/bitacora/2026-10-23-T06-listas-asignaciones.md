# T06 — Listas y asignaciones sobre la biblioteca

**Quién / dónde:** Claude (retoma el trabajo de Codex), worktree `nifty-robinson-8a8974`, rama `Esnaider/nifty-robinson-8a8974`, HEAD `cb230aa`. Solo desarrollo local con dobles; sin producción, datos reales ni commit.

**Qué cambió**
- `ListasService`: Lista, Product y Price por el cliente de biblioteca; crear, duplicar, editar, archivar, restaurar, activar, desvincular productos, solicitar y ejecutar borrado escriben con su evento (`LISTA_*`) en la misma transacción de biblioteca. En modo legacy se conserva el comportamiento y el `AuditLog` de siempre.
- Borrado de Lista en modo dedicado: primero biblioteca (desvincular productos, borrar Lista, evento) y después limpieza de `Assignment` operativo. **No es atómico entre bases**; si falla la segunda parte quedan accesos huérfanos; su efecto no se probó (no hay prueba de fallo parcial ni conciliación continua).
- `findAudit` en modo dedicado junta los eventos de biblioteca con el `AuditLog` histórico.
- `AssignmentsService`: solo lecturas de Lista, producto, tarifa y categoría pasan por el cliente de biblioteca; `Assignment` sigue operativo.
- Módulos de ambos importan `BibliotecaPrismaModule`; controlador de listas pasa `userName`.
- Pruebas: `listas.service.library.spec.ts` (7, dobles); `assignments.service.spec.ts` solo recibió el proveedor de biblioteca.

**Qué se probó:** `tsc` 0 errores; 626 pruebas pasan en listas, asignaciones, usuarios, precios y ficha. `workflow-links.spec.ts` (4 pruebas) falla porque necesita PostgreSQL en `localhost:54331` (mismo origen ambiental que las 5 suites ya conocidas).

**No se probó:** nada contra PostgreSQL real (falta `probar-listas.js` en el arnés aislado); ACL/concesiones son dobles.

**Cómo revertir:** originales en `traspaso-codex-biblioteca/evidencia/T06-precios-originales/` (`listas.service.ORIGINAL.ts`, `assignments.service.ORIGINAL.ts`).

## Ampliación: catalog-jobs, comercial, portal, panel y team-workflow (23/10/2026)

- `CatalogJobsService`: trabajos, unidades, productos y revisiones, incluido el reclamo atómico con SQL crudo (`FOR UPDATE SKIP LOCKED`), van por la biblioteca; `User` sigue operativo. Encolar y cancelar escriben con evento atómico (`CATALOG_JOB_ENQUEUED/CANCELLED`); el trabajador (`tick`) no reclama nada con la biblioteca congelada. Las actualizaciones internas de progreso del trabajador no emiten evento (son estado de cola, no cambios de negocio).
- Solo lecturas de biblioteca (sin cambio de escritura) en `QuotesService` (producto y precio vigente al agregar línea; la línea conserva su snapshot), `CustomerPortalService` (catálogo, precios por tarifa y validación de tarifa), `DashboardService`, `DashboardInsightsService` y `WorkflowService` (etiquetas de producto, Lista, tarifa e importación). Cotizaciones, clientes, portal, escalafones y actividades siguen operativos.
- Pruebas nuevas: `catalog-jobs.library.spec.ts` (6) y `dashboard-insights.library.spec.ts` (1), con dobles. Dirigidas: comercial, portal, panel y team-workflow, 286 pasan; solo fallan los 7 de `workflow-links` y `workflow-convert` (necesitan PostgreSQL en `localhost:54331`). `tsc` 0 errores, eslint sin errores.
- No probado: nada contra PostgreSQL real; consultas que cruzan bases no existen en estos módulos (revisado: sin `include` ni filtros de relación hacia modelos de la otra base), pero solo lo demostrará el ensayo aislado. `CustomerAccount.priceListId` y `PortalTier/PortalPriceListMapping.priceListId` siguen apuntando a `price_lists` sin FK entre bases (integridad referencial a validar en el servicio).
- Originales: `traspaso-codex-biblioteca/evidencia/T06-precios-originales/*.ORIGINAL.ts`.

## Relaciones entre bases (23/10/2026)

Se revisó el esquema operativo contra los 23 modelos de biblioteca (script sobre `prisma/schema.prisma`): quedan relaciones declaradas de `Quote` (→ `Lista`, `PriceList`), `QuoteItem` (→ `Product`, `Price`), `PortalTier`, `PortalPriceListMapping`, `CustomerAccount` (→ `PriceList`), `Stock` y `AuditLog` (→ `Product`) y de `User` (→ `Lista`, `Product`, revisiones). Código que las recorría y ya no lo hace (los ids se guardan como escalares y el dato de biblioteca se resuelve aparte):
- `QuotesService`: `findOne` ya no incluye `lista`/`priceList` (se leen de la biblioteca); `create` y `addItem` usan ids escalares en lugar de `connect`.
- `CustomerPortalService`: escalafones y asignaciones de tarifa se leen sin `include` de la tarifa, que se resuelve por id en la biblioteca (`listTiers`, `listMappings`, aprobación, catálogo).
- `DashboardInsightsService.getSalesByCategory`: la categoría del producto se resuelve por id en la biblioteca.
Pruebas: 204 de comercial, portal y panel pasan; se adaptaron las aserciones de `connect` a ids escalares y el doble de `priceList` del portal (el contrato cambió a propósito). Sin ensayo PG de estas lecturas.

**Pendiente real para el corte (T13/T15):** las FK de esas tablas operativas siguen apuntando a las tablas viejas de biblioteca de la base operativa; con la biblioteca dedicada, crear una cotización con una Lista o producto que no exista en las tablas viejas fallaría por la FK. Hay que reemplazarlas por referencias sin FK (migración aditiva) antes del corte; no se hizo por el límite de no migrar datos reales.
