# Action Items — Grupo Security Office

> Inventario accionable priorizado derivado de la exploración completa del proyecto (2026-09-30).
> Fuente de verdad versionada. Actualizar al cerrar cada ítem.

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| **Módulos backend** | 18 (auth, users, roles, products, categories, brands, prices, audit, listas, commercial/, customer-portal, dashboard, assignments, health, import, files, security, hierarchy, acl) |
| **Páginas frontend** | 13 (Dashboard, Products CRUD, Categories, Brands, Quotes, Users, Listas, Assignments, Login, Commercial Settings, Customer, Product Detail, Quote Detail, Audit) |
| **Tests backend** | 0 unitarios, 0 e2e — **Riesgo crítico de regresión** |
| **Tests frontend** | Configuración Vitest presente, 0 tests escritos |
| **Cobertura** | 0% |
| **Migración FSM datos legacy** | Pendiente (backup + aprobación requerida) |
| **Integración ERP Yéminus** | Bloqueada — sin confirmación de API |
| **Documentación** | Reconciliación pendiente (docs vs código vs Git history) |

---

## 🔴 CRÍTICO — Bloqueadores de producción / Riesgo alto

| ID | Título | Descripción | Esfuerzo | Dueño | Estado |
|----|--------|-------------|----------|-------|--------|
| **C001** | **Tests backend: suite mínima P0** | Instalar/Configurar Jest + ts-jest + Supertest; escribir tests AuthService (10-12), JwtAuthGuard (4-6), RolesGuard (4-6), Auth e2e (5). Sin tests no hay red de seguridad. | ~16h | Backend | 🔲 Pendiente |
| **C002** | **Rate limiting en login** | Instalar `@nestjs/throttler` (ya en package.json), configurar 5 req/min en `/api/auth/login`, 30 req/min global. Crítico para fuerza bruta. | 2h | Backend | 🔲 Pendiente |
| **C003** | **JWT_SECRET sin fallback hardcodeado** | Eliminar fallback `'fallback-dev-only'` en `jwt.strategy.ts:606`; exigir variable de entorno, fallar al arrancar si no existe. | 1h | Backend | 🔲 Pendiente |
| **C004** | **Contraseña mínimo 8 chars en LoginDto** | Cambiar `@MinLength(6)` → `@MinLength(8)` en `login.dto.ts` (actualmente 6, CreateUserDto ya tiene 8). | 0.5h | Backend | 🔲 Pendiente |
| **C005** | **HttpExceptionFilter global** | Registrar `app.useGlobalFilters(new HttpExceptionFilter())` en `main.ts`. Hoy no está registrado → respuestas de error inconsistentes. | 0.5h | Backend | 🔲 Pendiente |
| **C006** | **Migración FSM datos legacy (backup + aprobación)** | 544+ productos con estados `READY`, `SCHEDULED`, `HIDDEN`, `DISCONTINUED`. Requiere plan con backup, dry-run, aprobación explícita del usuario. No ejecutar sin autorización. | 4h | Backend + Coordinador | 🔲 Pendiente |

---

## 🟡 ALTO — Deuda técnica / Seguridad / Calidad

| ID | Título | Descripción | Esfuerzo | Dueño | Estado |
|----|--------|-------------|----------|-------|--------|
| **H001** | **TransformInterceptor global o estandarizar respuestas** | Decidir: registrar globalmente en `main.ts` O eliminar y estandarizar manualmente en cada controller. Hoy formato inconsistente (`{ data }` vs objeto plano). | 2h | Backend | 🔲 Pendiente |
| **H002** | **Eliminar guards duplicados** | `modules/auth/roles.guard.ts` y `permissions.guard.ts` duplican `common/guards/`. Eliminar duplicados, usar solo los canónicos. | 1h | Backend | 🔲 Pendiente |
| **H003** | **Migrar process.env → ConfigService** | `auth.module.ts` usa `process.env.JWT_SECRET` directo. Migrar a `@nestjs/config` + `ConfigService` para toda config sensible. | 2h | Backend | 🔲 Pendiente |
| **H004** | **DTOs de query tipados (skip/take/search)** | Reemplazar `parseInt()` manual en controllers por DTOs con `@Type(() => Number)` + ValidationPipe global (`transform: true`). | 3h | Backend | 🔲 Pendiente |
| **H005** | **Account lockout tras 10 fallos** | Agregar `failedLoginAttempts` + `lockedUntil` a `User` model + lógica en `AuthService.validateUser`. Post-MVP pero prioridad alta. | 4h | Backend | 🔲 Pendiente |
| **H006** | **Body parser limit 1MB** | `app.useBodyParser('json', { limit: '1mb' })` en `main.ts`. Previene DoS por payloads grandes. | 0.5h | Backend | 🔲 Pendiente |
| **H007** | **Blocking auto-role-assignment** | En `UsersService.update()`, validar que un usuario no pueda asignarse roles a sí mismo. | 1h | Backend | 🔲 Pendiente |
| **H008** | **Auditoría automática (decorador/interceptor)** | Hoy manual en cada servicio → duplicación y riesgo de olvido. Crear `@AuditLog()` decorator o interceptor. | 4h | Backend | 🔲 Pendiente |
| **H009** | **ProductImage timestamps** | Agregar `createdAt` a modelo `ProductImage` para rastrear cuándo se subió imagen. | 1h | Backend | 🔲 Pendiente |
| **H010** | **Tests frontend: suite mínima** | Configurar Vitest (ya en package.json), escribir tests de componentes críticos (Login, ProductForm, ImportWizard). | 12h | Frontend | 🔲 Pendiente |

---

## 🟢 MEDIO — Mejoras de arquitectura / Funcionalidad

| ID | Título | Descripción | Esfuerzo | Dueño | Estado |
|----|--------|-------------|----------|-------|--------|
| **M001** | **Etapa 8.1: Migración lecturas/escrituras a lifecycleStatus** | Inventario y migración no destructiva de lecturas/escrituras a `lifecycleStatus` en import, trending, Listas, lazy repair, `allowedActions`; dual-write mantenido; docs/tests actualizados; email canónico `admin@grupo-security.com`. | 12h | Backend | 🔲 Pendiente |
| **M002** | **Biblioteca de Vitrina (ADR-002) — Migración Prisma** | Agregar `nameSource`, `nameLockedAt`, `lastSeenAt`, tabla rol → tipo de precio. Decidir comportamiento borrado de listas. | 8h | Backend | 🔲 Pendiente |
| **M003** | **Biblioteca de Vitrina — Pipeline no pisa identidad** | Modificar `batch-executor.service.ts` rama update: no sobrescribir `name`, `description`, `categoryId`, `brandId` si `nameLockedAt` existe. | 4h | Backend | 🔲 Pendiente |
| **M004** | **Biblioteca de Vitrina — Interfaz bulk-transition** | UI para `POST /products/bulk-transition` — sin ella, publicar 764 productos son 764 acciones unitarias. | 6h | Frontend | 🔲 Pendiente |
| **M005** | **Biblioteca de Vitrina — Tope 70 chars en validador** | `row-validator.service.ts:128` cambiar límite 500 → 70 chars; corte de líneas en tarjeta. | 1h | Backend | 🔲 Pendiente |
| **M006** | **Biblioteca de Vitrina — Sembrar 764 fichas** | Importar las 764 referencias únicas como fichas de biblioteca antes de estrenar vitrina. | 4h | Backend | 🔲 Pendiente |
| **M007** | **Biblioteca de Vitrina — Limpiar costo/margen de extraAttributes** | 544 productos ya cargados tienen márgenes/costos en `extraAttributes`. Limpiar antes de abrir vitrina pública. | 2h | Backend | 🔲 Pendiente |
| **M008** | **Refresh tokens (post-MVP)** | Modelo `RefreshToken`, rotación, revocación en logout y cambio de password. Endpoints `/auth/refresh`, `/auth/logout` extendido. | 8h | Backend | 🔲 Pendiente |
| **M009** | **MFA/TOTP para Admin** | Reservar endpoint, modelo `UserMfa` ya existe en schema, implementar flujo. | 6h | Backend | 🔲 Pendiente |
| **M010** | **CSP Headers via Helmet** | Configurar `helmet.contentSecurityPolicy()` en `main.ts`. | 2h | Backend | 🔲 Pendiente |
| **M011** | **GIN index en extraAttributes** | Cuando volumen lo justifique (>5k productos), `CREATE INDEX USING GIN ON products (extraAttributes)`. | 1h | Backend | 🔲 Pendiente |
| **M012** | **Merge strategy re-import extraAttributes** | Hoy reemplaza completo; definir estrategia merge (opcional). | 3h | Backend | 🔲 Pendiente |
| **M013** | **ExternalId en Product/PriceList/Category para ERP** | Cuando se confirme API Yéminus, agregar campos `externalId` + mapeo. | 3h | Backend | 🔲 Pendiente |
| **M014** | **Sync module para ERP Yéminus** | Módulo `integration/` con conector REST genérico, schedulers, audit logs `SYNC`. | 16h | Backend | 🔲 Pendiente |
| **M015** | **Tests de integración (10-15)** | Servicios con PostgreSQL real (test DB separada o SQLite). Priorizar ProductsService, UsersService. | 8h | Backend | 🔲 Pendiente |

---

## 🔵 BAJO — Limpieza / Pulido / Documentación

| ID | Título | Descripción | Esfuerzo | Dueño | Estado |
|----|--------|-------------|----------|-------|--------|
| **L001** | **Hotfix H-1 ADR-001: NormalizedRow.isUpdate** | Preview reporta `toUpdate: 0` siempre; corregir para reflejar SKUs existentes. | 2h | Backend | 🔲 Pendiente |
| **L002** | **Limpieza H-3 ADR-001: HeaderDetectionConfig campos muertos** | Eliminar `headerRowIndex`, `sampleRows`, `allowCustomHeaderRow` no consumidos. | 1h | Backend | 🔲 Pendiente |
| **L003** | **Refactor H-6 ADR-001: SYSTEM_FIELD_LABELS compartido** | Duplicado en `MappingLine.tsx` e `ImportStepHeaders.tsx`. Extraer a archivo compartido. | 1h | Frontend | 🔲 Pendiente |
| **L004** | **Type-safety H-5 ADR-001: tx: any → Prisma.TransactionClient** | En `resolveCategory()` y `resolveBrand()`. | 1h | Backend | 🔲 Pendiente |
| **L005** | **Normalizar boolean en normalizeExtras** | Tipo declara `string | number | boolean` pero solo produce `string | number`. Ajustar tipo. | 0.5h | Backend | 🔲 Pendiente |
| **L006** | **Email seed canónico** | Alinear `admin@grupo-security.com` (docs/seed) vs `admin@gruposecurity.co` (código real). | 0.5h | Backend | 🔲 Pendiente |
| **L007** | **Throttler 429 agresivo en login** | Ajustar configuración actual si es muy restrictiva (R003). | 1h | Backend | 🔲 Pendiente |
| **L008** | **Query param `limit` → `skip`/`take`** | Normalizar `/api/products` para usar `skip`/`take` consistentemente (R004). | 1h | Backend | 🔲 Pendiente |
| **L009** | **Limpiar scripts residuales check-*.cjs / qa_*.js** | En Temp/opencode (R005). | 0.5h | Coordinador | 🔲 Pendiente |
| **L010** | **Reconciliación documentación (DOCS-AUDIT-001)** | Contrastar `backend-architecture.md`, `auth-architecture.md`, `testing-strategy.md`, `data-model-v1.md`, `architecture-detailed.md` contra código y Git history. Marcar verificados. | 8h | Coordinador | 🔲 Pendiente |
| **L011** | **Actualizar PROJECT_STATUS.md** | Reflejar fase actual (Etapa 8.1 próxima), riesgos actualizados, próximo hito. | 1h | Coordinador | 🔲 Pendiente |

---

## 📋 Por módulo — Resumen de gaps de tests (MVP)

| Módulo | Tests unitarios objetivo | Tests escritos | Gap | Prioridad |
|--------|-------------------------|----------------|-----|-----------|
| AuthService | 10-12 | 0 | 10-12 | 🔴 P0 |
| JwtAuthGuard | 4-6 | 0 | 4-6 | 🔴 P0 |
| RolesGuard | 4-6 | 0 | 4-6 | 🔴 P0 |
| JwtStrategy | 3-4 | 0 | 3-4 | 🟡 P1 |
| AuthController | 4-6 | 0 | 4-6 | 🟡 P1 |
| ProductsService | 8-10 | 0 | 8-10 | 🟡 P1 |
| ProductsController | 4-6 | 0 | 4-6 | 🟡 P1 |
| UsersService | 6-8 | 0 | 6-8 | 🟡 P1 |
| HttpExceptionFilter | 3-4 | 0 | 3-4 | 🔵 P2 |
| TransformInterceptor | 2-3 | 0 | 2-3 | 🔵 P2 |
| CategoriesService | 4-6 | 0 | 4-6 | 🔵 P2 |
| BrandsService | 4-6 | 0 | 4-6 | 🔵 P2 |
| PricesService | 4-6 | 0 | 4-6 | 🔵 P2 |
| AuditService | 3-4 | 0 | 3-4 | ⚪ P3 |
| RolesService | 4-6 | 0 | 4-6 | ⚪ P3 |
| PermissionsGuard | 2-3 | 0 | 2-3 | 🔵 P2 |
| **Auth e2e** | 5 | 0 | 5 | 🔴 P0 |
| **Products e2e** | 3-4 | 0 | 3-4 | 🟡 P1 |
| **Total estimado** | **~75-85 unit + 8-9 e2e** | **0** | **~83-94** | — |

---

## 🏷️ Etiquetas y convenciones

| Etiqueta | Significado |
|----------|-------------|
| 🔴 **CRÍTICO** | Bloquea producción, riesgo de seguridad alto, o regresión no detectada |
| 🟡 **ALTO** | Deuda técnica significativa, control de seguridad faltante, calidad |
| 🟢 **MEDIO** | Mejora arquitectural, funcionalidad importante, post-MVP |
| 🔵 **BAJO** | Limpieza, pulido, documentación, bugs menores conocidos |

| Estado | Significado |
|--------|-------------|
| 🔲 **Pendiente** | No iniciado |
| 🟡 **En progreso** | En curso |
| ✅ **Completado** | Hecho y verificado |
| ⏸️ **Bloqueado** | Espera decisión/dependencia externa |
| 🗑️ **Descartado** | Ya no aplica |

---

## Próximos hitos sugeridos

| Hito | Ítems incluidos | Target |
|------|-----------------|--------|
| **Hito 1: Seguridad dura** | C001–C006 | Semana 1 |
| **Hito 2: Calidad base** | H001–H010 | Semana 2 |
| **Hito 3: Etapa 8.1 + Biblioteca Vitrina (core)** | M001–M007 | Semana 3-4 |
| **Hito 4: Tests completos MVP** | Todos P0/P1 unit + e2e | Semana 4 |
| **Hito 5: Post-MVP auth** | M008, M009, M010 | Semana 5-6 |
| **Hito 6: ERP Yéminus (cuando API confirmada)** | M013, M014 | Futuro |

---

## Decisiones pendientes del coordinador (usuario + Claude Code)

| Decisión | Contexto | Opciones | Recomendación |
|----------|----------|----------|---------------|
| **D001** | Ejecutar `cleanup-orphaned-list-products.ts` | Sí (con backup + aprobación) / No / Posponer | ⏸️ **No ejecutar sin tarea explícita y aprobación usuario** (R002) |
| **D002** | Migración FSM datos legacy | Ejecutar ya / Posponer a post-Etapa 8.1 / Dry-run primero | 🟡 **Dry-run + backup + aprobación explícita** |
| **D003** | Integración ERP Yéminus | Esperar API / Mockear interfaz / Descarta Fase 1 | ⏸️ **Esperar confirmación API** (R001) |
| **D004** | TransformInterceptor: global vs manual | Registrar global / Estandarizar manual / Híbrido | 🟡 **Registrar global + estandarizar** (menos código) |
| **D005** | Borrado de Lista arrastra productos | Sí (cascada) / No (solo precios) / Solo nunca publicados | ⏸️ **Decisión de negocio pendiente** (ADR-002 límite) |
| **D006** | Rol → tipo de precio para vitrina pública | Definir ahora / Post-MVP / Con ERP | 🟢 **Definir ahora (bloquea vitrina pública)** |

---

## Referencias cruzadas

| Documento | Qué cubre |
|-----------|-----------|
| `docs/PROJECT_STATUS.md` | Estado actual, riesgos, fase activa, gobernanza |
| `docs/00-INDEX.md` | Navegación documentación vigente |
| `docs/MIGRACION-GENTLE-AI.md` | Contexto migración, material archivado |
| `docs/adr/ADR-001-import-hybrid-architecture.md` | Import pipeline, bugs H-1..H-6 |
| `docs/adr/ADR-002-biblioteca-vitrina.md` | Biblioteca, identidad vs precio, acciones M001-M007 |
| `docs/04-Cierre-FSM-2026-08-20.md` | FSM canónica 3 estados, migración legacy pendiente |
| `docs/backend-architecture.md` | Arquitectura completa, checklist Apéndice A (11 items) |
| `docs/auth-architecture.md` | Auth completa, checklist 14.2 (21 items pre-prod) |
| `docs/testing-strategy.md` | Estrategia tests, plan incremental, ejemplos concretos |
| `docs/mvp-scope-v1.md` | Alcance cerrado MVP, criterios éxito, timeline |
| `src/backend/prisma/schema.prisma` | Modelo de datos fuente de verdad |
| `src/backend/prisma/cleanup-orphaned-list-products.ts` | **UNVERIFIED — NO EJECUTAR SIN AUTORIZACIÓN EXPLÍCITA** |

---

## Cómo usar este documento

1. **Filtrar por prioridad**: `grep "🔴\|🟡" docs/ACTION_ITEMS.md`
2. **Filtrar por dueño**: `grep "Backend\|Frontend\|Coordinador" docs/ACTION_ITEMS.md`
3. **Actualizar estado**: Cambiar 🔲 → 🟡 → ✅ al completar
4. **Cerrar ítem**: Verificar `lint + typecheck + tests pertinentes` (regla AGENTS.md)
5. **Registrar en Engram**: `mem_save` con título, tipo, scope, contenido estructurado

---

*Generado automáticamente tras exploración completa 2026-09-30. Actualizar al cerrar cada ítem.*