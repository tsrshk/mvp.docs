---
id: OVERVIEW-ARCH
type: overview
title: LCOS architecture (as-built SSOT)
status: current
phase: "Phase 1"
verified_against_code: 2026-07-09
updated: 2026-07-09
owner: Ivan
trust_tier: 2
ssot_for: [architecture, layering, provider-seams, module-gates, config-tiers, migrations-chain]
legacy_refs: [01_ARCHITECTURE.md, APP_OVERVIEW.md]
sources:
  - 01_ARCHITECTURE.md (normative as-built)
  - APP_OVERVIEW.md §2–§13 (verified_against_code 2026-07-09)
  - mvp.be/CLAUDE.md (ground-truth conventions)
  - DEC-0011, DEC-0013
---

# LCOS architecture (as-built)

> This is the single SSOT for the system's actual architecture. It merges the normative `01_ARCHITECTURE.md` (tier 2) and the code-verified `APP_OVERVIEW.md` (tier 3, `verified_against_code 2026-07-09`). Authority on conflict: **code + `CLAUDE.md` > [[DEC-0011]]/[[DEC-0013]] > docs**. Data on entities and requirements is not duplicated here — see the links to [[MOC]] and [[MOC]].

## 1. What it is (system boundaries)

**LCOS** is an intake and strategic-analytics layer on top of an ERP/POS (the Belarusian **Esupl**). The product essence is an **AI manager** that *does the work* rather than drawing dashboards. The first wedge is **invoice intake**: photo → OCR → matching lines against the POS catalog → arithmetic validation → building a goods-receipt payload for Esupl → local persistence and (behind a gate) writing to the POS.

**What it is NOT:** it is not a POS, not operational accounting, not bookkeeping — that stays in Esupl. LCOS is the **invoice write-point** and is **read-only** with respect to Esupl's own data. Hard product rule: **the AI shows data and arguments; the human decides** — no auto-orders and no writes to the POS without human confirmation.

Phase 1 is a single coffee shop (Customer Zero), free of charge, running locally in Docker Compose. Product context: [[product]]. Roadmap: [[roadmap]]. The key phasing decision — [[ADR-001]]. Pilot-Gate (== Wife-Gate) — [[ADR-003]].

## 2. Stack

| Layer | Technologies |
|---|---|
| Backend (`mvp.be`) | Python 3.12, FastAPI, SQLAlchemy 2.0 **async** (asyncpg), Alembic, Pydantic v2, PostgreSQL 16 + pgvector, httpx, SQLAdmin, anthropic SDK, `uv`/`ruff`/pytest |
| Frontend (`mvp.fe`) | React 18 + TypeScript, Redux Toolkit (RTK Query), react-router v6, Tailwind v4, Vite 6, vite-plugin-pwa (mobile-first); strict Feature-Sliced Design (FSD) |
| Infra | Docker Compose: `db` (pgvector/pg16) + `backend` + `gluetun` (VPN sidecar for egress to the AI) |
| AI / OCR | Vision-LLM (Claude Vision, default); provider chosen at runtime from `system_settings.ai_provider` |

Monorepo at `d:\_work\mvp`: `mvp.be` (backend), `mvp.fe` (frontend PWA), `mvp.docs` (docs).

## 3. Backend layers and dependency direction

`CLAUDE.md` fixes the direction: **`api` → `services` (use-cases) → `providers` / `repositories`**. `services` depend **only on provider interfaces** (`providers/*/base.py`), never on concrete implementations.

- **api** (`app/api/v1/routes/*`) — thin: validates input, resolves DI, calls the service, maps ORM → `InvoiceOut`.
- **services** (`app/services/*`) — use-cases (`InvoiceService`, `MatchService`, `SupplierService`, catalog). The constructor accepts `session, ocr: OcrProvider, erp: ErpProvider, organization_id, subdivision_id` and instantiates tenant repositories internally. References only Protocols.
- **domain** (`app/domain/entities.py`) — ORM-free Pydantic models that cross the provider interfaces (`InvoiceDraft`, `PreparedInvoice`, `EsuplOutgoingInvoice`, `EsuplLineItem`, `IngredientRef`, `PackingRef`, `SupplierRef`, `MatchCandidate`). `Decimal` for money/quantities.
- **providers / repositories** — infra. OCR/ERP behind a `Protocol`; repositories wrap SQLAlchemy and **require `organization_id`**.

The `core` layer sits to the side; `effective_config.py` uses lazy imports inside functions to avoid the `core → providers → core` cycle.

**Two DI mechanisms:**
1. **FastAPI `Depends`** (`api/deps.py`, `auth/dependencies.py`, `modules/registry.py`) — per-request wiring of the session, providers, services, auth context, and module gates via `Annotated[T, Depends(...)]` (`SessionDep`, `OcrDep`, `ErpDep`, `InvoiceServiceDep`, `TenantContext`).
2. **`ProviderContext`** (`providers/context.py`) — a module-global singleton `_CTX` with cross-cutting infra (`egress` — two long-lived httpx clients, `ai_vpn` — `AiVpnToggle`, `session_scope` — `SessionFactory`) so it does not leak into Protocol signatures. Set in `main.py::lifespan`, cleared on shutdown; `get_provider_context()` raises `RuntimeError` if unset. Tests substitute fakes.

**Routes** (`app/api/v1/routes/`): `health`, `auth` (via `app/auth`), `organizations`, `ingredients` (catalog + SKU mappings), `invoices` (recognize/prepare/submit), `suppliers` (cards + criteria), `admin_system` (superadmin config). A single error envelope `{"error":{code,message,details?}}` (`core/errors.py`); the catch-all manually re-applies CORS headers.

More: [[provider-abstraction]].

## 4. Provider seams

- **Behind a `Protocol` + registry, one implementation per seam:** OCR = `claude` (default), ERP = `esupl`. Alternatives are **not written** until a real trigger ([[ADR-009]]).
- `providers/base.py` holds `_OCR_REGISTRY`/`_ERP_REGISTRY` (name → class), registered via decorators `@register_ocr("claude")`, `@register_erp("esupl")`. `import_providers()` explicitly imports the impl modules once in lifespan (the decorators fire on import).
- **No LLM `Protocol`.** LLM transport is module-level async functions in `providers/ai.py` (`ai_complete`, `claude_complete`, `gemini_complete`); OCR providers are thin adapters to them.
- **Implementation selection is split across two config planes** (easy to get wrong):
  - **ERP = statically from env** — `get_erp()` reads `settings.erp_provider` (`ERP_PROVIDER`, default `"esupl"`).
  - **OCR/AI = from the DB at runtime** — `get_ocr()` calls `resolve_ai_provider()` → `system_settings.ai_provider` (default `"claude"`). A lazy resolver: write paths do not pay for a DB read, and a superadmin can switch the provider in SQLAdmin without a redeploy.
- The frontend holds no secrets; live provider paths live only on the `backend` ([[ADR-012]]). FE providers (`shared/ocr`, `shared/match`, `shared/pos`) have `backend | mock` axes.

## 5. Module gates

Modules are gated **at request time**: `modules/registry.py::require_module` returns **404** if the module is off. **Routes are always registered** — the gate lives at the request-dependency level, not at mounting. This lets functional areas be turned on/off without changing the routing graph.

## 6. Multitenancy and authorization

- **Tenant = organization.** `organization_id` is **denormalized into every operational row** — a tenant query is impossible without a scope (hard isolation boundary, `ondelete=RESTRICT`). Operational rows also carry `subdivision_id`. `users` is the only **global** table; membership is via `memberships`.
- Hierarchy: `organization → subdivision → membership(user↔subdivision+role)`. `organization ↔ exactly one Esupl team`; `subdivision ↔ Esupl warehouse` ([[ADR-004]], [[ADR-008]]).
- **Two independent auth planes (never mix them)** — a non-negotiable in `CLAUDE.md`:
  1. **Application users** (React FE) — the `users` table, **argon2**, JWT access 15 min in an HttpOnly cookie (`lcos_access`) + opaque refresh 30 min (`lcos_refresh`), family_id rotation, reuse detection. `app/auth/*`.
  2. **SQLAdmin operator** — a single env "backdoor" (`ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`, **bcrypt**), session cookie, **no row in `users`**. `app/core/security.py` + `app/admin/setup.py` ([[ADR-007]]).
- **Roles:** `is_superadmin` — a global boolean on `User` (god-mode: sees/switches into any org/subdivision, treated as `admin` everywhere). The `Role` enum contains a **single value `admin`**, assigned per-subdivision via `Membership.role`. There is no RBAC matrix (an explicit non-goal). A user with no membership who is not a superadmin can log in but has no active context → tenant data is closed (403 from `get_tenant_context`).
- **Tenant isolation** is covered by tests and **blocks merge**.

Roles: [[superadmin]] · [[admin]] · [[member]] · [[sqladmin-operator]]. More: [[auth]], [[multitenancy]].

> **doc↔code correction:** the `admin_system` routes are gated by the **SQLAdmin OPERATOR** plane (env + bcrypt session), **not** the app-JWT superadmin. `is_superadmin` is the application plane; operator system configuration goes through the operator plane.

## 7. Three configuration tiers and secrets

Three tiers ([[ADR-005]]); for tiers 2–3 there is **no env fallback**:

1. **`.env`** — boot / trust root. `core/config.py::Settings` — the single reader of env, singleton `settings`.
2. **`system_settings`** — non-secret runtime settings (whitelisted keys), a typed registry `core/system_settings.py` (SSOT of keys/types/defaults), resolver `core/effective_config.py` (`DB → registry default`, **no env fallback**). Managed by the superadmin via SQLAdmin.
3. **`integration_credentials`** — integration secrets (a single SSOT table), scope=`platform|org|subdivision`, provider=`anthropic|gemini|esupl`. **Fernet encryption**. `core/credentials.py::get_active_credential` reads+decrypts **without a cache**.

**Secret encryption:** Fernet envelope `enc:v2:<key_id>:<token>`, versioned KEK, rotation without losing old ciphertexts ([[ADR-010]]); reads **without a cache** — rotation is instant ([[ADR-011]]). Startup secret-guard in `main.py::lifespan`. More: [[config-secrets]], [[secret-encryption]].

## 8. Fail-closed doctrine

Fail-closed **everywhere** ([[ADR-006]]):

- **VPN egress to the AI:** `providers/http.py` holds `direct_client` and `vpn_client` (via `gluetun:8888`). `get_client(via_vpn=True)` raises `VpnUnavailableError` if there is no vpn client — **no silent fallback to direct** (non-negotiable). `guard_vpn` converts transport errors into `VpnUnavailableError`. `via_vpn` for the AI is a **runtime toggle** (`AiVpnToggle`, cached, default fail-closed **True**), not a static `requires_vpn`.
- **POS token:** no active credential → the request goes out unauthenticated and Esupl returns **401** (no env fallback).
- **AI key:** its absence == `AiUnavailableError` → **503** (missing-config == unavailable, intentionally).
- **`ERP_WRITE_ENABLED`** defaults to **False** — there is no write to the POS until it is turned on.
- Errors map to a single envelope: `VpnUnavailableError → 503 vpn_unavailable`, `AiUnavailableError → 503 ai_unavailable`.

More: [[fail-closed]], [[vpn-egress]].

## 9. Key flow: the invoice

A 2-step API: `recognize` (OCR, no persist) → the client edits → `submit`. `prepare` is a pure resolve step (also `POST /invoices/prepare` for preview).

```text
Photo → recognize (OCR, vision-LLM)  →  InvoiceDraft (raw lines + supplier from the name)
  → prepare()  [draft context, tolerant]
      resolve the supplier; for each line, from the LOCAL catalog — numeric Esupl FKs
      (esupl_item_id, esupl_unit_id, packing), tax_rate; builds the EsuplOutgoingInvoice payload.
      Hints (fuzzy / LLM / exact-cache) live ONLY here. pos_ingredient_id is NOT touched.
  → submit()  [commit context, fail-closed]
      validate_draft (arithmetic, tolerance Decimal("0.05"))
      → _resolve_commit_identities → Phase-2 live validation
      → status: rejected / validated / prepared / written / failed
  → write_invoice()  ONLY when ERP_WRITE_ENABLED (default OFF → esupl-prepared-<number>, no write)
```

**MatchService.suggest** — the LLM matching path: a prompt built from the lines + local catalog → `ai_complete` (fail-closed VPN). The model cannot invent SKUs outside the catalog (`_parse_matches` drops an unknown `sku`).

The persisted invoice (dual-write: local DB + gated ERP): [[invoices]], [[invoice_lines]].

## 10. Invoice status machine

`InvoiceStatus` (native PG enum): `draft → validated → rejected → prepared → written → failed`.

| Status | Meaning |
|---|---|
| `draft` | initial (recognize, not submitted) |
| `validated` | recognized, arithmetic ok, but not ready for a POS payload |
| `rejected` | failed arithmetic / required fields / commit identity / live validation — **nothing written** |
| `prepared` | payload fully built and saved in `invoices.esupl_payload`, ready to send; writing is off |
| `written` | actually written to Esupl (only under `ERP_WRITE_ENABLED`) |
| `failed` | the write to ERP failed (caught, does not crash the request) |

`esupl_payload (Text)` is filled at `status=prepared` so that a later gated send reproduces the exact validated body. Write idempotency — unique `(organization_id, external_id)`. Full contract: [[invoice-status-machine]].

## 11. SKU identity — the two-context model ([[DEC-0011]] / [[DEC-0013]] variant A)

Two entities are separated:
- **Ingredient master data** (`name`, `unit`, `category`) — someone else's asset, owned by the POS. LCOS is **never** authoritative.
- **Mapping** (`source_key` → identity) — an LCOS asset, the accumulating **moat** ([[sku_mapping]]).

Line→SKU resolution happens in **two different contexts** (do not confuse them):

- **Draft resolve** (`prepare()`, tolerant, cheap): a payload from the local [[ingredients]] catalog — numeric FKs, tax_rate. Readiness = "payload buildable". Hints (client-side fuzzy, the LLM `suggest-matches`, an exact hit from [[ingredient_cache]]) are **hints only**. `prepare()` does **not** set `pos_ingredient_id`.
- **Commit resolve** (`submit()` → `_resolve_commit_identities` → Phase 2, **fail-closed**): the durable `pos_ingredient_id` is taken **only from `sku_mapping`** by `normalize_source_key(line.description)` (the same normalizer used on write, SSOT), priority **subdivision → org**, and **only a confirmed identity** (`method=manual` **OR** `confirmed_by IS NOT NULL`). Cache / fuzzy / AI **do not participate** on commit. Then a live query to the POS (`GET /teams/{id}/products?id=`; no exact match → `None`, no `items[0]` fallback). None / mismatch / unavailability → **block + review** (`rejected`), never a silent skip. On success the durable id is snapshotted onto `invoice_lines.pos_ingredient_id`.

- **[[DEC-0013]] variant A:** an exact cache match **without** a confirmed mapping does NOT auto-commit and does NOT auto-create a mapping — the line is held for manual confirmation. Variant C (auto-creating `cache_exact`/`confirmed_by='system'`) was proposed in the TZ and **rejected** ([[ADR-018]]); implementing it would break the merge-gate test `test_exact_cache_match_does_not_commit_and_creates_no_mapping`.
- **[[ADR-019]] ([[ADR-019]]) — composite key:** `sku_mapping` is keyed by `(scope_type, scope_id, supplier_external_id, source_key)`. The same line text from **different suppliers** can point to different POS SKUs — without the supplier in the key that is a collision.
- **`esupl_item_id` (int) vs `pos_ingredient_id` (str):** one Esupl entity in two representations — an int copy of the catalog for the payload (draft) and a str identity anchor in `sku_mapping`/on the line (commit); `pos_ingredient_id == str(esupl id)`.
- **Unit authority (D2):** the unit in the payload comes from the POS (`esupl_unit_id`); the OCR unit is a tolerant cross-check in `validate_ingredient_on_commit` (block only if **both** are set and differ).

**Learning loop (the moat grows), persist-then-commit ([[ADR-020]]):** each line's match → SKU is written by a **separate client** call `POST /ingredients/mappings` (`method='manual'`, `confirmed_by` = the authenticated user), which the FE makes in `InvoiceWorkbench.onSend` **before** the `sendInvoice` mutation. This is a separate transaction, **not a side effect of the submit endpoint** — submit only reads the mapping on commit resolve. `source_key` is the **raw line text** (not the SKU name from the catalog); in the send payload the `description` carries the same raw text. Normalization is on the backend (`normalize_source_key`, SSOT), and FE normalization mirrors it (a golden-vector parity test). Persist happens **BEFORE** send, so a confirmed mapping survives the reject of the first invoice — otherwise a fail-closed reject would not let the moat initialize. The loop used to live in localStorage; it was migrated entirely to the backend.

More: [[sku-identity-resolver]], [[DEC-0011]], [[DEC-0013]].

## 12. Suppliers: flexible criteria

`Supplier.criteria` is JSONB; the definitions live in the registry `app/domain/supplier_criteria.py` (`CriterionDef`: volume, delivery lead time, days, payment mode, deferral). Validation against the registry happens at the API level (invalid → 422; unknown keys are silently dropped). New criteria are added by editing the registry, without migrations. Consumer analytics (REQ 1b) — the model exists (a seam), the consumer is deferred per checkpoint. The supplier-card FE fields (the suppliers page, the supplier selector) **exist**.

More: [[supplier-criteria-registry]], [[suppliers]].

> **doc↔code correction:** supplier resolution (`_resolve_supplier`) uses a **blended score, trigram 0.65 + token Jaccard 0.35, minimum threshold 0.4** (NOT "Jaccard ≥ 0.5"). Order: tax_id priority, then the blended fuzzy score. The suppliers FE page, the supplier selector, breadcrumbs, and footer **exist** (the outdated statement that they are missing is retracted).

## 13. Esupl integration (read-only)

Real endpoints (the tenant's Bearer token on every read):

| Purpose | Endpoint |
|---|---|
| Suppliers | `GET /teams/{id}/following?is_virtual=1` |
| Catalog (search) | `GET /teams/{id}/products` (server-side `product_name` LIKE search) |
| Single item (commit validation) | `GET /teams/{id}/products?id=` |
| Invoices | `GET /teams/{id}/orders` |
| Write | `POST /teams/{id}/outgoing-invoices` — **behind the `ERP_WRITE_ENABLED` toggle (OFF)** |

`get_esupl_access(session, org_id) → (team_id, token)` — the SSOT for POS access (4 places: supplier list/sync, catalog, invoices, commit). `EsuplErpProvider` is the only ERP implementation, `requires_vpn=False` (Esupl is reachable directly). At OFF, `write_invoice` returns a synthetic `esupl-prepared-<number>` **without contacting Esupl**; at ON, the same path POSTs the real payload. Read surface: [[erp-esupl-integration]]. Requirement: [[erp-esupl-integration]].

> **Open gate [[VER-021_ESUPL_DURABILITY_TEST]]:** `pos_ingredient_id` durability (whether the id is stable under edit/delete-recreate in Esupl) is **NOT** empirically confirmed; the probe requires a WRITE to the sandbox (team 17957) → **owner-run**, and cannot be closed under read-only. **Merge stays gated.** An endpoint discrepancy is also documented: commit validation reads `/teams/{id}/products?id=`, while the VER-021 probe/doc mutates `/teams/{id}/ingredients/{id}` — different resources; until `products.id == ingredients.id` is documented, the probe does not certify the exact id that commit resolves.

## 14. Data model and migration chain

All tables are SQLAlchemy 2.0 (async, typed `Mapped`) on PostgreSQL 16 + pgvector. `organization_id` is a denormalized hard boundary on every operational row (`RESTRICT`); within a tenant, parent-child is `CASCADE`. Mixed PK types: UUID for structural/catalog tables, **int autoincrement** for `suppliers`/`invoices`/`invoice_lines`, int for `system_settings`.

14 entities (details and columns are in the docs, not duplicated here):
[[organizations]] · [[subdivisions]] · [[users]] · [[memberships]] · [[refresh_sessions]] · [[suppliers]] · [[invoices]] · [[invoice_lines]] · [[ingredients]] · [[packings]] · [[sku_mapping]] · [[ingredient_cache]] · [[system_settings]] · [[integration_credentials]].

**Migration chain (Alembic async): `0001` … `0009` + `1e12…` (OCR prompt).**

| Revision | Contents |
|---|---|
| `0001_initial` | squashed ("consolidated 0001–0004"), `down_revision=None`; `CREATE EXTENSION vector` first, creates all tables; `downgrade()` drops the enum types but does **not** drop `vector` |
| `0002_org_pos_token` | `organizations.esupl_api_token` (encrypted) — a per-org POS secret (later migrated) |
| `0003_integration_credentials` | the `integration_credentials` table + partial-unique via a sentinel-UUID COALESCE; **data-migrate** of secrets from `system_settings`/`esupl_api_token` → scoped rows; + `refresh_sessions.last_used_at` |
| `0004` | `sku_mapping` + `ingredient_cache` (moat + draft cache) |
| `0005` | `invoice_lines.pos_ingredient_id` (durable POS identity on the line) |
| `0006` | supplier-card fields (`contact_name`, `phone`, `messenger`, `delivery_terms`, `min_order_amount`, …) |
| `0007`–`0008` | supplier criteria JSONB / further evolution |
| `0009_sku_mapping_packing` | `packing` in `sku_mapping` ([[ADR-019]]) — the **last numbered** one |
| `1e12…` (OCR prompt) | OCR prompt in `system_settings` (an out-of-chain revision) |

`alembic/env.py` `include_object` excludes the `vector` extension (`EXCLUDE_NAMES={"vector"}`) so that autogenerate does not drop it.

> **doc↔code correction (dead code, backlog `DEC-02`, `status: open`):** the column **`invoice_lines.sku_embedding` `Vector(1536)` is NOT used** — nobody reads or writes it, there is no ANN index (ivfflat/hnsw), no embedding provider, no write trigger. It is an unused placeholder column for future semantic matching, flagged for dead-code cleanup ([[DEC-0011]]). The current line→SKU matching uses fuzzy + LLM, not this column.

The ER summary and FK behavior are in the [[MOC]] docs; normative slices are in [[multitenancy]].

## 15. Testing

- **Backend:** pytest + pytest-asyncio; the test DB is **real Postgres+pgvector** (not SQLite); outbound HTTP is mocked with respx. Non-negotiables (fail-closed VPN, tenant isolation, admin auth) are covered and **block merge**. A dedicated marker `merge_gate` (17 durable-id + DEC-0013 tests). **Currently: 209 passed.** Run: `docker compose run --rm backend pytest`.
- **Frontend:** vitest (+ RTL/jsdom); Playwright e2e separately. **Currently: 43 passed.**

## 16. Open gates and non-goals

**Open / gated:**
- [[VER-021_ESUPL_DURABILITY_TEST]] durability — owner-run (a write to the Esupl sandbox), merge gated.
- `S1` read-only — empirically confirm that the `products?id=` / `product_name` filters behave as expected; resolve the `/products` vs `/ingredients` discrepancy.
- `DEC-02` — dead-code cleanup of `sku_embedding` (backlog, open).
- The consumer of supplier analytics (REQ 1b) — deferred per checkpoint.

**Phase 1 non-goals:** Celery/queues, cloud hosting, RBAC matrix/OAuth, self-registration, supplier portal (schema placeholder only, [[ADR-017]]).

## Related documents

- Product and strategy: [[product]] · Roadmap: [[roadmap]] · Glossary: [[glossary]]
- Epics: [[LCOS-E1-platform]] · [[LCOS-E2-invoice-intake]] · [[LCOS-E3-sku-identity]] · [[LCOS-E4-suppliers]] · [[LCOS-E5-stabilization]]
- Requirements: [[auth]] · [[multitenancy]] · [[config-secrets]] · [[secret-encryption]] · [[fail-closed]] · [[vpn-egress]] · [[provider-abstraction]] · [[erp-esupl-integration]] · [[sku-identity-resolver]] · [[invoice-status-machine]] · [[supplier-criteria-registry]] · [[global-requirements]]
- Decisions: [[index]] · key ones — [[ADR-001]] [[ADR-005]] [[ADR-006]] [[ADR-009]] [[ADR-011]] [[ADR-018]] [[ADR-019]] [[ADR-020]] · [[DEC-0011]] [[DEC-0013]]
