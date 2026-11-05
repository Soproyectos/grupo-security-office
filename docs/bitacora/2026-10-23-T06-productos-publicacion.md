# T06 — Productos: publicación, programación, borrado e importación sobre la biblioteca

**Quién / dónde:** Claude (retoma el trabajo de Codex), worktree `nifty-robinson-8a8974`, rama `Esnaider/nifty-robinson-8a8974`, HEAD `cb230aa`. Solo desarrollo local con dobles; sin producción, datos reales ni commit.

**Antes:** en modo dedicado estas operaciones respondían 503 `LIBRARY_WRITER_PENDING` (publicar, despublicar, alternar visibilidad, transición, programar, cancelar, lotes por ids y por Lista, borrar, importar Excel, scheduler). En legacy escribían `AuditLog` operativo y el borrado no usaba transacción.

**Qué cambió (`products.service.ts`, `products.controller.ts`)**
- Se retiró el bloqueo `LIBRARY_WRITER_PENDING` (método eliminado). Ahora cada operación valida la congelación (503 `LIBRARY_WRITES_FROZEN`).
- Transiciones (con y sin pin de revisión), programación y cancelación: el cambio de estado, el historial de producto (`ProductChange`) y el evento (`PRODUCT_<EVENTO>`, `PRODUCT_SCHEDULED`, `PRODUCT_SCHEDULE_CANCELLED`) se escriben en la misma transacción de biblioteca. El `AuditLog` operativo solo se escribe en legacy.
- Borrado físico: precios, imágenes, producto y evento `PRODUCT_DELETED` en una sola transacción (antes tres escrituras sueltas); los archivos se borran después de confirmar. La «clave maestra» sigue sin aplicarse, como antes (documentado en el controlador y marcado en el spec).
- Lotes (por ids y por Lista): cada producto queda con su evento; el resumen agregado va como evento `BATCH_*` en dedicado y como `AuditLog` en legacy.
- Importación Excel simple: cada fila (categoría y marca nuevas + producto) es una transacción con sus eventos; los mapas en memoria se actualizan solo tras confirmar. En legacy esto cambia que categoría/marca ya no quedan creadas si falla el producto de esa fila.
- Scheduler: no publica ni reclama nada con la biblioteca congelada; reporta `skipped`.
- El controlador pasa el nombre del usuario para el actor del evento.

**Probado (local, dobles):** `products.publication.library.spec.ts` (10): publicar, cancelar/programar, borrar, importar Excel, lotes, congelación y legacy; `tsc` 0 errores, eslint limpio; 585 pruebas de `modules/products` pasan (original completo en `traspaso-codex-biblioteca/evidencia/T06-precios-originales/products.service.PRE-PUBLICACION.ts`). Solo fallan, como antes, `batch-executor` y `product-revisions.backfill`, que requieren PostgreSQL.

**Ensayo PostgreSQL 18 aislado (VPS, `gs-test-*`):** intento 2 con salida 0 ([evidencia](../biblioteca-dominio/evidencia/t06-catalogo-intento-2/resultado-ejecucion.json)): publicar con evento atómico, reversión si falla el evento, programar/cancelar/despublicar, lote con resumen, importación Excel por fila (una fila fallida no deja categoría ni marca), borrado atómico (con reversión si falla el evento), Listas (crear, eliminar en dos pasos, historial mixto), trabajos (encolado idempotente, un solo ganador entre dos trabajadores, cancelar) y congelación 503 con scheduler y trabajador detenidos; tablas vacías al final, sin recursos `gs-test` restantes y producción sin reinicio. **Intento 3 (salida 0, [evidencia](../biblioteca-dominio/evidencia/t06-catalogo-intento-3/resultado-ejecucion.json)) añade la publicación con revisiones y motor de validación:** bloqueo 409 sin escritura, pin de revisión, reversión completa del pin si falla el evento, despublicar libera el pin y el scheduler real publica la revisión congelada al programar. El intento 1 (salida 3) falló en la limpieza de mi fixture, no en el producto, y se conserva en `t06-catalogo-intento-1/`. `probar-escritor.js` ya no exige el cierre `LIBRARY_WRITER_PENDING` de estas operaciones (ahora portadas); el resto de sus aserciones no cambió.

**No probado:** trabajos de tipo `VALIDATION_SCAN` y lecturas cruzadas sin ensayo PG; `PublicationEvent` sigue escribiéndose fuera de la transacción y tragando errores (como antes); no se tocó `import/pipeline` (carga masiva por lotes).

**Cómo revertir:** restaurar `products.service.ts` desde el original anterior y retirar el spec nuevo; cambios menores en `products.controller.ts` (nombre de usuario e `importExcel`).
