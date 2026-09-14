# AGENTS.md — Reglas del Proyecto Grupo Security Office

> Configuración de agentes y reglas operativas para la Plataforma Comercial Grupo Security
> (panel administrativo interno + catálogo comercial integrado con ERP Yéminus).

## Idioma

- **Comunicación directa con el usuario humano (coordinador)**: Español — chat, preguntas, bloqueos, resúmenes conversacionales.
- **Reportes técnicos entre agentes** (bloque "Response format"/"Delivery format" de cada perfil en `.opencode/agents/`, entradas de `work-log.md`, contratos de delegación, cuerpo técnico de commits/PRs/issues de GitHub): **Inglés** — reduce tokens y es consistente con código/identificadores, que ya son en inglés. (Esto alinea con `docs/agent-coordination/README.md`, que ya exigía "imperative English summary" en commits.)
- **Documentación de referencia dirigida a humanos** (este archivo, ADRs, docs que lee el coordinador): Español, salvo que el documento ya esté establecido en inglés.
- **Código, nombres técnicos, APIs, variables, tablas, enums**: Inglés consistente (snake_case BD, camelCase TS/JS, PascalCase tipos, UPPER_SNAKE_CONSTANTS).

## Autoridad de coordinación

- **Usuario + Claude Code**: coordinación estratégica — define alcance, dependencias, propiedad de archivos, criterios de aceptación y secuencia de tareas en sesión directa.
- **Kilo Code**: ejecutor técnico bajo las reglas de `.kilo/` (ahora limitado a Excel e integración de resultados aprobados).
- **OpenCode**: ejecutor técnico bajo los perfiles de `.opencode/` (dueño exclusivo de implementación backend/frontend/devops/QA).
- **`tech-lead-orchestrator`**: agente de coordinación técnica de OpenCode únicamente. No reemplaza al coordinador (usuario + Claude Code) como autoridad estratégica.

## Equipo de agentes (OpenCode)

| Agente | Rol | Modo | Permisos clave |
|--------|-----|------|----------------|
| `tech-lead-orchestrator` | Coordinación técnica OpenCode | Ejecución | Secuencia tareas, análisis de dependencias, validación de handoff; **no autoridad estratégica sobre el coordinador (usuario + Claude Code)**; **no implementa código producto** |
| `solution-architect` | Arquitectura y contratos | **Solo análisis/diseño** | Revisión de arquitectura, contratos cross-layer, diseño técnico; **sin autoridad independiente de implementación** |
| `data-migration-engineer` | Datos / import / migración | Implementación | Análisis import/export y planificación de migración para PostgreSQL/Prisma; **sin Alembic ni SQLAlchemy**; **no toca prod** |
| `backend-engineer` | Backend NestJS | Implementación | `src/backend/**`, tests backend, lint/typecheck/prisma validate, **no secretos**, **no deploy prod** |
| `frontend-pwa-engineer` | Frontend React PWA | Implementación | `src/frontend/**`, tests frontend, a11y/PWA, **no modifica contratos backend sin aprobación** |
| `ai-integration-engineer` | IA/integración opcional | Implementación | Integración IA opcional, **no reglas financieras**, **no ownership de esquema de datos primario** |
| `qa-security-reviewer` | QA / Seguridad | **Independiente** | Lee todo, escribe tests/reportes, **no aprueba su propio trabajo**, **no despliega** |
| `devops-release-engineer` | DevOps / Release | Implementación | Infra local/reversible, Docker, CI; **no deploy prod ni cambios de credenciales sin aprobación humana** |

## Excel / importación

- `excel-mapping-architect`: define el mapeo canónico Excel/CSV, reglas de validación, reporte de filas rechazadas y contrato de mapeo. **No implementa**.
- `python-excel-toolsmith`: implementa únicamente la utilidad Python definida por el contrato de mapeo aprobado. **No decide política de mapeo**.
- `GS Excel Import Implementer` (Kilo): integra el resultado aprobado en la aplicación comercial NestJS/Prisma.
- `data-migration-engineer`: planificación de migración/import y revisión de riesgo de datos PostgreSQL/Prisma.

Ningún agente puede ser dueño simultáneo de la política de mapeo y de la integración a la aplicación sin una tarea separada asignada por el coordinador (usuario + Claude Code).

## Reglas globales obligatorias

### Flujo de trabajo
- **Una tarea o incremento a la vez**. No avanzar sin la designación y aprobación correspondiente.
- **Antes de editar**: inspeccionar archivo(s), resumir impacto, definir criterios de aceptación.
- **Evitar cambios masivos** no solicitados.
- **No cambiar stack** sin decisión documentada y aprobación explícita.
- **No guardar secretos** (tokens, passwords, API keys, teléfonos, comprobantes reales, PII) en Git. Usar variables de entorno.
- **Datos ficticios** en fixtures, tests, seeding, desarrollo.
- **No comandos destructivos** en ambientes no desechables: `rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`, `DROP DATABASE`, `docker volume rm`, reescritura historia.
- **No commits ni push** sin autorización explícita del usuario.
- **Cada tarea** debe incluir pruebas y documentación proporcional al cambio.
- **Funcionalidad comercial** debe probar: integridad, autorización (RBAC, ownership), y consistencia (invariantes de Lista/Producto/Precio).
- **Ningún agente declara "terminado" solo porque compila**. Requiere: validación, revisión independiente, evidencia documentada.
- **Decisiones importantes faltantes**: presentar máx. 3 opciones con recomendación y **detenerse** hasta aprobación.
- **Reportes breves**: hecho, evidencia, riesgos, siguiente paso.

### Protección de archivos
- El coordinador (usuario + Claude Code) asigna **propiedad temporal** de archivos/módulos a un solo agente a la vez.
- No dos agentes editando el mismo archivo simultáneamente.
- El registro de propiedad vive en `docs/agent-coordination/file-ownership.md`.

### Contratos de delegación (obligatorios en cada orden)
- Objetivo único
- Archivos permitidos
- Archivos prohibidos
- Entradas disponibles
- Salida esperada
- Criterios de aceptación
- Comandos de validación
- Riesgos conocidos

### Tablero de issues entre agentes

Cuando el coordinador (usuario + Claude Code) planea una tarea y la delega a OpenCode, Kilo, o entre sí, queda registrada en `docs/agent-coordination/issues/` como un archivo `.md` por issue, con los campos: `id`, `title`, `status` (pending | in_progress | completed | blocked), `assigned_tool` (claude | opencode | kilo), `created_by`, `created_at`, `scope` (con los campos "Contratos de delegación" arriba), `completed_at`, `result_summary`.

**Flujo operativo** (ver `docs/agent-coordination/worktree-issue-pr-procedure.md` para procedimiento completo):
1. El coordinador crea un issue en `docs/agent-coordination/issues/<TASK_ID>.md` con `status: pending` y `scope` explícito.
2. Orca (el orquestador técnico) descubre issues `pending`, abre un worktree (`agent/<executor>/<TASK_ID>-<slug>`), e invoca al agente correspondiente con el `scope` como contrato.
3. El agente ejecuta, prueba y cierra el issue (`status: completed` + `result_summary`), corriendo `graphify update .` al terminar.
4. Si la validación pasa, se abre PR automáticamente. El merge a `main` requiere aprobación humana explícita del coordinador (usuario + Claude Code) — es la misma regla de seguridad que ya existe, solo cambia quién otorga la autorización.

**Paralelismo**: máx. 2 tareas simultáneas solo si no tocan los mismos archivos/contratos/schema; si hay conflicto, una queda `BLOCKED` hasta liberarse. Por defecto, un worktree y un agente activo por issue.

Referencia cruzada: `docs/agent-coordination/worktree-issue-pr-procedure.md` (procedimiento técnico completo con branch naming, worktree, PR, merge rules).

**Runtime de Orca**: además del tablero interno de arriba, existe una automation de Orca corriendo headless en un servidor Ubuntu 24/7 que dispara directamente sobre **issues de GitHub** con label `ready-for-agent` (cada 15 min), independiente de que el equipo del coordinador esté encendido. Detalle completo, topología y comandos de operación en `docs/agent-coordination/orca-headless-runtime.md`.

### Respuesta de subagentes (obligatoria)
- Estado: `completado` | `bloqueado` | `requiere decisión`
- Archivos modificados
- Decisiones tomadas
- Pruebas ejecutadas y resultados
- Riesgos o deuda técnica
- Siguiente acción recomendada

## Stack aprobado

| Capa | Tecnología | Nota |
|------|------------|------|
| Frontend | React + TypeScript + Vite + Tailwind CSS | Panel admin + catálogo, mobile-first |
| Backend | NestJS + TypeScript | Módulos productos, listas, precios, usuarios, roles, auditoría |
| Database | PostgreSQL 16 | Única fuente de verdad |
| ORM | **Prisma 5.x** | Migraciones versionadas |
| Auth | JWT + bcrypt + RBAC | Roles: Super Admin, Supervisor, Admin Comercial, Operador, Consulta |
| Data Fetching | TanStack Query (React Query) | Server state |
| Estado UI | Zustand | Client state |
| API docs | Swagger (OpenAPI) | — |
| Testing | Jest/Vitest + Playwright | Backend + frontend |
| CI/CD | GitHub Actions | Lint, test, build, security |
| Contenedores | Docker + Docker Compose | Local/dev |
| Python | **Solo auxiliar** (Excel parsing, mapping, validación, import) | No es backend primario |
| ERP | Yéminus | **Pendiente confirmación API; no asumir CRUD** |

Python (pandas/openpyxl) se utiliza únicamente como herramienta auxiliar de análisis/mapping/importación de Excel. El backend primario es NestJS + Prisma.

## Archivos de coordinación

- `docs/agent-coordination/README.md` — Protocolo de coordinación Kilo/OpenCode.
- `docs/agent-coordination/agent-status.md` — Estado actual de cada ejecutor.
- `docs/agent-coordination/file-ownership.md` — Reservas activas y liberadas.
- `docs/agent-coordination/work-log.md` — Evidencia append-only de tareas completadas.
- `docs/agent-coordination/orca-runtime.md` — Sistema de orquestación automática de Orca: cómo delega issues de GitHub (label `ready-for-agent`) a OpenCode/Kilo en worktrees aislados.
- `docs/AGENT_TEAM.md` — Matriz de responsabilidades y escalamiento.
- `docs/WORKFLOW.md` — Fases, puertas y contratos de delegación.
- `docs/PROJECT_STATUS.md` — Estado por fase, tareas, bloqueos, evidencia.

> **Nota**: El proyecto **FINANZAS 1:1**, **FastAPI**, **SQLAlchemy**, **Alembic** y el agente **`finance-orchestrator`** no forman parte de este repositorio. El perfil `finance-orchestrator.md` se conserva únicamente como registro histórico inactivo.

## graphify

Knowledge graph for this project is at `graphify-out/graph.json` (covers código, documentación y contexto de coordinación).

Agentes y usuarios: Para preguntas sobre la base de código y la coordinación, prefieren `graphify query "<question>"` a leer archivos fuente directamente. Usen `graphify path` para rastrear relaciones y `graphify explain` para conceptos específicos. Ejecuten `graphify update .` después de cambios (sin costo LLM).

**Nota**: las consultas se formulan **en inglés** o con identificadores técnicos exactos (ej. `lifecycleStatus`, `AclService`, `RBAC`) — los nodos de documentación se indexaron con labels en inglés. La respuesta al usuario sigue siendo en español.