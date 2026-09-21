# Instrucciones globales

## Idioma
- Responde siempre en español.
- Nunca respondas en inglés, salvo que yo lo pida explícitamente.
- Si analizas código, explica en español claro, técnico y directo.
- Usa terminología de ingeniería de software, pero evita relleno.

## Estilo de respuesta
- Sé breve, preciso y accionable.
- Cuando describas un archivo, usa esta estructura:
  1. propósito
  2. dependencias
  3. flujo de datos
  4. riesgos
  5. mejoras recomendadas
- Si vas a modificar archivos, explica primero el plan en español y luego aplica cambios.

## Stack aprobado del proyecto

Consulta la tabla "Stack aprobado" en `AGENTS.md` para la configuración técnica completa: Frontend (React + TypeScript + Vite + Tailwind), Backend (NestJS + Prisma + PostgreSQL), Auth (JWT + RBAC con 5 roles: Super Admin, Supervisor, Admin Comercial, Operador, Consulta), Testing (Jest/Vitest), etc.

## graphify

Knowledge graph for this project is at `graphify-out/graph.json` (covers código, documentación y contexto de coordinación).

Agentes y usuarios: Para preguntas sobre la base de código y la coordinación, prefieren `graphify query "<question>"` a leer archivos fuente directamente. Usen `graphify path` para rastrear relaciones y `graphify explain` para conceptos específicos. Ejecuten `graphify update .` después de cambios (sin costo LLM).

**Nota**: las consultas se formulan **en inglés** o con identificadores técnicos exactos (ej. `lifecycleStatus`, `AclService`, `RBAC`) — los nodos de documentación se indexaron con labels en inglés. La respuesta al usuario sigue siendo en español.

## Decisiones vigentes

**Etapa 8 (destructiva) CONGELADA**. Planificada iteración separada `feat/fsm-legacy-removal-prep`:
- **8.1** (no destructiva): inventario y migración de lecturas/escrituras a `lifecycleStatus` (import, trending, Listas, lazy repair, `allowedActions` en listado), dual-write mantenido, docs/tests actualizados, email canónico.
- **8.2** (destructiva, futura): búsqueda referencias cero, DROP COLUMN legacy, desactivar dual-write, QA regresión completa con rollback.

**No se ejecutan migraciones destructivas ni DROP COLUMN en este cierre.**

**Regla operativa para subagentes**: Un task delegado que devuelve **reporte vacío** se marca como **NO VERIFICADO** y no cierra la orden. Antes de cerrar: confirmar con evidencia (git diff, tests, E2E, estado BD) o relanzar la tarea con exigencia explícita de reporte en texto.

## Historial de decisiones

Ver `docs/agent-coordination/decisiones-historicas.md` para el registro completo de decisiones arquitectónicas, operativas y de gobernanza tomadas durante el desarrollo del proyecto.