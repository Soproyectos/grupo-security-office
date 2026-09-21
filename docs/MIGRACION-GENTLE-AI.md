# Migración a Gentle-AI — 2026-09-21

**Contrato:** ADOPT-GENTLE-AI-001 · **Rama:** `agent/claude/ADOPT-GENTLE-AI-001`
**Herramienta:** Gentle-AI v3.4.0 (`gentle-ai`, `engram`, `gga`) · **Telemetría:** OFF (verificada `enabled:false`)

## Motivo de la decisión

El modelo de gobernanza anterior — coordinación multi-agente con tablero de issues local, agentes ejecutores autónomos (gatekeepers), runtime Orca headless y work-log manual — quedó obsoleto. Requería protocolo manual para cada sesión, provocaba conflictos entre reglas de contexto cerrado (`.kilo/rules/01-contexto-cerrado.md`) y la exploración que exige el desarrollo moderno, y duplicaba funciones que Gentle-AI resuelve nativamente (memoria, especificación, review, grafo de código). El coordinador aprobó reemplazarlo por Gentle-AI como capa de flujo/memoria/review con sesiones dirigidas por humano, sin orquestación automática.

## Tabla de equivalencias viejo → nuevo

| Antes (archivado) | Ahora (Gentle-AI) |
|---|---|
| Orca (runtime headless, WORKFLOW.md, AGENT_TEAM.md) | Sesiones directas dirigidas por el humano (una tarea a la vez) |
| `docs/agent-coordination/work-log.md` | Engram (memoria persistente `mem_*`) + `docs/archive/legacy-coordinacion-2026-09/` |
| Tablero de issues local (`agent-coordination/issues/`) | SDD (sdd-init/spec/tasks/verify) para trabajo sustancial |
| `qa-security-reviewer` (.opencode/agents) | RDD — review nativo (`gentle-ai review *`, opt-in, off por defecto) |
| `graphify-out/` (grafo de código piloto) | CodeGraph (capa de grafo de Gentle-AI) |
| `kilo.jsonc` / `opencode.json` / `CLAUDE.md` pre-Gentle | Configs generadas por el instalador (`.claude/`, `.config/kilo/`, `.config/opencode/`, `opencode.json` con agente `gentle-orchestrator`) |

## Dónde está el material archivado

**`docs/archive/legacy-coordinacion-2026-09/`** (movido con `git mv` — historia intacta):

| Elemento | Origen |
|---|---|
| `agent-coordination/` | `docs/agent-coordination/` — work-log, agent-status, file-ownership, issues, docs de Orca |
| `kilo/rules/` | `.kilo/rules/` — reglas de contexto cerrado y estándares (los estándares de código siguen aplicando como criterio de calidad) |
| `kilo/context/` | `.kilo/context/` — reportes, planes e `decisiones.md` (la última entrada registra esta migración) |
| `opencode/agents/` | `.opencode/agents/` — perfiles de ejecutores autónomos |
| `kilo.jsonc` | raíz del repo |
| `CLAUDE.md` | raíz del repo (versión pre-Gentle) |
| `opencode.json` | copia pre-Gentle extraída del backup del instalador (la versión vigente en la raíz la generó/modificó Gentle-AI y sigue activa) |
| `graphify-out/` | raíz del repo — grafo piloto; cubierto por CodeGraph |
| `WORKFLOW.md`, `AGENT_TEAM.md` | `docs/` — procedimiento Orca |

**Backups de configuración del instalador** (restaurables con `gentle-ai restore`): `~/.gentle-ai/backups/20260921164500.070080723/` — snapshot pre-install de `opencode.json`, `~/.claude/settings.json`, `~/.config/opencode/*` con checksum verificado.

## Issues GitHub de la cadena comercial

Los issues **#16–#27** de la cadena comercial siguen **vigentes**. No forman parte del material archivado (el tablero local sí lo es). Se ejecutan **por sesión directa** con el agente que el coordinador elija, una tarea a la vez, bajo las reglas de AGENTS.md.

## Notas para la primera sesión post-migración

1. Leer este documento antes de trabajar; **no confundir material archivado con vigente**. Documentos vigentes: `docs/00-INDEX.md`, `docs/PROJECT_STATUS.md`, `docs/adr/`, arquitectura técnica y docs de producto.
2. `.kilo/agents/` y `.kilo/plans/` quedaron fuera del archivo por no estar en el alcance del contrato; el modelo de gatekeepers ya no aplica — el coordinador decide su destino en una sesión futura.
3. RDD está **off por defecto** (switch del usuario: `gentle-ai review mode enable|disable|status`). No activarlo sin pedido explícito.
4. Telemetría deshabilitada a nivel estado (`gentle-ai telemetry disable`) y con `DO_NOT_TRACK=1` en `~/.bashrc`.
5. Los warnings de `gentle-ai doctor` por binarios duplicados (claude/kilo/opencode en PATH) son condición preexistente del servidor; los binarios de `/usr/bin` los usa el runtime Orca archivado.
6. Piloto ODD verificado (2026-09-21): tarea real (enlaces muertos en `docs/00-INDEX.md`), Explore → cambio → Check, memoria escrita en Engram y **recuperada por un agente nuevo en sesión fresca sin indicarle el contenido**. Hallazgo: la búsqueda de Engram es sensible al vocabulario literal del registro — escribir memorias con los términos clave del proyecto (`grupo security`, `decision`, nombres de feature) mejora la recuperación.
