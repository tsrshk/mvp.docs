---
id: LCOS-F59
type: feature
title: AI review analysis
epic: "[[LCOS-E12-competitor-reviews]]"
status: future
phase: "Phase 2"
roles: [admin, member, superadmin]
entities: ["[[subdivisions]]", "[[system_settings]]", "[[integration_credentials]]"]
requirements: ["[[provider-abstraction]]", "[[vpn-egress]]", "[[fail-closed]]", "[[multitenancy]]"]
adrs: ["[[ADR-009]]", "[[ADR-012]]", "[[ADR-006]]"]
legacy_refs: [plan F8, "plan F8-B3"]
sources: ["plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B3", "plan/00_IMPLEMENTATION_PLAN.md §4 G11"]
updated: 2026-07-09
---
# LCOS-F59 · AI review analysis
**Epic:** [[LCOS-E12-competitor-reviews]] · **Status:** future · **Phase:** Phase 2

## Description

Turns stored raw reviews ([[LCOS-F58-review-storage]]) into structured signal. A `ReviewAnalysisService` takes a batch of not-yet-analyzed reviews, calls the shared `ai_complete` LLM seam (a cheap model selected from REGISTRY), and writes `sentiment` (`positive|neutral|negative`), `topics` (JSONB list of categories — service, music, coffee, desserts…) and `mentions` (JSONB list of referenced menu items) into a `review_analyses` row, strictly parsed from a fixed JSON contract. An invalid LLM response leaves the review unanalyzed (it is retried on the next batch) rather than writing garbage — the analysis is stored separately so a re-run with a newer model never rewrites the source.

Runs are bounded and batched (`reviews_batch_size` REGISTRY, default 20) to respect the "no unbounded LLM calls" budget rule (G11): analysis fires after an import and once daily via the scheduler, never per-review inline. On top of the per-review analysis, trends are computed **deterministically without any LLM** — topic/sentiment counts aggregated by week, where "complaints about X rose" means the count of negative reviews with topic X over the last 4 weeks exceeds the previous 4.

## Capabilities

- `ReviewAnalysisService` batch analysis via the `ai_complete` provider seam; cheap model from REGISTRY.
- Strict fixed-JSON contract → `sentiment` / `topics` / `mentions`; invalid response → review stays in the queue, no error, retried next batch (no garbage rows).
- Batched and scheduled only (after import + daily job), batch size `reviews_batch_size` (default 20) — bounded LLM budget (G11).
- Deterministic (non-LLM) weekly trend aggregation over `topics` / `sentiment`; rising-complaint detection by 4-week vs prior-4-week comparison.
- Analysis decoupled from the review row — re-analysis with a new model never mutates the source.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Triggers analysis implicitly by importing reviews; consumes sentiment/topics/trends. |
| [[member]] | Consumes analysis output (badges, trends) within their subdivision. |
| [[superadmin]] | Same across all tenants; selects the analysis model / batch size via the config REGISTRY. |
| [[sqladmin-operator]] | Tunes `reviews_batch_size` and the model selection in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- Future `review_analyses` table — written here (1:1 with `reviews`, CASCADE); consumed by [[LCOS-F60-reviews-api]] for lists, trends and digest.
- Future `reviews` table — the source of the unanalyzed-batch query; owned by [[LCOS-F58-review-storage]].
- [[system_settings]] — REGISTRY-backed model selection and `reviews_batch_size` (edited without a redeploy).
- [[integration_credentials]] — Fernet-encrypted AI key used by the `ai_complete` seam (backend-only, egress via VPN).
- [[subdivisions]] — tenant scope; only the org's own reviews are analyzed within its context.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (analysis behind the shared `ai_complete` LLM seam), [[vpn-egress]] (LLM egress routed/gated on the backend), [[fail-closed]] (AI unavailable → analysis deferred with an explicit status, never silently dropped; import still works), [[multitenancy]] (analysis stays within tenant scope).
- **Features:** consumes [[LCOS-F58-review-storage]] and produces the input for [[LCOS-F60-reviews-api]]; scheduled by the digest scheduler shared with [[LCOS-F48-weekly-digest]].
- **Epics:** part of [[LCOS-E12-competitor-reviews]].
- **ADR:** [[ADR-009]] (provider seam, one implementation), [[ADR-012]] (live provider paths backend-only), [[ADR-006]] (fail-closed egress).

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Batch-analysis, invalid-JSON-requeue, deterministic-trend and bounded-budget (G11) criteria are drafted when the epic is activated.

## Sources

- `plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B3` (`ReviewAnalysisService`, fixed JSON contract, batching, deterministic trends).
- `plan/00_IMPLEMENTATION_PLAN.md §4 G11` (no unbounded LLM calls — batch/schedule only).
