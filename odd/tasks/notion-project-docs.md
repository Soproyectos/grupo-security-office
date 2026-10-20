# Feature: Living project documentation in Notion

Status: not started — handed off for another agent (2026-10-02). Not yet explored in depth.

## Objective
Keep the whole Grupo Security project written up and documented in Notion, always up
to date, in language a 16-year-old can understand. Every agent working on the project
(Claude Code, OpenCode, others) must be able to write pages and comments there.

## Why
The owner wants to read and understand what is being built, why, and how it is
going, without technical background. Today knowledge is spread across `odd/tasks/`,
`docs/`, commit messages and agent memories.

## Current state (evidence, 2026-10-02)
- Backend OAuth integration exists but is unfinished and uncommitted
  (`src/backend/src/modules/auth/notion-auth.{controller,service,module}.ts`,
  `notion-crypto.service.ts`, created 2026-09-30): routes `GET /api/auth/notion`,
  `/callback`, `/status`, `/disconnect`; tokens stored encrypted in `notion_tokens`
  (migration `20260930183000_add_notion_token`, applied locally and in Supabase).
- No frontend uses it. No code writes documentation to Notion yet.
- `NotionAuthService` reads `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`,
  `NOTION_REDIRECT_URI`; see the deploy note below about boot failures.
- `docs/notion-import/NOTION_Project_Overview.md` exists (content imported from Notion).
- Claude Code sessions in this workspace also have a Notion connector (MCP) that can
  create/update pages and comments directly.

## Open product decisions (ask the owner, one at a time)
1. Which Notion workspace/page is the documentation root?
2. Should agents write through the app's OAuth integration, or directly through each
   agent's own Notion connector? (The connector route needs no app code; the OAuth
   route is needed only if the web app itself must publish to Notion.)
3. What structure: one page per feature (mirroring `odd/tasks/*.md`), a changelog/
   diary, a glossary of terms?

## Scope (proposed, to confirm)
- Define the Notion structure and a writing guide ("explain it like to a
  16-year-old": short sentences, no unexplained jargon, always say why).
- Backfill: one plain-language page per existing feature document in `odd/tasks/`.
- Project rule for all agents (AGENTS.md / CLAUDE.md): after meaningful work, update
  the matching Notion page and add a dated entry.
- If the OAuth route is kept: finish it (frontend connect button, status) and make it
  optional at boot.

## Constraints
- Never put secrets, tokens, credentials or customer data in Notion pages.
- Plain-language pages complement, not replace, the technical docs in the repo.

## Acceptance criteria
- The owner can open Notion and understand what exists, what changed recently, and
  what comes next, without help.
- A new agent can find the rule and the guide and follow them.

## Tasks
- [ ] N01: Resolve the open product decisions with the owner.
- [ ] N02: Create the Notion structure and the writing guide.
- [ ] N03: Add the documentation rule to the agent instructions used by every tool.
- [ ] N04: Backfill pages from `odd/tasks/`.
- [ ] N05 (only if OAuth route kept): finish the integration (frontend + tests).
