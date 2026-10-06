---
tags: [bitacora, storefront, contacto, rbac, grupo-security]
date: 2026-10-06
autor: opencode
---

# Bitácora — 2026-10-06

Sesión (2026-10-05 → 2026-10-06): los datos de contacto del storefront dejan de vivir en constantes TypeScript y pasan a ser editables desde el panel interno, con permiso asignable a un rol o a un usuario. Terminó cerrado el alcance completo (`odd/tasks/storefront-contact-settings.md`), sin commit.

## ¿Qué se hizo?

**Backend** (`src/backend`): modelo singleton `StorefrontContact` + migración `20261005221500_add_storefront_contact` + fila semilla con los 7 valores demo actuales. Nuevo módulo `src/modules/storefront/` con `GET /api/public/storefront/contact` (endpoint público, `@Public()` + `@Throttle(60/min)`), `GET/PUT /api/storefront/contact` (`@Permissions('storefront:read' | 'storefront:write')`), DTO validado (`E164_PATTERN`, `@IsEmail`) y `AuditLog` con `entity: 'StorefrontContact'` añadida a `COMERCIAL_ENTITIES`. `storefront:read`/`storefront:write` en la matriz del seed, default **solo Super Admin**.

**Panel** (`src/frontend`): página propia **`/storefront`** (`StorefrontSettingsPage.tsx`, hermana de `/users`, protegida por `ProtectedRoute` + `AdminLayout`), entrada de menú "Tienda" en `Header.tsx` filtrada por `canViewStorefront()`/`canEditStorefront()` (`lib/rbac.ts`). Sin permiso → "No tienes permisos para ver esta sección"; con `read` → campos en solo lectura sin botón guardar; con `write` → formulario operativo.

**Concesión a rol y a usuario**: `'storefront:'` en `GRANTABLE_PREFIXES` (con excepción documentada), grupo `Tienda` en `PERMISSION_GROUPS` para la pestaña "Roles y Permisos", y sección "Configuración de tienda" en `DashboardGrants.tsx` reutilizando el borrador y el guardado existente vía `PUT /api/users/:id/dashboard-permissions`. Botón de tarjeta "Paneles" → "Accesos".

**Storefront**: store module-scoped `useStorefrontContact()` (una request cacheada por sesión, fallback a `constants/contact.ts` cuando la API falla) y sus 4 consumidores adaptados: barra superior, bloque "Contacto" del footer, canales de venta y ficha de producto.

**Barra superior** (trabajo previo de la misma rama): rojo institucional `#CE0203`, contraste de texto blanco 5.78:1 (AA a 12px), foco de teclado visible.

**Corrección al cierre**: el campo "Mensaje de «Vende con nosotros»" prefillaba la píldora "Contáctenos" de la barra superior y el enlace del pie seguía leyendo la constante.

## Decisiones tomadas

- **Singleton `StorefrontContact`, una fila** — tipado Prisma fuerte, un `PUT`, validación en el DTO. Una tabla key-value exigiría migración por cada campo nuevo.
- **Se guarda el teléfono en E.164 y se derivan `tel:` y `https://wa.me/…`** — antes eran 3 campos por teléfono duplicados.
- **Fallback a las constantes actuales si la API falla** — un dato de contacto nunca deja la tienda en blanco.
- **`updateContact()` crea la fila si la tabla está vacía** (ajuste del orquestador): con la migración aplicada y el seed sin correr, el panel —única vía de corrección sin código— quedaba bloqueado.
- **Página propia `/storefront`, no una pestaña de Configuración** — decisión del coordinador (2026-10-05).
- **Default `storefront:*` solo para Super Admin**, alineado con la propuesta de matriz de roles y pantallas del 2026-10-05 (pendiente de aprobación; vive en srv-soporte). `/storefront` será fila nueva cuando esa matriz se apruebe.
- **Acceso concedible por rol y por usuario** reutilizando `UserPermission` + `replaceForUser` (ya existente, `@Roles('Super Admin')`, auditado): los permisos efectivos son la unión rol + concesión, así que llegan al JWT sin backend nuevo.
- **`storefront:` entra en `GRANTABLE_PREFIXES` como excepción documentada** — el blindaje original (`dashboard:*`) separaba visibilidad de capacidad para impedir escalada; `storefront:write` es capacidad, solo la concede Super Audit y queda auditada.
- **Fuera de alcance**: `COLUMNS` y `SOCIAL_LINKS` del footer (estructura de enlaces, no datos de contacto) → feature aparte `StorefrontFooterLinks`.
- **TDD off** (patrón de las features previas de la rama); runners **Vitest** (frontend) y **Jest** (backend).

## Problemas encontrados

**El mensaje prellenado iba al botón equivocado.** El panel ofrece "Mensaje de «Vende con nosotros»", pero `useStorefrontContact` lo mapeaba a `contactMessage` y esa alimentaba la píldora **"Contáctenos"** de la barra superior; el enlace "Vende con nosotros" del pie seguía usando la constante, es decir el campo editable no cambiaba nada. Lo codificó un test (`storefront-contact-consumers.spec.tsx`), así que estaba verde. Corregido: píldora → número del API + `WHATSAPP_MESSAGES.contact`; pie → `contact.sellWithUsMessage`.

**Dos errores de lint heredados** del trabajo previo de la barra. Se cerraron extrayendo funciones puras a `features/users/lib/grant-selection.ts` y moviendo `PERMISSION_GROUPS` a `features/users/constants/permission-groups.ts`: ESLint del frontend pasó de **2 errores / 9 warnings** a **0 errores / 9 warnings**.

**Repo sin jsdom ni `@testing-library`**: los specs de UI usan `renderToStaticMarkup` con caché de TanStack Query sembrada. No se pueden añadir dependencias, así que los tests de puerta de permisos son de markup, no de interacción.

**Verificación limitada por el entorno**: no hay PostgreSQL en este servidor → ni la migración ni `db:seed` se pudieron ejecutar. Tampoco está el binario `gentle-ai` en el PATH → `review assess` no corre (RDD declarado `on` en el estado, pero la evaluación queda **no disponible**; no se infiere riesgo bajo).

**Baseline rojo preexistente**: `src/common/security/account-lockout.service.spec.ts` (1 test) y 3 errores TS en `src/scripts/import-biblioteca.logic.spec.ts` ya fallaban antes de esta rama.

## Próximos pasos

- [ ] **Autorización de commit** del coordinador + estrategia de cadena: 3130 líneas autoradas (526 en tracked + 2604 en archivos nuevos) muy por encima del presupuesto de ~400.
- [ ] Aplicar la migración y correr `db:seed` en el despliegue (no ejecutable aquí).
- [ ] Añadir la fila `/storefront` a la matriz de roles y pantallas cuando se apruebe (propuesta de 2026-10-05).
- [ ] Cambiar los valores demo por los reales antes de producción (`TODO` en `constants/contact.ts`).

## Verificación

| Lado | Resultado |
|------|-----------|
| Frontend | `npx vitest run` → **28 archivos / 313 tests OK** · `tsc --noEmit` exit 0 · `eslint` **0 errores / 9 warnings** |
| Backend | `npx jest` → **56/57 suites, 941/942 tests** (único rojo: `account-lockout`, baseline preexistente) · `tsc` solo los 3 errores heredados · `eslint` 0 |

## Referencias

- [Feature doc](../../odd/tasks/storefront-contact-settings.md)
- [2026-09-22 — Biblioteca de vitrina](./2026-09-22-biblioteca-vitrina.md)
- Plantilla: [TPL-bitacora](../procedimientos/TPL-bitacora.md)
