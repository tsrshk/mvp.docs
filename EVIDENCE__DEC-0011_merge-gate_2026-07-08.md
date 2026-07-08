# Evidence bundle — DEC-0011 merge-gate closure (2026-07-08)

Verification-first. Every claim below is backed by a command output run against the live backend
container (Python 3.12.13, real pgvector Postgres), not by assertion.

## Baseline (before the fix) — the gate was RED

`pytest -m merge_gate` at the committed baseline: **5 failed, 1 passed, 5 errored**. The existing
invoice suite was also broken (`Supplier(esupl_id=…)` invalid kwarg; `prepare()` wrongly required
`pos_ingredient_id`). This falsifies the prior "implementation-complete / ✅ 6/6 passing" claim in
`SKU_MECHANISM.md`.

Root causes (read from code, not guessed):
- Identity resolution fused into `prepare()` (payload building), breaking the two-context model.
- `source_key` keyed on the resolved SKU code (`line.sku`), not raw line text — moat inert.
- Phase-2 exceptions not caught → fail-open, not fail-closed.
- Broken test fixtures (`subdivision_id`, `Invoice(scope_type=…)`), non-numeric supplier ids.
- Migration 0004 diverged from models AND was un-appliable: 37-char revision id vs
  `alembic_version varchar(32)`; two-head branch (0003 → 0004 and 0003 → 1e12eebc3a2a).

## After the fix — GREEN

- `pytest -m merge_gate` → **14 passed, 127 deselected** (T3, T6).
- Full suite → **141 passed** (no regressions; 4 pre-existing non-gate failures also fixed).
- `mypy app/services/invoice_service.py --ignore-missing-imports` → **Success: no issues found**
  (write cluster clean, T7).
- `alembic revision --autogenerate` on a fresh DB at head → **empty upgrade body (`pass`)**
  (BLOCKER #2 / autogenerate diff empty).
- `pytest tests/test_migrations.py` → passed (upgrade→downgrade clean; single head).
- `ruff check` on all changed files → **All checks passed**.

## DoD (TZ `TZ__DEC-0011_merge-gate_2026-07-08.md`)

| Task | Status | Evidence |
|---|---|---|
| T1 — VER-021 durability | **OPEN (gated)** | Requires Esupl sandbox WRITE (team 17957); outward-facing → owner runs it. Runnable probe: `mvp.be/scripts/ver021_durability_probe.py`. Merge stays blocked until the id-table is filled in `01_ARCHITECTURE`. |
| T2 — `esupl_item_id` vs `pos_ingredient_id` | **DONE** | Same Esupl entity, two representations: `esupl_item_id` (int, catalog copy, payload) vs durable `pos_ingredient_id` (str, identity anchor in `sku_mapping`/committed on line). `pos_ingredient_id == str(esupl id)`. Documented in `01_ARCHITECTURE` + DEC-0011 amendment. Assignment sites: `sku_service._ingredient_to_ref` / `invoice_service._resolve_commit_identity`. |
| T3 — merge-gate tests pass; Tracker asserts durable id | **DONE** | `pytest -m merge_gate` = 14 passed. `TrackerErpProvider.validated_pos_ids` asserts the durable id from mapping is validated and the cache surrogate never is (`test_phase2_validates_durable_id_from_mapping`). |
| T4 — fuzzy/AI localized to draft; excluded from commit | **DONE** | Draft suggestions: `MatchService.suggest` (`suggest-matches`, LLM) + client fuzzy; commit path (`_resolve_commit_identity`) consults only `sku_mapping`. Intentional per DEC-0013(A). |
| T5 — Tier-3 scope asymmetry / VER-022 | **DONE (closed)** | Under DEC-0013(A) the cache is not a commit tier → asymmetry dissolves; commit authority only from `sku_mapping` (subdivision→org). Documented (VER-022 closed). |
| T6 — DEC-0013 | **DONE (variant A)** | Ivan chose **A** (block until manual confirm), overriding TZ default C. Tests: `test_dec0013_commit_gate.py` (exact-cache-no-commit-no-autocreate; fuzzy-without-confirm-blocks; confirmed-commits) — all merge_gate green. |
| T7 — write-cluster type safety | **DONE** | None-guards before `EsuplLineItem`/`EsuplOutgoingInvoice` + write path (`invoice_service`); `Decimal(str(...))` in `sku_service`. mypy on `invoice_service.py` clean. Remaining 2 mypy notes are read/search-path SQLAlchemy-plugin noise (no plugin configured) — triaged. Bonus: fixed a real latent bug (`Ingredient.sku` → `.external_id` join). |
| T8 — two-context canon | **DONE** | `01_ARCHITECTURE` → "SKU identity & the two-context resolver"; DEC-0011 amendment; DEC-0013 record. |

## Extra fixes made (pre-existing defects surfaced during verification)

- Migration branch linearized (0003 → 1e12eebc3a2a → 0004 → 0005); revision ids shortened to ≤32.
- New migration `0005` adds `invoice_lines.pos_ingredient_id` (committed durable-id snapshot).
- `/ingredients/mappings` no longer self-commits (fought `get_session` lifecycle) → upsert works;
  `session.refresh` fixes `MissingGreenlet` on server `updated_at`.
- `get_ingredients_by_supplier` join fixed (`Ingredient.sku` did not exist → `external_id`).
- `test_scope_isolation` password bug fixed; `test_api` list-step retargeted to `GET /invoices/{id}`
  (GET /invoices lists Esupl orders, not local invoices).

## Adversarial review

An independent multi-lens review workflow (fail-closed, DEC-0013-A conformance, source_key SSOT,
migrations, test adequacy) with an adversarial refute pass ran over the diff: **14 agents, 9 raw
findings → 2 confirmed** after refutation. No correctness defect survived (no fail-open path, no
DEC-0013 violation, no source_key drift, no migration-behavior bug). The 2 confirmed items were
addressed:

1. **(low, cosmetic)** migration docstrings cited the pre-rebase revision ids while the actual
   `revision`/`down_revision` variables were correct (alembic ignores docstrings) → docstrings fixed.
2. **(medium, coverage gap)** the `→ org` fallback leg of `_resolve_commit_identity` was never proven
   by a passing commit (both org tests only proved subdivision *wins*) → added
   `test_org_scope_mapping_resolves_when_no_subdivision_mapping` (merge_gate).

Post-fix: **`pytest -m merge_gate` = 15 passed; full suite = 142 passed.**
