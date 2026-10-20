# NVIDIA Gentle-AI model mapping

## Objective
Configure explicit, validated NVIDIA NIM model assignments for the Gentle-AI agents used by OpenCode and Kilo, with documented per-role replacements.

## Problem
The current project configurations relied on inherited/default model selection, which made model capability, availability, and replacement behavior implicit.

## Authorized scope
- `opencode.json`
- `.config/opencode/opencode.json`
- `.config/kilo/opencode.json`
- `odd/tasks/nvidia-gentle-ai-models.md`

No credentials, remote destinations other than NVIDIA NIM, commits, pushes, deploys, or credential changes.

## Route and TDD
- Route: delegated direct.
- Trigger evidence: three non-trivial runtime configuration files plus remote model-catalog and minimal-inference validation.
- TDD mode: unknown/disabled; this is JSON configuration and no project-level configuration test runner has been evidenced.

## Acceptance criteria
- [x] Inspect runtime configuration schema/capability without inventing fallback fields.
- [x] Discover exact NVIDIA NIM model IDs exposed to the authenticated runtime.
- [x] Execute a minimal non-destructive inference validation for every assigned primary model and designated fallback where runtime support permits.
- [x] Explicitly assign validated models by Gentle-AI role in all in-scope runtime configs.
- [x] Record an actionable primary-to-replacement matrix when automated fallback is unsupported.
- [x] Validate every changed JSON file and runtime configuration loading; capture observed evidence.
- [x] Mirror this complete document to Engram topic `odd/nvidia-gentle-ai-models/tasks` and read it back.

## Tasks
- [x] T1 — Map active OpenCode/Kilo configuration schema and provider/model discovery mechanisms.
  - `opencode 1.18.32` accepts per-agent `model` as `provider/model` and lists NVIDIA as an authenticated provider.
  - `opencode agent list` loaded the project configuration after the change.
  - Kilo's CLI cannot initialize in this environment because its state location is mounted read-only; its JSON uses the same established per-agent `model` shape, but runtime loading could not be observed here.
  - No native agent-level automatic fallback field was found in the installed runtime/schema. No unsupported field was added.
- [x] T2 — Validate NVIDIA NIM candidate model IDs and minimal inference health.
  - Successful exact `Respond with exactly: OK` probes: `nvidia/nvidia/nemotron-3-super-120b-a12b`, `nvidia/z-ai/glm-5.3`, `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b`.
  - Not assigned: `nvidia/deepseek-ai/deepseek-v4-pro`, `nvidia/deepseek-ai/deepseek-v4-flash`, `nvidia/qwen/qwen3-coder-480b-a35b-instruct`, `nvidia/qwen/qwen3.5-397b-a17b`, `nvidia/minimaxai/minimax-m3`, and `nvidia/mistralai/mistral-small-4-119b-2603` each returned NVIDIA HTTP 410 end-of-life.
  - Not assigned: `nvidia/moonshotai/kimi-k3` returned no `OK` response, so it did not meet the health criterion.
  - Discovery note: the runtime's model listing includes retired IDs; a minimal inference probe is the availability authority.
- [x] T3 — Configure only validated explicit role assignments and documented replacement matrix.
  - Heavy reasoning/orchestration: `nvidia/nvidia/nemotron-3-super-120b-a12b`.
  - Implementation and independent Judgment Day judge: `nvidia/z-ai/glm-5.3`.
  - Low-cost exploration, specs, tasks, archive, onboarding, readability and resilience: `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b`.
- [x] T4 — Validate JSON and runtime configuration loading; capture observed evidence.
  - `jq empty` passed for all three modified JSON files.
  - `opencode agent list` completed successfully with the project configuration.

## Active role assignments
| Role group | Primary model |
| --- | --- |
| `gentle-orchestrator`; SDD design/propose/research/verify; risk/reliability/refuter/validator reviews; Judgment Day judge A | `nvidia/nvidia/nemotron-3-super-120b-a12b` |
| SDD apply; Judgment Day fix agent and judge B | `nvidia/z-ai/glm-5.3` |
| SDD explore/init/spec/tasks/archive/onboard; general/explore; readability/resilience reviews | `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b` |

## Replacement matrix
| If this primary fails | Use this validated replacement | Reason |
| --- | --- | --- |
| `nvidia/nvidia/nemotron-3-super-120b-a12b` | `nvidia/z-ai/glm-5.3` | Validated high-capability alternative from a different family. |
| `nvidia/z-ai/glm-5.3` | `nvidia/nvidia/nemotron-3-super-120b-a12b` | Validated high-capability alternative from a different family. |
| `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b` | `nvidia/z-ai/glm-5.3` | Validated replacement when throughput-oriented work needs continuity. |

## Replacement procedure
1. Confirm the primary failure with one minimal, non-destructive NVIDIA NIM probe.
2. Change only the affected agent's `model` field to the matrix replacement in the relevant runtime configuration.
3. Validate JSON with `jq empty <file>` and run `opencode agent list` for OpenCode when available.
4. Record the observed failure and successful replacement probe before treating the substitution as active.

Automatic failover was deliberately not configured: the installed OpenCode/Kilo configuration does not expose a verified per-agent fallback field.

## Progress and evidence
- Engram mirror: saved, read back, and synchronized after the final configuration update.
- No commit created: project policy requires explicit user authorization.

## Next step
Use the configured roles in the next OpenCode/Kilo session. If NVIDIA changes availability, apply the replacement procedure above rather than trusting the model listing alone.
