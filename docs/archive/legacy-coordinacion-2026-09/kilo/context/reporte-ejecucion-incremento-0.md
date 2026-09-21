# Reporte de ejecución — Incremento 0 (2026-08-14)

**Incremento:** 0 — Modelo de datos y reglas base (Lista como raíz de Producto).
**Agente:** comercial-dev
**Modo:** ejecución autónoma supervisada.
**Fecha:** 2026-08-14 (18:04 backfill; validaciones posteriores).

---

## 1. Ambiente detectado y clasificación
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/grupo_security?schema=public`
- Host: `localhost` → **LOCAL**.
- Herramientas: `psql` y `pg_dump` disponibles.
- Clasificación: **LOCAL** → autorizado para aplicar migraciones y backfill automáticamente (regla de ambiente).

## 2. Fases completadas / bloqueadas / no iniciadas
- Fase A — Esquema no destructivo: **COMPLETADA** (esquema + migración aplicada y validada).
- Fase B — Lista General y backfill controlado: **COMPLETADA** (script idempotente/transaccional; Lista General creada; 197 productos + 1379 precios + 1 assignment migrados; invariantes validadas).
- Fase C — Compatibilidad temporal: **COMPLETADA** (DTOs, services, auditoría mínima y tests).
- Fase D — Retiro gradual: **NO INICIADA** (pendiente aprobación explícita; no se borran estructuras).

## 3. Archivos modificados (cambios del Incremento 0)
> Nota: el working tree contiene cambios preexistentes no atribuibles a este incremento (p. ej. restructura frontend, `CLAUDE.md`). La lista siguiente son los archivos del Incremento 0.

**Esquema + migración:**
- `src/backend/prisma/schema.prisma` — modelo `Lista`; `Product.listaId`; `Price.listaId`; `Assignment.roleId`; inversas en `User`/`Role` (sobre un working tree ya modificado).
- `src/backend/prisma/migrations/20260814171500_lista_entidad_raiz/migration.sql` — nueva migración no destructiva (NUEVA).

**Backfill:**
- `src/backend/prisma/scripts/backfill-catalog-to-lista.ts` — script idempotente/transaccional (NUEVO).

**Compatibilidad (Fase C):**
- `src/backend/src/modules/products/dto/create-product.dto.ts` — +`listaId`.
- `src/backend/src/modules/products/dto/update-product.dto.ts` — +`listaId`.
- `src/backend/src/modules/prices/dto/create-price.dto.ts` — +`listaId`, `@Min(0)` en `value`.
- `src/backend/src/modules/prices/dto/update-price.dto.ts` — +`listaId`, `@Min(0)` en `value`.
- `src/backend/src/modules/products/products.service.ts` — `resolveListaId`; `create`/`update` persisten `listaId`; `upsertPrices(productId, listaId, prices)` propaga `listaId`; `importFromExcel` setea `listaId` (fallback LISTA-GENERAL).
- `src/backend/src/modules/prices/prices.service.ts` — `validatePrice` (value≥0, vigencia); invariante `Price.listaId == Product.listaId` en `createPrice`/`updatePrice`.
- `src/backend/src/__test__/mocks/prisma.mock.ts` — bloque `lista`; `product.updateMany`; `user.deleteMany`; `userRole.deleteMany`.

**Tests:**
- `src/backend/src/modules/products/products.service.spec.ts` — mock `lista`; +3 tests (asocia listaId, rechaza listaId inexistente, fallback LISTA-GENERAL).
- `src/backend/src/modules/prices/prices.service.spec.ts` — +4 tests (mismatch, propagación, valor negativo, update mismatch).
- `src/backend/src/modules/users/users.service.spec.ts` — elimina asignación runtime redundante (gap de mock cubierto por `createPrismaMock`).

**Documentación (.kilo):**
- `.kilo/context/backlog-activo.md` — actualizado.
- `.kilo/context/decisiones.md` — decisiones Fase A/B/C materializadas.
- `.kilo/context/reporte-ejecucion-incremento-0.md` — este archivo (NUEVO).

## 4. Migraciones creadas y aplicadas
- Creada: `src/backend/prisma/migrations/20260814171500_lista_entidad_raiz/migration.sql` (no destructiva: tabla `listas`; columnas nullable `listaId`/`roleId` + FK `ON DELETE SET NULL` + índices; comentarios SQL para CHECK/índices futuros).
- Aplicada: **sí**, via `npx prisma migrate deploy`, en **LOCAL** (`localhost:5432/grupo_security`).
- `prisma migrate status` → "Database schema is up to date!" (6/6 migraciones aplicadas).

## 5. Respaldo creado
- `C:\Users\sopor\AppData\Local\Temp\gs-backups\grupo_security_baseline_20260814_124932.sql` (355 KB, `pg_dump -F p` sin owner/privileges).
- Verificable: dump SQL plano de texto.

## 6. Conteos de datos antes / después
Antes (baseline, post-Fase-A, pre-backfill):
- users=3, roles=5, user_roles=3, role_permissions=35, catalogs=1, price_lists=9, products=197, prices=1379, assignments=1, categories=7, brands=6, product_images=0, audit_logs=8, import_mappings=0.

Después (post-backfill + Fase C; Fase C no escribe datos):
- products=197 (197 con `listaId`), prices=1379 (1379 con `listaId`), listas=1, catalogs=1, price_lists=9, assignments=1 (0 CATALOG, 1 LISTA).
- `priceListId` preservado: 1379.
- **Integridad / datos eliminados:** 0 (los counts coinciden exactamente con el baseline; se eliminación de datos).

## 7. Validaciones / build / lint / pruebas
- `npx prisma format` → OK (esquema formateado).
- `npx prisma validate` → "The schema at prisma/schema.prisma is valid 🚀".
- `npx prisma generate` → Prisma Client v5.22.0 regenerado (la aplicación posterior falló por EPERM del query_engine DLL bloqueado por proceso dev local; el cliente ya estaba regenerado en paso previo y la fase C no cambia el esquema, por lo que no fue necesario re-generar).
- `npm run build` (`nest build`) → **OK** (limpio).
- `npx tsc --noEmit` → **limpio** (0 errores). [Antes de la fase C había 6 errores preexistentes de mock en `users.service.spec.ts`; se corrigieron incidentalmente.]
- `npm test` (Jest) → **242/242 pass**, 17 suites.
- `npm run lint` → **no ejecutable en este entorno** (ESLint no está instalado como dependencia del backend; solo `@types/eslint` está en `package.json`). No se instaló nada. Se rechazó `npx eslint` que traía v10 incompatible con el config del proyecto.
- `prisma migrate status` → up to date.

## 8. Cambios de compatibilidad realizados
- **Producto:** `create`/`update` aceptan `listaId`; si falta, fallback a `LISTA-GENERAL`. `catalogId` preservado (no borrado). `upsertPrices` propaga `listaId` del producto al precio. `importFromExcel` setea `listaId` vía fallback.
- **Precio:** `create`/`update` validan `dto.listaId == product.listaId` (ConflictException); valor no negativo y `validFrom ≤ validUntil` (BadRequestException). `priceListId` preservado.
- **Respuesta:** `listaId` (escalar) ya se expone automáticamente en las respuestas de Prisma (no se agregó relación `lista` a `include` para minimizar cambios). La entidad `Assignment` soporta `roleId` (columna) aunque aún no se valida a nivel app (Fase A2).

## 9. Invariantes verificadas (post-backfill)
- product con `listaId` (197/197) y `price` con `listaId` (1379/1379).
- `Price.listaId == Product.listaId` → 0 discrepancias.
- `products sin catalogId ni listaId` → 0.
- `priceListId` preservado → 1379.
- FK: `products.listaId`/`prices.listaId`/`assignments.roleId` → 0 violaciones.
- SKU único global → 0 duplicados. `listas.code` único → 0 duplicados.
- `price.value < 0` → 0.
- Assignment CATALOG→LISTA migrado en place (level `view`, isActive preservado); 0 duplicados.

## 10. Errores preexistentes vs. introducidos
- **Preexistentes (no introducidos por este incremento):** 6 errores de tipo en `users.service.spec.ts` (`user`/`userRole` sin `deleteMany` en el mock) — documentados en el análisis del Incremento 0 (§11.9/§12.3). Resueltos incidentemente al completar el mock compartido `createPrismaMock`.
- **Introducidos por este incremento:** ninguno. `tsc --noEmit` limpio; build limpio; 242 tests pass.

## 11. Riesgos restantes
- **deny-by-default** no implementado todavía (Fase 2 / Incremento 1): la lectura sigue siendo "default-abierto" para usuarios sin assignments (`buildAclWhere` en `catalogs.service.ts`). No expone `listaId` directamente, pero no cambia la política global sin tests.
- **`Assignment` XOR user/role a nivel DB** diferido a Fase A2 (CHECK/índice coalescente).
- **`Category` no scoped a Lista** (se mantiene global) → decisión pendiente.
- **Reconciliación `PriceList` (tier) vs `Lista`** diferida a la tarea de precios.
- **`prisma generate`** falló con EPERM en este ambiente por un proceso dev local que mantiene bloqueado el `query_engine-windows.dll.node`; el cliente ya estaba regenerado con el esquema correcto.
- El working tree preexistencia (restructura frontend, eliminación de páginas `BrandsPage`/`CategoriesPage`/`PricesPage`, etc.) no fue causada por este incremento y no fue tocada.

## 12. Pasos pendientes para iniciar Incremento 1
1. Aprobar el plan de Incremento 1 (CRUD de Listas + ACL real deny-by-default + UI): `listas.module/service/controller/dto`, `LISTA` en `ASSIGNMENT_RESOURCE_TYPES`, `buildAclWhen` deny-by-default por Lista, apertura a `Admin Comercial`.
2. Registrar decisiones Q-cat-scoping / Q-precio-tier / Q-assignment-unique (pendientes en `decisiones.md`).
3. Re-evaluar reactivación del `ImportModule` (no registrado en `app.module`) para importación por Lista.

## 13. Diff resumido (cambios funcionales del Incremento 0)
- **Schema:** `+`model `Lista` (listas) con `id, code @unique, name, description?, currency@default COP, isActive, archivedAt, createdById, updatedById, createdAt, updatedAt`; `+`campo `listaId?` en `Product` y `Price` (índices); `+`campo `roleId?` en `Assignment`; inversas `User.createdListas/updatedListas`, `Role.assignments`. Todo nullable + `ON DELETE SET NULL` (no destructivo).
- **Migración:** crea tabla + columnas + índices; preserva `Catalog`, `PriceList`, `catalogId`, `priceListId`, `@@unique([productId, priceListId])`.
- **Backfill script:** crea `LISTA-GENERAL`; mapea `CAT-LOG→LISTA`; setea `products.listaId`, `prices.listaId`; migra assignment `CATALOG→LISTA`; auditoría ligera.
- **Services/DTOs:** `listaId` opcional en productos/precios; invariante `Price.listaId == Product.listaId` (rechaza con ConflictException); valor≥0 y vigencia coherente (BadRequestException); fallback LISTA-GENERAL.
- **Tests:** 7 tests nuevos + mock completo de `lista`/`updateMany`/`deleteMany`.

## 14. Confirmación
- **No se tocó producción.** Todas las escrituras fueron contra `localhost:5432` (LOCAL).
- **No se modificaron secretos, `.env` ni credenciales.** `.env` fue solo lectura.
- **No se hicieron deploy.**
- **No se eliminaron estructuras antiguas.** `Catalog`, `PriceList`, `catalogId`, `priceListId` preservados (0 eliminación de datos; counts idénticos a baseline).
- **No se hicieron commits** (working tree con cambios sin commitear; nada fue committeado).
- No se implementó: CRUD de Listas, UI nueva, deny-by-default global, gestión por rol, PriceHistory, importación masiva por Lista, excepciones por producto, publicación programada, ni borrado físico de `Catalog`/`PriceList`.
