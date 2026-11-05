# T03 · Esquema y SQL candidatos, sin aplicar

**22/10/2026 — Preparado sin ejecutar.** Se autorizaron únicamente archivos y comprobaciones locales, sin instalaciones, conexiones a BD, Docker, SSH, migraciones ejecutadas, cambios productivos ni operaciones de publicación en Git. La revisión humana del SQL sigue pendiente. [Estado único](./README.md) · [Bitácora](../bitacora/2026-10-22-T03-esquema-candidato.md).

**Estado vigente tras corrección autorizada:** [preparada para prueba, no validada en PostgreSQL](./t03-prueba-postgresql18.md). Se recuperó NOT NULL/default, se excluyeron los GIN y se preparó el procedimiento aislado con guardas y rollback. Los [hallazgos anteriores](./t03-revision-local.md) se conservan como corte histórico. No se aplicó SQL ni se inició T04. La comparación estática no certifica ejecución PostgreSQL, ingreso incompleto o reglas futuras de publicación.

## Recepción y alcance

- Carpeta verificada: `C:\Users\sopor\grupo-security-office\.claude\worktrees\nifty-robinson-8a8974`.
- Rama `Esnaider/nifty-robinson-8a8974`; HEAD `cb230aa6fa206f142d4cdf8caf7a6a11fe3ebf00`. Sin consultas remotas: `437ebc2f…` es una observación anterior, no el estado confirmado de producción.
- Se recibieron cinco archivos modificados: `AGENTS.md`, `docs/00-INDEX.md`, `docs/adr/README.md` y los dos archivos del parche `products.service.ts` / `products.service.spec.ts`.
- Los 20 archivos no rastreados recibidos pertenecían al ADR de biblioteca, los 11 archivos de `docs/biblioteca-dominio/`, dos bitácoras, los cinco archivos de T02 y `products.service.fuzzy.pgint.ts`. Ninguno era un inicio de T03. Los clientes generados de T02 estaban ignorados.
- Se leyeron los AGENTS de los ancestros y del worktree, las instrucciones del dominio, ADR, plan y evidencia T02. Explore confirmó que no hay AGENTS adicionales en los subárboles pertinentes de documentación/Prisma.
- El traspaso externo `C:\Users\sopor\traspaso-codex-biblioteca\TRASPASO-CODEX.md` aún proponía probar el parche SQL en VPS y no recogía el diseño ni T02. El repositorio prevalece; T00 continúa separada y no se probó en esta tarea. Las frases antiguas de «nada autorizado/implementado» se ajustaron a la autorización local actual.

## Archivos del candidato

Todo vive en [`src/backend/prisma/biblioteca-candidata/`](../../src/backend/prisma/biblioteca-candidata/), fuera del esquema y del historial actuales:

- [`schema.prisma`](../../src/backend/prisma/biblioteca-candidata/schema.prisma): 23 modelos y cinco enums; URL exclusiva `BIBLIOTECA_CANDIDATA_URL`; cliente en `./generated/client`.
- [`migrations/20261022000000_t03_initial_candidate/migration.sql`](../../src/backend/prisma/biblioteca-candidata/migrations/20261022000000_t03_initial_candidate/migration.sql) y `migration_lock.toml`: SQL desde vacío e historial candidato independiente.
- `complemento-historico.sql`: objetos históricos que Prisma no genera. `ejecutar-local.js sql` lo añade al resultado de `migrate diff`; no editar solo la copia concatenada.
- `ejecutar-local.js`: permite únicamente `validate`, `generate` y `sql`, comprueba Prisma 6.19.3 instalado y deshabilita autoinstalación. Usa un cwd temporal con `package.json` propio, sin `.env`, y URL ficticia en `.invalid`; proxy inválido para impedir descargas automáticas. Rechaza un `.env` junto al candidato antes de lanzar Prisma. No ejecuta SQL.
- `comprobar-candidato.js` y `tsconfig.json`: comprobación estática y de tipos, sin instanciar clientes. Son JavaScript para no entrar en el build global como nuevos `.ts` (misma precaución de T02).
- `.gitignore`: excluye `generated/`. El cliente generado no se versiona ni se importa desde la aplicación.

## Equivalencia y diferencias deliberadas

La [comparación reproducible de las 23 tablas](./evidencia/t03-comparacion.json) verifica **280 campos escalares**, nombres físicos, tipos, nulabilidad y defaults **declarados en Prisma**, PK, índices declarados, mapas, unicidad, cinco enums y relaciones internas. No cubre automáticamente toda restricción física del SQL histórico: la revisión detectó el NOT NULL omitido de `catalogManufacturerRefs`. No se alteraron IDs ni se copiaron/borraron datos. El diccionario actual se conserva sin regenerarlo.

Se retiraron **17 campos de relación** hacia modelos externos: ocho relaciones con FK a `User` y nueve relaciones inversas hacia operativo o modelos pendientes. Se conservan los escalares `publishedById`, `createdById`, `appliedById` y los cuatro IDs de actor de `Lista`; también todos los actores que ya eran escalares sin FK. El SQL tiene **19 FK**, todas internas. No crea usuarios ni FK entre bases.

`Stock` y `UploadedFile` quedan fuera sin decidir D1. `ProviderEquivalence.productId`, los snapshots de importación, `ProductChange`, `PublicationEvent` y `scheduledRevisionId` conservan su ausencia de FK actual: no se añadieron vínculos nuevos para hacer que el diseño pareciera terminado. Marca/categoría siguen obligatorias y no se resuelve su nulabilidad futura con datos inventados. No se añaden nombres de actor ni se renombran columnas en esta separación; su contrato/copia histórica quedan para T07/T11, sin inventar nombres.

Revisión del SQL histórico pertinente, siempre sobre archivos del repositorio:

1. `20260820185813_lifecycle_status`: se conserva `products_lifecycleStatus_check` con **siete** estados. Se corrigió el resumen de tres estados del documento de modelo; no se modificó la migración histórica.
2. `20261019170000_add_export_bundles`: se conserva `export_bundles_size_check`, rango inclusivo 0–52.428.800 bytes.
3. `20261002200000_products_sku_normalized_unique`: se conserva `products_sku_normalized_key` y la expresión exacta `upper(regexp_replace("sku", '\s', '', 'g'))`, además del UNIQUE literal del SKU. No se copia el bloque de búsqueda de duplicados ni se ejecuta deduplicación: este SQL parte de vacío; validar datos de copia corresponde a T11.
4. `20260829154935` / `20260829154937`: se conserva `pg_trgm`. La primera entrega incluía tres GIN por una redacción incorrecta del plan; `20260908172738_add_import_session` los eliminó sin motivo documentado encontrado ni recreación posterior. Tras decisión del usuario se excluyeron del candidato; evaluarlos en el futuro exige consultas y mediciones.
5. `20261017150000_add_product_sheet_notes_occ`: NOT NULL de `catalogManufacturerRefs` recuperado mediante ALTER COLUMN en el complemento; default ARRAY[] conservado en CREATE TABLE. La futura prueba comprueba `attnotnull`, default y rechazo de NULL, sin confiar solo en Prisma.
5. `20261020120000_price_import_mixed_lists`: se conserva `PriceImportRevision.listaId` anulable con `ON DELETE SET NULL`, ya reflejado en Prisma.
6. Se conserva el comentario histórico de `prices.listaId`. El comentario obsoleto sobre `Product.catalog` no se traslada como regla vigente. Las propuestas de trigger o índices parciales en comentarios no se convierten en objetos SQL. No se encontraron otros CHECK, funciones, triggers o índices parciales efectivos para estas 23 tablas en el historial revisado.

## Comprobaciones ejecutadas y resultados

Desde la raíz del worktree, con Node y dependencias ya instalados:

```powershell
node src/backend/prisma/biblioteca-candidata/ejecutar-local.js validate
node src/backend/prisma/biblioteca-candidata/ejecutar-local.js generate
node src/backend/prisma/biblioteca-candidata/ejecutar-local.js sql
node src/backend/prisma/biblioteca-candidata/comprobar-candidato.js
node src/backend/node_modules/typescript/bin/tsc -p src/backend/prisma/biblioteca-candidata/tsconfig.json
node src/backend/node_modules/typescript/bin/tsc --noEmit --incremental false -p src/backend/tsconfig.json
```

Todos terminaron con código 0 tras corregir los dos detalles del comprobador anotados en la bitácora. La comparación contrasta fuente y metadatos con el cliente legado existente y confirma que este corresponde al esquema fuente; ningún cliente se instancia. Los tipos aceptan la relación interna `publicRevision` y rechazan el join externo `publishedBy`. Los resultados detallados de campos/relaciones están en el JSON enlazado.

Además: `npm run lint` desde `src/backend` → código 0, **cero errores y seis advertencias preexistentes** sobre directivas eslint-disable sin uso; `node --check` de ambos scripts → código 0; `git diff --check` → código 0. No se aplicó `--fix`. El lint habitual cubre `src/**/*.ts`; los scripts nuevos quedan comprobados con sintaxis y TypeScript `checkJs`.

La segunda generación de SQL produjo exactamente el mismo SHA-256. Huellas de los artefactos:

- Esquema: `5f6bc6835e7d775929006b3da7a85b46cd1cb2d5ab06ec63bbeaae3dccd396a4`.
- SQL de la **entrega inicial anterior a correcciones**: `ca9ddf91e66bbd44e9dfcf37e1cc58ba7b56791c800e0088adbd0bb46addb05c`. Las huellas vigentes completas están en [prueba preparada](./t03-prueba-postgresql18.md).

En la preparación original, las [huellas protegidas](./evidencia/t03-archivos-protegidos.json) registraron los archivos que permanecieron idénticos, incluidos T00, T02, las 56 migraciones históricas, esquema productivo, PrismaService, dependencias/lockfile y cliente actual. Entonces se actualizaron tres documentos: índice, plan y modelo. La revisión posterior modifica cinco documentos deliberadamente, incluida transición; su [nueva evidencia](./evidencia/t03-revision-local.json) conserva las huellas recibidas y finales sin sobrescribir la evidencia anterior.

## Preparado sin ejecutar y límites

SQL listo para revisión, **no aplicado**. No se verificaron sintaxis por un servidor PostgreSQL, disponibilidad/permisos de `pg_trgm`, conexiones, copia de datos, compatibilidad de datos existentes, comportamiento de CHECK/índices ni consultas reales. Validar/generar no demuestra que una migración funcione en PostgreSQL.

Solo Windows y motores instalados. Linux/Alpine, `binaryTargets`, adaptador `pg` en ejecución, build real y despliegue siguen pendientes de T02/T04/T12. Se conserva la advertencia de Prisma sobre `driverAdapters` obsoleto, sin cambiar configuración productiva. No se ejecutaron Jest global, pruebas con `gs-tanda-db` ni comandos `DROP/CREATE DATABASE`.

## Requisitos y decisiones para tareas posteriores

- **T07:** `library_audit_events` y enrutamiento de eventos de biblioteca; historial operativo intacto. Conservar los historiales actuales no implementa este registro nuevo.
- **T11:** copia/validación de IDs y referencias externas; tratamiento aprobado de snapshots de actor, sin usuarios duplicados ni nombres inventados.
- **T13 → T09/T10:** `product_gaps` (faltantes) y `field_evidence` (fuentes/verificación). Documentos ausentes se registrarán y no bloquearán publicación; distinguir no encontrado de no aplica. T03 no implementa estas tablas ni cambia publicación.
- **T13:** `supplier_costs`, separado de tarifas de venta; ampliación de proveedor y referencias. No se crean costos ni se publican precios a visitantes.
- **D1/D7 → T08/T13:** dominio de `UploadedFile`/`Stock`, `library_files`, almacenamiento, originales, retención y respaldos. Ningún archivo se movió.
- **T01:** siguen pendientes D1, D3, D4, D5 y D7; también las demás decisiones no confirmadas del ADR. No se añadieron `CHECK(value > 0)`, tarifa de referencia, variantes, atributos por familia ni cambios de autoridad de campos.

**Siguiente paso concreto:** autorización separada sobre script y paquete de la [prueba preparada](./t03-prueba-postgresql18.md), antes de ejecutar. No se ha accedido a VPS ni bases. T04 permanece no iniciada.

## Retirada local

Retirar únicamente `src/backend/prisma/biblioteca-candidata/`, este informe, los dos JSON de evidencia y la bitácora T03; deshacer solo los párrafos T03 en README, plan y modelo. Preservar todos los cambios de T00, T02 y diseño recibidos. Ningún objeto de BD requiere reversión porque no se ejecutó SQL. No usar reset, stash ni limpieza global.
