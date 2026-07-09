---
id: LCOS-F11
type: feature
title: Esupl read integration
epic: "[[LCOS-E2-invoice-intake]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[suppliers]]", "[[ingredients]]", "[[invoices]]", "[[integration_credentials]]", "[[organizations]]", "[[subdivisions]]"]
requirements: ["[[erp-esupl-integration]]", "[[fail-closed]]", "[[provider-abstraction]]", "[[vpn-egress]]"]
adrs: ["[[ADR-004]]", "[[ADR-008]]", "[[ADR-006]]", "[[ADR-009]]"]
legacy_refs: [07 Э0, "08 F0.3", plan F1]
sources: ["APP_OVERVIEW.md §9", "08_PHASE1_SPEC.md F0.3", "mvp.be app/providers/erp/esupl.py:80", "mvp.be app/providers/erp/esupl.py:230", "mvp.be app/api/v1/routes/invoices.py:72"]
updated: 2026-07-09
---
# LCOS-F11 · Esupl read integration
**Epic:** [[LCOS-E2-invoice-intake]] · **Status:** built · **Phase:** Phase 1

## Description

LCOS is a write-point for receipts but **read-only** for everything else in Esupl. F11 is the read surface of the single ERP provider (`EsuplErpProvider`): the team-scoped GET calls that pull suppliers, catalog positions, single ingredients (for commit validation) and posted invoices, plus the `GET /invoices` route that maps Esupl orders into the frontend's shape. It is the data backbone that [[LCOS-F9-line-matching]] matches against and that [[LCOS-F10-invoice-status-machine]] validates against (APP_OVERVIEW §9).

Every read is team-scoped and requires the **tenant's** Bearer token, resolved by the caller (per-org, from [[integration_credentials]]). There is no global/env token fallback: without a token Esupl answers 401 — [[fail-closed]] by design (`_auth_headers` returns no `Authorization` header, so the request goes out unauthenticated and Esupl rejects it). All GETs funnel through one egress helper (`_get`): it builds the URL from `esupl_api_base`, lets `httpx` url-encode params, applies the VPN guard (`requires_vpn=False` — Esupl is reachable directly today, a static seam that can flip to VPN-only), and does `raise_for_status()` so HTTP/network errors propagate rather than being swallowed. Responses are unwrapped tolerantly (bare list or `{"data": […]}`), because the API doc mirror does not give response bodies and real shapes are confirmed in the browser.

The four reads map to real endpoints: suppliers = `GET /teams/{id}/following?is_virtual=1` (teams our team follows are our suppliers), catalog = `GET /teams/{id}/products` (server-side `product_name` LIKE search), single position = `GET /teams/{id}/products?id=` (strict exact-id match, no `items[0]` fallback — used on the fail-closed commit path so a POS outage cannot be mislabeled "not found"), and invoices = `GET /teams/{id}/orders`. The `GET /invoices` route reads orders and normalizes each into `PosOrderOut`, deriving `is_submitted` from `status == 8` and `is_paid` from `payment_status == 2`, and tolerating orders with no `team_to` (supplier id sentinel `0`, so one supplier-less order can't 500 the whole list).

## Capabilities

- `list_suppliers(team_id, token)` — `GET /teams/{id}/following?is_virtual=1` → `SupplierRef` (external_id, name, tax_id/unp); no base URL configured → empty list + warning.
- `list_ingredients(team_id, token, query)` — `GET /teams/{id}/products` with `fields=id,name,unit`; optional `query` → server-side `product_name` LIKE (`operator[product_name]=like`).
- `get_ingredient(team_id, pos_ingredient_id, token)` — `GET /teams/{id}/products?id=`; **strict** exact-id match, else `None` (never `items[0]`); network/5xx/VPN errors propagate (used by commit validation).
- `validate_ingredient_on_commit(...)` — exists + unit-match check returning `{valid, ingredient, error}`; empty-unit tolerant (block only when both units set and differ, case/space-normalized); timeout/OSError → fail-closed invalid.
- `list_invoices(team_id, token, per_page, page)` — `GET /teams/{id}/orders` with `include=team_to`, pagination via `per_page`/`page`.
- `GET /api/v1/invoices` route — maps Esupl orders → `PosOrderOut`: `is_submitted = status==8`, `is_paid = payment_status==2`, tolerant `team_to`/date/total handling; org with no `esupl_team_id` → empty list.
- Single access SSOT `get_esupl_access(session, org_id) → (team_id, token)` used by the four read call-sites (supplier list/sync, catalog, invoices, commit validation).

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | See the tenant's supplier list, catalog and posted invoices pulled from Esupl within their subdivision. |
| [[admin]] | Same as member; triggers supplier/catalog sync for the subdivision. |
| [[superadmin]] | All tenants; manages the per-org Esupl token that authorizes reads. |
| [[sqladmin-operator]] | Not in the flow; stores/rotates the Esupl token in `integration_credentials` via the SQLAdmin plane ([[LCOS-F3-sqladmin-operator]]). |

Reads are tenant-scoped: `team_id` derives from `Organization.esupl_team_id` for the active org context (see [[auth]], [[multitenancy]]).

## Involved entities

- [[suppliers]] — mirror of Esupl `following`; `list_suppliers` feeds the supplier directory ([[LCOS-F17-supplier-cards]]).
- [[ingredients]] — the catalog mirror; `list_ingredients`/`get_ingredient` back matching and commit validation.
- [[invoices]] — `list_invoices` + `GET /invoices` present posted Esupl orders (`PosOrderOut`).
- [[integration_credentials]] — per-org Esupl Bearer token (Fernet); resolved by the caller, never env.
- [[organizations]] — `esupl_team_id` (org ↔ exactly one Esupl team, [[ADR-004]]).
- [[subdivisions]] — `esupl_warehouse_id` (subdivision ↔ warehouse, [[ADR-008]]), used with the warehouse family of reads.

## Dependencies / links

- **Requirements:** [[erp-esupl-integration]] (the endpoint contract + read-only stance), [[fail-closed]] (no-token → 401, POS-unavailable propagates as a truthful block), [[provider-abstraction]] (single `esupl` implementation behind the ERP `Protocol` — [[ADR-009]]), [[vpn-egress]] (`requires_vpn` seam + `guard_vpn`).
- **Features:** feeds [[LCOS-F9-line-matching]] (catalog) and [[LCOS-F10-invoice-status-machine]] (commit validation + write); supplier sync consumer is [[LCOS-F17-supplier-cards]]; warehouse reads are extended by [[LCOS-F12-warehouse-target]]; the path-fix that made these reads real is legacy 08 F0.3 → [[LCOS-F28-esupl-contracts]].
- **ADR / decisions:** [[ADR-004]] (org ↔ team), [[ADR-008]] (subdivision ↔ warehouse), [[ADR-006]] (fail-closed egress), [[ADR-009]] (one ERP implementation).

## Acceptance criteria (AC)

### Backend
- [ ] AC-BE-1. `list_suppliers` calls `GET /teams/{id}/following?is_virtual=1` and maps to `SupplierRef`; unconfigured base URL → `[]` + warning.
- [ ] AC-BE-2. `list_ingredients` calls `GET /teams/{id}/products`; a non-empty `query` adds `product_name` + `operator[product_name]=like` (server-side search).
- [ ] AC-BE-3. `get_ingredient` returns only an exact-`id` match, else `None`; it never falls back to `items[0]`; network/5xx/VPN errors propagate (not swallowed as None).
- [ ] AC-BE-4. `validate_ingredient_on_commit` blocks on unit mismatch only when both units are set and differ (normalized), and returns fail-closed invalid on timeout/network error.
- [ ] AC-BE-5. `list_invoices` calls `GET /teams/{id}/orders` with `include=team_to` and honors `per_page`/`page`.
- [ ] AC-BE-6. `GET /api/v1/invoices` maps orders to `PosOrderOut` with `is_submitted = status==8`, `is_paid = payment_status==2`, tolerates missing `team_to` (supplier id `0`), and returns `[]` when the org has no `esupl_team_id`.
- [ ] AC-BE-7. Every read requires the per-org Bearer token (via `get_esupl_access`); no token → unauthenticated request → Esupl 401 (no env fallback); tokens never logged.
- [ ] AC-BE-8. All GETs route through the single `_get` egress helper (URL build, `httpx` param encoding, `guard_vpn`, `raise_for_status`) and tolerantly unwrap list-or-`{data:[]}`.

### Frontend
- [ ] AC-FE-1. The invoices list renders `PosOrderOut` (number, delivery date, supplier, total, submitted/paid badges) from `GET /invoices`.
- [ ] AC-FE-2. An org with no configured Esupl team shows an empty state, not an error.
- [ ] AC-FE-3. Supplier/catalog data surfaced from Esupl reads is read-only in the UI (LCOS never edits Esupl master data).

## Open questions / gates

- **`S1` read-only (open):** confirm in the browser that the `products?id=` and `product_name` filters are actually honored; the `/products?id=` (code) vs `/ingredients/{id}` (probe) endpoint divergence is documented.
- **`VER-021` durability (open, owner-run):** `pos_ingredient_id` stability across edit/delete-recreate is not confirmed empirically; read reflects, does not fix — see [[LCOS-E5-stabilization]].
- Response shapes are parsed tolerantly pending live confirmation on team 17957 (08 F0.3 AC-3).

## Sources

- `APP_OVERVIEW.md §9` (real endpoints, per-read token, `get_esupl_access` SSOT).
- `08_PHASE1_SPEC.md F0.3` (team-scoped path fix; no-token → `[]` + warning; pagination).
- `mvp.be/app/providers/erp/esupl.py:80` (`list_suppliers`), `:104` (`list_ingredients`), `:123` (`get_ingredient` strict match), `:154` (`validate_ingredient_on_commit`), `:230` (`list_invoices`), `:53` (`_get` egress helper), `:286` (`_auth_headers` no-token → 401).
- `mvp.be/app/api/v1/routes/invoices.py:72` (`GET /invoices` → `PosOrderOut`, status/payment semantics).
