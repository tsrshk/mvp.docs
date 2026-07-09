---
id: LCOS-F7
type: feature
title: Frontend platform (FSD / RTK / PWA)
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[users]]", "[[organizations]]", "[[subdivisions]]"]
requirements: ["[[auth]]", "[[multitenancy]]", "[[provider-abstraction]]", "[[global-requirements]]"]
adrs: ["[[ADR-012]]"]
legacy_refs: [plan/00 G8, LCOS_Conformance R9, APP_OVERVIEW §16 §17]
sources: ["APP_OVERVIEW.md (Frontend internals, integration modules, cross-cutting)", "01_ARCHITECTURE.md (Frontend architecture internals, shared modules)", "LCOS_Conformance_Alignment_GlobalRequirements.md R9 G8", "mvp.fe src/main.tsx", "mvp.fe src/app/store/index.ts", "mvp.fe src/app/observers/configSync.ts", "mvp.fe src/shared/api/baseApi.ts", "mvp.fe src/shared/api/backendRequest.ts", "mvp.fe vite.config.ts"]
updated: 2026-07-09
---
# LCOS-F7 · Frontend platform (FSD / RTK / PWA)
**Epic:** [[LCOS-E1-platform]] · **Status:** built · **Phase:** Phase 1

## Description

The frontend foundation the product screens are built on: a **mobile-first React PWA** organized by strict **Feature-Sliced Design** (pages → widgets → features → entities → shared), state in **Redux Toolkit + RTK Query**, an **RxJS observer layer** that reconciles settings/scope/provider config, HttpOnly-cookie transport, and Vite + `vite-plugin-pwa`. It carries **no domain features by itself** — it is the wiring that makes every product feature safe, offline-demoable, and tenant-scoped.

Three cross-cutting invariants define it. **No secrets in the browser:** auth is HttpOnly cookies only (`backendRequest` sends `credentials:'include'`, refreshes once on 401), and `VITE_*` env vars are non-secret endpoint/provider switches — there is no API key or ERP token in JS ([[ADR-012]]). **One reactive config spine:** `startConfigSync(store)` runs before first render and mirrors the settings overlay, the active tenant scope (from the `/auth/me` cache), and provider config into RxJS BehaviorSubjects (`ocrConfig$`, `posConfig$`, `activeScope$`) so at-call-time non-React code (the `queryFn`s, storage helpers) can resolve them; a POS-config change triggers `resetApiState()` to refetch from the newly selected provider. **The provider pattern collapsed to `backend|mock`:** `shared/ocr`, `shared/match`, `shared/pos` each expose an interface + `backend`/`mock` impls + config + factory; the whole "browser-direct LLM/ERP" era is dead (vestigial `shared/llm`, `ocr/prompt+parse`, `match/prompt+parse`), and one `mockData` toggle flips everything to offline demo.

Tenancy is projected here: per-browser stores (learned mappings, sent-invoice ledger) are keyed by `orgScopeToken()`, and login/logout/switch invalidate the tenant caches (see [[LCOS-F1-multitenancy]]).

## Capabilities

- Strict FSD layering with `@/* → src/*` alias; import rules enforced by **convention + review** (no ESLint/dependency-cruiser in-repo).
- Bootstrap (`main.tsx`): `startConfigSync(store)` → `<StrictMode><Provider><App/>`; `App.tsx` mounts `RouterProvider` + global `<Toaster/>`; `AuthGuard` gates non-public routes via `useMeQuery()`.
- Store: one `baseApi` (`fakeBaseQuery`, `tagTypes`) + `invoiceSession` + `settings`; a `fileSync` listener keeps non-serializable `File` binaries out of Redux (out-of-store `fileHolder`, index-aligned to session metadata).
- RTK Query with `injectEndpoints` + `queryFn` wrappers (`backendQueryFn`/`aiQueryFn`/`posQueryFn`); each endpoint calls `backendRequest` (real HTTP) or a factory-resolved provider.
- Transport `backendRequest`: `fetch` with `credentials:'include'`, refresh-once-on-401-then-replay, `BackendError(message,status,code)`, base URL from `VITE_BACKEND_API_URL`. The only auth "interceptor".
- RxJS config-sync: settings overlay → localStorage; `ocrConfig$`/`posConfig$`/`activeScope$` BehaviorSubjects; POS-config change → `resetApiState()`; cross-tab via `storage` events under the `localos.` prefix.
- Two-axis provider model, both `backend|mock`: OCR/AI axis (`ocrConfig$`, also governs matching) and POS/ERP axis (`posConfig$`); driven by a single `mockData` demo toggle.
- PWA: `VitePWA(autoUpdate)`, precached app shell, `navigateFallback:'/index.html'`, `manualChunks.vendor`, route-split pages via `React.lazy`; SW disabled in dev.
- No secrets in the browser: HttpOnly cookies for auth; `VITE_*` non-secret only; per-browser stores tenant-scoped by `orgScopeToken()`.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Uses the PWA on a phone; sees only their subdivisions (scope from `/auth/me`); mobile-first flows. |
| [[admin]] | Same shell + admin-scoped actions inside their subdivisions; `ContextSwitcher` across memberships. |
| [[superadmin]] | Same shell with the full org/subdivision tree in the switcher (from `/auth/me`). |
| [[sqladmin-operator]] | Not a consumer of this PWA — operates the separate SQLAdmin panel ([[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- [[users]] — projected via `/auth/me` (identity, superadmin flag) driving the sidebar and guard.
- [[organizations]] / [[subdivisions]] — the active scope (`activeScope$`, `orgScopeToken()`) projected from the `/auth/me` cache; per-browser stores keyed by it.

(The FE holds no authoritative data — the backend is authoritative for all tenant/entity state; these are projections.)

## Dependencies / links

- **Requirements:** [[auth]] (HttpOnly-cookie transport, refresh-once), [[multitenancy]] (scope projection, `orgScopeToken()` keying, cache invalidation), [[provider-abstraction]] (FE `backend|mock` provider pattern mirroring the backend seams), [[global-requirements]] (R9 / plan G8).
- **Features:** consumes [[LCOS-F2-app-auth]] (`/auth/me`, refresh) and [[LCOS-F1-multitenancy]] (scope); hosts the product surfaces of [[LCOS-F8-ocr-recognition]], [[LCOS-F9-line-matching]], [[LCOS-F10-invoice-status-machine]]; the FE provider pattern mirrors [[LCOS-F5-provider-seams]].
- **ADR:** [[ADR-012]] (no browser secrets; provider live-paths `backend`/`mock` only).

## Acceptance Criteria (AC)

### Frontend
- [ ] AC-FE-1. FSD layering holds (pages → widgets → features → entities → shared); the only sanctioned upward reference is a type-only `import type` of store types (erased at compile).
- [ ] AC-FE-2. `startConfigSync(store)` runs before first render and populates `ocrConfig$`, `posConfig$`, `activeScope$`; a settings change is resolvable at call time in non-React code.
- [ ] AC-FE-3. A POS-config change dispatches `baseApi.util.resetApiState()` so data refetches from the newly selected provider.
- [ ] AC-FE-4. All endpoints use `injectEndpoints` + a `queryFn` wrapper; the base query is a stub (`fakeBaseQuery`).
- [ ] AC-FE-5. `backendRequest` sends `credentials:'include'`, refreshes once on 401 (except `/auth/refresh`,`/auth/login`) then replays, and throws `BackendError` on non-ok.
- [ ] AC-FE-6. No secret exists in the browser: no `VITE_*` API key/ERP token; auth is HttpOnly cookies only.
- [ ] AC-FE-7. Each integration module (`ocr`/`match`/`pos`) exposes `backend` + `mock` impls; the `mockData` toggle flips the whole app to offline demo.
- [ ] AC-FE-8. Per-browser stores are keyed by `orgScopeToken()`; login/logout/switch invalidate `['Me','Invoice','Supplier','Ingredient']`.
- [ ] AC-FE-9. PWA builds green (`tsc -b && vite build`); app shell precached, pages route-split, SW disabled in dev.

### Other (cleanup / infra)
- [ ] AC-OTHER-1. Dead browser-direct code carries no live consumer — `shared/llm` transport, `ocr/prompt.ts`+`parse.ts`, `match/prompt.ts`+`parse.ts`, and the legacy `VITE_POS_PROVIDER=esupl` path are vestigial (live `rules.ts` helpers preserved). Removal tracked in [[LCOS-F25-deadcode-cleanup]].

## Open questions / gates

- **A2 (open):** dead browser-direct modules still ship (with stale "mock/Gemini/Claude" comments) — Conformance A2 mandates deletion, keeping the live `rules.ts` helpers; tracked as [[LCOS-F25-deadcode-cleanup]].
- FSD import rules are review-only (no linter); a steiger/dependency-cruiser step is deferred (Conformance DEFER).
- **D-g:** `BackendOcrProvider` sends only `pages[0]` — multi-page invoices silently lose pages 2–3; interim fix [[LCOS-F26-multipage-fix]], full support [[LCOS-F29-multipage-recognize]].
- No FE test/lint step in CI observed; "build green" = `tsc + vite build` (Conformance V/DEFER).

## Sources

- `APP_OVERVIEW.md` — Frontend architecture internals, integration modules (`shared/ocr|match|pos|llm|api`), cross-cutting (multi-tenancy projection).
- `01_ARCHITECTURE.md` — "Frontend architecture internals", "Frontend integration modules", "Cross-cutting concerns".
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R9 + plan G8 + Part 2 A2/D-e/D-g.
- `mvp.fe/src/main.tsx` (`startConfigSync` before render), `src/app/store/index.ts` (store + `fileSync`), `src/app/observers/configSync.ts` (RxJS spine).
- `mvp.fe/src/shared/api/baseApi.ts` (`fakeBaseQuery`, tagTypes), `src/shared/api/backendRequest.ts` (transport, refresh-once), `src/shared/api/queryFn.ts` (wrappers).
- `mvp.fe/vite.config.ts` (VitePWA, manualChunks).
