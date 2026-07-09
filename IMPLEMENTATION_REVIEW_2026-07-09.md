# Implementation Review — Suppliers / Catalog / Performance (2026-07-09)

Review of the actually-delivered work for the three-point request plus the two add-ons
(no dead code; maximal unit-test coverage). Covers **Phase A** (POS-contract fix + perf +
refactor + dead-code) and **Phase B** (supplier criteria + matching + UI), the
adversarially-verified findings that followed, and the fixes applied in response.

- **Scope owners:** backend `mvp.be` (FastAPI/SQLAlchemy async), frontend `mvp.fe` (React/RTK).
- **Method:** implementation by hand; a parallel review agent-workflow then hunted bugs
  across 4 dimensions (requirement coverage, backend correctness, frontend correctness,
  tests/dead-code); **every** finding was independently refuted-or-confirmed by a separate
  skeptic pass. 30 findings evaluated → **22 confirmed, 8 refuted**. All confirmed
  correctness bugs (4 major + minors) were then fixed and re-verified.

---

## 1. Requirements → outcome

| # | Requirement | Status | Where |
|---|---|---|---|
| 1a | Suppliers have **flexible, add/removable criteria** (volume, order sum, delivery days, payment: prepay/on-delivery/deferred N days) | ✅ Done | `app/domain/supplier_criteria.py` registry + `Supplier.criteria` JSONB (`0007`); FE registry-driven form |
| 1b | Each supplier **analyzable** by these criteria (future order planning) | ◑ Model only (by design) | JSONB + registry are the seam; **no analysis/planning consumer built** — deferred per checkpoint decision |
| 1c | Pull suppliers from **POS (Esupl `/teams`)** | ✅ Done | `list_suppliers` → `GET /teams/{id}/following`; `sync` route resolves per-org token+team |
| 1d | Supplier-name **SKU matching** (`лигопак` ↔ `ООО Лиго Пак`) | ✅ Done | `_name_score` = token-Jaccard + char-trigram; regression-tested |
| 2 | After OCR, ingredient list comes from **POS catalog** (not the doc); loading + search work | ✅ Root-caused & fixed | catalog ← `GET /teams/{id}/products` (was a fabricated `/ingredients?scope=<uuid>` with no auth → non-functional) |
| 3 | Backend + frontend **performance / readability** | ✅ Done | commit path batch+gather; lazy OCR; FE single cached catalog + memoization + feature cache |
| A1 | **No dead code** | ✅ Done | removed `skusSlice`, `createSKUFactory` (also broken under ESM), `onCreateSku`, `resolve_write_level_for_ingredient`, redundant hook/imports |
| A2 | **Maximal unit-test coverage** | ◑ Strong for pure logic; DB paths deferred to CI | new pure tests (criteria, name-score, esupl parsing, FE fuzzy); DB/HTTP-backed tests written but need Postgres/testcontainers |

---

## 2. What was built

### Backend (`mvp.be`)
- **Esupl provider rewrite** (`providers/erp/esupl.py`, `base.py`): real endpoints
  (`/teams/{id}/following`, `/teams/{id}/products` with `product_name` LIKE search),
  Bearer auth on every read, `_get`/`_unwrap` helpers (httpx `params=`, no hand-built
  query strings). `list_invoices` promoted onto the Protocol.
- **`get_esupl_access()`** (`core/credentials.py`): single resolver of per-org
  `(team_id, token)`, used by supplier sync, catalog sync, invoice list, and commit.
- **Commit path perf** (`services/invoice_service.py`): `_resolve_commit_identities`
  batches the sku_mapping lookup into one `tuple_ IN` query (was 2×N sequential);
  `_validate_ingredients_on_commit` runs the per-line live POS checks with
  `asyncio.gather` (was N sequential round-trips). OCR provider resolved **lazily**
  (`ocr_resolver`) so write paths no longer read `system_settings`.
- **Catalog sync SSOT** (`services/catalog.py::sync_catalog_from_erp`): one function for
  both startup bootstrap and `POST /ingredients/sync-from-erp`; existing keys preloaded
  in one query (no N+1). Unified `ingredient_to_ref` (Decimal-safe) — killed a duplicate.
- **Supplier criteria** (`domain/supplier_criteria.py`): typed `CriterionDef` registry +
  `validate_criteria` (coerce/validate/drop-unknown) + `criteria_schema()`; `Supplier.criteria`
  JSONB (`0007_supplier_criteria`); schema `field_validator`; `GET /suppliers/criteria-schema`.
- **Supplier matching** (`services/supplier_service.py`): token-Jaccard(0.35) + trigram-Dice(0.65),
  threshold 0.4 — mirrors the FE `nameSimilarity`.

### Frontend (`mvp.fe`)
- **SKU picker** (`SkuSelect2`, `shared/sku/factory`): reuses the workbench's single
  RTK-cached catalog (`allItems`) instead of fetching per line; singleton
  `ingredientSkuFactory` with a per-supplier promise cache; memoized context.
- **Line rendering** (`LineRow`/`LineCard` `React.memo`, `useLine` `useMemo`, `fuzzy.ts`
  WeakMap feature cache): editing a line no longer re-ranks the whole catalog for every row.
- **Criteria UI**: `CriterionDef`/`CriteriaValues` types, `useGetSupplierCriteriaSchemaQuery`,
  registry-driven `CriteriaFields`, pure helpers `pages/suppliers/lib/criteria.ts`, wired into
  `SupplierForm` (fieldset) and `SuppliersPage` (card chips).

---

## 3. Review findings & disposition

### Confirmed MAJOR (correctness) — all **fixed**

| Finding | File | Fix |
|---|---|---|
| `get_ingredient` fell back to `items[0]` on a filtered-by-id query → **fail-open** commit validation (arbitrary product accepted if Esupl ignores `id=`) | `providers/erp/esupl.py` | Return **`None`** on no exact id match (fail-closed) |
| `GET /invoices` **500s the whole list** when any Esupl order has no `team_to` (supplier `id=""` can't coerce to int) | `routes/invoices.py` | Use the int team id or sentinel `0`, never `""` |
| Commit **unit validation rejected valid lines**: `line.unit or ""` vs strict `!=` blocked any line where OCR extracted no unit | `providers/erp/esupl.py` | Empty/None-tolerant, case/space-normalized compare (mismatch only when both present and differ) |
| **N identical `GET /ingredients/by-supplier/{id}`** — one per line dropdown (the `/ingredients` N+1 was fixed but this one remained) | `shared/sku/factory/ingredientFactory.ts` | Per-supplier promise cache dedupes N dropdowns → 1 request |

### Confirmed MINOR / NIT — **fixed**
- `PATCH /suppliers` with explicit `"criteria": null` → 500 (NOT NULL column; `exclude_unset` keeps explicit null) → route drops null-criteria ("don't touch").
- Startup catalog bootstrap used a **global** emptiness check → only the first org seeded → now **per-org**.
- `React.memo` defeated by unstable `supplierProductIds = []` default each render → module-level `EMPTY_IDS` constant (restores the candidate memo in the supplier-uncertain path).
- Dead code: removed broken/unused `createSKUFactory` (CommonJS `require` under ESM), unused `resolve_write_level_for_ingredient` + its repo field.
- Stale `write_invoice` docstring claiming an env-token fallback (there is none — fail-closed) → corrected.
- OCR provenance lost on the two-step submit (regression from lazy OCR) → `ocr_provider` now carried on the draft across the round-trip (no extra DB read).

### Confirmed test-coverage gaps
- **Added now (runnable):** `mvp.fe/src/shared/match/fuzzy.test.ts` (rankSkus, nameSimilarity, bestNameMatch, supplier bonus, cache reuse — the review's top-priority gap); `mvp.be/tests/test_provider_egress.py` respx tests for `get_ingredient` exact/none and unit tolerance.
- **Still deferred to CI (need Postgres/testcontainers):** `sync_catalog_from_erp`, `get_esupl_access` fail-closed branches, criteria validators end-to-end (422 + JSONB round-trip), `GET /suppliers/criteria-schema`, `_load_catalog_from_erp` bootstrap, `CriteriaFields` component render/emit, lazy-OCR `_get_ocr` branches. See §5.
- Remaining `onSuggestLine` `useCallback` gap (memo shallow-compare still churns cheaply) — left as-is: the heavy work (fuzzy rank, dropdown grouping) is independently memoized, so real impact is a cheap reconcile; documented, not fixed, to avoid a deeper callback-stability refactor.

### Refuted (8) — checked and dismissed
- SupplierSelector substring hint "misses лигопак" — **tooltip only**; real auto-resolve is upstream (`bestNameMatch`), which the new tests cover.
- "search can return SKUs absent from the listing" — **false**; both endpoints resolve the same subdivision scope.
- Backend `Sku` omits `productId` so supplier bonus is inert — no reachable wrong result (bonus only breaks ties; correctness unaffected).
- Boolean criterion can't store explicit `false` — no registry criterion is boolean today; unchecking = unset is the intended semantics.
- `_resolve_commit_identities` multi-line path "untested" — **false**; `test_phase2_multiple_validation_errors_collected` exercises it.
- `team_id is None` commit branch "untested" — unreachable in `submit` (prep.ready requires team_id) — defensive only.
- Two "verified-OK" notes (WeakMap cache, deleted slice, PATCH replace semantics) — confirmed clean.
- "analyzable" has storage but no consumer — accurate, but **intentional** (checkpoint decision: model only).

---

## 4. Verification performed

| Gate | Result |
|---|---|
| `mvp.fe` `tsc -b` | ✅ clean |
| `mvp.fe` `vitest run` | ✅ 25 passed (3 files) |
| `mvp.fe` `npm run build` (vite + PWA) | ✅ built |
| `mvp.be` `ruff check app/ tests/` | ✅ clean |
| `mvp.be` `mypy` (changed modules) | ✅ no new errors vs pre-existing baseline\* |
| `mvp.be` pytest (DB-free) | ✅ 25 passed (`test_supplier_criteria`, `test_esupl_parsing`, `test_providers_contract`) |
| `mvp.be` pytest (DB-backed) | ⚠️ **not run here** — needs Postgres/testcontainers (host `db` unresolvable in this env) |

\* Pre-existing baseline mypy noise (unchanged by this work): route params typed
`session=None`/`ctx=None`, `RequestContext.organization_id: UUID | None` (guarded at
runtime by `get_tenant_context`), and a `list?` iterable quirk on repo returns.

---

## 5. Residual gaps & recommendations

1. **Run the DB-backed suite in CI/Docker** — `docker compose run backend pytest`. The new
   respx tests (`get_ingredient`, unit tolerance) and all commit/tenant tests exercise the
   fixes end-to-end there. Migration `0007` needs `alembic upgrade head` against a real DB
   (hand-authored with a working `downgrade`; not applied here).
2. **Supplier analysis / order planning** (REQ 1b) is unbuilt by design — the JSONB criteria +
   registry are the seam. Next step: a read-side that computes per-supplier metrics from
   invoice history and checks them against `criteria`.
3. **Add the deferred unit tests** listed in §3 once CI DB is wired (criteria 422 + round-trip,
   `get_esupl_access` None branches, `CriteriaFields` component, bootstrap resilience).
4. **`onSuggestLine` `useCallback`** — optional polish to make the row `memo` fully effective.
5. **Esupl `products` contract** — `get_ingredient`/`list_ingredients` assume `id=`/`product_name`
   filtering per the mirrored Postman docs; validate against the live API and adjust if the
   `id=` filter is not honored (the fail-open there is now closed regardless).
6. **`IngredientSKUFactory.save()`** is currently only called by its own test — either wire it
   into a "create mapping from picker" flow or remove it.

---

_Generated after implementing the change and running an adversarial multi-agent review;
findings above are the ones that survived independent refutation._
