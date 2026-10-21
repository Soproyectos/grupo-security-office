# 🏢 Grupo Security Office — Plataforma Comercial

> **Estado**: Exploración completa (30-sep-2026) → **Hito 1: Seguridad dura**  
> **Coordinador**: Usuario + Claude Code  
> **Stack**: React 18 + NestJS 11 + PostgreSQL 18 + Prisma 5.20 + JWT/RBAC  
> **Repo**: `github.com/zatairo/grupo-security-office` (rama `agent/claude/ADOPT-GENTLE-AI-001`)

---

## 🎯 Resumen Ejecutivo (30 seg)

Plataforma interna para gestión de catálogo, precios, clientes y cotizaciones de **Grupo Security** (seguridad electrónica: CCTV, alarmas, control de acceso, smart home). Se integra (futuro) con ERP **Yéminus**.

- ✅ **Arquitectura limpia**: 18 módulos backend, 13 páginas frontend, FSM 3-estados implementada
- ✅ **Import real probado**: Hikvision 84 cols / 584 filas → 209 productos en 3.8s
- ❌ **CERO tests automáticos** — riesgo crítico de regresión
- ❌ **Seguridad expuesta**: JWT fallback hardcodeado, sin rate limit, errores inconsistentes

---

## 🚨 6 Riesgos CRÍTICOS (Bloquean producción)

| ID | Riesgo | Severidad | Acción Inmediata |
|----|--------|-----------|------------------|
| **C001** | **0 tests backend** (Jest configurado, 0 escritos) | 🔴 Crítica | Escribir suite P0: AuthService, JwtAuthGuard, RolesGuard, Auth e2e (~16h) |
| **C003** | `JWT_SECRET` con fallback `'fallback-dev-only'` en `jwt.strategy.ts:606` | 🔴 Crítica | Eliminar fallback, obligar variable de entorno real (1h) |
| **C002** | **Sin rate limiting** en login (aunque `@nestjs/throttler` instalado) | 🔴 Crítica | Configurar 5 req/min login, 30 global (2h) |
| **C005** | `HttpExceptionFilter` **no registrado global** → errores inconsistentes | 🔴 Crítica | `app.useGlobalFilters()` en `main.ts` (30min) |
| **C004** | Login acepta password **6 chars** vs registro **8 chars** | 🔴 Crítica | Unificar a 8 en `LoginDto` (30min) |
| **C006** | **544 productos** con estados legacy (`READY`, `SCHEDULED`, `HIDDEN`, `DISCONTINUED`) | 🔴 Crítica | Plan migración con backup + aprobación explícita (4h) |

> ⚠️ **Script `cleanup-orphaned-list-products.ts` = UNVERIFIED** → **NO EJECUTAR** sin autorización escrita.

---

## 🏗️ 2 Decisiones de Arquitectura Clave (ADRs)

### **ADR-001: Importación Híbrida** ✅ *Implementada y verificada*
- Pipeline 6 etapas: PARSE → DETECT → MAP → VALIDATE → NORMALIZE → EXECUTE
- Campo `extraAttributes` JSON para columnas no reconocidas
- **Resultado real**: 209/211 productos OK, 7 listas precio/producto, 10+ attrs extra
- **Bugs conocidos**: H-1 (preview `toUpdate:0`), H-3 (config muerta), H-5 (`tx:any`), H-6 (labels duplicados)

### **ADR-002: Biblioteca de Vitrina** 🟡 *Propuesta (9 acciones pendientes)*
- **Problema**: Vitrina muestra descripciones de 500 chars; cargas mensuales pisan curaduría manual; costos/márgenes viajan con producto
- **Solución**: Separar **Biblioteca** (identidad permanente: nombre, marca, categoría, imagen) ↔ **Lista** (precio desechable)
- **4 controles nuevos**: `nameSource`, `nameLockedAt`, `lastSeenAt`, tabla **rol → tipo de precio**
- **Bloquea vitrina pública** hasta definir D005/D006

---

## 📅 6 Hitos Priorizados

| Hito | Foco | Ítems clave | Target | Esfuerzo |
|------|------|-------------|--------|----------|
| **🔴 Hito 1** | Seguridad dura | C001–C006 | **Semana 1** | ~24h |
| **🟡 Hito 2** | Calidad base | H001–H010 (interceptor, guards, ConfigService, DTOs, lockout, auditoría auto, tests FE) | **Semana 2** | ~35h |
| **🟢 Hito 3** | Etapa 8.1 + Biblioteca core | M001–M007 (lifecycleStatus, schema biblioteca, pipeline no-pisa, UI bulk-transition, 70 chars, sembrar 764, limpiar extraAttributes) | **Semana 3-4** | ~40h |
| **🟢 Hito 4** | Tests completos MVP | Todos P0/P1 unit + e2e (~75 unit + 9 e2e) | **Semana 4** | ~25h |
| **🔵 Hito 5** | Post-MVP Auth | Refresh tokens, MFA/TOTP Admin, CSP Headers | **Semana 5-6** | ~20h |
| **⏸️ Hito 6** | ERP Yéminus | `externalId`, módulo sync bidireccional | **Cuando API confirmada** | ~20h |

---

## 🤝 6 Decisiones Pendientes (Requieren tu input)

| ID | Decisión | Contexto | Recomendación |
|----|----------|----------|---------------|
| **D001** | ¿Ejecutar `cleanup-orphaned-list-products.ts`? | Script destructivo UNVERIFIED | **NO** sin tarea escrita + tu "sí" explícito |
| **D002** | ¿Migrar ya 544 productos legacy FSM? | Requiere backup + dry-run | **Dry-run primero**, luego tu aprobación |
| **D003** | ¿Integración ERP Yéminus? | Sin API confirmada | **Esperar** confirmación real |
| **D004** | `TransformInterceptor`: ¿global o manual? | Formato respuestas inconsistente | **Global + estandarizar** |
| **D005** | ¿Borrar Lista arrastra productos? | ADR-002 lo deja abierto | **Decisión de negocio** (cascada / solo precios / solo nunca publicados) |
| **D006** | ¿Rol → tipo de precio para vitrina? | 7 precios, ¿quién ve cuál? | **Definir YA** (bloquea vitrina pública) |

---

## 📚 Documentos de Referencia (en repo)

| Archivo | Qué cubre |
|---------|-----------|
| `docs/ACTION_ITEMS.md` | **Lista completa 80+ items** (fuente de verdad operativa) |
| `docs/PROJECT_STATUS.md` | Estado, riesgos, hitos, gobernanza |
| `docs/adr/ADR-001-import-hybrid-architecture.md` | Pipeline import, bugs H-1..H-6 |
| `docs/adr/ADR-002-biblioteca-vitrina.md` | Separación identidad/precio, 9 acciones |
| `docs/04-Cierre-FSM-2026-08-20.md` | FSM canónica 3 estados, migración legacy |
| `docs/backend-architecture.md` | Arquitectura completa, checklist 11 items |
| `docs/auth-architecture.md` | Auth completa, checklist 21 items pre-prod |
| `docs/testing-strategy.md` | Estrategia tests, plan incremental, ejemplos |
| `src/backend/prisma/schema.prisma` | **Modelo de datos = fuente de verdad** |