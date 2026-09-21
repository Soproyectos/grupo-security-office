# Runtime headless de Orca — servidor Ubuntu

> Documenta la infraestructura real de ejecución de Orca para este repo: dónde
> corre, cómo se dispara, y cómo delega a OpenCode/Kilo. Complementa —no
> reemplaza— `worktree-issue-pr-procedure.md` y `README.md` (protocolo
> Kilo/OpenCode).

## Qué es

Orca es el orquestador técnico que crea worktrees aislados por tarea y lanza
en ellos al ejecutor correspondiente (OpenCode o Kilo, según
`AGENTS.md` § "Equipo de agentes"). Hasta ahora corría solo como app de
escritorio en el equipo Windows del coordinador; ahora además corre **headless
y persistente** en un servidor Ubuntu siempre encendido, para que la
delegación por issues funcione sin depender de que ese equipo esté prendido.

## Topología

```
GitHub Issues (label "ready-for-agent")
        │
        ▼
Orca runtime headless — systemd, soporte@192.168.110.153, puerto 6768
        │  cada 15 min: gh issue list --label ready-for-agent (precheck)
        ▼
Coordinador Claude (cuenta esnaideridrobo2@gmail.com, agente "claude")
        │
        ├─ backend / frontend / devops / QA ──▶ OpenCode  (opencode run ..., .opencode/)
        └─ Excel / import               ──▶ Kilo      (kilo run ...,    .kilo/)
        │
        ▼
Commit en rama propia del worktree + `gh pr create --draft` contra main
```

El equipo Windows del coordinador (`orca.exe` local) es ahora un **cliente**
más, emparejado como entorno `servidor-ubuntu` vía pairing code. Se puede
usar para delegar tareas puntuales sin pasar por GitHub (`orca worktree
create --environment servidor-ubuntu --agent claude --prompt "..."`), pero no
hace falta tenerlo prendido para que la automation corra.

## Componentes instalados en el servidor (`soporte@192.168.110.153`, Ubuntu 22.04)

| Componente | Ubicación | Corre como |
|---|---|---|
| Orca AppImage + servicio systemd `orca-serve.service` | `/opt/orca/orca-linux.AppImage` | usuario dedicado `orca` (sin login, `nologin`) |
| Repo clonado | `/home/orca/repos/grupo-security-office` | `orca` |
| Credenciales `gh`/git (copiadas de `soporte`, misma cuenta `Zatairo`) | `/home/orca/.config/gh`, `/home/orca/.gitconfig` | `orca` |
| Cuenta Claude gestionada por Orca | login OAuth propio, cuenta `esnaideridrobo2@gmail.com` | `orca` |
| CLI `claude` | `/usr/bin/claude` (npm global) | sistema |
| CLI `opencode` | `~soporte/.npm-global/bin/opencode` | usuario `soporte` (prefix local, sin sudo) |
| CLI `kilo` | `~soporte/.npm-global/bin/kilo` | usuario `soporte` (prefix local, sin sudo) |

El servicio systemd (`enable --now`) sobrevive reinicios del servidor.
Bind: `ws://0.0.0.0:6768`. Firewall: puerto 6768 abierto solo para la LAN
(`192.168.110.0/24`) vía `ufw`/`iptables` — no expuesto a internet.

## La automation

Nombre: `GitHub Issue Triage - grupo-security-office`, creada con
`orca automations create --environment servidor-ubuntu`.

- **Trigger**: cron `*/15 * * * *` (cada 15 min).
- **Precheck**: `gh issue list --repo Soproyectos/grupo-security-office --state open --label ready-for-agent --json number -q '.[0].number'` — si no hay issues con ese label, la corrida se salta (no consume cuota).
- **Provider**: `claude` (coordinador).
- **Workspace mode**: `new-per-run` (un worktree nuevo por issue).
- **Prompt del coordinador** (resumen; ver el automation completo con `orca automations show` para el texto exacto):
  1. Lista issues abiertos con label `ready-for-agent` sin worktree Orca ya vinculado (`linkedIssue`).
  2. Por cada uno: `orca worktree create --repo name:grupo-security-office --issue <n> --base-branch main`.
  3. Delega la implementación según `AGENTS.md` (OpenCode para backend/frontend/devops/QA, Kilo solo para Excel).
  4. El label `ready-for-agent` es la autorización explícita para commitear en la rama del worktree y abrir PR con `gh pr create --draft`. **Nunca** marca el PR listo para review ni mergea — eso sigue siendo aprobación humana explícita, igual que en `worktree-issue-pr-procedure.md`.
  5. Si falta una decisión importante, comenta en el issue (`gh issue comment`) y se detiene, en vez de asumir.

### Diferencia con el tablero interno de issues

`AGENTS.md` § "Tablero de issues entre agentes" describe a Orca descubriendo
issues `pending` en `docs/agent-coordination/issues/*.md`. La automation acá
documentada **no lee ese tablero**: dispara directamente sobre **issues de
GitHub** con label `ready-for-agent`. Son dos mecanismos de entrada
complementarios, no unificados todavía — si se necesita que ambos confluyan
(p. ej. que un issue de GitHub cree automáticamente su archivo en
`docs/agent-coordination/issues/`), es una tarea aparte a definir con el
coordinador.

## Operación

Comandos desde el equipo Windows (cliente emparejado como `servidor-ubuntu`):

```bash
# ver corridas de la automation
orca automations runs --environment servidor-ubuntu --json

# ver/editar la automation
orca automations show --environment servidor-ubuntu --automation <id> --json
orca automations edit --environment servidor-ubuntu --automation <id> --disabled   # pausar

# delegar una tarea puntual sin pasar por GitHub
orca worktree create --environment servidor-ubuntu --repo name:grupo-security-office \
  --name <tarea> --agent claude --prompt "<instrucciones>"

# ver worktrees/estado en el servidor
orca worktree ps --environment servidor-ubuntu
```

Desde el propio servidor (como `soporte`, con sudo):

```bash
sudo systemctl status orca-serve.service
sudo journalctl -u orca-serve.service -f
```

## Seguridad

- El pairing code (`orca://pair?code=...`) trae credenciales de dispositivo —
  no compartir fuera del equipo del coordinador ni pegarlo en logs
  compartidos.
- `orca serve` no tiene autenticación propia más allá del pairing; el acceso
  está limitado por firewall a la LAN local.
- El usuario de servicio `orca` corre sin shell de login (`nologin`) y sin
  sudo, siguiendo el principio de mínimo privilegio.
- Los PRs generados quedan siempre en **draft**; el merge a `main` sigue
  requiriendo aprobación humana explícita, sin excepción, igual que el resto
  del flujo Issue → PR → Merge.
