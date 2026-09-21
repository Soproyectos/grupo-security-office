# Procedimiento Issue → PR → Merge → Handoff

> Procedimiento canónico de ramas, worktrees y cierre para Grupo Security Office.
> Título en español; instrucciones operativas en inglés técnico.

## Flujo

```
Issue → Plan → Branch → Worktree → Agent → Validation → Commit → Pull Request → Merge → Handoff
```

**One Issue = one branch = one worktree = one closed goal.** No combine multiple
goals in a single branch or worktree.

## Convención de ramas

```
agent/<executor>/<TASK_ID>-<short-slug>
```

- `<executor>`: `opencode` or `kilo`.
- `<TASK_ID>`: e.g. `DOCS-CLEANUP-001`.
- Example: `agent/opencode/DOCS-CLEANUP-001-remove-legacy-docs`.

## Convención de worktrees

```
<task-id-lowercase>-<short-slug>
```

- Example: `docs-cleanup-001-remove-legacy-docs`.
- One worktree per task; Orca isolates agent execution.

## Reglas de trabajo en paralelo

- Two tasks may run in parallel only when they modify **different files** and do
  not share an endpoint, API contract, shared type, Prisma schema, migration,
  package manifest, lock file, or infrastructure configuration.
- A conflicting task remains `WAITING` or `BLOCKED` until the coordinator (user + Claude Code) resolves
  ownership.
- Never edit the same file from two worktrees simultaneously.

## Validación y evidencia de cierre

Before closing, the agent must:

1. Run the allowed validation commands for the task.
2. Append an entry to `docs/agent-coordination/work-log.md`.
3. Update `docs/agent-coordination/agent-status.md` to `COMMITTED`.
4. Release reservations in `docs/agent-coordination/file-ownership.md`
   **immediately before** the atomic commit.
5. Create one atomic commit (code + docs + validation evidence).
6. Report the commit hash and next action.

## Prohibiciones de Git

- Do **not** develop directly on `main`.
- Do **not** run destructive Git commands.
- Do **not** use `git add .`, `git commit -a`, force-push, `reset --hard`, or
  mass cleanup.
- Do **not** amend or rewrite another agent's commit.
- Do **not** merge into `main` without an explicit coordinator (user + Claude Code) order and user approval.

## Archivos fuera de stage y commits

- `src/backend/prisma/schema_backup.prisma` must remain **outside** staged changes
  and commits at all times.
- Do not stage secrets, `.env` files, keys, tokens, generated build artifacts, or
  unrelated files.

## Aprobación humana requerida

- Cambios en producción, secretos, RBAC, datos destructivos, migraciones, DNS o
  despliegue requieren aprobación humana explícita.