# PROJECT_STATUS.md — Estado del Proyecto Grupo Security Office

> Plataforma Comercial Grupo Security. Coordinador estratégico: **Usuario + Claude Code**.

## Identidad activa

| Campo | Valor |
|-------|-------|
| **Proyecto** | Grupo Security Office / Plataforma Comercial Grupo Security |
| **Coordinador estratégico** | Usuario + Claude Code |
| **Ejecutores técnicos** | Sesiones directas dirigidas por humano (Gentle-AI: ODD/SDD/RDD, Engram, CodeGraph) |
| **Rama Git actual** | `feat/storefront-public-pricing` (HEAD `e7e6ba7`, 2026-10-07). Migración Gentle-AI en `agent/claude/ADOPT-GENTLE-AI-001` (2026-09-21) |

## Stack activo

| Capa | Tecnología |
|------|------------|
| Frontend | React 18 + TypeScript + Vite 6 + Tailwind CSS 3.4 (PWA, mobile-first) |
| Backend | NestJS 11 + TypeScript 5.6 (strict) |
| Database | PostgreSQL 18 (contenedor `postgres:18-alpine`) |
| ORM | Prisma 5.20+ (driverAdapters, previewFeatures) |
| Auth | JWT (HttpOnly cookie) + bcrypt (rounds 12) + RBAC (5 roles) + MFA (TOTP modelo listo) |
| Data Fetching | TanStack Query v5 + Zustand v5 |
| API docs | Swagger/OpenAPI (`@nestjs/swagger` v11) |
| Testing | **Jest 30 + ts-jest + Supertest** (backend: 1102 tests / 64 suites) / **Vitest 5** (frontend: 377 tests / 35 archivos) |
| Contenedores | Docker + Docker Compose (prod: `docker-compose.prod.yml`, imágenes GHCR) |
| Python | Solo auxiliar (Excel parsing/mapping/import) |
| ERP | Yéminus (integración PENDIENTE confirmación API) |

**Python**: auxiliar únicamente para parsing/mapping/validación/importación de Excel. No es backend primario.

## Estado del proyecto

| Campo | Valor |
|-------|-------|
| **Fase activa** | **Cadena de commits de octubre cerrada (2026-10-07)** → Próximo: **Hito 2 Calidad base** + deuda de **Etapa 8.1 / Biblioteca Vitrina** |
| **Última actualización** | 2026-10-07 |
| **Tests backend** | 1102 tests / 64 suites — todos verdes (`npx jest`) |
| **Tests frontend** | 377 tests / 35 archivos — todos verdes (`npx vitest run`) |
| **Cobertura** | Sin medir (no hay reporte de coverage configurado) |
| **Typecheck** | Backend `tsc --noEmit` y frontend `tsc -b` limpios (2026-10-07) |
| **Migración FSM datos legacy** | Pendiente (backup + aprobación explícita requerida) |
| **Integración ERP Yéminus** | Bloqueada — sin confirmación de API |

---

## Riesgos y bloqueos activos

| ID | Riesgo/Bloqueo | Severidad | Owner |
|----|----------------|-----------|-------|
| R001 | Integración ERP Yéminus sin confirmación de API | Medio | Coordinador — decisión de alcance |
| R002 | `cleanup-orphaned-list-products.ts` sin validar | **Alto** | Coordinador — **autorizar ejecución solo con tarea explícita y aprobación del usuario** |
| R003 | Throttler global a 20 req/min (ajustable por env `THROTTLE_*`) | Bajo | Coordinador — proponer ajuste específico si molesta en uso real |
| R004 | `limit` no válido en `/api/products` (usa `skip`/`take`) | Bajo | Coordinador — normalizar query params |
| R005 | Scripts residuales `check-*.cjs`/`qa_*.js` en Temp/opencode | Bajo | Coordinador — limpiar post-QA |
| R006 | Email seed `admin@gruposecurity.co` vs docs `admin@grupo-security.com` | Bajo | Coordinador — alinear |
| ~~R007~~ | ~~Tests backend: 0 tests~~ — **CERRADO 2026-10-07**: 1102 tests / 64 suites | Cerrado | — |
| ~~R008~~ | ~~`JWT_SECRET` con fallback hardcodeado~~ — **CERRADO**: `auth.module.ts` y `jwt.strategy.ts` lanzan si falta la env var | Cerrado | — |
| ~~R009~~ | ~~Rate limiting login no implementado~~ — **CERRADO**: `@Throttle({ limit: 5 })` en login/registro + throttler global 20/min | Cerrado | — |
| ~~R010~~ | ~~`HttpExceptionFilter` no registrado globalmente~~ — **CERRADO**: `main.ts` registra filtro + `TransformInterceptor` | Cerrado | — |
| ~~R011~~ | ~~Contraseña mínima 6 chars~~ — **CERRADO**: `@MinLength(8)` + `PasswordPolicyService` (zxcvbn) | Cerrado | — |
| **R012** | **2 errores de lint en `features/users/components/DashboardGrants.tsx`** (preexistentes, `@typescript-eslint/no-unused-expressions`) | Bajo | Frontend — corregir en Hito 2 |
| **R013** | **`gentle-ai` no está en PATH** en el runtime de estas sesiones → RDD `review assess` no disponible | Medio | Coordinador — reinstalar/verificar el binario |

---

## Script de limpieza Prisma

- **Archivo**: `src/backend/prisma/cleanup-orphaned-list-products.ts`
- **Estado**: `UNVERIFIED — DO NOT EXECUTE WITHOUT EXPLICIT COORDINATOR (USER + CLAUDE CODE) TASK AND USER APPROVAL`
- **Nota**: Es un script administrativo destructivo (borrado físico en transacción). No se ejecuta sin autorización explícita.

---

## Deuda técnica conocida

| ID | Descripción | Prioridad |
|----|-------------|-----------|
| DT001 | Historial de perfiles FINANZAS 1:1 removidos; `finance-orchestrator.md` conservado como inactivo | Baja |
| ~~DT002~~ | ~~Tests backend 0%~~ — **RESUELTO 2026-10-07**: 1102 tests / 64 suites; **cobertura sin medir** | Resuelta (falta medir cobertura) |
| ~~DT003~~ | ~~Guards duplicados en `modules/auth/`~~ — **RESUELTO**: sólo existen `common/guards/` (roles + permissions) y `jwt-auth.guard.ts` | Resuelta |
| ~~DT004~~ | ~~`process.env` directo en `auth.module.ts`~~ — **RESUELTO**: usa `ConfigService` y lanza si falta la variable | Resuelta |
| DT005 | **parseInt manual** en query params vs DTOs tipados + ValidationPipe | Media |
| DT006 | **Auditoría manual** en servicios (duplicación, riesgo olvido) | Media |
| ~~DT007~~ | ~~`TransformInterceptor` no global~~ — **RESUELTO**: registrado en `main.ts` junto al `HttpExceptionFilter` | Resuelta |
| DT008 | **ProductImage sin timestamps** | Baja |
| DT009 | **Migración FSM datos legacy** (544+ productos con estados legacy) — `lifecycleStatus` ya se usa en lecturas/escrituras, falta migrar los datos | Alta |
| DT010 | **Biblioteca Vitrina (ADR-002)**: 9 acciones pendientes (M001–M007) | Media |
| DT011 | **Import pipeline bugs** (ADR-001): H-1..H-6 (isUpdate, HeaderDetectionConfig, type-safety, labels duplicados) | Media/Baja |
| DT012 | **2 errores de lint** en `DashboardGrants.tsx` + 9 warnings (frontend) | Baja |

---

## Próximas acciones (priorizadas)

### Hito 1: Seguridad dura — ✅ CERRADO 2026-10-07 (salvo C006)
1. **C001** Tests backend — hecho: 1102 tests / 64 suites (cobertura sin medir)
2. **C002** Rate limiting login — hecho: `@Throttle({ limit: 5 })` en login, 10 en
   registro/restauración, throttler global 20/min por env `THROTTLE_*`
3. **C003** JWT_SECRET sin fallback — hecho: `auth.module.ts` y `jwt.strategy.ts` lanzan
4. **C004** LoginDto `@MinLength(8)` + `PasswordPolicyService` (zxcvbn) — hecho
5. **C005** HttpExceptionFilter + TransformInterceptor globales en `main.ts` — hecho
6. **C006** Migración FSM legacy — **PENDIENTE** (backup + dry-run + aprobación explícita)

### Hito 2: Calidad base (próximo)
7. ~~**H001** TransformInterceptor~~ — hecho (global en `main.ts`)
8. ~~**H002** Eliminar guards duplicados~~ — hecho (sólo `common/guards/`)
9. ~~**H003** `process.env` → `ConfigService` en auth~~ — hecho
10. **H004** DTOs query tipados (`skip`/`take`/`search` con `@Type(() => Number)`)
11. ~~**H005** Account lockout~~ — hecho: `AccountLockoutService` (5→15 min, 10→60 min, 15→ indefinido)
12. **H006** Body parser limit 1MB
13. **H007** Bloquear auto-asignación roles
14. **H008** Auditoría automática (decorador/interceptor)
15. **H009** ProductImage `createdAt`
16. **H010** Ampliar tests frontend (Login, ProductForm, ImportWizard) — hay 377 tests
17. **H011** Corregir 2 errores de lint en `DashboardGrants.tsx` (DT012/R012)

### Hito 3: Etapa 8.1 + Biblioteca Vitrina core (Semana 3-4)
17. **M001** Etapa 8.1: migración lecturas/escrituras a `lifecycleStatus` (no destructiva)
18. **M002** ADR-002 migración Prisma: `nameSource`, `nameLockedAt`, `lastSeenAt`, tabla rol→tipo precio
19. **M003** Pipeline no pisa identidad si `nameLockedAt` existe
20. **M004** UI `bulk-transition` (764 productos = 764 clicks sin ella)
21. **M005** Tope 70 chars validador + corte tarjeta
22. **M006** Sembrar 764 fichas biblioteca
23. **M007** Limpiar costo/margen de `extraAttributes` (544 productos)

### Hito 4: Tests completos MVP (Semana 4)
24. Completar todos tests P0/P1 unitarios + e2e (~75 unit + 9 e2e total)

### Hito 5: Post-MVP Auth (Semana 5-6)
25. **M008** Refresh tokens (rotación, revocación)
26. **M009** MFA/TOTP Admin
27. **M010** CSP Headers

### Hito 6: ERP Yéminus (cuando API confirmada)
28. **M013** `externalId` en Product/PriceList/Category
29. **M014** Módulo `integration/` sync bidireccional

---

## Gobernanza de documentación

| Recurso | Rol |
|---------|-----|
| `docs/README.md` | Punto de entrada canónico de la documentación |
| `docs/00-INDEX.md` | Navegación corta a documentos vigentes |
| `docs/PROJECT_STATUS.md` | **Este archivo — estado actual, riesgos, próximos hitos** |
| `docs/ACTION_ITEMS.md` | **Inventario accionable completo priorizado (fuente de verdad versionada)** |
| `docs/adr/` | Única ubicación para nuevas decisiones de arquitectura (ADR) |
| `docs/archive/legacy-coordinacion-2026-09/` | Material archivado (Orca, issues locales, gatekeepers, kilo.jsonc, CLAUDE.md pre-Gentle, graphify-out, WORKFLOW.md) |

- La documentación heredada de **OpenClaw** y **FINANZAS 1:1** (incluyendo FastAPI, SQLAlchemy, Alembic, Pydantic y el ORQUESTADOR heredado) fue eliminada en la tarea `DOCS-CLEANUP-001`.
- Los documentos de modelo de datos, arquitectura backend, autenticación, testing, seguridad, alcance MVP y despliegue **requieren reconciliación verificada** posterior (identificado en `DOCS-AUDIT-001`). No se tratan como verificados hasta contrastarlos contra el código y la historia reciente de Git.

---

## Decisiones pendientes del coordinador

| ID | Decisión | Contexto | Recomendación |
|----|----------|----------|---------------|
| D001 | Ejecutar `cleanup-orphaned-list-products.ts` | Script destructivo UNVERIFIED | **No ejecutar sin tarea explícita + aprobación usuario** (R002) |
| D002 | Migración FSM datos legacy | 544+ productos con estados legacy | **Dry-run + backup + aprobación explícita** |
| D003 | Integración ERP Yéminus | Sin API confirmada | **Esperar confirmación API** (R001) |
| D004 | TransformInterceptor: global vs manual | Formato respuestas inconsistente | **Registrar global + estandarizar** |
| D005 | Borrado de Lista arrastra productos | ADR-002 límite conocido | **Decisión de negocio pendiente** |
| D006 | Rol → tipo de precio para vitrina | Bloquea vitrina pública | **Definir ahora** |

---

## Historial de cambios

| Fecha | Cambio | Autor |
|-------|--------|-------|
| 2026-10-07 | Cadena de **19 commits por feature** en `feat/storefront-public-pricing` (1a35342…e7e6ba7): seguridad Hito 1, db/pg adapter, Notion auth, notificaciones, team-workflow, portal de clientes, ficha de producto, media, auditoría, storefront, docs. Test-rojo corregido, gitignore de backups, zips fuera del índice, probes `src/test{,2}` borrados. Verificado: jest 1102/1102, vitest 377/377, tsc limpio. Hito 1 cerrado salvo C006 | Usuario + Claude Code (ODD `baseline-commit-chain`) |
| 2026-09-30 | Exploración completa post-migración; creado `docs/ACTION_ITEMS.md`; actualizado PROJECT_STATUS con riesgos críticos (tests, JWT_SECRET, rate limiting, HttpExceptionFilter, password min), hitos priorizados, deuda técnica expandida, decisiones pendientes | Usuario + Claude Code (sesión exploración) |
| 2026-09-09 | Reestructuración documentación: coordinador = usuario + Claude Code; OpenCode 11 agentes, Kilo 2 agentes; tablero issues en `docs/agent-coordination/issues/`; Etapa 8.1 como próximo paso; hallazgos menores añadidos a riesgos | Agente Haiku (plan enumerated-whistling-rivest) |
| 2026-09-03 | Reconciliación de identidad a Grupo Security Office; stack NestJS/Prisma/React; finance-orchestrator inactivo; script Prisma marcado UNVERIFIED | tech-lead-orchestrator |
| 2026-09-21 | Migración a Gentle-AI completada (ADOPT-GENTLE-AI-001); RDD ON, telemetría OFF, material archivado en `docs/archive/legacy-coordinacion-2026-09/` | Usuario + instalador Gentle-AI |

---

> **Nota**: Ver `docs/ACTION_ITEMS.md` para el inventario completo accionable (80+ ítems priorizados por criticidad, módulo, dueño y esfuerzo). Este archivo resume los hitos y decisiones; el ACTION_ITEMS es la lista de trabajo operativa.