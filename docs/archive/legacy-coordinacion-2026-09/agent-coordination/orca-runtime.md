# Orca Runtime — Delegación de Issues a Agentes

> Describe el sistema de orquestación que delega issues de GitHub directamente a
> OpenCode/Kilo en worktrees aislados, sin intervención manual por cada tarea.

## Qué es

Orca es el orquestador técnico del proyecto. Monitorea issues de GitHub con un
label específico (ej. `ready-for-agent`) y por cada uno crea un worktree
aislado, delegando la implementación a:

- **OpenCode**: tareas de backend, frontend, devops, QA (reglas en `.opencode/`).
- **Kilo**: tareas específicas de Excel, import, mapping (reglas en `.kilo/`).

Sigue exactamente las reglas definidas en `AGENTS.md`, incluyendo: una tarea a
la vez, sin cambios masivos, sin comandos destructivos, sin tocar producción.

## Operación

### Cómo delegar una tarea

1. **Crear un issue** en `Soproyectos/grupo-security-office`.
2. **Aplicar el label** `ready-for-agent` (o el configurado en la automation).
3. **Esperar**: Orca lo detecta en el próximo ciclo de polling (~15 min) y crea
   un worktree + rama (`agent/<executor>/<TASK_ID>-<slug>`).
4. **Revisar**: El agente abre un PR en **draft** contra `main`. Nunca lo marca
   listo ni lo mergea — eso sigue siendo aprobación humana explícita.

### Validación y cierre

Cada tarea cierra solo después de:

- Ejecutar tests/validaciones permitidas (según `worktree-issue-pr-procedure.md`).
- Commitar en su rama propia + abrir PR **en draft**.
- Actualizar `docs/agent-coordination/work-log.md` con evidencia.
- Liberar reservas en `file-ownership.md`.

Nada se mergea automáticamente. Vos revisás, aprobás, y mergeás manualmente
en la CLI o en GitHub.

## Seguridad

- El label `ready-for-agent` es **autorización explícita** para que el agente
  trabaje (comitee, abra PR). Sin el label, Orca ignora el issue.
- PRs siempre quedan en **draft** — revisa antes de marcar listo para review.
- Merge a `main` requiere aprobación humana explícita, sin excepciones.
- Cada worktree es **aislado**: cambios en uno no afectan otros.
- Comandos destructivos (`rm -rf`, `git reset --hard`, `DROP TABLE`, etc.)
  están prohibidos — la agent-automation los rechaza por validación de prompt.

## Integración con AGENTS.md

Este flujo completa las reglas en `AGENTS.md`:

- **§ Tablero de issues entre agentes**: describe issues interiores en
  `docs/agent-coordination/issues/*.md` (si se necesita coordinación entre
  agentes).
- **§ Flujo operativo**: Orca implementa los pasos 2–4 automáticamente. El paso
  1 (crear el issue) lo haces vos en GitHub.
- **§ Contratos de delegación**: el label + issue de GitHub reemplazan el
  contrato explícito en este modelo.

Referencia cruzada: `worktree-issue-pr-procedure.md` (branch naming, PR rules,
commit format), `README.md` (protocolo Kilo/OpenCode).
