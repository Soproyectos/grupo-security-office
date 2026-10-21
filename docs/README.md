# Documentación — Grupo Security Office

> Punto de entrada canónico de la documentación del proyecto.

## Identidad del proyecto

- **Proyecto**: Grupo Security Office / Plataforma Comercial Grupo Security.
- **Coordinador estratégico**: Usuario + Claude Code.
- **Ejecutores técnicos**: Kilo Code (reglas `.kilo/`) y OpenCode (perfiles `.opencode/`).
- **Coordinación técnica OpenCode**: `tech-lead-orchestrator` (no reemplaza al coordinador).

## Stack activo

| Capa | Tecnología |
|------|-----------|
| Frontend | React + TypeScript + Tailwind CSS + Vite |
| Backend | NestJS + TypeScript |
| Base de datos | PostgreSQL 18 |
| ORM | Prisma 5.x |
| Auth | JWT + bcrypt + RBAC |
| ERP | Yéminus (integración pendiente de confirmación de API) |

**Python** es auxiliar únicamente para parsing/mapping/validación/importación de Excel.
No es backend primario.

## Fuente de verdad

- **GitHub** es la única fuente de verdad para código, documentación, Issues,
  Pull Requests, commits e historial de proyecto.
- **Obsidian**, si se usa, es únicamente un navegador local de solo lectura sobre
  el Markdown versionado que vive bajo `docs/`. No es una segunda fuente de verdad.
- **Claude Pro** no forma parte del flujo de trabajo actual.

## Navegación

- [Estado actual del proyecto](./PROJECT_STATUS.md)
- [Flujo de trabajo (fases, puertas y delegación)](./WORKFLOW.md)
- [Equipo de agentes](./AGENT_TEAM.md)
- [Coordinación de ejecución](./agent-coordination/README.md)
- [Procedimiento Issue → PR → Merge → Handoff](./agent-coordination/worktree-issue-pr-procedure.md)
- [Handoff actual](./handoffs/HANDOFF_ACTUAL.md)
- [Índice de ADRs](./adr/ADR-001-import-hybrid-architecture.md)

### Arquitectura

- [Arquitectura general](./architecture.md) — estado parcial, pendiente de reconciliación.
- [Arquitectura detallada](./architecture-detailed.md) — estado parcial, pendiente de reconciliación.
- [Arquitectura backend](./backend-architecture.md) — estado parcial, pendiente de reconciliación.
- [Arquitectura de autenticación](./auth-architecture.md) — estado parcial, pendiente de reconciliación.
- [Gobernanza de acceso backend](./backend-access-governance.md) — estado parcial, pendiente de reconciliación.
- [Diagrama entidad-relación](./diagrama-er.md)

### Producto, testing, seguridad y UI

- [Alcance MVP](./mvp-scope-v1.md)
- [Estrategia de testing](./testing-strategy.md)
- [Checklist de seguridad](./security-checklist-v1.md)
- [Migración de filtros UI](./UI/ui-filters-migration.md)

## Estado de reconciliación

Parte de la documentación de arquitectura, modelo de datos, testing, seguridad,
alcance MVP y despliegue quedo identificada en la auditoría `DOCS-AUDIT-001` como
**desactualizada o parcial** frente al estado real del repositorio. Los documentos
que aún requieren una reconciliación verificada se marcan arriba como
"pendiente de reconciliación". No se asume como verificada ninguna afirmación que
no haya sido contrastada contra el código y la historia reciente de Git.

La documentación heredada de **FINANZAS 1:1**, **FastAPI**, **SQLAlchemy**,
**Alembic**, **Pydantic**, **OpenClaw** y el **ORQUESTADOR** heredado fue eliminada
en la tarea `DOCS-CLEANUP-001`.