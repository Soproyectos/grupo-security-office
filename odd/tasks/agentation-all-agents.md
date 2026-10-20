# Agentation for all agent clients

## Objective
Make Agentation annotations available to the project’s supported MCP clients and ensure the local annotation bridge is started consistently.

## Scope and constraints
- Authorized scope: project-local Agentation configuration and launch scripts.
- Do not change application behavior outside the development-only overlay.
- No commit, push, pull request, or remote operation without explicit authorization.
- Route: inline. The runtime instruction prohibits sub-agent delegation; mapping and implementation remain bounded to the existing integration files.

## Tasks
- [x] AGT-01 — Configure project MCP manifests so Codex-, Claude-, and OpenCode-compatible clients can connect to the Agentation bridge.
  - Acceptance: manifests use the same Agentation bridge URL and are valid JSON.
  - Checks: `jq empty .mcp.json` passed; `codex mcp list` reports `agentation` as enabled with the shared bridge URL.
- [x] AGT-02 — Provide a cross-platform local launcher and verify the HTTP bridge accepts connections on port 4747.
  - Acceptance: one documented launcher starts the bridge and its health endpoint responds.
  - Checks: `bash -n scripts/run-agentation.sh` passed; `npx -y agentation-mcp doctor` reports `Server (http://localhost:4747): Running and healthy`.
- [x] AGT-03 — Expose the shared bridge through Tailscale without dropping localhost access.
  - Acceptance: MCP clients use the verified MagicDNS bridge address; launchers bind to all interfaces and permit local, Tailscale IP, and MagicDNS frontend origins.
  - Checks: service restarted active; localhost, Tailscale IP, and MagicDNS each responded over HTTP; MagicDNS CORS preflight returned 204 with the expected allow-origin.
- [x] AGT-04 — Restore the browser clipboard fallback for Agentation on insecure HTTP/Tailscale origins.
  - Acceptance: Agentation can call `navigator.clipboard.writeText` even where the browser does not expose the native Clipboard API.
  - Checks: Docker frontend build and lint passed.

## Progress
Implemented project-local MCP configuration and cross-platform bridge launchers. The existing `.env.example` change remains outside this task.

## Verification evidence
- `jq empty .mcp.json` — passed.
- `bash -n scripts/run-agentation.sh` — passed.
- `codex mcp list` — Agentation enabled with the MagicDNS bridge URL.
- `npx -y agentation-mcp doctor` — Node, SQLite storage, and the shared HTTP bridge healthy.
- `git diff --check` — passed.
- `curl` bridge probes — `127.0.0.1`, `100.87.48.41`, and `srv-soporte.taila71364.ts.net` each reached port 4747.
- MagicDNS CORS preflight — `204 No Content` and `Access-Control-Allow-Origin: http://srv-soporte.taila71364.ts.net:5173`.
- `docker compose exec -T frontend npm run build` — passed after correcting the TypeScript clipboard feature check.
- `docker compose exec -T frontend npm run lint` — passed.

## Work-unit evidence
- Commit `5fb2586` — `fix(agentation): support clipboard over tailscale`.
- Rollback boundary: revert the Agentation MCP endpoints, launchers, and `installClipboardFallback` in `src/frontend/src/main.tsx`; application behavior outside the development overlay is unaffected.

## Next step
Restart the intended MCP client so it reloads its manifest. In Claude Code, approve the project MCP entry if prompted. Then use Agentation's Copy action on the Tailscale web URL and paste into the agent chat as the browser end-to-end check.
