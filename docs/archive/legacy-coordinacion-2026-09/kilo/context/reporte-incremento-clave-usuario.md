# Reporte de ejecución — Incremento: Clave por usuario (password, 2026-08-24)

**Incremento:** Clave por usuario (password).
**Agente:** comercial-dev
**Modo:** ejecución continua (aprobación D1-D7 defaults previa, "continua").
**Fecha:** 2026-08-24.

---

## 1. Ambiente detectado y clasificación
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/grupo_security?schema=public`
- Host: `localhost` → **LOCAL** → autorizado para aplicar migraciones (regla de ambiente).
- **Nota crítica de entorno:** las herramientas `read`/`grep` devolvían instantáneas stale al inicio de la sesión; `bash`/`node`/`git` son la fuente de verdad del estado real del disco. El repo real está **muy por delante** de lo que describían los docs `.kilo` (ya tenía FSM/lifecycle, suppliers, stock, purchaseOrders, rich ACL con 6 niveles, master-key global). Se verificó todo contra disco antes de editar.
- `prisma generate` falla con EPERM en este entorno (query_engine DLL bloqueado por proceso dev local) — limitación documentada en incrementos previos. **No bloquea**: el cliente ya se regeneró (TypeScript types SÍ incluyen `password`).

## 2. Objetivo
Implementar **clave por usuario** (`User.password`, hash bcrypt opcional):
- El usuario crea/edita/elimina su clave desde el apartado Usuarios (auto-servicio) o un admin la gestiona.
- Si un usuario TIENE clave configurada → el sistema la exige para eliminar o modificar cualquier producto.
- Si NO tiene clave → no se pide (flujo libre).
- Diálogo de confirmación en eliminar: aparece de inmediato y exige la clave si está habilitada.
- Capa **independiente** de la clave maestra global (`masterKey`), que sigue protegiendo el borrado en cascada.

## 3. Decisiones aplicadas (D1-D7 defaults, aprobadas por "continua")
- **D1** `User.password String?` (bcrypt) + migración `20260824151000_user_clave`.
- **D2** Coexistencia: clave per-usuario + masterKey global (capas independientes).
- **D3** Auto-servicio (currentClave requerida para cambiar) + admin reset.
- **D4** Exención por rol: NO hay; cualquier usuario con password la debe proporcionar (solo el scheduler `internal` está exento).
- **D5** "Modificar" = `update` + `transition` (FSM) + `toggleVisibility`/`toggleActive` + `remove`.
- **D6** Condicional: solo si `ctx.user.password != null`; 409 si falta, 403 si incorrecta.
- **D7** HTTP 409 `CLAVE_USUARIO_REQUERIDA` / 403 `CLAVE_USUARIO_INCORRECTA` (reutiliza diálogo existente, discrimina por `code`).

## 4. Archivos modificados

### Backend — esquema + migración:
- `src/backend/prisma/schema.prisma` — `+password String?` en `User`.
- `src/backend/prisma/migrations/20260824151000_user_clave/migration.sql` — **NUEVA** (ALTER TABLE users ADD COLUMN password TEXT).

### Backend — módulo Users (clave):
- `src/backend/src/modules/users/dto/set-clave.dto.ts` — **NUEVO** (`clave` min 6, `currentClave?`).
- `src/backend/src/modules/users/users.service.ts` — `+getClaveStatus`, `+setClave` (auto-servicio, propio-usuario), `+adminSetClave`, `+removeClave`, `+adminRemoveClave`. `ForbiddenException` añadida a imports.
- `src/backend/src/modules/users/users.controller.ts` — `ctx()` helper; endpoints `GET/PUT/DELETE /api/users/:id/clave` (auto-servicio, abiertos) + `PUT/DELETE /api/users/:id/clave/admin` (admin) + `GET status`. `SetClaveDto`, `AccessContext` imports.

### Backend — módulo Products (assertClave):
- `src/backend/src/modules/products/products.service.ts` — `+import * as bcrypt`; `+assertClave(ctx, clave, internal)` (private, antes de masterKey); invocado en `update` (tras ACL), `doTransition` (`if (!internal)`, cubre transition+toggles), `remove` (tras confirm, antes de masterKey cascade).
- `src/backend/src/modules/products/dto/update-product.dto.ts` — `+clave?: string`.
- `src/backend/src/modules/products/dto/transition.dto.ts` — `+clave?: string`.
- `src/backend/src/modules/products/dto/delete-product.dto.ts` — `+clave?: string` (masterKey restaurado).
- `src/backend/src/modules/products/dto/toggle-product.dto.ts` — **NUEVO** (`clave?: string`).
- `src/backend/src/modules/products/products.controller.ts` — toggles aceptan `@Body() dto?: ToggleProductDto` y reenvían al service.

### Backend — fixtures + tests:
- `src/backend/src/__test__/fixtures/auth.fixture.ts` — `+password: null` en `buildActiveUser`/`buildInactiveUser` (requerido por el tipo generado).
- `src/backend/src/modules/products/products.service.spec.ts` — `+jest.mock('bcrypt')` a nivel módulo; **+7 tests** `describe('clave por usuario')`: update no exige si no tiene password, 409 si falta, 403 si incorrecta, 200 si coincide, remove 409 antes de masterKey, transition 409.
- `src/backend/src/modules/users/users.service.spec.ts` — `+ForbiddenException` import; **+8 tests** `describe('clave por usuario')`: getClaveStatus, setClave crea/exige-current/403-incorrecta/403-ajeno, removeClave, adminSetClave.

### Frontend — servicio + tipos:
- `src/frontend/src/services/users.service.ts` — `+fetchClaveStatus`, `+setClave`, `+removeClave`, `+adminSetClave`, `+adminRemoveClave`, `+ClaveStatus`.
- `src/frontend/src/services/product-detail.service.ts` — `deleteProduct` acepta `{ clave?, masterKey? }` y envía ambos.
- `src/frontend/src/features/products/hooks/useProductMutations.ts` — `deleteProductWithMasterKey` acepta `{ id, clave?, masterKey? }`.

### Frontend — UI (diálogos):
- `src/frontend/src/pages/UsersPage.tsx` — `+UserClaveSection` (panel admin: seleccionar usuario, ver estado, crear/cambiar/eliminar clave). Imports `users.service`.
- `src/frontend/src/pages/ProductsPage.tsx` — `handleBulkDeleteConfirm` acepta `{ clave?, masterKey? }` y reenvía.
- `src/frontend/src/pages/ProductDetailPage.tsx` — mutación delete acepta `{ clave?, masterKey? }`; `DeleteProductModal` generalizado a ambas keys con `code`-driven label (Clave del usuario / Clave maestra).
- `src/frontend/src/features/products/components/BulkDeleteModal.tsx` — reescrito a 3 fases (confirmar → clave → masterKey → done); `onConfirm(opts?)`.
- `src/frontend/src/features/products/components/ProductFormModal.tsx` — `+clave`/`claveRequired` state; campo inline de clave al modificar si backend lo exige (409/403); `clave` se envía solo en update.

## 5. Verificación / build / pruebas
- `npx prisma validate` → "The schema at prisma/schema.prisma is valid".
- `npx prisma format` → OK.
- `npx prisma migrate deploy` → migración aplicada.
- Backend `npx tsc --noEmit` → **limpio (0 errores)**.
- Backend `npm run build` (nest build) → **OK**.
- Backend `npx jest` → **630/630 pass (30 suites)**. (+14 tests nuevos: 7 products + 7 users... productos 7, users 8 = 15 nuevos; baseline 616).
- Frontend `npx tsc --noEmit` → **limpio**.
- Frontend `npm run build` (tsc -b && vite build) → **OK**, 224 módulos transformados.

## 6. Riesgos / limitaciones
- **EPERM `prisma generate`**: conocido, no bloquea. Types ya regenerados (password presente en `index.d.ts`). Motor query-engine no se renueva pero estaba en el mismo estado precedente.
- **Diálogo bulk (3 fases)**: si un usuario tiene clave Y productos con datos asociados, el flujo pide primero la clave y luego la masterKey en dos pasos. Correcto pero añade un paso; es el comportamiento esperado por diseño de capas independientes.
- **El scheduler** (`internal=true`) NO exige clave — intencional (publicación/despublicación programadas no deben romperse).
- **read/grep tools stale**: durante esta sesión devolvieron contenido desactualizado. Se mitigó verificando siempre contra `bash`/`node`. Los docs `.kilo` previos describían un estado menos avanzado que el repo real.

## 7. Diferidas / pendientes
- Tests de integración e2e para el flujo completo de clave en delete/modify (UI).
- Posible unificación del diálogo de clave (per-usuario + masterKey) en un solo paso cuando ambas apliquen (mejora UX, no requerida).
- Auto-servicio de clave por cada usuario desde una sección de "mi perfil" (el endpoint existe; UI de perfil no implementada).
- Pendiente decisión sobre si los roles administrativos deben estar exentos de su propia clave (D4 = no exención hoy).

## 8. Confirmación
- **No se tocó producción.** Todo contra `localhost:5432` (LOCAL).
- **No se modificaron secretos, `.env` ni credenciales.**
- **No se hicieron deploy ni commits.** Working tree con cambios sin commitear.
- **No se corrieron** `migrate reset`, `db push`, `DELETE`, `TRUNCATE`, `DROP` ni eliminación de datos.
- **No se eliminaron** estructuras antiguas (masterKey global, Catalog, PriceList preservados).
- No se implementó nada fuera del incremento activo.
