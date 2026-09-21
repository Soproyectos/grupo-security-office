# AGENT_TEAM.md — Matriz de Responsabilidades y Escalamiento

> Equipo de agentes del proyecto **Grupo Security Office / Plataforma Comercial Grupo Security**.
> Autoridad estratégica: **Usuario + Claude Code**. Ejecutores técnicos: **Kilo Code** y **OpenCode**.

## Resumen del equipo (OpenCode)

| Agente | Archivo | Rol | Modo |
|--------|---------|-----|------|
| `tech-lead-orchestrator` | `.opencode/agents/tech-lead-orchestrator.md` | Coordinación técnica OpenCode | Ejecución |
| `solution-architect` | `.opencode/agents/solution-architect.md` | Arquitectura / contratos | **Solo análisis/diseño** |
| `data-migration-engineer` | `.opencode/agents/data-migration-engineer.md` | Datos / import / migración | Implementación |
| `backend-engineer` | `.opencode/agents/backend-engineer.md` | Backend NestJS | Implementación |
| `frontend-pwa-engineer` | `.opencode/agents/frontend-pwa-engineer.md` | Frontend React PWA | Implementación |
| `ai-integration-engineer` | `.opencode/agents/ai-integration-engineer.md` | IA/integración opcional | Implementación |
| `qa-security-reviewer` | `.opencode/agents/qa-security-reviewer.md` | QA / Seguridad | **Independiente** |
| `devops-release-engineer` | `.opencode/agents/devops-release-engineer.md` | DevOps / Release | Implementación |
| `excel-mapping-architect` | `.opencode/agent/excel-mapping-architect.md` | Contrato de mapeo Excel/CSV | **Solo diseño** |
| `python-excel-toolsmith` | `.opencode/agent/python-excel-toolsmith.md` | Utilidad Python de mapeo | Implementación (solo utilidad) |

> `finance-orchestrator` (`.opencode/agents/finance-orchestrator.md`) es un perfil **INACTIVO — FUERA DE ALCANCE**. No tiene autoridad, ownership ni rol de coordinación en este repositorio.

## Matriz de responsabilidades por dominio

| Dominio | Owner principal | Colaboradores | Revisor (QA) |
|---------|-----------------|---------------|--------------|
| **Coordinación estratégica** | Usuario + Claude Code | — | — |
| **Coordinación técnica OpenCode** | tech-lead-orchestrator | — | — |
| **Arquitectura, ADR, contratos** | solution-architect | tech-lead-orchestrator | qa-security-reviewer |
| **Modelo datos, Prisma, import/migración** | data-migration-engineer | backend-engineer | qa-security-reviewer |
| **Backend NestJS, auth, dominio** | backend-engineer | data-migration-engineer | qa-security-reviewer |
| **Frontend React PWA, UX, a11y** | frontend-pwa-engineer | backend-engineer (contratos) | qa-security-reviewer |
| **IA/OCR/Integraciones (opcional)** | ai-integration-engineer | backend-engineer (interfaces) | qa-security-reviewer |
| **Calidad, seguridad, tests** | qa-security-reviewer | (todos, revisión cruzada) | — (independiente) |
| **Infra local, CI/CD, release** | devops-release-engineer | backend-engineer, frontend-pwa-engineer | qa-security-reviewer |
| **Mapeo Excel/CSV (política)** | excel-mapping-architect | — | qa-security-reviewer |
| **Utilidad Python Excel (implementación)** | python-excel-toolsmith | excel-mapping-architect (contrato) | qa-security-reviewer |

## Permisos por agente (resumen ejecutivo)

| Agente | Lee todo | Escribe código | Escribe docs | Ejecuta tests | Despliega | Comandos destructivos |
|--------|----------|----------------|--------------|---------------|-----------|----------------------|
| tech-lead-orchestrator | ✅ | ❌ | ✅ (coordinación) | ❌ | ❌ | ❌ |
| solution-architect | ✅ | ❌ | ✅ (arquitectura/contratos) | ❌ | ❌ | ❌ |
| data-migration-engineer | ✅ | ✅ (import/migración/plan) | ✅ | ✅ (dev) | ❌ | ❌ (prod) |
| backend-engineer | ✅ | ✅ (`src/backend/**`) | ✅ | ✅ | ❌ | ❌ |
| frontend-pwa-engineer | ✅ | ✅ (`src/frontend/**`) | ✅ | ✅ | ❌ | ❌ |
| ai-integration-engineer | ✅ | ✅ (módulos IA opcionales) | ✅ | ✅ | ❌ | ❌ |
| qa-security-reviewer | ✅ | ✅ (tests/reportes) | ✅ | ✅ | ❌ | ❌ |
| devops-release-engineer | ✅ | ✅ (infra local/Docker/CI) | ✅ | ✅ (local) | ⚠️ (con aprobación) | ❌ |
| excel-mapping-architect | ✅ (Excel/CSV) | ❌ | ✅ (contrato mapeo) | ❌ | ❌ | ❌ |
| python-excel-toolsmith | ✅ (contrato + datos) | ✅ (solo utilidad Python) | ✅ | ✅ | ❌ | ❌ |

**Leyenda**: ✅ = Permitido | ❌ = Prohibido | ⚠️ = Con aprobación humana explícita

## Escalamiento y resolución de conflictos

### Nivel 1: Conflicto técnico entre ejecutores
1. Ejecutores reportan a su coordinador técnico (tech-lead-orchestrator para OpenCode) con evidencia.
2. Se propone solución o se solicita diseño a `solution-architect`.
3. El coordinador (usuario + Claude Code) documenta la decisión final.

### Nivel 2: Bloqueo de fase (Gate)
1. El coordinador (usuario + Claude Code) detecta criterios de puerta no cumplidos.
2. Documenta en `docs/PROJECT_STATUS.md`: qué falta, riesgos, opciones.
3. Solicita aprobación al usuario con máx. 3 opciones + recomendación.

### Nivel 3: Hallazgo crítico de seguridad (qa-security-reviewer)
1. QA emite hallazgo **Bloqueante** o **Alto** en reporte.
2. Se **detiene** el trabajo afectado inmediatamente.
3. El coordinador (usuario + Claude Code) asigna corrección al owner del módulo + plazo.
4. QA valida fix antes de reabrir gate.

### Nivel 4: Decisión de producto / alcance
1. El coordinador (usuario + Claude Code) presenta opciones (máx. 3).
2. Usuario decide → El coordinador documenta la decisión.
3. Equipo alinea y continúa.

## Propiedad temporal de archivos (Locks)

El registro de propiedad vive en `docs/agent-coordination/file-ownership.md`:

Reglas:
- Un archivo = un owner a la vez.
- Lock se libera al completar la tarea y commitear.
- El coordinador (usuario + Claude Code) inspecciona el registro antes de cada delegación.
- Conflictos de lock → Nivel 1 escalamiento.

## Comunicación entre agentes

### Formato orden de delegación (coordinador → ejecutor)
```markdown
## Orden: [ID único]
**Agente**: <ejecutor>
**Objetivo**: <resultado observable único>
**Archivos permitidos**: <paths exactos>
**Archivos prohibidos**: <paths que NO debe tocar>
**Entradas**: <docs, specs, schemas, código>
**Salida esperada**: <archivos nuevos/modificados, tests, docs>
**Criterios aceptación**: <lista verificable>
**Comandos validación**: <comandos exactos>
**Riesgos**: <técnicos, dependencia, alcance>
```

### Formato reporte ejecutor (ejecutor → coordinador)
```markdown
## Reporte: [ID orden]
**Estado**: completado | bloqueado | requiere decisión
**Archivos modificados**: [lista]
**Decisiones tomadas**: [qué y por qué]
**Pruebas ejecutadas**: [comando + resultado]
**Riesgos/deuda**: [pendientes, known issues]
**Siguiente acción**: [qué debería pasar]
```

## Historial de cambios

| Fecha | Cambio | Autor |
|-------|--------|-------|
| 2026-09-03 | Reconciliación de identidad: Grupo Security Office, Perplexity como coordinador único, finance-orchestrator inactivo | tech-lead-orchestrator |