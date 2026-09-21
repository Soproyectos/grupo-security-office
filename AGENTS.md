# AGENTS.md — Grupo Security Office

Plataforma Comercial Grupo Security: panel administrativo interno + catálogo comercial integrado con ERP Yéminus (pendiente confirmación de su API).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React + TypeScript + Vite + Tailwind CSS (PWA, mobile-first) |
| Backend | NestJS + TypeScript |
| Database | PostgreSQL 16 (única fuente de verdad) |
| ORM | Prisma 5.x (migraciones versionadas) |
| Auth | JWT + bcrypt + RBAC (Super Admin, Supervisor, Admin Comercial, Operador, Consulta) |
| Data Fetching / Estado | TanStack Query / Zustand |
| API docs / Testing | Swagger (OpenAPI) / Jest-Vitest + Playwright |
| Contenedores | Docker + Docker Compose (local/dev) |
| Python | Solo auxiliar (Excel parsing/mapping/import) |
| ERP | Yéminus |

Código e identificadores en inglés; comunicación con el coordinador en español.

## Reglas del proyecto

1. **Sin secretos en Git** — tokens, passwords, API keys, teléfonos, comprobantes reales y PII van en variables de entorno. Datos ficticios en fixtures, tests y seeding.
2. **Ambientes LOCAL/PROD** — todo corre local primero (Docker); nada llega a producción sin aprobación humana explícita. No deploy a prod, no cambios de credenciales, sin autorización.
3. **Cambios mínimos** — resolver la tarea con el menor cambio coherente posible; sin reescrituras, refactors masivos ni cambios de stack no solicitados. Sin commits/push sin autorización explícita del usuario.
4. **Validación antes de "terminado"** — lint + typecheck + tests pertinentes; compilar no es terminar.

## Flujo de trabajo

**Gentle-AI es la capa de flujo/memoria/review** (ODD/SDD/RDD, Engram, skills, CodeGraph, personas) para Claude Code, Kilo Code y OpenCode. **No hay orquestación automática**: las sesiones son dirigidas por el humano, una tarea a la vez. Contexto de la migración: `docs/MIGRACION-GENTLE-AI.md`.
