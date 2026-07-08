# LCOS ("Local OS") — Architecture & Handoff Reference

## What is LCOS

**Local OS (LCOS)** is an AI assistant for the owner of a *small coffee shop*: a "thinking partner" that sits between the shop's daily operations and its POS/accounting system (the Belarusian POS **Esupl**) and takes over routine work. Its guiding product principle, stated verbatim in the docs, is **«Сначала помочь жене. Потом — деньги.»** ("First help the wife. Then — money.") — the founder's wife runs the actual coffee shop and is "Customer Zero." The headline pain it kills is manually re-typing paper supplier invoices into the POS (20–40/month). Concretely, the shipped system is the **invoice write-point**: photograph a supplier invoice → OCR reads it → the app resolves each line to a POS product (SKU) → validates arithmetic → builds an Esupl goods-receipt payload → persists locally and (behind a gate) writes it back to the POS. A hard product rule: **AI shows data and arguments; the human decides** — no automatic orders, and no POS write without human confirmation. Phase 1 is a single coffee shop, free, run locally via Docker Compose; Phase 2 (not built) is a multi-tenant SaaS for the CIS HoReCa market.

## How to read this doc

This is a reference for a reader (human or model) who has **not seen the code**. It is intentionally long and concrete: every claim names real files, functions, classes, routes, DB tables, and environment variables. A few things to internalize before diving in:

- **Trust code over product docs.** The two product docs (`mvp.docs/Local_OS_Specification_v04.md` and parts of `Local_OS_MVP1_AgentSpec.md`) are older/aspirational: they describe a **Telegram-bot** frontend, a **Java/Node** backend, and a "no-auth single-user" scope. **None of that is true of the shipped code.** The ground truth is `mvp.be/CLAUDE.md`, the actual `docker-compose.yml`, `app/core/config.py`, and `mvp.docs/recognition-feature.md` (the most current implementation journal). Where docs and code conflict, the code wins.
- **The central design theme is a deliberate three-tier config/secret split** with **no env fallback** for runtime settings or secrets, and **fail-closed** behavior everywhere (VPN, AI keys, POS token). If you remember one thing, remember that.
- **The frontend holds no secrets.** All LLM keys and ERP tokens live on the backend, encrypted. The browser authenticates with HttpOnly cookies and talks only to the LocalOS backend.
- **All in-code docstrings/UI text are Russian; identifiers are English.**

---

## Architecture at a glance

Three repositories in one monorepo at `d:\_work\mvp`:

| Repo | Role | Stack |
|---|---|---|
| **mvp.be** | Backend — the invoice write-point, auth, multi-tenancy, provider integrations, config/secret store | Python 3.12, FastAPI ≥0.115, SQLAlchemy 2.0 async (asyncpg), Pydantic v2, PostgreSQL 16 + pgvector, Alembic, httpx, SQLAdmin, anthropic SDK; `uv` + `ruff` + pytest/testcontainers |
| **mvp.fe** | Frontend — mobile-first PWA for capture → review → send | React 18, Redux Toolkit + RTK Query, react-router v6, RxJS observer layer, Tailwind v4, Vite 6, TypeScript, vite-plugin-pwa; strict Feature-Sliced Design (FSD) |
| **mvp.docs** | Product docs / vision (older, partly superseded) | Markdown |

### Component diagram (frontend → backend → DB/providers)

```
┌───────────────────────────────────────────────────────────────────────┐
│  BROWSER (mvp.fe — React PWA, mobile-first)                             │
│                                                                         │
│  Pages: login · invoices-list · invoice-import (photo→review wizard)    │
│         · settings                                                      │
│  State: Redux (baseApi cache + invoiceSession + settings overlay)       │
│  RxJS observer (configSync): ocrConfig$ / posConfig$ / activeScope$     │
│  Providers (backend|mock): shared/ocr · shared/match · shared/pos       │
│  Transport: backendRequest (fetch, credentials:'include', refresh-once) │
└───────────────────────────────┬─────────────────────────────────────────┘
              HttpOnly cookies   │  HTTPS/JSON + multipart (image upload)
              lcos_access (JWT)  │  →  /api/v1/...
              lcos_refresh       │
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│  BACKEND (mvp.be — FastAPI, /api/v1)                                    │
│                                                                         │
│  api/v1/routes  →  services (use-cases)  →  providers / repositories    │
│  (thin routes)     InvoiceService,          OCR/ERP behind Protocols    │
│                    MatchService,            repos require organization_id│
│                    SupplierService                                      │
│                                                                         │
│  Cross-cutting: auth (JWT+refresh), tenant scope, ProviderContext,      │
│                 modules/registry gates, unified error envelope          │
│  SQLAdmin at /admin (operator login) — edits system_settings + secrets  │
└───────┬───────────────────────────────┬─────────────────────┬──────────┘
        │                               │                     │
        ▼                               ▼                     ▼
┌───────────────┐          ┌────────────────────────┐  ┌──────────────────┐
│ PostgreSQL 16 │          │ Egress (httpx)          │  │ gluetun (VPN      │
│ + pgvector    │          │  direct_client          │  │ sidecar, :8888)   │
│               │          │  vpn_client ────────────┼─▶│ WireGuard proxy   │
│ tenant tables │          └──────────┬──────────────┘  └────────┬─────────┘
│ users(global) │                     │                          │
│ system_settings│    ai_complete()   ▼          ERP write        ▼
│ integration_   │  Anthropic / Gemini LLM   EsuplErpProvider → Esupl POS API
│ credentials    │  (OCR + SKU matching)     (gated by ERP_WRITE_ENABLED)
└───────────────┘
```

Two egress axes cross the trust boundary: **AI calls** (OCR + matching) route through the VPN sidecar when `ai_vpn_enabled` (default on, fail-closed); **ERP writes** go to Esupl directly today and are gated off by default (`erp_write_enabled=False`).

---

## Repository layout

### mvp.be (backend)

```
mvp.be/
  app/
    main.py               # create_app(): FastAPI factory + lifespan; startup secret guard
    core/
      config.py           # Settings (pydantic-settings) — the ONLY env reader; settings singleton
      system_settings.py  # REGISTRY of typed runtime settings (SSOT of keys/types/defaults)
      effective_config.py # resolver: DB (system_settings) -> registry default; NO env fallback
      credentials.py      # get_active_credential(): read+decrypt integration_credentials, no cache
      secrets.py          # Fernet encrypt/decrypt, keyring, validate_keyring (enc:v2:<kid>:...)
      security.py         # AdminAuth backend + authenticate_admin (SQLAdmin operator login, bcrypt)
      errors.py           # register_exception_handlers — single {"error":{code,message}} envelope
      logging.py          # configure_logging + redact()
    api/
      deps.py             # FastAPI DI: SessionDep, OcrDep/ErpDep, service factories, TenantContext
      v1/
        router.py         # api_router aggregator (mounted at /api/v1)
        schemas.py        # request/response Pydantic models (InvoiceOut, SuggestMatches*, ...)
        routes/           # health, auth (via app/auth), admin_system, organizations,
                          #   invoices, suppliers, ingredients
    services/             # USE-CASES: invoice_service, supplier_service, match_service, catalog
    domain/
      entities.py         # ORM-free Pydantic domain models (InvoiceDraft, PreparedInvoice, Esupl*)
    providers/
      base.py             # OCR/ERP registry (register_ocr/register_erp, get_*_provider, import_providers)
      context.py          # ProviderContext (egress + ai_vpn + session_scope), module global
      http.py             # Egress (direct + vpn httpx clients), guard_vpn, VpnUnavailableError
      ai.py               # ai_complete() — single LLM entrypoint (claude|gemini), fail-closed VPN
      vpn_toggle.py       # AiVpnToggle (cached ai_vpn_enabled)
      ocr/{base,claude,gemini,prompt}.py   # OcrProvider Protocol + impls
      erp/{base,esupl}.py                  # ErpProvider Protocol + impl
    modules/
      registry.py         # togglable modules: require_module() request-time 404 gate
    db/
      base.py             # DeclarativeBase, naming convention, Org/Subdivision scoped mixins, uuid_pk
      models.py           # all ORM tables
      repositories.py     # tenant repos (require organization_id) + auth/structural repos
      session.py          # async engine, SessionFactory, get_session()
    auth/                 # application auth: password provider, argon2, JWT access + opaque refresh
      {base,dependencies,router,service,tokens,password,cookies,schemas}.py
    admin/setup.py        # SQLAdmin ModelViews + auth backend mount
    seed.py               # idempotent demo seed (org/subdivision/users iter, oter)
  alembic/
    env.py
    versions/{0001_initial, 0002_org_pos_token, 0003_integration_credentials}.py
  scripts/{entrypoint.sh, hash_password.py, ...}
  docker-compose.yml
  Dockerfile
  lcos.env.example        # copy -> lcos.env (bind-mounted as /app/.env)
  pyproject.toml
  CLAUDE.md               # ground-truth conventions & non-negotiables
```

### mvp.fe (frontend, Feature-Sliced Design)

```
mvp.fe/
  src/
    main.tsx              # bootstrap: startConfigSync(store) BEFORE first render, then <App/>
    app/                  # composition root (only layer that knows about everything)
      App.tsx             # createBrowserRouter + RouterProvider + <Toaster/>
      AuthGuard.tsx       # useMeQuery() gate -> spinner / redirect / <Outlet/>
      store/index.ts      # configureStore: baseApi + invoiceSession + settings; fileSync listener
      observers/configSync.ts   # the RxJS reactive glue (settings/scope/provider config sync)
    pages/                # route screens
      login/  invoices-list/  invoice-import/  settings/
    widgets/              # composite UI blocks
      app-layout/  invoice-workbench/  ocr-progress/  prepare-step/
    features/             # self-contained interactions
      lines-table/  photo-viewer/  image-cropper/
    entities/             # domain models + API endpoints + slices
      auth/   (authApi: me/login/logout/switchContext)
      invoice/(sessionSlice wizard state + invoicesApi + mappingStorage/prepareInvoice/validate)
      settings/(settingsSlice overlay + posConfigApi + selectors)
      supplier/  sku/  order/
    shared/               # no domain knowledge
      api/    (baseApi, backendRequest, queryFn, mockData)
      config/ (env, activeScope, settingsStorage)
      lib/    (store typed hooks, fileHolder, format, mobileNav, layout, assertNever)
      ui/     (Button, Toaster, ConfirmDialog, ...)
      ocr/    (provider + factory + config + providers/{backend,mock} + preprocess)
      match/  (provider + factory + config + providers/{backend,mock} + fuzzy)
      pos/    (provider + factory + config + providers/{backend,mock} + sentRegistry)
      llm/    (vestigial vendor abstraction — parse helpers only are live)
  vite.config.ts          # React + Tailwind v4 + VitePWA; manualChunks vendor
  package.json            # dev/build(tsc -b && vite build)/preview
  .env.example            # VITE_* only, non-secret
```

---

## Backend architecture & layering

`mvp.be` is described in `CLAUDE.md`/`README.md` as a strategic-analytics layer over an ERP, but concretely it is the **invoice write-point**. It is explicitly **not** a POS and not operational accounting.

### Layer boundaries — the core rule

`CLAUDE.md` fixes the dependency direction: **`api` → `services` (use-cases) → `providers`/`repositories`**, and **`services` depend ONLY on provider interfaces (`providers/*/base.py`)**, never on concrete implementations.

- **api layer** (`app/api/v1/routes/*`): thin. Validates input, resolves DI, calls a service, maps ORM → `InvoiceOut`. Example `routes/invoices.py`: `recognize_invoice` checks MIME against `_ALLOWED_MIME`, reads bytes, delegates to `service.recognize(...)`.
- **services layer** (`app/services/*`): the use-cases. `InvoiceService` takes `session, ocr: OcrProvider, erp: ErpProvider, organization_id, subdivision_id` in its constructor and instantiates tenant repositories internally. It references only the `OcrProvider`/`ErpProvider` **Protocols**, not `claude`/`esupl`.
- **domain layer** (`app/domain/entities.py`): ORM-free Pydantic models crossing provider interfaces (`InvoiceDraft`, `InvoiceLineDraft`, `PreparedInvoice`, `EsuplOutgoingInvoice`, `EsuplLineItem`, `IngredientRef`, `PackingRef`, `SupplierRef`, `MatchCandidate`, `LineToMatch`/`LineMatch`). This DTO boundary keeps SQLAlchemy models out of provider signatures; `Decimal` is used for money/quantity.
- **providers/repositories layer**: infra. OCR/ERP behind `Protocol`; repositories wrap SQLAlchemy queries. `CLAUDE.md` mandates **one implementation per provider** (OCR=claude default, ERP=esupl); seams exist but alternative impls are not to be written unless asked.

The `core` layer sits beside these. `effective_config.py` uses lazy imports inside functions specifically to avoid a `core → providers → core` import cycle (providers import core).

### How a request flows (photo → invoice)

Take `POST /api/v1/invoices` (`routes/invoices.py::submit_invoice`):

1. **DI resolution** (`api/deps.py`): `InvoiceServiceDep` triggers `get_invoice_service(session, ocr, erp, ctx)`. `session` from `get_session()`; `ocr` from `get_ocr()` which calls `resolve_ai_provider()` (reads `system_settings.ai_provider` at **runtime**, default claude via registry) then `get_ocr_provider(name)`; `erp` from `get_erp()` using the **static** `settings.erp_provider`; `ctx: TenantContext` comes from `auth/dependencies.py::get_tenant_context`, which decodes the access-JWT from the cookie and 403s if `organization_id` is None.
2. **Service constructs tenant repos** scoped by `organization_id`/`subdivision_id` from the JWT context — tenant access is impossible without an authenticated org scope.
3. `InvoiceService.submit(draft)`: `validate_draft` (number, positive total, line-sum vs total within `_TOTAL_TOLERANCE = Decimal("0.05")`) → `prepare(draft)` resolves supplier and each line, building an `EsuplOutgoingInvoice` payload only if everything resolves.
4. **Status machine** (`InvoiceStatus`): `rejected` (validation failed) / `validated` (recognized, not POS-ready) / `prepared` (payload built, `esupl_payload` stored) / `written` / `failed`.
5. **ERP write is gated**: only if `resolve_bool(session, ERP_WRITE_ENABLED)` (runtime DB toggle, registry default **False**). The per-org POS token is fetched from `integration_credentials` (scope=org, provider=esupl) via `get_active_credential`; None → request goes unauthenticated and Esupl returns 401 (fail-closed, no env fallback). The actual POST is in `EsuplErpProvider.write_invoice`, itself re-guarded by `ERP_WRITE_ENABLED` (returns a synthetic `esupl-prepared-<number>` id when off, without contacting Esupl).
6. **Response**: ORM `Invoice` → `InvoiceOut.model_validate`. `get_session()` commits on success, rolls back on exception, then re-raises.

`suggest-matches` is the LLM matching path: `MatchService.suggest` builds a prompt from lines + local catalog and calls `ai_complete`, which dispatches to `claude_complete`/`gemini_complete` through the shared egress with fail-closed VPN. The model may not invent SKUs outside the catalog (`_parse_matches` drops unknown `sku`).

### Two DI mechanisms

1. **FastAPI `Depends`** (`api/deps.py`, `auth/dependencies.py`, `modules/registry.py`) — per-request wiring of session, providers, services, auth context, module gates. Uses `Annotated[T, Depends(...)]` aliases (`SessionDep`, `OcrDep`, `ErpDep`, `InvoiceServiceDep`, `TenantContext`, etc.).
2. **`ProviderContext`** (`providers/context.py`) — a module-global singleton (`_CTX`) holding cross-cutting infra that must not pollute provider `Protocol` signatures: `egress` (the two long-lived httpx clients), `ai_vpn` (the `AiVpnToggle`), and `session_scope` (`SessionFactory`, so a provider can open its own DB session). Set in `main.py::lifespan`, cleared on shutdown; providers call `get_provider_context()` (raises `RuntimeError` if unset). Tests swap in fakes. This is why `claude_complete` can compute `via_vpn` and grab an egress client without any of that leaking into `OcrProvider.extract_invoice`'s signature, and without providers importing the `services` layer (which would create a dependency back-edge).

### App assembly & cross-cutting middleware (`main.py`)

`create_app()` builds `FastAPI(title="LCOS Backend", version="0.1.0", lifespan=lifespan)`, then adds `SessionMiddleware` (shared `session_secret` with SQLAdmin), `CORSMiddleware` (origins from `cors_origins_list`, `allow_credentials=True`), registers exception handlers, includes `api_router` at `/api/v1`, and mounts SQLAdmin at `/admin`. `lifespan` builds egress, the VPN toggle, sets `ProviderContext`, calls `import_providers()` + `import_auth_providers()`, and logs a redacted config snapshot.

**Unified error envelope** (`core/errors.py`): every error becomes `{"error":{"code","message","details?"}}`. Handlers: `VpnUnavailableError → 503 vpn_unavailable`, `AiUnavailableError → 503 ai_unavailable`, `HTTPException → http_error`, `RequestValidationError → 422 validation_error`, catch-all `Exception → 500 internal_error`. The catch-all manually re-applies CORS headers because it runs in `ServerErrorMiddleware` *above* `CORSMiddleware` (otherwise the browser sees "Failed to fetch").

### Coding conventions

Full type hints, `from __future__ import annotations` everywhere, async for all I/O. Pydantic v2 for schemas; ORM models strictly separate from domain entities. API under `/api/v1`. Single error format. ruff (line-length 100, py312, rules `E,F,I,UP,B,ASYNC`; `B008` ignored for `Depends()` defaults). Alembic async migrations must be reviewed after `--autogenerate` and ship a working `downgrade()`; the `vector` extension is created in the init migration before any Vector column. Tests: behavior over implementation, real Postgres+pgvector via testcontainers (never SQLite), egress mocked with `respx`; non-negotiables are test-gated to block merge. `wtforms>=3.1,<3.2` is pinned (3.2 breaks sqladmin's boolean widget).

---

## Data model, DB & migrations (mvp.be)

SQLAlchemy 2.0 (async, typed `Mapped[...]`) on PostgreSQL 16 + pgvector via asyncpg, migrated with Alembic (async). **`organization_id` is a denormalized hard isolation boundary carried on every operational row**; operational rows also carry `subdivision_id`. `users` is the single global exception.

### ORM base & mixins (`app/db/base.py`)

- `Base(DeclarativeBase)` with a fixed `NAMING_CONVENTION` (`ix/uq/ck/fk/pk`) so autogenerated constraint/index names are stable and diffable.
- `TimestampMixin` — `created_at` / `updated_at` (`DateTime(timezone=True)`, `server_default=func.now()`, `updated_at` `onupdate=func.now()`).
- `OrganizationScopedMixin(TimestampMixin)` — adds `organization_id` UUID FK → `organizations.id`, `ondelete="RESTRICT"`, `nullable=False`, `index=True`.
- `SubdivisionScopedMixin(OrganizationScopedMixin)` — additionally adds `subdivision_id` UUID FK → `subdivisions.id`, `ondelete="RESTRICT"`, `nullable=False`, `index=True`. A subdivision-scoped table gets **both** columns.
- `uuid_pk()` helper: `Uuid` PK defaulting to `uuid.uuid4`. Note PK types are mixed: UUID PKs for structural/catalog tables (organizations, subdivisions, users, memberships, refresh_sessions, ingredients, packings, integration_credentials), but **integer autoincrement PKs for `suppliers`, `invoices`, `invoice_lines`**, and an integer PK for `system_settings`.

### Session management (`app/db/session.py`)

One async engine via `create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)`; `database_url` defaults to `postgresql+asyncpg://lcos:change_me@db:5432/lcos`. `SessionFactory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)`. `get_session()` yields a session per request, **commits on success, rolls back on any exception, re-raises** — the single transaction-per-request seam.

### Enums (native PG enums, `StrEnum`)

- `Role`: only `admin` (assignable per-subdivision; `superadmin` is a global boolean on `User`, not a role).
- `InvoiceStatus`: `draft → validated → rejected → prepared → written → failed`. `validated` = OCR ok, not yet resolved to POS payload; `rejected` = failed arithmetic/required-field validation; `prepared` = fully resolved into an Esupl payload, ready to send; `written` = actually written to Esupl (only under `ERP_WRITE_ENABLED`); `failed` = ERP write failed.
- `CredentialScope`: `platform` (one secret per deploy, e.g. AI key), `org` (per-tenant, e.g. Esupl POS token), `subdivision` (reserved, not actively used).
- `CredentialProvider`: `anthropic`, `gemini`, `esupl`.

### Tables (key columns)

**Structural / auth (not tenant-scoped):**

- **`organizations`** — the tenant. `id (uuid pk)`, `name`, `legal_name?`, `esupl_team_id? (int)` (org ↔ exactly one Esupl team). The POS token is a SECRET and lives in `integration_credentials`, not here.
- **`subdivisions`** — physical point in a tenant. `id (uuid pk)`, `organization_id (FK CASCADE)`, `name`, `address?`, `esupl_warehouse_id? (int)`. Unique `(organization_id, name)`.
- **`users`** — GLOBAL, no `organization_id`. `id (uuid pk)`, `email (unique global, String(320))`, `password_hash?` (nullable for external providers), `first_name?`, `last_name?`, `is_superadmin (bool, default false)`, `is_active (bool, default true)`.
- **`memberships`** — user ↔ subdivision + role. `user_id (FK CASCADE)`, `subdivision_id (FK CASCADE)`, `role (enum, default admin)`. Unique `(user_id, subdivision_id)`. Org is derived through the subdivision, not stored here.
- **`refresh_sessions`** — server-side refresh-token state (stores only a hash). `user_id (FK CASCADE)`, `token_hash (String(128), unique)`, `active_subdivision_id? (FK SET NULL)` (persists active context for restore on refresh), `family_id (uuid, indexed)` for rotation/reuse-detection, `expires_at`, `last_used_at?` (sliding-idle marker, added in 0003), `revoked (bool, default false)`.

**Operational / catalog (tenant-scoped):**

- **`suppliers`** (`OrganizationScopedMixin`, **int pk**) — org-wide. `external_id?` (indexed), `name`, `tax_id?`. Unique `(organization_id, external_id)`; composite index `(organization_id, name)`.
- **`invoices`** (`SubdivisionScopedMixin`, **int pk**) — `supplier_id?` (FK, no explicit ondelete), `image_ref?`, `ocr_provider?`, `ocr_raw? (Text)`, `number?` (indexed), `issued_at?`, `total_amount? Numeric(14,2)`, `currency?`, `status (enum, default draft, indexed)`, `validation_errors? (Text)`, `external_id?` (indexed), **`esupl_payload? (Text)`** — the prepared Esupl JSON, filled at `status=prepared` so a later gated send reproduces the exact validated body. Composite index `(organization_id, status)`; **unique `(organization_id, external_id)`** for POS write idempotency (PG treats NULLs as distinct, so drafts without external_id don't conflict).
- **`invoice_lines`** (`SubdivisionScopedMixin`, **int pk**) — `invoice_id (FK CASCADE)`, `line_no`, `description (Text)`, `sku?`, `quantity? Numeric(14,3)`, `unit?`, `unit_price? Numeric(14,4)`, `line_total? Numeric(14,2)`, **`pos_ingredient_id? String(256)`** (durable POS identity committed at Phase 2 — snapshot of `sku_mapping.pos_ingredient_id`; NULL for non-committed lines; migration `0005`), and **`sku_embedding` `Vector(1536)`** (pgvector).
- **`ingredients`** (`OrganizationScopedMixin`, **uuid pk**) — the SKU catalog. `subdivision_id?` (FK CASCADE) is an **optional override**: NULL = org-wide SKU, set = subdivision-specific. `external_id?`, `name`, `unit?`, `esupl_item_id?`, `esupl_unit_id?`, `default_tax_rate? Numeric(6,2)`. Unique `(organization_id, subdivision_id, external_id)`. Base+override merge logic is intentionally not implemented (schema only).
- **`packings`** (`OrganizationScopedMixin`, **uuid pk**) — packing of a SKU. `ingredient_id (FK CASCADE)`, `name`, `factor Numeric(14,4)` (base units per packing unit), `is_default (bool)`, `esupl_packing_id?`. **Partial unique index `uq_packings_default_per_ingredient` on `ingredient_id WHERE is_default`** — at most one default packing per SKU, making auto-substitution deterministic.
- **`sku_mapping`** (uuid pk; migration `0004`) — the **moat**: normalized raw line text → durable POS identity. `scope_type String(32)` (`org|subdivision`), `scope_id Uuid` (**polymorphic — deliberately NO FK**, per BLOCKER #2), `source_key String(512)`, `pos_ingredient_id String(256)` (durable POS id, **NO FK to `ingredient_cache`**), `method (enum manual|fuzzy|ai)`, `confidence? Numeric(5,4)`, `confirmed_by? (FK users SET NULL)`, `confirmed_at?`. Unique `(scope_type, scope_id, source_key)`; index on `scope_id`. Survives cache rebuild (holds a durable id, not a surrogate).
- **`ingredient_cache`** (uuid pk; migration `0004`) — **non-authoritative** acceleration/display cache of POS ingredients, fully rebuildable. `scope_type String(32)`, `scope_id Uuid`, `pos_ingredient_id String(256)`, `name?`, `unit?`, `category?`, `pos_version?`, `content_hash?`, `is_active`, `synced_at?`. Unique `(scope_type, scope_id, pos_ingredient_id)`; index on `scope_id`. **Never read for commit authority** (DEC-0011); drop+rebuild leaves `sku_mapping` intact.

**Config / secrets:**

- **`system_settings`** (int pk) — non-secret KV app settings (whitelisted keys), superadmin-managed via SQLAdmin. `key (unique)`, `value?`. No secrets here (enforced by comment/convention).
- **`integration_credentials`** (uuid pk) — **single SSOT table for all integration secrets**. `scope (enum, indexed)`, `provider (enum, indexed)`, `org_id? (FK CASCADE)`, `subdivision_id? (FK CASCADE)`, `encrypted_value (Text, Fernet ciphertext)`, `is_active (bool, default true)`, `rotated_at?`, `created_by?`. **Partial unique index `uq_credentials_active_per_scope`** on `(scope, provider, coalesce(org_id, sentinel-uuid), coalesce(subdivision_id, sentinel-uuid)) WHERE is_active` — at most one active secret per (scope, provider, org, subdivision); the COALESCE-with-sentinel trick works around PG treating NULLs as distinct.

### Repositories (`app/db/repositories.py`)

Tenant repositories **require `organization_id` in their constructor** so a tenant query is impossible without a scope:

- `SupplierRepository(session, organization_id)` — `list`, `get_by_external_id`, `get_by_tax_id`, `upsert_by_external_id`.
- `IngredientRepository(session, organization_id, subdivision_id=None)` — `list` returns org-wide SKUs (`subdivision_id IS NULL`) plus, with a subdivision scope, that subdivision's overrides (via `or_`). Eager-loads `packings` with `selectinload`.
- `InvoiceRepository(session, organization_id, subdivision_id=None)` — `_scope()` filters by org, optionally narrows to subdivision; `add` (stamps org/subdiv), `get`, `get_by_external_id` (idempotent POS write), `list` (eager-loads `.lines` to avoid `MissingGreenlet` async lazy-load errors).
- Non-tenant repos (by design): `SettingsRepository` (KV + `get_bool`/`set_bool`), `UserRepository`, `OrganizationRepository`, `SubdivisionRepository` (incl. `first_in_system`), `MembershipRepository` (`list_for_user` eager-loads subdivision→organization), `RefreshSessionRepository` (`get_by_token_hash`, `add`, `revoke_family`).

### pgvector — prepared seam only

Extension enabled in the init migration (`CREATE EXTENSION IF NOT EXISTS vector`, before any Vector column). Column `invoice_lines.sku_embedding Vector(1536)` (`SKU_EMBEDDING_DIM = 1536`). **Important: it is never read or written anywhere in `app/`; no similarity query and no ANN index (ivfflat/hnsw) exist.** Semantic SKU matching is future work; current line→SKU matching uses the fuzzy + LLM recognition feature, not this column.

### SKU identity & the two-context resolver (DEC-0011 / DEC-0013 variant A)

Line→SKU resolution runs in **two distinct contexts** (do not conflate them):

- **Draft-resolve (`prepare()`, tolerant, cheap):** builds the Esupl payload from the local
  `ingredients` catalog — numeric FKs (`esupl_item_id`, `esupl_unit_id`, default `packing`),
  `tax_rate`. Readiness = "payload buildable". Suggestions (fuzzy layer 1 client-side, LLM
  `suggest-matches`, and exact `ingredient_cache` hits) live here as **hints only**. Draft
  never asserts identity authority. `prepare()` does **not** set `pos_ingredient_id`.
- **Commit-resolve (`submit()` → `_resolve_commit_identity` → Phase 2, fail-closed):** resolves
  the durable `pos_ingredient_id` by `normalize_source_key(line.description)` — the **same**
  normalization used on write (`sku_service.normalize_source_key`, SSOT) — against `sku_mapping`
  with priority **subdivision → org**. Only **confirmed identity** is commit-eligible:
  `method = manual` **OR** `confirmed_by IS NOT NULL`. cache / fuzzy / AI are **never** consulted
  on the commit path. The resolved id is then **live-validated** against POS
  (`validate_ingredient_on_commit`); any exception, missing id, or unit mismatch → **block +
  review** (status `rejected`, nothing written). Unresolved (no confirmed mapping) also blocks —
  never a silent skip. On success the durable id is snapshotted onto `invoice_lines.pos_ingredient_id`.

**DEC-0013 (ratified variant A — block until manual confirmation):** an exact `ingredient_cache`
match without a confirmed `sku_mapping` does **not** auto-commit and does **not** auto-create a
mapping — the line is held for human confirmation. Confirming a suggestion (or creating a manual
mapping via `POST /ingredients/mappings`) is what grows the moat. This is stricter than the TZ's
default variant C and is the maximally fail-closed reading of "an invoice is a responsible step."

**T2 — `esupl_item_id` (int) vs `pos_ingredient_id` (str):** these are the **same Esupl
ingredient entity in two representations**, used by the two contexts. `ingredients.esupl_item_id`
(int) is the catalog's numeric copy consumed by *payload building* (draft-resolve); the durable
POS id is a *string* anchor owned by `sku_mapping`/committed on the line for *identity*
(commit-resolve). They are not two entities; `pos_ingredient_id == str(esupl ingredient id)`.
The catalog copy is disposable/re-syncable; the mapping's durable id is the moat.

**T5 / VER-022 — cache scope:** `ingredient_cache` is scope-aware (`scope_type ∈ {org, subdivision}`)
and is a **draft-only** store. Under variant A it is **not a commit tier at all**, so the earlier
"cache tier checks only org while mapping tiers check subdivision→org" asymmetry **dissolves** —
commit authority comes solely from `sku_mapping` (subdivision→org). VER-022 is thereby closed:
no cache-vs-mapping scope priority conflict can exist on the commit path.

> **T1 / VER-021 (durability gate) — OPEN.** The whole durable-id model assumes `pos_ingredient_id`
> is stable across Esupl edit/delete-recreate. This has **not** been empirically confirmed (requires
> WRITE access to Esupl sandbox team 17957). A runnable probe is in `VER-021_ESUPL_DURABILITY_TEST.md`
> / `scripts/ver021_durability_probe.py`. **Merge stays gated until this table is filled.** If the id
> is not durable on edit → STOP and reopen DEC-0011 on an alternative anchor.

### Migrations (Alembic async)

`alembic/env.py` reads the same `settings.database_url`, sets `target_metadata = Base.metadata`, imports `app.db.models`, uses `compare_type=True`/`compare_server_default=True`, and `include_object` **excludes the `vector` extension** (`EXCLUDE_NAMES={"vector"}`) so autogenerate never drops it.

- **`0001_initial`** — squashed ("consolidated 0001–0004"), `down_revision = None`. Runs `CREATE EXTENSION vector` first, creates all tables; `downgrade()` drops native enum types (`invoice_status`, `role`) but intentionally does not drop the `vector` extension.
- **`0002_org_pos_token`** — added `organizations.esupl_api_token` (encrypted Text) as a per-org POS secret.
- **`0003_integration_credentials`** — creates `integration_credentials`, builds the partial unique index via raw SQL with the sentinel-UUID COALESCE, then **data-migrates existing secrets**: AI keys from `system_settings` (`anthropic_api_key`, `gemini_api_key`) → `platform`-scoped rows, the per-org `esupl_api_token` → `org`-scoped rows (ciphertext copied as-is, not re-encrypted), deletes old `system_settings` keys, drops `organizations.esupl_api_token`. Also adds `refresh_sessions.last_used_at`. Downgrade is best-effort/one-way (does not restore AI keys to `system_settings`).

### Entity-relationship summary

```
organizations 1───* subdivisions 1───* memberships *───1 users (GLOBAL)
organizations 1───* suppliers
organizations 1───* ingredients 1───* packings
subdivisions  0/1─* ingredients          (subdivision_id optional = override)
subdivisions  1───* invoices 1───* invoice_lines
suppliers     1───* invoices
users         1───* refresh_sessions ───0/1 subdivisions (active context, SET NULL)
organizations 0/1─* integration_credentials 0/1─* subdivisions   (nullable org/subdiv FKs)
```

FK delete behavior: tenant-boundary FKs (`organization_id`/`subdivision_id` on operational rows) are **RESTRICT**; parent-child within a tenant are **CASCADE**; `refresh_sessions.active_subdivision_id` is **SET NULL**; `invoices.supplier_id` has no explicit ondelete (defaults to NO ACTION). Esupl/POS integration threads through numeric FK columns (`organizations.esupl_team_id`, `subdivisions.esupl_warehouse_id`, `ingredients.esupl_item_id`/`esupl_unit_id`, `packings.esupl_packing_id`) that feed the `EsuplOutgoingInvoice` payload built at prepare time.

---

## Backend provider abstraction (pluggable OCR / LLM / ERP)

The backend isolates all external-service integrations behind `Protocol` interfaces + a decorator-based registry, and injects shared infra through the process-global `ProviderContext`. The design goal: `services` depend ONLY on `providers/*/base.py`, never on concrete classes; exactly one real implementation per provider today, but seams exist.

### Interfaces (Protocols, not ABCs)

`typing.Protocol` classes decorated `@runtime_checkable` — structural typing, so concrete classes need not inherit anything.

- `providers/ocr/base.py` — `OcrProvider`: `name: str`, `requires_vpn: bool`, and one coroutine `extract_invoice(image_bytes: bytes, mime_type: str) -> InvoiceDraft`.
- `providers/erp/base.py` — `ErpProvider`: `name`, `requires_vpn`, plus `list_suppliers() -> list[SupplierRef]`, `list_ingredients() -> list[IngredientRef]`, `write_invoice(payload: EsuplOutgoingInvoice, api_token: str | None = None) -> str`.
- There is deliberately **no LLM `Protocol`.** The LLM transport is a set of module-level async functions in `providers/ai.py` (`ai_complete`, `claude_complete`, `gemini_complete`). OCR providers are thin adapters that call these functions.

### Registry + selection + instantiation

`providers/base.py` holds `_OCR_REGISTRY` and `_ERP_REGISTRY` (name → class). Registration is via decorators `@register_ocr("claude")`, `@register_ocr("gemini")`, `@register_erp("esupl")`. Lookups `get_ocr_provider(name)`/`get_erp_provider(name)` do zero-arg `cls()` (providers hold no state; they pull infra from `ProviderContext` at call time) and raise a descriptive `ValueError` listing registered names on miss. Because decorators fire on import, `import_providers()` explicitly imports the impl modules; it is called once in lifespan.

**Selection is split across two config planes (easy to get wrong):**

- **ERP provider = static/deploy config from env.** `get_erp()` reads `settings.erp_provider` (env `ERP_PROVIDER`, default `"esupl"`).
- **OCR/AI provider = runtime config from the DB, not env.** `get_ocr()` calls `resolve_ai_provider()`, which reads `system_settings.ai_provider` via the resolver (default `"claude"`). So a superadmin can flip the active OCR provider (and the LLM used) in SQLAdmin at runtime with no redeploy.

### Esupl ERP: read-only vs write, `ERP_WRITE_ENABLED` gating, prepare()→payload

`EsuplErpProvider` (`providers/erp/esupl.py`) is the only ERP implementation, `requires_vpn=False` (Esupl is reachable directly; flipping to True routes it through gluetun). `list_suppliers`/`list_ingredients` are best-effort GETs to `{ESUPL_API_BASE}/suppliers` and `/ingredients` (return `[]` if base unset); the docstring notes suppliers come from seed and the catalog from the local `ingredients` table, so these are off the critical path (and today call `_auth_headers()` with no token).

`write_invoice` gating — the key read-only safety mechanism:
1. Reads `ERP_WRITE_ENABLED` via `resolve_with_context()` (DB `system_settings`, default **False**). While OFF, it logs a warning and returns a synthetic id `esupl-prepared-<number>` **without contacting Esupl** — no silent fake, just a short-circuit before egress.
2. When ON, POSTs the fully-resolved payload to `{ESUPL_API_BASE}/teams/{team_id}/outgoing-invoices` with the per-org bearer token, serializing via `json.loads(payload.model_dump_json())` (correct Decimal/datetime handling), `raise_for_status()`, then extracts `id` (or nested `data.id`). Same code path in both modes — flipping the toggle makes it a real write with zero rewrite.

`prepare()` flow (`services/invoice_service.py`). The 2-step API is `recognize` (OCR only, no persist) → client edits → `submit`; `prepare` is the pure resolution step (also exposed at `POST /api/v1/invoices/prepare` for preview):
- `recognize(image, mime)` delegates to `ocr.extract_invoice` → `InvoiceDraft`.
- `prepare(draft)` returns `PreparedInvoice(draft, payload, warnings, ready)`: supplier via `_resolve_supplier` (explicit `supplier_external_id`, else name/tax-id match through `SupplierService` — tax_id priority then token-Jaccard ≥ 0.5); each line via `_resolve_line` (match `sku` against the local ingredient catalog, fill numeric Esupl FKs `esupl_item_id`/`esupl_unit_id`, pick default packing `esupl_packing_id`, default tax rate; any missing field sets `resolution_note` + a warning and marks the line not-ready); team/warehouse from `Organization.esupl_team_id` and `Subdivision.esupl_warehouse_id`; supplier `external_id` coerced to int. `ready` = all lines ready AND team_id AND warehouse_id AND numeric supplier present. Only then is `EsuplOutgoingInvoice` built.
- `submit(draft)` = `validate_draft` (arithmetic tolerance `Decimal("0.05")`) + `prepare`, then persists a local `Invoice`, sets `InvoiceStatus`, and — if `ERP_WRITE_ENABLED` — resolves the org Esupl token and calls `erp.write_invoice`; exceptions are caught and recorded as `failed` rather than crashing the request. This dual-write (local DB + ERP) is the backend's role as "the invoice write point."

### Failure handling (fail-closed VPN, error mapping)

`providers/http.py` owns egress. `Egress` (built once in lifespan by `build_egress`) holds two long-lived `httpx.AsyncClient`s: `direct_client` and `vpn_client` (through gluetun's `http://gluetun:8888`, or None if unconfigured). `get_client(via_vpn=True)` raises `VpnUnavailableError` if there's no vpn client — **no silent fallback to direct** (non-negotiable). `guard_vpn(via_vpn)` is an async context manager: with `via_vpn=True` it converts transport failures (`httpx.ProxyError`, `ConnectError`, `TimeoutException`) into `VpnUnavailableError`; with `via_vpn=False` it's a no-op.

- **`via_vpn` for AI** is a **runtime toggle**, not the static `requires_vpn` flag (both OCR providers set `requires_vpn=False` because AI routing is dynamic). `ai.py::_resolve_via_vpn` reads it from `AiVpnToggle` (cached, defaults fail-closed True). `claude_complete` passes the chosen client into `AsyncAnthropic(http_client=client, max_retries=0)` and, inside `guard_vpn`, catches the SDK's `anthropic.APIConnectionError`: if `via_vpn` was True it re-raises as `VpnUnavailableError`; if False it re-raises the original. `gemini_complete` (raw REST via egress) wraps everything in `guard_vpn`, re-raises `VpnUnavailableError`, and converts any other failure into `AiUnavailableError` so the client sees a clean 503.
- **Two custom exceptions** map to 503 in `core/errors.py`: `VpnUnavailableError → vpn_unavailable`, `AiUnavailableError → ai_unavailable`. `AiUnavailableError` is also raised when no active AI key exists (missing-config == unavailable, deliberately).
- **ERP write failures** are NOT surfaced as request errors: `submit` catches them and records `status=failed` + `validation_errors`.

---

## Auth & multi-tenancy (mvp.be)

**Two entirely separate authentication mechanisms coexist and must never be mixed** (a `CLAUDE.md` §11 non-negotiable):

1. **Application auth** — real coffee-shop users in the `users` table, **argon2** hashing (`app/auth/password.py`), JWT access + opaque refresh cookies. This is what the React frontend uses. Lives in `app/auth/*`.
2. **SQLAdmin operator login** — a single dev/operator "backdoor" from env vars (`ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`, **bcrypt**), session-cookie based. Lives in `app/core/security.py` + `app/admin/setup.py`. It has **no row in `users`**.

Both `app/auth/password.py` and `app/core/security.py` define `hash_password`/`verify_password` pairs — do not confuse them (argon2 for users, bcrypt for the operator).

### The org/subdivision/user hierarchy

A "Slack-style" identity model: **organization** (the tenant, hard isolation boundary) → **subdivision** (physical location, maps to an Esupl warehouse) → **memberships** (user ↔ subdivision + role). `users` is a global table with no `organization_id`. See the Data Model section for columns.

### Roles

- **`is_superadmin`** — a global boolean flag on `User` (not a role row). God-mode: sees and can switch into any org/subdivision regardless of membership, and is treated as `admin` in every subdivision (`AuthService._role_for`).
- **`Role` enum** currently has a **single value `admin`**, assigned per-subdivision via `Membership.role`. There is no `operator` role in the enum — the two authorization levels are `superadmin` (flag) and `admin` (membership role). No RBAC permission matrix (explicit non-goal). A user with no membership and not superadmin can log in but has **no active context** → tenant data is closed (403 from `get_tenant_context`), and the FE shows "no available subdivisions."

### JWT access + refresh-token flow

Crypto primitives are pure functions in `app/auth/tokens.py`; orchestration in `app/auth/service.py`; cookies in `app/auth/cookies.py`.

- **Access token** — signed JWT (PyJWT, HS256, `settings.jwt_secret`), TTL **15 min**. Payload: `sub`=user_id, `is_superadmin`, `org`=active org id, `sub_div`=active subdivision id, `role` (=`admin` for superadmin), `type="access"`, `iat`, `exp`. Stored in HttpOnly cookie `lcos_access`. Every request resolves authorization from this signed token **statelessly** (no DB lookup) via `decode_access_token → AccessClaims`.
- **Refresh token** — an **opaque** random string (`secrets.token_urlsafe(48)`), NOT a JWT. Only its SHA-256 hash is stored (`RefreshSession.token_hash`). TTL **30 min sliding** (`expires_at` pushed +30 min on each rotation). Stored in HttpOnly cookie `lcos_refresh`.

Routes (`app/auth/router.py`):
- **`POST /auth/login`**: `PasswordAuthProvider.authenticate` → compute default context (`_default_subdivision`) → `_issue` creates a `RefreshSession` with a fresh `family_id`, sets both cookies (and CSRF cookie if enabled). Invalid creds → generic **401** (reason never disclosed).
- **`POST /auth/refresh`**: look up by hash; not found → 401; **if `revoked` → reuse-detected: revoke the entire `family_id` via `revoke_family` and 401**; if expired → 401. Otherwise rotate: mark old revoked, insert new row in the **same `family_id`** with fresh `expires_at` and `last_used_at=now`, reissue access with context restored from `row.active_subdivision_id`.
- **`POST /auth/logout`**: revoke current refresh row, clear cookies, 204.
- **`GET /auth/me`**: returns `{ user, active_context, organizations }`. Regular user → only subdivisions they belong to; **superadmin → the full org/subdivision tree**. This is the **sole data source for the frontend sidebar and active scope**.
- **`POST /auth/switch-context`**: authorize via `_role_for` (403 if no access; 404 only reachable by superadmin, avoiding existence leaks). Fail-closed: switching requires a live, non-revoked, non-expired refresh session (else 401). Updates `refresh_session.active_subdivision_id`, reissues only the access cookie.

Access-token revocation is **not instant** (explicit non-goal) — mitigated by the short 15-min TTL plus refresh revocation.

### Tenant scoping / query enforcement (the security core)

- Request context from `app/auth/dependencies.py`: `get_current_context` verifies the access JWT (401 on missing/invalid/expired); `get_tenant_context` further requires `organization_id` present (403 "no active organization context"); `require_superadmin` gates superadmin-only routes.
- **Tenant repositories require the scope in their constructor** — a tenant query is impossible without a scope, and scope always originates from the signed JWT, never from client input.

### Admin panel (SQLAdmin)

`app/admin/setup.py` mounts SQLAdmin at `/admin`; `AdminAuth` (`core/security.py`) form login checks `authenticate_admin` (username == `settings.admin_username`, bcrypt-verify `settings.admin_password_hash`), stores `admin_authenticated=True` in the Starlette session (`SessionMiddleware`, secret `settings.session_secret`). ModelViews: Organization, Subdivision, User, Membership, Supplier, Invoice, InvoiceLine, SystemSetting, IntegrationCredential, RefreshSession. Notable:
- **`UserAdmin.on_model_change`**: the `password_hash` form field accepts **plaintext** and argon2-hashes it on save (skips if already `$argon2`). This is how operators create real users.
- **`RefreshSessionAdmin`**: read-only (inspection only).
- **`IntegrationCredentialAdmin`**: see the secrets section — encrypts before persist, masks to last-4, enforces single-active.

### Seeded accounts (`app/seed.py`, idempotent, gated on `SEED_DEMO_DATA=true`)

- Organization **"ООО Давай поговорим"** (`esupl_team_id=17957`); Subdivision **"Кофейня Давай поговорим"** (Витебск, `esupl_warehouse_id=1`).
- **`iter` / `iter`** — application **superadmin** (global, no membership).
- **`oter` / `oter`** — application user, **admin** membership on the coffee-shop subdivision.
- Demo suppliers + SKU catalog (`Ingredient` + `Packing`) with Esupl numeric FKs, org-wide (`subdivision_id=NULL`). (Recognition seed adds 3 suppliers + 5 SKUs with 9 packings.)
- Logins are short strings (`iter`, `oter`), not RFC emails — `LoginIn.email` is a plain `str`, not `EmailStr`.
- **`admin` / `admin`** is the separate SQLAdmin operator login (env), intentionally **NOT** seeded into `users`.

---

## Keys, Secrets & Credential Management

This is the primary architectural concern. Configuration is split into **three storage tiers**, each with a distinct owner and precedence rule. This split is a locked decision (config-arch-review).

| Tier | What lives here | Where stored | Who edits | Env fallback? |
|------|-----------------|--------------|-----------|---------------|
| **Deploy config** | provider selection (ERP), URLs, cookie flags, ports, KEK, JWT/session secrets, DB creds | `.env` (bind-mounted as `/app/.env`) → `Settings` (pydantic-settings) | ops (env file) | n/a — this *is* env |
| **Runtime non-secret settings** | AI provider choice, model names, VPN toggle, module toggles, ERP write flag | `system_settings` table | superadmin via SQLAdmin | **NO** (DB → registry default only) |
| **Integration secrets** | AI API keys (Anthropic/Gemini), POS/ERP tokens (Esupl) | `integration_credentials` table, Fernet-encrypted | superadmin via SQLAdmin (or org-admin via `PUT /organizations/{id}/pos-config`) | **NO** (fail-closed → None) |

The guiding rule: AI keys, POS tokens, provider choice, models, and all `MODULE_*`/`ERP_WRITE`/`AI_VPN` toggles are **not in `.env` anymore** — they live only in the DB. `.env` holds only static deploy config plus the master encryption/signing keys.

### Resolution order (the definitive table)

| Item | Source of truth | Resolution order | Fail behavior |
|------|-----------------|------------------|---------------|
| Anthropic (Claude) API key | `integration_credentials` (scope=`platform`, provider=`anthropic`) | active row → decrypt; **no env fallback** | None → `AiUnavailableError` (503) |
| Gemini API key | `integration_credentials` (scope=`platform`, provider=`gemini`) | active row → decrypt; no env | None → `AiUnavailableError` |
| Esupl POS token (per-tenant) | `integration_credentials` (scope=`org`, provider=`esupl`, org_id) | active row → decrypt; no env | None → provider sends unauthenticated → Esupl 401 |
| `ai_provider` (claude/gemini) | `system_settings` | DB value (validated) → registry default `"claude"` | invalid DB value → warning + default |
| `anthropic_model` / `gemini_model` | `system_settings` | DB → default (`claude-opus-4-8` / `gemini-2.0-flash`) | default |
| `ai_vpn_enabled` | `system_settings` (cached via `AiVpnToggle`) | DB → default `True` | fail-closed default ON |
| `module_ocr_enabled`, `module_suppliers_enabled` | `system_settings` | DB → default `True` | default |
| `erp_write_enabled` | `system_settings` | DB → default `False` | default OFF (read-only) |
| KEK (Fernet master key) | `.env` `SECRETS_ENC_KEY` (+ `_KEY_ID`, `_KEYS_OLD`) | env only | empty & non-local → refuse to start |
| `jwt_secret`, `session_secret` | `.env` | env only | weak/default → refuse to start |
| `admin_password_hash`, `admin_username` | `.env` (bcrypt hash) | env only | — |
| DB password | `.env` `DATABASE_URL` | env only | — |

**Key contrast:** `system_settings` and `integration_credentials` have **no env fallback** by design (stated in `effective_config.py` "БЕЗ ФОЛБЭКА НА ENV" and `credentials.py` "без env-фолбэка"). Only `Settings` (deploy config) reads env.

### Encryption scheme (envelope encryption with KEK versioning, `enc:v2`)

Implemented in `app/core/secrets.py`. Secret values are encrypted at rest with **Fernet** (AES-128-CBC + HMAC). The Fernet master keys (KEKs) live in `.env`, never in the DB — a DB dump alone is useless.

**Storage formats** (a prefix keeps operations idempotent and backward-compatible):
- `enc:v2:<key_id>:<token>` — **current format**. The `key_id` records which keyring entry encrypted it, enabling rotation.
- `enc:v1:<token>` — legacy (no key_id); decrypted by trying every key in the ring.
- No prefix → treated as plaintext / passthrough (dev fallback or unencrypted legacy).

**Keyring** (from `Settings.secrets_keyring`):
- `SECRETS_ENC_KEY` = primary key (encrypts all new values), stamped with `SECRETS_ENC_KEY_ID` (default `"v1"`).
- `SECRETS_ENC_KEYS_OLD` = retired keys, decrypt-only, format `"kid1:key1,kid2:key2"`.
- Ring order: primary first, then retired. `_primary()` returns ring[0]; `_keyring()` builds `{key_id: Fernet}` (`@lru_cache`d, `cache_clear()` in tests/rotation).

**Functions:**
- `encrypt(value)` — encrypts with primary → `enc:v2:<kid>:...`. Idempotent (skips already-`enc:*`). Empty keyring → logs warning, stores **plaintext** (deliberate dev fallback).
- `decrypt(value)` — passthrough if no `enc:` prefix. `enc:v2` uses the exact key by `key_id`, falling back to the whole ring; `enc:v1` tries the whole ring. Ciphertext present but keyring empty → raises `RuntimeError` (explicit, not silent garbage).
- `validate_keyring()` — eager startup validation; malformed Fernet key raises `RuntimeError` immediately.

**Rotation:** promote a new key to `SECRETS_ENC_KEY` with a new `SECRETS_ENC_KEY_ID`, move the old key into `SECRETS_ENC_KEYS_OLD`. New writes get the new key_id; old ciphertexts remain readable.

### Typed registry + resolver (non-secret settings)

Two-file pattern:
- **Registry** (`core/system_settings.py`): `REGISTRY` is a tuple of frozen `SettingSpec(key, type, label, default, choices)` — the single whitelist of allowed keys, types (`TYPE_BOOL`/`TYPE_ENUM`/`TYPE_STR`), and hardcoded defaults. `SETTING_TYPES` feeds the SQLAdmin dropdown so keys are chosen, not free-typed. **No secrets here.**
- **Resolver** (`core/effective_config.py`): `resolve(session, key) → Resolved(key, value, source, valid)`. Fetches the raw DB value, type-coerces via `_parse_db()`; invalid DB value → logs warning + falls back to `spec.default` (never propagates garbage). Helpers: `resolve_bool`, `resolve_all`, `resolve_with_context` (opens its own session via the provider context). Precedence strictly **DB (validated) → registry default**, no env.

### How secrets reach providers at runtime (no caching for secrets)

`credentials.py::get_active_credential(session, provider, scope, org_id, subdivision_id)` selects the single `is_active=True` `IntegrationCredential.encrypted_value` for the (scope, provider, org, subdivision) tuple and returns `decrypt(...)` or `None`. It reads + decrypts on **every call, no cache** (comment "БЕЗ КЭША") so admin rotation takes effect instantly.

- **AI providers** (`providers/ai.py`): `_key_and_model()` opens a provider-context session, calls `get_active_credential(scope=platform)` for the key and `resolve(model_key)` for the model. `claude_complete`/`gemini_complete` fail hard with `AiUnavailableError` if the key is `None`. Key passed to `AsyncAnthropic(api_key=...)` or as a `?key=` query param for Gemini.
- **ERP/POS** (`services/invoice_service.py`): only when `resolve_bool(ERP_WRITE_ENABLED)` is true does it call `get_active_credential(scope=org, provider=esupl, org_id=...)` and pass into `erp.write_invoice(payload, api_token=...)`. `EsuplErpProvider._auth_headers(api_token)` sets `Authorization: Bearer <token>` only if present; absent → no auth header → Esupl 401. `Organization.esupl_team_id`/`Subdivision.esupl_warehouse_id` are **non-secret** ID columns; the token is the only Esupl secret.
- **Write path (SQLAdmin)** `IntegrationCredentialAdmin.on_model_change`: takes plaintext input, calls `encrypt()` before persist (idempotent), sets `rotated_at`, and enforces the single-active invariant by deactivating other active rows of the same (scope, provider, org, subdivision) before insert. Lists/detail mask the value to the last 4 chars via `_cred_last4`. The field is write-only plaintext, read-masked.
- **Org-admin POS path** (`routes/organizations.py`): `PUT /organizations/{org_id}/pos-config` — `_authorize()` requires superadmin OR admin of that org; `encrypt(submitted)` then inserts a new active `IntegrationCredential` (scope=org, provider=esupl) after deactivating the current active one. `GET` returns `PosConfigOut { esupl_team_id, esupl_api_token: {is_set, last4} }` — never the plaintext.

### JWT / password / session secrets (recap)

- App auth JWT access (15 min, HS256, `jwt_secret`); refresh opaque, only SHA-256 hash stored, sliding 30 min with `family_id` rotation/reuse-detection.
- App passwords: `users.password_hash` via **argon2**. SQLAdmin operator: env `ADMIN_USERNAME` + bcrypt `ADMIN_PASSWORD_HASH`, verified via `bcrypt.checkpw`.

### What is fail-closed (backend)

- **Startup guard** (`main.py::_ensure_strong_secrets`, in lifespan): refuses to boot if `SESSION_SECRET`/`JWT_SECRET` are empty or well-known defaults (`change_me`, `secret`, ...); requires `SECRETS_ENC_KEY` when `APP_ENV != "local"`; calls `validate_keyring()`.
- Missing AI key → `AiUnavailableError`. Missing Esupl token → unauthenticated → 401. VPN tunnel failure (when on) → `VpnUnavailableError`, never silent direct egress. `erp_write_enabled` defaults False. Ciphertext with no keyring → `RuntimeError`. Single-active credential invariant enforced by partial unique index.

### Secret redaction in logs

`core/logging.py::redact()` fully masks `admin_password_hash`, `session_secret`, `jwt_secret`, `secrets_enc_key`, `secrets_enc_keys_old`, and masks the password inside `database_url`. AI keys/POS tokens no longer live in `Settings`, so they can't leak via a settings snapshot dump.

### Frontend side: no secrets in the browser

The FE deliberately holds **no secrets**. The design comment in `shared/config/settingsStorage.ts` states it directly: "POS credentials are NOT here: they live on the backend (per-org, encrypted)."

- **Auth tokens: none in JS.** `backendRequest()` sends `credentials: 'include'`; access + refresh are HttpOnly cookies. Transparent refresh-once on 401 (except `/auth/refresh` and `/auth/login`), then replay.
- **Env vars are `VITE_*` only and non-secret** (endpoints + provider selection) — see DevOps section. There is no `VITE_ANTHROPIC_API_KEY`, no ERP token env var.
- **localStorage holds only non-secret UI prefs / best-effort caches**, tenant-scoped by `orgScopeToken()` (see Cross-cutting → multi-tenancy). The Settings page lets an org-admin set the Esupl `team_id` + token, but the token is **write-only** (password field, POSTed, never read back; UI shows only `is_set` + `last4`, e.g. "Токен задан (…9999)").

---

## UI Flow / User Journey (mvp.fe)

The React + FSD frontend. All UI text is Russian. Mobile-first PWA for a shop owner: photograph a supplier invoice, let OCR read it, confirm recognized lines against the POS catalog, push to Esupl as a supply order.

### 0. Routing & auth guard (`app/App.tsx`, `app/AuthGuard.tsx`)

Routes via `createBrowserRouter`: `/login` → `LoginPage` (public); everything else wrapped in `<AuthGuard>` → `<AppLayout>`: `/` redirects to `/invoices`; `/invoices`, `/invoices/new`, `/settings`. Pages are `React.lazy()` chunks rendered inside a `<Suspense>` in `AppLayout`. `AuthGuard` calls `useMeQuery()` (`GET /auth/me`); loading → spinner; `isError` → `<Navigate to="/login" replace>`; else `<Outlet/>`. The transport silently refreshes the access cookie on 401, so a genuine `isError` truly means no session.

### 1. Login (`pages/login/ui/LoginPage.tsx`)

Centered card ("Local**OS** / Вход в систему"), Логин + Пароль + "Войти". `onSubmit` → `useLoginMutation()`; on error shows "Неверный логин или пароль"; on success `navigate('/', {replace:true})` → redirects to `/invoices`.

### 2. App shell (`widgets/app-layout/ui/AppLayout.tsx`)

Responsive, driven by `MobileNavProvider`/`useMobileNav`. Desktop (md+): sticky 230px left sidebar (brand, `NavLink`s "Накладные"/"Настройки", `ContextSwitcher` over `UserMenu`). Mobile (<md): sticky top bar + fixed bottom tab bar (same two items). The bottom tab bar is **hidden when `useMobileNav().hidden`** — the workbench claims the thumb zone with its own action bar (set via `useHideMobileTabBar()`).

### 3. Invoices list (`pages/invoices-list/ui/InvoicesListPage.tsx`)

Landing screen. Header "Накладные из {posLabel}" + primary "Новая накладная" → `/invoices/new`. Data via `useGetOrdersQuery({page})` (paginated `PosOrder[]`). Desktop table (`OrderRow`: Дата поставки, Создана, № накладной with copy-to-clipboard, Поставщик, Сумма+currency, Проведение via `SubmittedBadge`, Оплата via `PaidBadge`). Mobile: stacked `OrderCard`s. `Pagination` drives `setPage`. **Read-only view of orders already in the POS** — the only forward action is "Новая накладная."

### 4. Invoice import — the two-step wizard (`pages/invoice-import/ui/InvoiceImportPage.tsx`)

The core "photo-first" flow. Exactly **two real screens** (`WizardStep = 'prepare' | 'review'`); recognition is a transient in-flight state, not a third step. State lives in the Redux `invoiceSession` slice, which outlives the page component (so leaving mid-recognition is handled explicitly). A `Stepper` shows "Фото накладной" / "Проверка и отправка"; while recognizing, step 1 is done and step 2 pulses "Распознавание…". Body switches: `recognizing` → `<OcrProgress>`; `step==='review'` → `<InvoiceWorkbench>`; else `<PrepareStep>` (with `OcrErrorBanner` if a prior recognition failed).

**Why "photo-first":** the supplier is NOT chosen up front — OCR reads the supplier name off the photo and the app resolves it against the cached supplier list afterwards (`useGetSuppliersQuery()` is warmed here).

### 5. Step 1 — Prepare / capture (`widgets/prepare-step/ui/PrepareStep.tsx`)

One `StepCard`: **Document type** picker (`INVOICE_TYPES`: paper vs electronic → `invoiceTypeChanged`; steers the OCR prompt AND which identity field is required — waybill blank vs document number; default paper). **Photo upload** dashed drop zone (JPG/PNG/PDF, up to `MAX_INVOICE_PAGES=3`); invalid types/over-limit → toasts. PDFs are held immediately (can't crop); images open the `ImageCropper` one at a time. Held page binaries live out-of-Redux in `fileHolder`; only metadata (`{name,size,type}`) goes into Redux via `filesAttached`. Primary "Распознать →" enabled once `files.length>0 && !cropperOpen`.

**Image cropper** (`features/image-cropper/ui/ImageCropper.tsx`): full-screen modal, 90° rotate, draggable/resizable crop (Pointer Events → touch+mouse), "Весь кадр" reset, Esc to cancel. On confirm runs `cropImage(file, crop, rot)` — "В провайдер уйдёт только выделенная область." Re-crop uses `replaceHeldFileAt` + `fileReplacedAt` (bumps `filesRevision` so viewers re-read binaries even at equal byte count).

### 6. Recognition (transient) — `startRecognition` + `OcrProgress`

`startRecognition`: guards empty/re-entry, clears `ocrError`, fires `useRecognizeInvoiceMutation()` → `recognizeInvoice`. This reads held binaries, converts via `fileToOcrPage`, resolves the OCR provider from `ocrConfig$` at call time (backend/mock), and sends one multimodal request through `provider.extractInvoice(pages, {supplierName, invoiceType, signal})`. `api.signal` is wired so leaving the page aborts (`useEffect(() => () => inFlight.current?.abort(), [])`), preventing a late resolution from shoving the wizard to "review" behind the user.

On success it **auto-resolves the supplier**: `bestNameMatch(result.header.supplierName, suppliers)`; `supplierUncertain = !match || match.score < SUPPLIER_CONFIDENT_SCORE (0.6)`. It loads saved mappings (`loadMappingsForSupplier`) and dispatches `ocrCompleted({result, mappings, supplier, supplierUncertain})`. On failure sets `ocrError` (persistent retry banner); on abort stays silent.

`OcrProgress` is an honest spinner (single provider request, no fake staged checklist): "{N} листов обрабатываются через {provider label}. Обычно 10–30 секунд" + "Отменить".

**`ocrCompleted` reducer:** commits `supplier` + `supplierUncertain`, sets `header`, maps `result.lines` into working `InvoiceLine`s (ids `L0..Ln`). Per line it looks up a saved mapping by `mappingKey(supplierId, rawName)`; found → `skuId`/`packing` prefilled, `mappingState:'auto'`; else `skuId:null`, `mappingState:'none'`. Sets `step:'review'`. (Supplier is committed HERE, in the same dispatch that reads its id, because in photo-first the supplier is only known post-OCR — otherwise the learning loop matches nothing.)

### 7. Step 2 — Workbench (`widgets/invoice-workbench/ui/InvoiceWorkbench.tsx`)

The review/edit screen. Calls `useHideMobileTabBar()`. Loads reference data via RTK Query: `useGetSkusQuery`, `useGetSupplierProductIdsQuery(supplier.id)`, `useGetWarehousesQuery`, `useGetUnitsQuery`, `useGetSuppliersQuery`.

**Header bar (editable):** Поставщик `<select>` (⚠ warn style + tooltip when `supplierUncertain`; changing → `supplierReassigned({supplier, mappings})` which re-applies the new supplier's saved mappings to untouched lines — the learning loop re-runs against the correction). Дата, Склад (`onWarehouseChange`, persisted to `localStorage['localos.lastWarehouseId']`, auto-picked if exactly one), and — per `invoiceType` — either Накладная (waybill series+number, uppercase series, format check) or № документа; plus Итог + currency. All header edits → `headerFieldChanged`.

**Auto-AI-suggest:** `autoSuggested` ref runs once per session — as soon as the SKU catalog loads, if any line is unmapped it auto-runs `onSuggest()` so the owner arrives at a pre-matched list. The explicit "✨ Подобрать товары (N)" button remains for manual re-runs. `onSuggest` → `useSuggestMatchesMutation` → `suggestMatches`, which builds a reduced candidate set (`buildMatchCandidates`: supplier's own products + top fuzzy matches per line via `rankSkus`) and asks the LLM (`getMatchProvider(ocrConfig$)`) in one batch. Suggestions with `confidence >= APPLY_THRESHOLD (0.6)` are applied as **unsaved** picks via `lineSkuPicked` (auto-substituting the SKU's `defaultPacking`); weaker ones left for manual choice.

**Validation panel:** single source of truth `validateInvoice(supplier, header, lines, invoiceType, {warehouseId})` (`entities/invoice/model/validate.ts`), recomputed every render via `useMemo` → `Issue[]` with severity `block` (red ⛔, forbids send) or `warn` (amber ⚠). Empty → green "✓ Всё проверено — можно отправлять". Clicking an issue routes attention (scroll+focus a header input via `HEADER_FIELD_IDS`, or `activeLineSet` + `photoToggled(true)` to reveal the row on the photo). Blockers: no supplier, no warehouse, no header, missing date, `total <= 0`, zero lines, no line mapped to any SKU. Warnings: odd/future date, waybill format, doc-number missing, Σ(line sums) vs printed total mismatch, per-line qty×price ≠ sum, low-confidence rows.

### 8. Lines editing + per-line arithmetic verify (`features/lines-table`, `features/photo-viewer`)

Desktop `LinesTable`/`LineRow` (dense 10-col; "База (расчёт)" column hides on tablet); mobile `LineCard`s; shared logic in `lib/useLine.ts`. Editable per line: rawName, qty, unit, packing, unitPrice, sum → each dispatches `lineFieldChanged`; editing packing on a saved/auto line → `packingDiverged` (marks `unsaved`).

**Per-line arithmetic verify:** `lineSumMismatch(line)` flags qty×unitPrice not reconciling with the printed sum (tolerance `max(0.5, sum*1%)`) — the most reliable OCR-error signal, needs no provider support. Mismatched rows get warn styling and feed the validation panel. `useLine` also surfaces `confWarn` (low OCR confidence via `isLowConfidence`).

**SKU mapping:** `SkuSelect` dropdown (grouped, supplier's products prioritized via `supplierProductIds`); picking → `lineSkuPicked` (`mappingState:'unsaved'`, auto-fills default packing). Inline fuzzy "подсказки" + per-line "✨ найти SKU" (`onSuggestLine → suggestForLines([line])`). Status badge "✓ товар"/"⚠ нет товара". "Создание нового ингредиента" is a stub toast (never creates POS items). "Добавить строку" (`lineAdded`) / "✕" (`lineRemoved`) for manual rows.

**Photo viewer:** the verify-against-photo panel. Desktop split (photo ~30% top, table ~70% below). Mobile: photo and table **swap** (toggled via the bottom action bar). With real held binaries it shows the actual photo/PDF with page tabs + zoom and, for raster pages with bbox coords, clickable region overlays synced to `activeLineId`. No binary (demo/reload) → reconstructed "paper" (`MockPaper`) with row-aligned boxes.

**Footer / action bar:** desktop footer "{mapped} готовы к отправке" / "{none} без товара (пропуск)" + primary "Отправить в {posLabel} →" (disabled while `sending` or `blockers > 0`). Mobile: fixed bottom contextual action bar (photo toggle, ✓/⚠ counts, send CTA). "↺ Новая" resets the session.

### 9. Send / discard confirm + send to ERP

Both use `shared/ui/ConfirmDialog`. **Send confirm** lists Поставщик, Склад, Итог, "Будет отправлено строк" (mapped), "Пропущено без товара" (none), plus a note that picked products will be remembered. **Discard confirm** only shows when `manualPicks` (lines with `mappingState:'unsaved'`) > 0, else resets immediately → `sessionReset()` (a store listener drops held binaries).

**`onSend`** → `useSendInvoiceMutation()` → `sendInvoice`: resolves the POS provider from `posConfig$`, computes `invoiceIdentity(header, invoiceType)` + idempotency key `sentInvoiceKey(provider.scopeId, identity)`; if `wasInvoiceSent` refuses a duplicate. Otherwise `prepareInvoice(...)` builds a provider-agnostic `PreparedInvoice` (**lines without an SKU are dropped — new ingredients are never created**), then `provider.sendInvoice(prepared)` writes to the POS and `markInvoiceSent` records it. Real writes are gated server-side by `ERP_WRITE_ENABLED`. After success, `onSend` **persists every mapped line's mapping** (`saveMapping(supplier.id, l.rawName, {skuId, packing})`) — confirming the invoice IS confirming its matches (the separate per-row save ritual was removed). Result toast reflects the real backend outcome: `written` ("Записано в {POS}"), `prepared` ("Подготовлено… запись в POS отключена"), `validated` ("Сохранено, но не готово"), else "Отправлено".

### State-transition summary

```
prepare (attach + crop photos, pick type)
  → [recognizing: recognizeInvoice in-flight, abortable]
  → ocrCompleted (set header/lines + auto-resolve supplier + apply saved mappings)
  → review (auto-AI-suggest fills unmapped lines; edit header/lines; arithmetic + validation; verify vs photo)
  → send-confirm → sendInvoice (dedupe → prepare → POS write) → persist mappings + result toast
sessionReset (↺ Новая / discard) returns to prepare. Mobile tab bar stays hidden throughout the workbench.
```

---

## Frontend architecture internals (mvp.fe)

### Stack & conventions

React 18 (StrictMode, `createRoot`), Redux Toolkit + RTK Query, react-router-dom v6, RxJS 7 (BehaviorSubjects + a store→stream observer), Tailwind v4 (no config file), lucide-react icons, Vite 6 + TypeScript 5.7 + vite-plugin-pwa. **No react-query** (100% RTK Query), **no forms library**, and **no ESLint/dependency-cruiser config** — FSD import rules are enforced by **convention + code review**, not tooling. Path alias `@/* → src/*`. TS is `strict`, `moduleResolution: bundler`, `noEmit` (Vite emits).

### Bootstrap (`src/main.tsx`)

1. `startConfigSync(store)` — wires the RxJS observer layer **before** first render.
2. Renders `<StrictMode><Provider store={store}><App/></Provider></StrictMode>`.
3. `App.tsx` mounts `<RouterProvider>` + global `<Toaster/>`.

### The Redux store (`app/store/index.ts`)

`configureStore` with three reducers: `[baseApi.reducerPath]` (RTK Query cache, key `'api'`), `invoiceSession` (the wizard slice), `settings` (the user overlay). Middleware prepends a `createListenerMiddleware` instance (`fileSync`) then concats `baseApi.middleware`. The `fileSync` listener listens for `sessionReset`/`fileRemovedAt` and mutates the out-of-Redux `fileHolder` so binaries stay index-aligned with session metadata — the pattern for keeping non-serializable `File` objects out of Redux.

Typed hooks (`shared/lib/store.ts`): `useAppDispatch`/`useAppSelector` via `withTypes`. This file (and `entities/settings/model/selectors.ts`) is the **one sanctioned FSD exception**: a *type-only* `import type { AppDispatch, RootState } from '@/app/store'` — erased at compile time, so no runtime upward dependency.

### RTK Query — one baseApi, injected endpoints, `queryFn` everywhere

`baseApi.ts` creates the API with `fakeBaseQuery<{message:string}>()` and empty endpoints; `tagTypes: ['Supplier','Sku','Invoice','Order','Me','Ingredient','PosConfig']`. Every entity/feature calls `baseApi.injectEndpoints(...)`. The base query is a **stub**; each endpoint supplies its own `queryFn` that either calls `backendRequest` (real HTTP) or a **provider** (OCR/match/POS) resolved at call time from an RxJS BehaviorSubject.

`shared/api/queryFn.ts` centralizes the result contract (`{data}` | `{error:{message}}`) with three wrappers so endpoints stay one line: `backendQueryFn` (fallback `'Запрос к бэкенду не выполнен'`), `aiQueryFn` (maps cancellation to an `'AbortError'` sentinel callers swallow), `posQueryFn`.

`backendRequest.ts` is the real transport: `fetch` with `credentials:'include'` (HttpOnly cookies, no tokens in JS); on 401 (except `/auth/refresh` and `/auth/login`) it POSTs `/auth/refresh` once and replays; throws `BackendError(message,status,code)` (reads `data.error.{message,code}`) on non-ok; 204 → `undefined`. Base URL `BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL ?? 'http://localhost:8000/api/v1'`. This is the *only* auth "interceptor" — no axios/RTK middleware layer.

### The RxJS observer / config-sync layer (`app/observers/configSync.ts`)

The app's most distinctive piece — the single reactive place reconciling the settings SSOT, tenant scope, provider config, localStorage, the data cache, and other tabs. `startConfigSync(store)` uses `fromStore(store)` (Redux → hot `Observable<RootState>`) and wires:
- **(1)** settings overlay → `persistOverlay` (localStorage), de-duped by JSON equality.
- **(2)** `selectOcrConfig` → `ocrConfig$` BehaviorSubject.
- **(2b)** `selectPosConfig` → `posConfig$`.
- **(2d)** active tenant scope from `authApi.endpoints.me.select()` → `activeScope$` (`{organizationId, subdivisionId}` or `EMPTY_SCOPE`, deduped).
- **(3)** on any POS-config *change* (`skip(1)`) → `store.dispatch(baseApi.util.resetApiState())` to refetch from the newly selected provider.
- **(4)** cross-tab: `fromEvent(window,'storage')` filtered by `STORAGE_PREFIX` (`localos.`) → `overlayHydrated(loadOverlay())`.

**Why BehaviorSubjects instead of reading Redux directly:** provider selection must be resolvable in non-React, at-call-time code (the `queryFn`s and storage helpers), so provider config and `activeScope` are mirrored into `ocrConfig$` / `posConfig$` / `activeScope$`. This decouples provider factories from React/Redux and lets a settings change take effect on the next call with no component re-wiring.

### Key domain slice: `entities/invoice/model/sessionSlice.ts`

`invoiceSession` holds the entire photo-first wizard: `step`, resolved `supplier` + `supplierUncertain`, `invoiceType`, `files` (metadata only, ≤ `MAX_INVOICE_PAGES=3`) + `filesRevision`, `header`, `lines[]`, `activeLineId`, `photoVisible`, `zoom`. Notable reducers: `ocrCompleted` (the learning loop), `supplierReassigned`, and the per-line mapping-state machine (`none`/`auto`/`unsaved`/`saved`).

### PWA / build (`vite.config.ts`)

`VitePWA({registerType:'autoUpdate'})` with a Russian manifest ("LocalOS · Приёмка накладных", `lang:'ru'`, `display:'standalone'`, `orientation:'portrait'`, `theme_color:'#2f6df0'`, icons 192/512 + maskable 512), workbox precache of the app shell (`**/*.{js,css,html,svg,png,woff2}`), `navigateFallback:'/index.html'`, `cleanupOutdatedCaches`, `clientsClaim`; SW disabled in dev (`devOptions.enabled:false`). `manualChunks.vendor` splits React/react-dom/react-router/RTK/react-redux into a long-lived chunk; pages already route-split via `React.lazy`. Icons generated by a custom script (sharp is broken on Windows).

---

## Frontend integration modules (shared/ocr, match, pos, llm, api)

These `shared/` modules are the FE's integration boundary. Each of OCR, POS, and Match follows the **identical provider pattern**: a canonical `types.ts`, a `provider.ts` interface + error classes, a `providers/` folder with `backend` and `mock` implementations, a `config.ts` deriving the effective provider from the Redux settings overlay, and a `factory.ts` mapping config → provider instance. Entity RTK Query endpoints stay one line thick and call through the factory-resolved provider.

**The single most important fact (overrides older docs/memory): NO AI call goes browser-direct anymore.** All LLM work (OCR + matching) and all ERP/POS work run **on the LocalOS backend**, which holds the keys/tokens. The browser never sees a secret. The only two real choices left are `backend` (real) and `mock` (offline demo), both driven by one `mockData` settings toggle. Several files carry stale comments and dead exports referencing the old "mock / Gemini / Claude" browser-direct era — vestigial, not active.

### Two-axis provider model (both collapsed to backend|mock)

- **OCR/AI axis** — `ocrConfig$` (from `computeOcrConfig`). Governs OCR **and** matching (matching deliberately reuses the OCR provider choice — `MatchProviderId = OcrProviderId`).
- **POS/ERP axis** — `posConfig$` (from `computePosConfig`). Governs suppliers/SKUs/orders/warehouses/units/send.

Both computed from `SettingsOverlay.mockData === 'true'`, so one demo toggle flips everything to mock at once.

### shared/ocr — invoice recognition

`OcrProvider.extractInvoice(pages: OcrPage[], ctx?) => Promise<OcrResult>`; `OcrProviderId = 'mock' | 'backend'`. `factory.getOcrProvider(config)`: `'mock' → MockOcrProvider` else `BackendOcrProvider`. `config.computeOcrConfig(overlay)` = `{provider: overlay.mockData==='true' ? 'mock' : OCR_ENV_DEFAULTS.provider}` (`VITE_OCR_PROVIDER` if valid else `'backend'`).

- **`providers/backend.ts`** sends **one** page (`pages[0]`) via `FormData` (`base64ToBlob`) to `POST /invoices/recognize`; the backend calls the LLM. Maps the returned `BackendInvoiceDraft` (snake_case, mirrors backend `InvoiceDraft`) onto canonical `OcrResult`, slicing `issued_at` to a date, setting every line `confidence:1`. **Multi-page is not yet supported server-side — extra pages are ignored.**
- **`providers/mock.ts`** resolves `MOCK_OCR_RESULT` after 2600ms; wires `ctx.signal` to reject with `AbortError`.
- **`preprocess/normalizeImage`** — client image prep before upload: EXIF-correct, downscale so longest edge ≤ `MAX_LONG_EDGE=1568` (Claude's native limit), single JPEG re-encode at `JPEG_QUALITY=0.88`, **fail-open** (any error returns the original). Deliberately **no** binarize/threshold/grayscale (hurts vision-LLMs).
- **`invoiceType.ts`** — `InvoiceType='paper'|'electronic'`; each spec carries an `identifier` (`waybillBlank` vs `documentNumber`) and `promptNote`. **`rules.ts`** — field rules SSOT (waybillSeries = 2 uppercase letters, waybillNumber = 7 digits; `totalRow` prefixes to drop ИТОГО/НДС rows).
- **DEAD CODE:** `prompt.ts` (`buildOcrPrompt`) and `parse.ts` (`parseOcrResult`) are browser-direct legacy (backend now builds its own prompt/JSON). Still exported from `index.ts` but no live consumer. Note `waybillSeries.isValid`/`isWaybillIdValid` and `totalRow` from `rules.ts` ARE still used by the live workbench/validator, so the file can't be deleted wholesale.

### shared/match — hybrid SKU matching (fuzzy layer 1 + backend AI layer 2)

`MatchProvider.suggestMatches(req, ctx?) => Promise<MatchSuggestion[]>`. `getMatchProvider(config: OcrConfig)` (takes OcrConfig — no separate matching setting).

- **`providers/backend.ts`** — real AI matching via `POST /invoices/suggest-matches`. Sends only `{lines:[{line_no, description}]}` — **caller-built candidates are ignored** (the backend re-sources from `/ingredients`). Correlates by `line_no`, takes `candidates[0]` per line.
- **`providers/mock.ts`** — offline, no LLM, pure local fuzzy via `rankSkus`.
- **`fuzzy.ts` — the local ranker (layer 1).** `rankSkus(rawName, skus, supplierProductIds?, opts?)` blends **50% Jaccard** (token-set overlap; drops `NOISE_TOKENS` like кг/л/шт and pure numbers) **+ 50% Dice** (character-trigram similarity), plus `SUPPLIER_BONUS=0.08` for the supplier's own products. `MIN_MATCH_SCORE=0.34` floor for user-facing suggestions (lower floor 0.15 to gather AI candidates). Uses `canonicalText` from `shared/lib/format`. Also exports `bestNameMatch(query, items, minScore)` — auto-resolves the OCR'd supplier name against the POS supplier list (photo-first flow).
- In `invoicesApi.ts`, `suggestMatches` builds a **reduced** candidate set (`buildMatchCandidates` = supplier's own products + top `AI_CANDIDATES_PER_LINE=6` fuzzy matches per line, floor `AI_CANDIDATE_MIN_SCORE=0.15`) — but since the backend ignores it, this only matters for the mock provider.
- **DEAD CODE:** `match/prompt.ts` + `match/parse.ts` (browser-direct legacy), no live consumer.

### shared/pos — POS/ERP data layer + duplicate-send guard

`PosProvider` (widest interface): `listSuppliers`, `listSkus`, `listSupplierProductIds`, `listOrders`, `listWarehouses`, `listUnits`, `sendInvoice`, plus `scopeId`, `id`/`label`. `PosProviderId = 'backend'|'mock'`.

- **`config.ts`** — `effectivePosProvider(config) = config.useMock ? 'mock' : config.provider`. `computePosConfig` fixes `provider` at **build time** (`VITE_POS_PROVIDER` else `'backend'`) — the browser cannot pick a real provider; only the demo toggle can force mock. `ORDERS_PER_PAGE=10`.
- **`providers/backend.ts`** — real ERP path via the LocalOS backend. Maps snake_case: `listSuppliers` ← `GET /suppliers`, `listSkus` ← `GET /ingredients` (incl. `packings[]`), `listOrders` ← `GET /invoices` (`is_submitted = status==='written'`), `listWarehouses` returns one synthetic `DEFAULT_WAREHOUSE` (resolution is server-side), `listUnits` returns `[]`, `listSupplierProductIds` returns `[]`. `sendInvoice` builds a snake_case draft, `POST /invoices`; throws on `status==='rejected'` or `'failed'`; returns `SendResult` with `status` + `warnings`.
- **`sentRegistry.ts` — the duplicate-send guard.** localStorage ledger under `localos.sentInvoices` (a `Set<string>`). `sentInvoiceKey(teamId, invoiceNumber)` = `${orgScopeToken()}::${teamId}::${normalizedNumber}` (empty number → `null`). Scoped by active org so two tenants sharing an invoice number can't block each other. Intentionally per-browser best-effort (stops accidental double-taps, not a determined cross-device retry); storage failure degrades to no-guard. `SendResult.status`: `'written'` (posted), `'prepared'` (resolved+validated but write gated off), `'validated'` (persisted, not POS-ready).

### shared/llm — vestigial vendor abstraction

Intended as a vendor-agnostic transport (`LlmVendor.complete(apiKey, req, signal)`, `LlmCompletion`, `LlmImage`, `LlmError`). **In the current codebase it is not used** — there are **no concrete vendor files**, and `index.ts` exports **only** `stripCodeFence, clamp01, parseJsonSafe` from `parse.ts`. Those two parse helpers are the only live use, consumed by `shared/ocr/parse.ts` and `shared/match/parse.ts` — both themselves dead. The whole module survives the browser-direct-LLM removal as a stub.

### Definitive "which call goes where" table

| Concern | Real path (`backend`) | Demo path (`mock`) | Secrets in browser? |
|---|---|---|---|
| OCR recognition | `POST /invoices/recognize` (multipart) → backend calls LLM | `MOCK_OCR_RESULT` after 2.6s | No |
| SKU matching (AI) | `POST /invoices/suggest-matches` → backend calls LLM | local `rankSkus` fuzzy | No |
| SKU matching (fuzzy) | always client-side (`fuzzy.ts`, layer 1 + candidate pre-filter) | same | No |
| Suppliers/SKUs/orders/warehouses/units | `GET /suppliers`, `/ingredients`, `/invoices`, etc. | `mockData.ts` | No (ERP token server-side) |
| Send invoice | `POST /invoices` | log + `{orderId:0}` | No |
| Auth | `/auth/{me,login,logout,refresh,switch-context}` (cookie-based) | — | No (HttpOnly cookies) |

---

## Cross-cutting concerns

### Multi-tenancy scoping (backend + frontend)

- **Backend hard boundary:** `organization_id` is denormalized onto every operational/catalog row (`suppliers`, `invoices`, `invoice_lines`, `ingredients`, `packings`) with `ondelete=RESTRICT`; `invoices`/`invoice_lines` also carry `subdivision_id`. `users` is the sole global table. Tenant repositories **require `organization_id` in their constructor**, so a tenant query is structurally impossible without a scope. Scope originates from the signed access-JWT (`org`, `sub_div` claims) resolved by `get_tenant_context`, never from client input.
- **Frontend projection:** the active scope is **derived from the `/auth/me` query cache** (backend is authoritative). `configSync` pushes `active_context` into the RxJS `activeScope$` BehaviorSubject; `orgScopeToken()` returns the org id (`'noorg'` pre-auth). Per-browser stores are keyed by it to prevent cross-tenant leakage: learned SKU mappings (`mappingStorage.ts`, key `${effectivePosProvider}::${orgScopeToken()}::${supplierId}::${normalizedName}` under `localos.skuMappings.v5` — the v5 bump added the org segment for hard isolation) and the duplicate-send ledger (`sentRegistry.ts`, `localos.sentInvoices`). Login/logout/switch invalidate `['Me','Invoice','Supplier','Ingredient']` caches so tenant data refetches on scope change. (Exception: `localos.lastWarehouseId` is not org-scoped — a low-risk UI default.)

### Provider extensibility

- **Backend:** OCR/ERP behind `@runtime_checkable` `Protocol`s + decorator registry (`@register_ocr`/`@register_erp`); one impl per provider today (claude OCR default, esupl ERP). Shared infra injected via the module-global `ProviderContext` so `Protocol` signatures stay clean. **ERP selection is static (env `ERP_PROVIDER`); AI/OCR selection is a runtime DB setting (`system_settings.ai_provider`)** flippable by superadmin with no redeploy. The LLM transport is *not* behind a Protocol — it's module functions in `providers/ai.py` with `if provider=='gemini' ... else claude` dispatch (adding a third vendor edits that dispatch).
- **Frontend:** the identical provider pattern across `shared/ocr`, `shared/match`, `shared/pos` (interface + `backend`/`mock` impls + config + factory). Providers resolved at call time from RxJS BehaviorSubjects. Only `backend`/`mock` are live; the vendor-direct era (`shared/llm` transport, `ocr/prompt+parse`, `match/prompt+parse`) is dead.

### Security posture

- **No secrets in the browser.** Auth via HttpOnly cookies (resistant to XSS token theft). All real secrets (LLM keys, ERP tokens) are backend-only, Fernet-encrypted, behind a write-only/read-masked API surface.
- **No wildcard CORS with credentials** — backend `cors_origins_list` strips `*` (wildcard + `allow_credentials=True` is a vuln).
- **Separate auth planes** (app users = argon2/JWT; SQLAdmin operator = env/bcrypt) that must never be mixed.
- **Startup fail-fast** refuses weak/default `SESSION_SECRET`/`JWT_SECRET` and requires `SECRETS_ENC_KEY` outside `APP_ENV=local`.
- **Refresh-token theft detection**: reuse of a revoked refresh token revokes the whole `family_id`.
- **Gaps / watch items (posture, not leaks):** CSRF double-submit is *supported* server-side but **OFF by default** and the **FE sends no `X-CSRF-Token`** — with `SameSite=Lax` this is partially mitigated, but enabling `csrf_enabled` in prod would break FE mutations until wired. The legacy browser-direct Esupl path still exists in `.env.example`/pos config (should be confirmed dead). The duplicate-send guard is per-browser best-effort, awaiting a real backend idempotency key. Client-side caches (mappings, sent ledger) hold low-sensitivity business data slated to move backend-side. Access-token revocation is not instant (mitigated by 15-min TTL). No rate-limiting on `/auth/login` was observed.

### Fail-closed behavior (consolidated)

- **VPN for AI:** `ai_vpn_enabled` defaults True; a dead/slow gluetun tunnel raises `VpnUnavailableError` (503) — **never a silent direct-egress fallback**.
- **Missing AI key** → `AiUnavailableError` (503). **Missing Esupl token** → unauthenticated call → Esupl 401. Both have **no env fallback**.
- **`erp_write_enabled` defaults False** — real ERP writes are opt-in; while off, `write_invoice` short-circuits to a synthetic id without egress.
- **Decrypt with ciphertext but empty keyring** → `RuntimeError`, not silent garbage.
- **Runtime settings and secrets never fall back to env** — DB → registry default (settings) or → None (secrets).
- **Frontend:** the send flow drops SKU-less lines and never creates POS items; `bestNameMatch` marks low-confidence supplier matches as uncertain; image normalize is fail-open (returns original on error).

---

## DevOps / Deployment

`mvp.be/docker-compose.yml` defines three services + a `pgdata` volume:

| Service | Image / build | Purpose | Ports |
|---|---|---|---|
| `db` | `pgvector/pgvector:pg16` | Postgres 16 + pgvector. Compose defaults `lcos`/`change_me`/`lcos`; `pg_isready` healthcheck; persists to `pgdata`. | 5432:5432 |
| `backend` | `build: .` (Dockerfile) | FastAPI app; healthcheck `GET /api/v1/health` | 8000:8000 |
| `gluetun` | `qmcgaw/gluetun` | **VPN sidecar** (WireGuard); HTTP proxy on `:8888` consumed via `VPN_PROXY_URL=http://gluetun:8888` | 8888:8888 (debug) |

`backend depends_on db (condition: service_healthy)`. Dev bind-mounts `./app`, `./alembic`, `./alembic.ini`, `./tests`, `./pyproject.toml` for hot reload; `alembic/versions` mounted so autogenerated revisions land in the repo.

**The critical `lcos.env` trick:** config does NOT live in `./.env`. Compose auto-reads `./.env` and does `$`-interpolation, which corrupts the bcrypt `ADMIN_PASSWORD_HASH` (contains `$`). Instead config lives in **`lcos.env`**, bind-mounted read-only as `/app/.env` (`./lcos.env:/app/.env:ro`) and read directly by pydantic-settings (`env_file=".env"`) with no interpolation. Only `APP_HOST`/`APP_PORT` are passed inline via compose. Copy `lcos.env.example` → `lcos.env` to start (ships working dev values).

**Startup (`scripts/entrypoint.sh`):** with args → `exec "$@"` (alembic/pytest/ruff); without args → `alembic upgrade head` → `python -m app.seed` (idempotent, gated on `SEED_DEMO_DATA`) → `exec uvicorn app.main:app`.

**Backend image (`Dockerfile`):** `python:3.12-slim`, deps via **uv** (`uv pip install --system --no-cache ".[dev]"`), `EXPOSE 8000`, `PYTHONPATH=/app`. **No production/multi-stage build, no cloud deploy** — Phase 1 is local Docker only (Hetzner is Phase 2). Prod hardening is env-comment guidance (real secrets, `COOKIE_SECURE=true`, `CSRF_ENABLED=true`, provide `SECRETS_ENC_KEY`).

**Frontend build:** `dev`=vite, `build`=`tsc -b && vite build`, `preview`=vite preview. **No frontend Docker service** in the actual compose; the FE talks to the backend over `VITE_BACKEND_API_URL` directly.

**Common commands (`mvp.be/CLAUDE.md`):**
```
docker compose up --build                                   # db + backend + gluetun
docker compose run backend alembic upgrade head             # migrations
docker compose run backend alembic revision --autogenerate -m "msg"
docker compose run backend ruff check .
docker compose run backend pytest
```

### Environment variable names (no values)

**Backend** (`lcos.env`, parsed by `app/core/config.py`):
- App: `APP_ENV`, `APP_HOST`, `APP_PORT`, `LOG_LEVEL`
- DB: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`
- Providers (static): `ERP_PROVIDER` (=esupl), `ESUPL_API_BASE`, `GEMINI_API_BASE`
- Secret KEK: `SECRETS_ENC_KEY`, `SECRETS_ENC_KEY_ID`, `SECRETS_ENC_KEYS_OLD`
- SQLAdmin operator: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (bcrypt), `SESSION_SECRET`
- App auth: `JWT_SECRET`, `JWT_ALGORITHM`, `ACCESS_TOKEN_TTL_MIN`, `REFRESH_TOKEN_TTL_MIN`, `AUTH_PROVIDER`
- Cookies: `COOKIE_SECURE`, `COOKIE_SAMESITE`, `ACCESS_COOKIE_NAME`, `REFRESH_COOKIE_NAME`, `CSRF_ENABLED`, `CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME`
- VPN (declarative for gluetun): `VPN_PROVIDER`, `VPN_TYPE`, `WIREGUARD_PRIVATE_KEY`, `WIREGUARD_ADDRESSES`, `VPN_SERVER_COUNTRIES`, `VPN_PROXY_URL`, `EGRESS_TIMEOUT_SECONDS`
- Other: `CORS_ORIGINS`, `SEED_DEMO_DATA`

**Explicitly NOT in env** (moved to `system_settings` / `integration_credentials`, superadmin-managed, encrypted): `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `ai_provider`, `anthropic_model`, `gemini_model`, `ai_vpn_enabled`, `module_ocr_enabled`, `module_suppliers_enabled`, `erp_write_enabled`, and the per-org POS token.

**Frontend** (`.env.example`, `VITE_*` only, all non-secret): `VITE_BACKEND_API_URL`, `VITE_OCR_PROVIDER` (backend|mock), `VITE_POS_PROVIDER` (backend|esupl|mock), `VITE_POS_MOCK`, `VITE_ESUPL_API_URL` (legacy), `VITE_ESUPL_READ_ONLY` (legacy). `env.ts` only actually reads `VITE_BACKEND_API_URL`; the OCR/POS vars are read in their respective `shared/ocr` and `shared/pos` config modules.

---

## Open Questions / Things to Verify

Gathered across all specialist sections; grouped for triage.

### Product/docs vs. code
- The product docs (`Local_OS_Specification_v04.md`, parts of `Local_OS_MVP1_AgentSpec.md`) are outdated: they describe a Telegram-bot FE, Java/Node backend, and "no-auth single-user" scope. Trust the code (`docker-compose.yml`, `config.py`, `CLAUDE.md`) over these where they conflict.

### Backend auth & secrets internals not read line-by-line
- `app/auth/{service,tokens,router,cookies}.py` internals (JWT rotation, reuse-detection, switch-context re-issue) summarized from docstrings/CLAUDE.md, not fully verified.
- `core/secrets.py` Fernet envelope details (enc:v2 key-id selection, rotation via `scripts/rotate_kek.py`) and `core/security.py` AdminAuth mechanics described from usage sites — the argon2 hasher in `app/auth/password.py` (vs bcrypt for the SQLAdmin operator) was not opened to confirm how `users.password_hash` is produced/verified.
- No rate-limiting / brute-force protection observed on `/auth/login`; whether any exists in middleware/proxy is unverified.
- Auth-isolation tests (the merge-blocking tenant-isolation suite) were not located/read; presence and coverage unverified. More broadly, the non-negotiable tests (fail-closed VPN, egress client selection, ERP_WRITE gating, tenant isolation) were inferred, not confirmed in test files.

### Provider / integration nuances
- The stale `ErpProvider.write_invoice` docstring still says "None → fallback to global env token," but the code implements fail-closed (no env fallback) — likely a stale docstring worth fixing.
- The LLM transport is module functions, not a Protocol-behind-registry — adding a third LLM vendor edits `ai_complete`'s dispatch. Intentional or an incomplete seam?
- `resolve_ai_provider()` returns the raw DB enum used for BOTH the LLM `ai_complete` dispatches to AND the OCR provider class `get_ocr()` instantiates. This double-duty assumes registered OCR names exactly equal the `ai_provider` enum values — verify no OCR name could be registered that isn't a valid `ai_provider` enum.
- `esupl.py` `list_suppliers`/`list_ingredients` call `_auth_headers()` with no token (would hit Esupl unauthenticated); docstrings say off the critical path (suppliers from seed, catalog from local `ingredients`). Confirm these GET endpoints are effectively unused in Phase 1.
- `subdivision`-scoped credentials (`CredentialScope.subdivision`) are declared but noted "задел, активно не используется" — no runtime caller passes `subdivision_id` for credential resolution.
- `guard_vpn` / egress client selection (`providers/http.py`) — the precise mechanism routing `via_vpn` through gluetun vs direct was inferred from `ai.py` usage; the exact interaction of gluetun's HTTP proxy with `ai_vpn_enabled` was not read in full.

### Data model / migrations
- `invoice_lines.sku_embedding Vector(1536)` is never read/written and has no ANN index — confirm whether semantic SKU matching is planned to use it, or whether the current recognition/matching feature uses a different mechanism entirely. The embedding provider/model that would populate 1536-dim vectors is not defined.
- `invoices.supplier_id` FK has no explicit `ondelete` (defaults to NO ACTION/RESTRICT) — confirm this matches intended behavior.
- The Alembic pre-squash history (0001–0004) is gone; only `0001_initial`/`0002`/`0003` `.py` exist. Schema-vs-migration parity and the exact DDL creating the enum types / partial unique indexes were not opened.
- Most routes (`organizations.py`, `suppliers.py`, `ingredients.py`, `health.py`) and `api/v1/schemas.py` were not read in full — only `invoices.py` and `admin_system.py` as representative.

### Frontend
- FSD import rules are enforced only by convention/review — no ESLint/steiger/dependency-cruiser in the repo. Confirm no lint step in CI.
- No test files or test runner visible in `mvp.fe/package.json` — "build green" is `tsc + vite build` only; whether any FE tests exist is unconfirmed.
- Dead-code confirmation: `ocr/prompt.ts`+`parse.ts` (partly — some `rules.ts` helpers ARE live in the workbench), `match/prompt.ts`+`parse.ts`, and the `shared/llm` vendor transport are browser-direct legacy with no live consumers. Confirm they are safe-to-delete vs. intended for a future client-side fallback.
- Stale doc comments in `invoicesApi.ts` still say OCR/matching go to "mock / Gemini / Claude" — the code only resolves backend/mock. Confirm no build-time env (`VITE_OCR_PROVIDER`) can select a vendor-direct id (the guard would reject `gemini`/`claude` and silently fall back to `backend`).
- `BackendOcrProvider` sends only `pages[0]` — multi-page invoices silently lose pages 2–3. Confirm `/invoices/recognize` is still single-page (a backend follow-up per the code comment).
- Matching reads `ocrConfig$` (not a separate match config) — confirm this coupling is intended (matching cannot be toggled independently of OCR).
- The backend match provider ignores the client-built candidate set and re-sources from `/ingredients`, so `buildMatchCandidates` only matters for the mock provider — confirm intended, not an oversight where the backend should receive the pre-filtered candidates.
- `ContextSwitcher.tsx`/`UserMenu.tsx` (org/subdivision switching, logout) and `SkuSelect.tsx`/`shared/match` scoring internals were not read in full; the store listener that drops held binaries on `sessionReset`/`fileRemovedAt` was referenced but `app/store/index.ts` subscription not opened. PhotoViewer bbox overlays may be effectively a mock/demo-only feature (real Gemini/Claude may not return usable pixel coords).

### Security posture (FE)
- **CSRF:** backend supports double-submit (`lcos_csrf` cookie + `X-CSRF-Token`) but it is `csrf_enabled=False` by default and the FE has NO code reading/sending the token. If prod enables CSRF, FE mutations will fail until `backendRequest.ts` is wired. Confirm whether prod runs with `csrf_enabled`.
- The legacy browser-direct Esupl path (`VITE_POS_PROVIDER=esupl`, `VITE_ESUPL_API_URL`) still exists in `.env.example`/pos config — verify it is truly dead/unreachable and can't reintroduce a browser-direct ERP call.
- `localos.lastWarehouseId` is not org-scoped like the other stores — confirm intentional (low-risk UI default) vs. an oversight that should carry `orgScopeToken()`.
- Confirm no window where a tenant-scoped localStorage write happens under `'noorg'` before `activeScope$` is populated (reads guard on `orgScopeToken()`, but a pre-auth write path was not fully traced).

### DevOps / CI / deploy
- No CI pipeline config (GitHub Actions, etc.) was found, yet `CLAUDE.md` says non-negotiables should be CI-enforced. Whether CI exists is unverified.
- The actual `docker-compose.yml` has no frontend service; how the FE is served/deployed alongside the backend in any non-dev scenario is undefined in the reviewed files.
- Production deploy target (Hetzner per docs) has no infra-as-code/Dockerfile.prod in the reviewed set — Phase 1 is local-only; prod hardening is env-comment guidance only.
