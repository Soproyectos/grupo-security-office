# File Ownership

> This file prevents concurrent edits and merge conflicts.
> An agent must reserve files before modifying them and release them after committing.
> The coordinator (user + Claude Code) must inspect this file before every new delegation.

## Active reservations

| Task ID | Executor | Agent | Branch | Reserved file or directory | Purpose | Status | Reserved at | Expected release |
|---|---|---|---|---|---|---|---|---|
| DOCS-CLEANUP-001 | OpenCode | tech-lead-orchestrator | agent/opencode/DOCS-CLEANUP-001-remove-legacy-docs | docs/README.md, docs/00-INDEX.md, docs/PROJECT_STATUS.md, docs/agent-coordination/README.md, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md, docs/agent-coordination/worktree-issue-pr-procedure.md, docs/handoffs/HANDOFF_ACTUAL.md (create/update) + deletion targets (docs/DECISIONS.md, docs/decisions/, docs/decisiones/, docs/memoria/, docs/arquitectura/, docs/bitacora/, docs/reuniones/, docs/SOUL.md, docs/IDENTITY.md, docs/USER.md, docs/HEARTBEAT.md, docs/TOOLS.md, docs/seguimiento/, docs/archive/legacy-202607/, docs/data-model.md, docs/data-model-v1.md, docs/backend-remediation-plan.md, docs/frontend-phase1-stabilization.md, docs/qa-phase1-stabilization.md, docs/devops-phase1-stabilization.md, docs/deploy.md, docs/deployment-architecture.md) | Remove legacy docs + establish minimal canonical entry point | WORKING | 2026-09-07T00:00:00Z | before atomic commit |


> Note (2026-09-08, Claude Code): IMPL-DEV-ADMIN-BOOTSTRAP-001's reservation below was left in this
> table marked WORKING even though work-log.md and agent-status.md already show it COMMITTED
> (commit c1dc8fdbc19c0dcdf113b15926a83a4060399cef). Moved to Released reservations to correct the
> stale entry; no file content from that task was changed.

## Reservation rules

1. Reserve every code, configuration, documentation, test, migration, or infrastructure file before editing it.
2. Do not reserve broad directories when exact files are known.
3. A reservation conflicts when it targets the same file or a shared logical resource:
   - API endpoint
   - DTO or shared type
   - Prisma schema or migration
   - package manifest or lock file
   - deployment configuration
   - shared UI component
4. A conflicting task remains `WAITING` until the coordinator (user + Claude Code) resolves ownership.
5. Release reservations only after documentation, validation, and commit are complete.
6. Historical released reservations remain below for traceability.

## Released reservations

| Task ID | Executor | Agent | Files | Commit | Released at |
|---|---|---|---|---|---|
| COORD-RECONCILE-001 | OpenCode | tech-lead-orchestrator | AGENTS.md, docs/AGENT_TEAM.md, docs/WORKFLOW.md, docs/PROJECT_STATUS.md, docs/agent-coordination/*, opencode.json, .opencode/agents/*.md, .opencode/agent/excel-*.md, data/import/README.md, requirements.txt | (see work-log) | 2026-09-03T00:00:00Z |
| FE-COMMERCIAL-NAV-001 | Kilo Code | GS Frontend Implementer | src/frontend/src/components/layout/Header.tsx, src/frontend/src/components/layout/CommercialLayout.tsx, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-04T00:00:00Z |
| BE-RBAC-001 | OpenCode | backend-engineer | src/backend/src/app.module.ts, src/backend/src/common/guards/permissions.guard.ts, src/backend/src/common/guards/permissions.guard.spec.ts, src/backend/prisma/seed.ts, src/backend/src/modules/listas/listas.controller.ts, src/backend/src/modules/products/products.controller.ts, src/backend/src/modules/assignments/assignments.controller.ts, docs/agent-coordination/{agent-status,file-ownership,work-log}.md | (see work-log) | 2026-09-04T00:00:00Z |
| BE-LINT-FIX-001 | OpenCode | backend-engineer | src/backend/src/modules/products/products.controller.ts, src/backend/src/modules/products/products.service.ts, docs/agent-coordination/{agent-status,file-ownership,work-log}.md | b7e8ca4 (code) | 2026-09-04T00:00:00Z |
| CHORE-OBSIDIAN-IGNORE-001 | OpenCode | tech-lead-orchestrator | .gitignore, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | chore(git): ignore local Obsidian configuration [CHORE-OBSIDIAN-IGNORE-001] | 2026-09-07T00:00:00Z |
| IMPL-DEV-ADMIN-BOOTSTRAP-001 | Kilo Code | Comercial-Backend-Implementer | src/backend/scripts/dev-admin-bootstrap.ts, src/backend/package.json, src/backend/.env.example, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | c1dc8fdbc19c0dcdf113b15926a83a4060399cef | 2026-09-08T05:32:03Z |
| IMPL-DEV-RBAC-BOOTSTRAP-001 | Claude Code | (direct session) | src/backend/scripts/dev-rbac-bootstrap.ts, src/backend/package.json, src/frontend/src/services/api.ts, src/frontend/src/vite-env.d.ts, src/frontend/.env.production, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-08T00:00:00Z |
| FIX-IMPORT-NAME-FALLBACK-001 | Claude Code | (direct session) | src/backend/src/modules/products/import/helpers/text-normalizer.ts, src/backend/src/modules/products/import/pipeline/row-normalizer.service.ts, src/backend/src/modules/products/import/pipeline/row-validator.service.ts, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-08T00:00:00Z |
| FIX-IMPORT-BATCH-ISOLATION-001 | Claude Code | (direct session) | src/backend/src/modules/products/import/pipeline/batch-executor.service.ts, src/backend/src/modules/products/import/pipeline/row-validator.service.ts, src/backend/src/modules/products/import/pipeline/batch-executor.service.spec.ts, src/backend/src/__test__/mocks/prisma.mock.ts, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-08T00:00:00Z |
| FIX-IMPORT-SESSION-PERSISTENCE-001 | Claude Code | (direct session) | src/backend/prisma/schema.prisma, src/backend/prisma/migrations/20260908172738_add_import_session/, src/backend/src/modules/products/import/import.service.ts, src/backend/src/modules/products/import/import.service.spec.ts, src/backend/src/__test__/mocks/prisma.mock.ts, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-08T00:00:00Z |
| FIX-IMPORT-MAPPING-GATE-001 | Claude Code | (direct session) | src/backend/src/modules/products/import/pipeline/column-mapper.service.ts, src/backend/src/modules/products/import/pipeline/column-mapper.service.spec.ts, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-08T00:00:00Z |
| FIX-PRISMA-BINARY-ENGINE-001 | Claude Code | (direct session) | src/backend/prisma/schema.prisma, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-08T00:00:00Z |
| FIX-PRISMA-DRIVER-ADAPTER-001 | Claude Code | (direct session) | src/backend/prisma/schema.prisma, src/backend/src/prisma/prisma.service.ts, src/backend/package.json, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-08T00:00:00Z |
| FIX-IMAGE-UPLOAD-STORAGE-001 | Claude Code | (direct session) | src/backend/prisma/schema.prisma, src/backend/prisma/migrations/20260908201231_add_uploaded_file/, src/backend/src/modules/files/, src/backend/src/app.module.ts, src/backend/src/modules/products/products.module.ts, src/backend/src/modules/products/products.service.ts, src/backend/src/modules/products/products.service.spec.ts, src/backend/src/modules/products/products.scheduler.spec.ts, src/backend/src/modules/products/transition.service.spec.ts, src/backend/src/modules/brands/brands.module.ts, src/backend/src/modules/brands/brands.service.ts, src/backend/src/modules/brands/brands.service.spec.ts, src/backend/src/__test__/mocks/prisma.mock.ts, src/frontend/src/services/api.ts, src/frontend/src/features/products/components/{ProductCard,ProductTableRow,ProductFormModal,ProductSpreadsheetTable}.tsx, src/frontend/src/pages/ProductDetailPage.tsx, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-08T00:00:00Z |
| FIX-IMPORT-PRICE-BATCH-001 | Claude Code | (direct session) | src/backend/src/modules/products/import/import.service.ts, src/backend/src/modules/products/import/import.controller.ts, src/backend/src/modules/products/import/import.service.spec.ts, src/frontend/src/features/products/import/hooks/useCurrentPrices.ts, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-08T00:00:00Z |
| GS-IMP-24-SALES-ORDER-001 | OpenCode | backend-engineer | src/backend/prisma/schema.prisma, src/backend/prisma/migrations/add_sales_orders/migration.sql, src/backend/src/modules/commercial/sales-orders/, src/backend/src/modules/commercial/quotes/quotes.service.ts, src/backend/src/modules/commercial/quotes/quotes.service.spec.ts, src/backend/src/app.module.ts, src/backend/src/__test__/mocks/prisma.mock.ts | 7ebba95 | 2026-09-15T00:00:00Z || FIX-MOJIBAKE-BASELINE-001 | OpenCode | backend-engineer | src/backend/src/modules/products/products.service.ts, src/backend/src/modules/products/products.service.spec.ts, src/backend/src/modules/products/transition.service.spec.ts, src/backend/src/modules/listas/listas.service.spec.ts, docs/agent-coordination/agent-status.md, docs/agent-coordination/file-ownership.md, docs/agent-coordination/work-log.md | (see work-log) | 2026-09-18T00:00:00Z |
