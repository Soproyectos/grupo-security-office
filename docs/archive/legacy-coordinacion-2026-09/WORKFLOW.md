# WORKFLOW.md — Fases, Puertas de Aprobación y Contratos de Delegación

> Flujo de trabajo del proyecto **Grupo Security Office / Plataforma Comercial Grupo Security**.
> Coordinador estratégico: **Usuario + Claude Code**. Ejecutores técnicos: **Kilo Code** y **OpenCode**.

## Visión general de fases

```
Fase 1: Panel administrativo interno ──────────► GATE 1
Fase 2: E-commerce público ────────────────────► GATE 2
Fase 3: Portal cliente ────────────────────────► GATE 3
```

**Regla de oro**: Una tarea o incremento a la vez. No avanzar sin aprobación explícita en la puerta correspondiente.

---

## Fase 1 — Sistema interno modular (ACTUAL)

### Objetivo
Panel administrativo interno: gestión de productos, categorías, marcas, precios/listas de precios, buscador y filtros, publicación, usuarios y roles (RBAC), y auditoría básica. **Stack NestJS + Prisma + PostgreSQL + React.**

### Tareas clave
- Productos, categorías y marcas.
- Listas de precios y precios con vigencia (invariante `Price.listaId == Product.listaId`).
- Carga masiva de precios/productos vía Excel/CSV (con Python auxiliar).
- Publicación (visible/no visible) y permisos de visibilidad/edición por lista.
- Usuarios internos y roles (Admin, Gerente, Operator, Viewer).
- Auditoría de cambios.

### Gate 1 — Panel administrativo operativo
**Qué se valida**: CRUD de productos/listas/precios, RBAC, auditoría, carga masiva, publicación.
**Quién aprueba**: Usuario (con input de `qa-security-reviewer`).
**Criterio**: "Panel administrativo funcional, seguro y probado".

---

## Fase 2 — E-commerce público

### Objetivo
Catálogo público, ficha de producto, carrito, checkout, registro/login, integración ERP (stock/precios/pedidos), pasarela de pago (PCI-DSS).

**Nota**: La integración con **ERP Yéminus** está **pendiente de confirmación de API**. No asumir CRUD hasta validación. El conector se implementa como endpoint 501 (not implemented placeholder) hasta confirmar.

### Gate 2 — E-commerce público operativo
**Qué se valida**: catálogo público, carrito, checkout, integración ERP (si confirmada), pago.
**Quién aprueba**: Usuario + `qa-security-reviewer`.

---

## Fase 3 — Portal cliente

### Objetivo
Acceso a cotizaciones, seguimiento de pedidos y soporte.

### Gate 3 — Portal cliente operativo
**Qué se valida**: cotizaciones, seguimiento, soporte.
**Quién aprueba**: Usuario + `qa-security-reviewer`.

---

## Ciclo obligatorio por tarea (todas las fases)

```
1. PLAN BREVE
   - Objetivo único, archivos objetivo, criterios de aceptación

2. CRITERIOS DE ACEPTACIÓN VERIFICABLES
   - Métricas, tests, evidencias esperadas

3. IMPLEMENTACIÓN (ejecutor especializado)
   - Código + tests + docs proporcionales

4. PRUEBAS AUTOMÁTICAS
   - lint, typecheck, unit, integration, contract

5. REVISIÓN qa-security-reviewer
   - Hallazgos por severidad, reporte documentado

6. CORRECCIONES
   - Fix bloqueantes/altos en la misma iteración

7. INFORME DE EVIDENCIA
   - Qué se hizo, tests pasan, riesgos residuales

8. APROBACIÓN ANTES DE LA SIGUIENTE PUERTA
   - Usuario valida evidencia
```

---

## Contrato de delegación (plantilla obligatoria)

Cada orden del coordinador al ejecutor **debe incluir**:

| Campo | Descripción |
|-------|-------------|
| **Objetivo único** | Una frase, resultado observable |
| **Archivos permitidos** | Paths exactos o glob patterns |
| **Archivos prohibidos** | Paths que NO debe tocar |
| **Entradas disponibles** | Docs, specs, schemas, código existente |
| **Salida esperada** | Archivos nuevos/modificados, tests, docs |
| **Criterios de aceptación** | Lista verificable (comandos, assertions) |
| **Comandos de validación** | Exactos para ejecutar y verificar |
| **Riesgos conocidos** | Técnicos, de dependencia, de alcance |

---

## Respuesta de ejecutor (formato obligatorio)

Cada ejecutor **debe responder** con:

| Campo | Descripción |
|-------|-------------|
| **Estado** | `completado` \| `bloqueado` \| `requiere decisión` |
| **Archivos modificados** | Lista paths relativos |
| **Decisiones tomadas** | Qué se decidió y por qué (trade-offs) |
| **Pruebas ejecutadas y resultados** | Comando + output resumen |
| **Riesgos o deuda técnica** | Pendientes, known issues |
| **Siguiente acción recomendada** | Qué debería pasar ahora |

---

## Protección de archivos (concurrencia)

- Registro de propiedad en `docs/agent-coordination/file-ownership.md`.
- Un archivo = un owner. Conflicto → escalamiento Nivel 1.
- Lock se libera al completar la tarea y commitear.

---

## Responsabilidades Excel / importación

| Responsabilidad | Owner |
|-----------------|-------|
| Política de mapeo, reglas de validación, contrato de mapeo, reporte de filas rechazadas | `excel-mapping-architect` |
| Implementación de la utilidad Python (según contrato aprobado) | `python-excel-toolsmith` |
| Integración del resultado aprobado en NestJS/Prisma | `GS Excel Import Implementer` (Kilo) |
| Planificación de migración/import y revisión de riesgo de datos PostgreSQL/Prisma | `data-migration-engineer` |

Ningún agente puede ser dueño simultáneo de la política de mapeo y de la integración a la aplicación sin una tarea separada asignada por el coordinador (usuario + Claude Code).

---

## Historial de cambios

| Fecha | Cambio | Autor |
|-------|--------|-------|
| 2026-09-03 | Reconciliación a Grupo Security Office; fases comerciales; eliminación de referencias FINANZAS/FastAPI/SQLAlchemy/Alembic | tech-lead-orchestrator |