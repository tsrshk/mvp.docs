---
doc: REVIEW_PROGRESS_2026-07-10
title: "Журнал прогресса ревью (2026-07-10)"
status: archived
archived: 2026-07-15
archived_from: repo-root (d:/_work/mvp)
reason: "Сам помечен SUPERSEDED 2026-07-10, хранится как audit trail"
trust_tier: 3
---

> Архивировано 2026-07-15 из корня репозитория. Документ инертен — не читается как актуальный. Хранится для истории.
# Code Review — Progress Snapshot (interrupted)

> ✅ **SUPERSEDED 2026-07-10** — the review was resumed and completed. Final deliverables:
> [BACKEND_DB_REVIEW.md](BACKEND_DB_REVIEW.md) · [FRONTEND_REVIEW.md](FRONTEND_REVIEW.md) · [REQUIREMENTS_STATUS.md](REQUIREMENTS_STATUS.md).
> This file is kept only as an audit trail of the first (stopped) run.

**Date:** 2026-07-10
**Workflow:** `mvp-review` — run ID `wf_014809ff-768`
**Status:** ⛔ STOPPED by owner mid-run. This file records what the agents produced before termination so nothing is lost.

## Scope requested

1. Code review of backend + DB data structure (best practices / obvious problems).
2. Code review of frontend.
3. Current position vs Phase-1 requirements + a "what to verify now" checklist (not yet produced — see below).

## Agent status (12 agents)

| # | Dimension | Agent ID | State | Output captured |
|---|-----------|----------|-------|-----------------|
| 1 | be-arch (backend architecture) | af5bf02374b5afe1d | running when killed | ❌ none |
| 2 | be-sec (security/multitenancy) | a90a01f64845bd5fa | running when killed | ❌ none |
| 3 | **be-svc (services/providers correctness)** | a7b6e4dfeb3f03186 | ✅ complete | ✅ 6 findings (below) |
| 4 | db-schema (models.py) | a882431410cd57875 | analysis done, killed mid-write | ⚠️ intro only, findings lost |
| 5 | **db-migr (alembic)** | a353db28f5ec4f023 | ✅ complete | ✅ 4 findings (below) |
| 6 | fe-arch (FSD layering) | a2b1893f4de494df0 | running when killed | ❌ none |
| 7 | fe-react (React/state/perf) | a4bca2d30697877d3 | analysis done, killed mid-write | ⚠️ partial summary only |
| 8 | fe-types (TypeScript safety) | a97819bb08f89d433 | analysis done, killed mid-write | ⚠️ partial summary only |
| 9 | verify #1 (be-svc idempotency finding) | aac35b787dbb518af | killed | ❌ no verdict |
| 10 | verify #2 (be-svc dual-write finding) | a39a3b9b1ebf80aac | killed | ❌ no verdict |
| 11 | requirements-position | — | never started (later phase) | ❌ none |

> ⚠️ **The two HIGH backend findings below were NOT adversarially verified** — the verify pass was killed before producing verdicts. Treat them as *plausible, unconfirmed*.

Raw salvaged JSON: `scratchpad/salvage-a7b6e4dfeb3f03186.json`, `scratchpad/salvage-a353db28f5ec4f023.json`.

---

## ✅ Backend — services & providers (COMPLETE)

**Overall:** Service/provider layer is well-structured — fail-closed commit validation, tenant-scoped repositories, eager loading to avoid async lazy-load, per-org credential resolution with no env fallback. The real risks cluster in the Esupl send/prepare flow.

### HIGH-1 — POST /invoices submit is not idempotent *(unverified)*
`mvp.be/app/services/invoice_service.py:215-293`
`submit()` always builds a brand-new `Invoice` and never looks up an existing one by natural key before writing. `InvoiceRepository.get_by_external_id` (repositories.py:219) and `UniqueConstraint(organization_id, external_id)` (models.py:273) exist but are unused here. Two failure modes:
- **ERP_WRITE_ENABLED on:** a double-submit (double-click / client retry / re-uploaded draft) calls `erp.write_invoice` twice; Esupl assigns two different doc ids so the unique constraint never trips → **two duplicate outgoing invoices** for one delivery.
- **ERP_WRITE_ENABLED off (default):** `write_invoice` returns the deterministic `f'esupl-prepared-{invoice_number}'` (esupl.py:258); a second submit sets the identical `external_id` → commit fails with an **uncaught IntegrityError → opaque 500** instead of returning the already-prepared invoice.

*Fix:* look up existing invoice by stable natural key (supplier_external_id + number, or explicit idempotency key) and short-circuit; send an idempotency token to Esupl; catch IntegrityError and resolve to the existing row.

### HIGH-2 — Dual-write: ERP POST executes before the DB commit *(unverified)*
`mvp.be/app/services/invoice_service.py:279-293`
With writes enabled, `submit()` POSTs to Esupl and sets `external_id/status=written` on the in-memory object, but the DB commit only happens later in the `get_session` dependency (session.py:33). If that commit fails (connection drop, serialization error, pool timeout), the local txn rolls back but the Esupl document already exists → POS invoice with no local record, and (combined with HIGH-1) the next retry writes a second document.
*Fix:* commit a `prepared` state BEFORE the external write, then write and commit `external_id/written` in a second step; record `failed` on write error. Or outbox/2-phase. At minimum pair with an idempotency key.

### MEDIUM-3 — SKU mapping upsert is a SELECT-then-INSERT race → IntegrityError 500
`mvp.be/app/api/v1/routes/ingredients.py:126-161`
`create_or_update_mapping` SELECTs then INSERTs; two concurrent requests for the same key both miss and both INSERT, violating `UniqueConstraint(scope_type, scope_id, supplier_external_id, source_key)` (models.py:503) → second commit 500s and the operator's manual mapping is silently lost.
*Fix:* PostgreSQL `INSERT ... ON CONFLICT DO UPDATE`, or catch IntegrityError and re-fetch+update.

### MEDIUM-4 — One malformed Esupl order aborts the entire GET /invoices list
`mvp.be/app/api/v1/routes/invoices.py:90-115`
Loop calls `EsuplOrderOut.model_validate` with no per-item guard; a single order with missing/null/non-int `status`/`payment_status` (schemas.py:166-167) or an unparseable date raises ValidationError → whole endpoint 500s, user sees zero invoices. A prior incident (order without `team_to`) shows the fragility.
*Fix:* wrap per-order validation in try/except, log+skip bad orders, return the valid ones.

### LOW-5 — Unguarded `float()` on LLM match score
`mvp.be/app/services/match_service.py:68`
`float(c.get('score', 0))` on raw model JSON; a non-numeric score ("high", null, dict) raises → 500 on POST /invoices/suggest-matches. `line_no` also used as dict key without type check.
*Fix:* defensive coerce (try/except, clamp 0..1, default 0).

### LOW-6 — Supplier ERP sync N+1 and racy
`mvp.be/app/services/supplier_service.py:74-84`
`sync_from_erp` loops calling `upsert_by_external_id`, each doing its own SELECT (N round-trips) and SELECT-then-INSERT → concurrent syncs can hit `UniqueConstraint(organization_id, external_id)` (models.py:230). `catalog.sync_catalog_from_erp` already batches — mirror it.
*Fix:* preload existing external_ids in one query, or ON CONFLICT upsert.

---

## ✅ DB — Alembic migrations (COMPLETE)

**Overall (from transcript):** Migrations match models.py — single linear chain, one head. All findings are LOW / cosmetic; no data-safety blocker.

### LOW-1 — Filenames diverge from internal revision ids
`0004_ingredient_cache_and_sku_mapping.py:25` — file `0004_...` vs revision id `0004_ingredient_sku` (shortened for the 32-char `alembic_version` varchar). Same for 0005–0009. Functionally correct (down_revision chain is consistent) but hard to grep revision→file.
*Fix (optional):* keep filename slug == revision id, or add a header comment mapping.

### LOW-2 — 0008 downgrade can fail on populated data
`0008_sku_mapping_supplier_key.py:53` — downgrade drops the composite UNIQUE `(scope_type, scope_id, supplier_external_id, source_key)` and recreates the narrower `(scope_type, scope_id, source_key)`; if per-supplier rows share the narrower key it raises. Documented and safe today (sku_mapping effectively empty; learning loop still on localStorage), but not unconditionally reversible once the moat is populated.

### LOW-3 — `suppliers.criteria` server_default representation drift
`0007_supplier_criteria.py:33` uses `sa.text("'{}'::jsonb")` vs models.py:220 `server_default="{}"`. Equivalent at runtime but `--autogenerate` may report phantom changes (same for the raw-SQL partial unique index `uq_credentials_active_per_scope` in 0003).
*Fix:* align ORM default to `'{}'::jsonb` or add to `compare_server_default` exclusions; do not emit no-op migrations.

### LOW-4 — 0001_initial docstring provenance misleading
`0001_initial.py:1` says "consolidated 0001-0004 / Заменяет прежние 0001..0004", but new 0002/0003/0004 add unrelated content (org_pos_token, integration_credentials, ingredient_sku). Reused numbering can mislead a reader into thinking the squash already contains those. *Fix:* clarify docstring.

---

## ⚠️ Partially done — analysis finished, structured output lost on kill

Recovered summary fragments only (findings were being written when killed):

- **db-schema** (models.py): *"The schema is generally well-considered: tenant isolation vi…"* — findings not captured.
- **fe-react** (React/state/perf): *"The data-fetching layer is well-structured: RTK Query with a…"* — findings not captured.
- **fe-types** (TypeScript safety): *"Overall the codebase is in good type-safety shape for an MVP…"* — findings not captured.

Full transcripts (agent reasoning, including the read files) survive in:
`.claude/projects/d---work-mvp/c1d116c4-.../subagents/workflows/wf_014809ff-768/agent-<id>.jsonl`

## ❌ Not produced

- **be-arch** (backend architecture/layering/FastAPI idioms)
- **be-sec** (auth, tenant scoping, secret encryption, fail-closed, ERP write gate)
- **fe-arch** (FSD layer-rule violations, public-api discipline)
- **requirements-position** (the "where are we / what to verify now" report — this phase never started)

---

## How to resume

The workflow was stopped, not deleted. To continue from the cache (same session only), re-run with the saved script and completed agents return instantly:

```
Workflow({
  scriptPath: "…/workflows/scripts/mvp-review-wf_014809ff-768.js",
  resumeFromRunId: "wf_014809ff-768"
})
```

Only be-svc and db-migr are cached; everything else re-runs live. If resuming in a new session, launch a fresh workflow — the two salvaged results above can be pasted in to skip re-review.
