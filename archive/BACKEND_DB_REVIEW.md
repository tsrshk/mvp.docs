---
doc: BACKEND_DB_REVIEW
title: "Код-ревью БД backend (2026-07-10)"
status: archived
archived: 2026-07-15
archived_from: repo-root (d:/_work/mvp)
reason: "Ревью отработано частично; переходим на spec-kit/converge"
trust_tier: 3
open_findings: true
open_findings_action: extract-to-[[05_BACKLOG]]
---

> Архивировано 2026-07-15 из корня репозитория. Документ инертен — не читается как актуальный. Содержит НЕзакрытые находки: перед опорой на spec-kit вынести в [[05_BACKLOG]].
# Backend & Database Code Review — LCOS (mvp.be)

**Date:** 2026-07-10 · **Method:** multi-agent review (architecture, security/multitenancy, services/correctness, DB schema, migrations), high/critical findings adversarially verified by an independent pass. Paths are repo-relative to `mvp.be/`.

## Verdict

The backend is **in good shape and follows its own stated architecture rules well.** Layering is clean (`api → services → providers/repositories`), DI is idiomatic FastAPI, tenant isolation and the fail-closed/ERP-write-gate invariants genuinely hold in code, and the schema is thoughtfully typed (Numeric money, tz-aware timestamps, partial unique indexes, JSONB criteria). No **critical** issues. The findings worth acting on cluster in **one place: the invoice submit / Esupl write flow**, which is not idempotent and writes to the ERP before the DB commits.

### Severity rollup

| Sev | Count | Where |
|-----|-------|-------|
| Critical | 0 | — |
| High | 2 | invoice submit: idempotency (**CONFIRMED**), dual-write ordering (**PLAUSIBLE**) |
| Medium | 6 | mapping upsert race, list-endpoint fragility, tz-naive `issued_at`, `Mapped[float]` over Numeric, unused `ScopeType` enum, no trigram index |
| Low | 11 | gemini 2nd impl, startup ERP coupling, CSRF wiring, cookie-secure fail-fast, float match cast, N+1 supplier sync, + schema/migration cosmetics |

---

## 1. Architecture & code quality

**Assessment:** Clean and consistent with `CLAUDE.md`. `api/deps.py` builds tenant services only from the authenticated `TenantContext` (tenant access is impossible without auth). Provider selection is a decorator registry (`providers/base.py`); module toggles are request-time gates (`modules/registry.py::require_module` → 404), routes always mounted. `get_session` is a clean per-request unit-of-work. Pydantic v2 schemas are separate from ORM models. Good.

- **A1 — LOW/guardrail: `gemini` is a fully live second implementation of the OCR + AI seam.** `providers/base.py:55` imports `gemini`, `providers/ocr/gemini.py:20` registers `@register_ocr("gemini")`, and `providers/ai.py:80-81` dispatches to `gemini_complete`. `CLAUDE.md` mandates *one implementation per seam* (OCR=claude, ERP=esupl) and DEC-01 is claude-only. Two live vendors is a maintenance/attack-surface cost with no Phase-1 payoff. *Fix: drop the gemini registration + dispatch branch (keep behind an unregistered seam if wanted later).*
- **A2 — (architectural root of HIGH-2): the transaction boundary is owned by `get_session` (commit-on-yield, session.py:33).** Services cannot sequence an external side-effect (ERP POST) relative to the commit, because the commit happens *after* the handler returns. This is a fine default for pure-DB handlers but is the structural cause of the dual-write risk below. *Fix: for the write path, commit an intermediate state inside the service before the external call rather than relying on the ambient auto-commit.*
- **A3 — LOW: startup couples readiness to ERP latency/availability.** `main.py:34-68 _load_catalog_from_erp` runs a **sequential per-org** ERP catalog sync inside `lifespan`. It is best-effort (per-org skip + `try/except` + rollback), so it won't crash boot, but N orgs × httpx timeouts can delay readiness. *Fix: bound it (one org / short timeout) or make it opt-in; the manual `POST /ingredients/sync-from-erp` already exists as the SSOT.*
- **A4 — LOW: minor constructor/typing smells.** `InvoiceService` is built with both `ocr=None` and an `ocr_resolver` callable (`deps.py:42-50`) — two OCR-acquisition paths. Provider registries are typed `dict[str, type]` (`base.py:12-13`), losing the element type. Cosmetic.

---

## 2. Security & multitenancy — all 6 invariants HOLD ✅

Independent audit confirmed, with citations, that every non-negotiable holds in code:

1. **Fail-closed on provider errors** — VPN errors → `VpnUnavailableError` → 503, never silent direct egress (`providers/http.py:69-88`); AI with no key → `AiUnavailableError`; commit-time POS validation treats any provider exception as a *block* (`invoice_service.py:361-385`); `get_ingredient` exact-id match returns `None` rather than `items[0]`.
2. **Tenant scoping** — every repository requires `organization_id` in its constructor and filters on it (`repositories.py:33-235`); every raw select on a tenant model filters by org; cross-tenant `get_*` returns 404.
3. **ERP write gated** — double-gated: single caller `invoice_service.py:283` behind `ERP_WRITE_ENABLED`, and the provider re-checks and returns a synthetic id when off (`esupl.py:250-258`). No app endpoint can flip the toggle.
4. **Secret encryption** — `enc:v2:<key_id>:<token>`, keyring decrypt by key_id, KEK only in env, fail-fast requires KEK when `app_env != local` (`main.py:124-128`); tokens exposed only as `{is_set,last4}`; never logged.
5. **JWT/refresh** — explicit `algorithms=[HS256]` (rejects `alg=none`), opaque refresh sha256-at-rest, sliding + rotation + family reuse-detection; switch-context checks membership before existence (no existence leak).
6. **admin_system authz** — router-level `require_admin`, separate signed session cookie, `/status` returns no secrets.

**Two LOW defense-in-depth gaps (the only issues found):**

- **S1 — LOW: CSRF not wired to business endpoints, disabled by default.** `csrf_protect` is only on `/auth/*` and `csrf_enabled` defaults `False` (`config.py:75`). Mutating endpoints (`POST /invoices`, `/invoices/recognize`, `/ingredients/mappings`, `/suppliers`, `PUT /organizations/{id}/pos-config`) carry no CSRF dep. With cookie-JWT auth and cross-origin `SameSite=none`, `/invoices/recognize` (multipart, **preflight-exempt**) is a CSRF target that can force billable OCR/LLM egress. *Fix: attach `csrf_protect` at the tenant routers and default `csrf_enabled` True when `SameSite=none`.*
- **S2 — LOW: startup fail-fast enforces KEK/secret strength in prod but not `cookie_secure`.** `main.py:110-130` doesn't require `cookie_secure=True` outside local (`config.py:71` defaults False). A TLS-terminating-proxy deploy that forgets `COOKIE_SECURE=true` emits auth cookies without Secure → token capture over an accidental HTTP hop. *Fix: require `cookie_secure` (and explicit SameSite) when `app_env != local`, mirroring the KEK check.*

> **Reconciliation with the requirements report:** encryption **is** fail-closed in production (KEK required at startup). The "silent plaintext" gap the requirements analyst flags is the **local-dev** fallback inside `encrypt()` (`secrets.py`), which task **F23** is meant to remove. Both are correct — see [REQUIREMENTS_STATUS.md](REQUIREMENTS_STATUS.md) gap list.

---

## 3. Services & providers — correctness

**Assessment:** Well-structured (fail-closed commit validation, tenant-scoped repos, eager loading to avoid async lazy-load, per-org credential resolution with no env fallback). Risks concentrate in the Esupl send/prepare flow.

- **HIGH-1 — CONFIRMED ✅ — `POST /invoices` submit is not idempotent.** `invoice_service.py:215-293` always builds a new `Invoice` and never looks up an existing one by natural key, even though `get_by_external_id` (repositories.py:219) and `UniqueConstraint(organization_id, external_id)` (models.py:273) exist. **Writes ON:** double-submit → `erp.write_invoice` twice → two Esupl docs. **Writes OFF (default):** `write_invoice` returns deterministic `esupl-prepared-{number}` (esupl.py:258) → second submit hits the unique constraint → **uncaught IntegrityError → 500** instead of returning the prepared invoice. *Verifier: "the code confirms the finding."* *Fix: look up by stable key and short-circuit; send an idempotency token; catch IntegrityError → resolve to existing row.*
- **HIGH-2 — PLAUSIBLE — dual-write: ERP POST executes before the DB commit.** `invoice_service.py:279-293` POSTs to Esupl and mutates the in-memory invoice, but the commit happens later in `get_session` (see A2). A commit failure after a successful POST leaves an Esupl doc with no local record, and (with HIGH-1) the retry writes a second. *Real, but gated on `ERP_WRITE_ENABLED` + a commit-time failure. Fix: commit `prepared` before the write, then write + commit `written`; or an outbox; at minimum an idempotency key.*
- **MEDIUM-3 — SKU mapping upsert is SELECT-then-INSERT (race → 500).** `ingredients.py:126-161` can double-INSERT under concurrency, violating the composite unique key and losing the operator's manual mapping. *Fix: `INSERT ... ON CONFLICT DO UPDATE` or catch+refetch.*
- **MEDIUM-4 — one malformed Esupl order aborts the entire `GET /invoices` list.** `invoices.py:90-115` validates each order with no per-item guard; one bad `status`/date → whole endpoint 500s, user sees zero invoices. *Fix: per-order try/except, skip+log.*
- **LOW-5 — unguarded `float()` on LLM match score** (`match_service.py:68`) → a non-numeric score 500s `/suggest-matches`. *Fix: defensive coerce + clamp.*
- **LOW-6 — supplier ERP sync is N+1 and racy** (`supplier_service.py:74-84`); mirror the batched `catalog.sync_catalog_from_erp`.

---

## 4. Database schema (`app/db/models.py`)

**Assessment:** Thoughtful — Numeric for money, tz-aware `TimestampMixin`, partial unique indexes (single default packing, one active credential, tenant-scoped `external_id` idempotency), JSONB for supplier criteria, consistent org/subdivision indexing on scoped mixins.

- **MEDIUM (was High) — `Invoice.issued_at` is timezone-naive.** `models.py:246` bare `mapped_column()` → `timestamp without time zone`, while every other datetime is `DateTime(timezone=True)`. *Verifier CONFIRMED, downgraded to medium.* Mixing aware/naive breaks range queries & comparisons. *Fix: `DateTime(timezone=True)` + hand-written migration (autogenerate won't detect tz change).*
- **LOW (was High) — `IngredientCache`/`SkuMapping` use polymorphic `scope_type`/`scope_id` instead of `organization_id`.** `models.py:432-507`. *Verifier: observation accurate but severity overstated* — this is the deliberate DEC-0012 two-context (org|subdivision) design and `scope_id` is a globally-unique UUID from the signed token, so it is effectively tenant-scoped (be-sec confirmed no leak). Real residue: no FK on `scope_id` → orphaned rows on subdivision delete; the standard `organization_id` tenant filter/tests don't apply uniformly. *Fix: add an indexed `organization_id` + cleanup for orphaned rows.*
- **MEDIUM — monetary/decimal columns annotated `Mapped[float]` over `Numeric`** (total_amount, quantity, unit_price, line_total, factor, confidence, …). DB returns `Decimal`; annotation invites float assignment → binary-float error in the per-line arithmetic check / POS payload. *Fix: `Mapped[Decimal]`.*
- **MEDIUM — `ScopeType` enum defined but bypassed;** `scope_type` stored as free-text `String(32)` (models.py:441,474) while every other categorical uses a DB enum. A typo silently makes a mapping unfindable → fail-closed block. *Fix: `SAEnum(ScopeType)` or delete the dead enum.*
- **MEDIUM — no DB-level enforcement of the invoice status machine** and no invariant tying `prepared`→payload / `written`→external_id (models.py:250-262). A raw/SQLAdmin update can set `written` with NULL external_id, defeating the idempotency guard. *Fix: CHECK constraints (`status <> 'written' OR external_id IS NOT NULL`) or accept app-only enforcement + merge-gate tests.*
- **MEDIUM — fuzzy matching has no trigram/GIN index** on `Ingredient.name` / `IngredientCache.name` (only B-tree / none). As the catalog grows, every OCR-line match seq-scans the tenant catalog — the invoice-entry hot path. *Fix: `pg_trgm` GIN index + enable the extension.*
- **LOW ×5:** unused `sku_embedding Vector(1536)` (models.py:298, no ANN index — drop per DEC-02); `esupl_payload` as `Text` not JSONB; mixed Integer/UUID PKs + `Invoice.supplier_id` FK has no explicit `ON DELETE` despite the comment claiming RESTRICT; `InvoiceLine.subdivision_id` denormalized with no consistency constraint vs parent; `uuid_pk` has client default only, no `server_default=gen_random_uuid()`.

---

## 5. Alembic migrations

**Assessment:** Migrations match `models.py` — single linear chain, one head, working downgrades. All findings are **LOW / cosmetic**; no data-safety blocker.

- Filenames diverge from internal revision ids (`0004_...` file vs `0004_ingredient_sku` revision) — harder to grep; consistent chain otherwise.
- `0008` downgrade can fail on populated data (recreates a narrower unique) — documented, safe while `sku_mapping` is effectively empty.
- `suppliers.criteria` server_default representation drift (`'{}'::jsonb` vs `"{}"`) → phantom autogenerate diffs; don't emit no-op migrations.
- `0001_initial` docstring says "consolidated 0001-0004" while new 0002-0004 add unrelated content — clarify the docstring.

---

## Top recommendations (priority order)

1. **Make invoice submit idempotent** (HIGH-1, CONFIRMED) — biggest correctness risk; fixes both the read-only 500 and the write-mode duplicate.
2. **Reorder commit vs ERP write / add idempotency token** (HIGH-2 + A2).
3. **`ON CONFLICT` upsert** for sku-mapping and supplier-sync (MEDIUM-3, LOW-6).
4. **Per-item guard on `GET /invoices`** (MEDIUM-4).
5. **Fix `issued_at` tz + `Mapped[Decimal]`** (schema medium) before real pilot data accrues.
6. **Wire CSRF + cookie-secure fail-fast** (S1/S2) before any non-local deploy.
7. **Drop gemini + `sku_embedding`** (guardrail/dead-schema cleanup, aligns with F25/DEC-01/DEC-02).

Frontend review: [FRONTEND_REVIEW.md](FRONTEND_REVIEW.md) · Requirements position: [REQUIREMENTS_STATUS.md](REQUIREMENTS_STATUS.md)
