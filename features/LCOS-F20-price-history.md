---
id: LCOS-F20
type: feature
title: Price history + auto-collect from invoices
epic: "[[LCOS-E4-suppliers]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[suppliers]]", "[[ingredients]]", "[[invoices]]", "[[invoice_lines]]", "[[packings]]"]
requirements: ["[[multitenancy]]", "[[invoice-status-machine]]"]
adrs: []
legacy_refs: ["plan F3-B2", "plan F3-B3", "plan F3-B4", "plan F3-F1", "07 Э2"]
sources: ["plan/PHASE_F3_SUPPLIERS.md §1-3", "plan/PHASE_F3_SUPPLIERS.md AC-2/5/6/7", "APP_OVERVIEW.md §10", "mvp.be app/services/invoice_service.py"]
updated: 2026-07-09
---
# LCOS-F20 · Price history + auto-collect from invoices

**Epic:** [[LCOS-E4-suppliers]] · **Status:** planned · **Phase:** Phase 1

## Description

The pain: supplier prices live "in the head", in WhatsApp and a notebook — impossible to compare or track. The product answer: a personal supplier price book where prices update **automatically** from every posted invoice, and the change history is visible. Concretely, each posted invoice appends per-line price observations to an append-only `supplier_prices` table; the "current price" for a `(supplier, ingredient)` pair is simply the latest observation by `observed_at`.

This is the next increment of epic E4 after the supplier card + CRUD ([[LCOS-F17-supplier-cards]], built). The card/directory is done; price history (F3-B2/B3, the `GET /suppliers/{id}/prices` and `/ingredients/{id}/price-history` routes of F3-B4, manual price entry, and the price UI) is **not built** — this feature covers it. The price-change signal in the invoice flow is the sibling [[LCOS-F21-price-change-signal]] (it reads the previous price that this feature records).

History is never overwritten: every invoice adds rows. Prices are stored per **base SKU unit** — the invoice line's `unit_price` is recalculated through the packing factor ([[packings]]) so observations are comparable across pack sizes. A manual price entry (owner types a price) creates a history point with `source_invoice_id = NULL`.

## Capabilities

- (Planned) Append-only `supplier_prices` table (`OrganizationScopedMixin`, int pk): `supplier_id` (FK, CASCADE), `ingredient_id` (FK, CASCADE), `price Numeric(14,4)` per base unit, `currency` (default BYN), `raw_name` (as the line was named on the invoice), `unit`, `qty` (observation context), `source_invoice_id` (FK, SET NULL, nullable — NULL = manual), `observed_at` (invoice date, not `created_at`). Indexes on `(organization_id, ingredient_id, observed_at)` and `(organization_id, supplier_id)`.
- (Planned) Auto-collect in `InvoiceService.submit()`: on successful persist of a `prepared`/`written` invoice, write one `supplier_prices` row per resolved-SKU line, price per base unit via the packing factor (Decimal math, no float).
- (Planned) Idempotency: re-submitting the same invoice (same `external_id`) does not duplicate price rows.
- (Planned) `GET /suppliers/{id}/prices` — current price per SKU (latest `observed_at`) plus the previous price and % change.
- (Planned) `GET /ingredients/{id}/price-history?supplier_id=` — the series of price points for a chart.
- (Planned) `POST /suppliers/{id}/prices` — manual price entry (`source_invoice_id = NULL`).
- (Planned) `PriceService` (services layer) + `SupplierPriceRepository` (org scope in constructor); the whole router stays behind the `suppliers` module gate.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | See a supplier's price book and per-SKU history; enter a manual price. Prices auto-appear from invoices they post. Right = "any member of the subdivision" (plan F3-B4). |
| [[admin]] | Same, within the subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved; toggles the `suppliers` module gate in the SQLAdmin plane (see [[LCOS-F6-module-gates]]). |

Tenant scope (`organization_id`) comes from the active JWT context; org-A prices must not be visible from an org-B scope (see [[multitenancy]]).

## Involved entities

- [[suppliers]] — owner of the price book; `supplier_prices.supplier_id` FK (CASCADE).
- [[ingredients]] — the SKU a price is observed for; `supplier_prices.ingredient_id` FK (CASCADE); `/ingredients/{id}/price-history` reads by ingredient.
- [[invoices]] — the source of an auto-collected observation; `supplier_prices.source_invoice_id` FK (SET NULL); `observed_at` = the invoice date.
- [[invoice_lines]] — each resolved-SKU line yields one observation; `raw_name`/`unit`/`qty` carry the line context.
- [[packings]] — the packing factor recalculates `unit_price` to a per-base-unit price so observations are comparable.

## Dependencies / links

- **Requirements:** [[multitenancy]] (new table carries `organization_id`, isolation tested), [[invoice-status-machine]] (auto-collect runs inside `submit()` for `prepared`/`written` invoices; re-submit idempotency).
- **Features:** [[LCOS-F17-supplier-cards]] (parent directory/card — built), [[LCOS-F21-price-change-signal]] (reads the previous price recorded here to raise a change warning), [[LCOS-F10-invoice-status-machine]] (the submit path that triggers auto-collect), [[LCOS-F13-sku-identity-resolver]] (only resolved-SKU lines are recorded). Cross-supplier comparison and Excel/PDF price import are out of scope (Phase 2 / E4 sibling).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `supplier_prices` migration applies and downgrades; the table carries `organization_id`; tenant-isolation test: org-A prices are not visible from an org-B scope. (plan F3 AC-1)
- [ ] AC-BE-2. Submitting a `prepared`/`written` invoice with 2 mapped lines creates 2 `supplier_prices` rows with the correct **per-base-unit** price (packing-factor recalculation is a Decimal unit test, no float); a repeat submit does not duplicate. (plan F3 AC-2)
- [ ] AC-BE-3. `GET /suppliers/{id}/prices` returns, per SKU, the latest price, the previous price and the % change (test with 3 history points). (plan F3 AC-5)
- [ ] AC-BE-4. `GET /ingredients/{id}/price-history?supplier_id=` returns the ordered series of price points (date + source). (plan F3 AC-6)
- [ ] AC-BE-5. `POST /suppliers/{id}/prices` creates a history point with `source_invoice_id = NULL` (manual entry). (plan F3 AC-7)
- [ ] AC-BE-6. History is append-only: each invoice adds rows, none are overwritten; "current price" = latest by `observed_at` per `(supplier, ingredient)`.
- [ ] AC-BE-7. Routes are behind `module_suppliers_enabled`: disabling in SQLAdmin → 404 on all price routes. (plan F3 AC-8)

### Frontend
- [ ] AC-FE-1. Supplier card shows a price table (SKU → current price, date, change arrow/% with warn-highlight on increases). (plan F3-F1)
- [ ] AC-FE-2. Per-SKU price history is visible (at minimum a table of points with dates and source "invoice №… / manual"; a simple sparkline/chart is acceptable only if it does not bloat the bundle — decision recorded in the work journal). (plan F3 AC-6)
- [ ] AC-FE-3. Manual price entry from the UI creates a point with `source_invoice_id = NULL`. (plan F3 AC-7)
- [ ] AC-FE-4. `entities/supplier` gains RTK endpoints for prices/history (`injectEndpoints` + `queryFn`); the `backend | mock` provider returns demo prices in dev.

### Other
- [ ] AC-OTHER-1. Readiness metric: all real pilot-coffeeshop suppliers (7–12) are entered, and after the first real invoice their prices appear automatically — recorded in `work/phase-f3.md`. (plan F3 AC-9)

## Open questions / gates

- **Not built yet:** `supplier_prices`, auto-collect in `submit()`, the prices/history routes and manual entry, and the price UI are the open F3 increment (plan F3 status 2026-07-08: F3-B2/B3, F3-B4 prices routes, F3-F2 open). AC-2/3/5/6/7/9 of plan F3 remain open.
- **Chart library:** whether to render a sparkline/chart or a plain point table is left to the implementer to avoid bundle bloat; decision to be journaled.
- **Consumer analytics (REQ 1b):** price history is a natural input to supplier scoring, but that consumer is deferred by checkpoint decision.

## Sources

- `plan/PHASE_F3_SUPPLIERS.md §1` (F3-B2 `supplier_prices` schema, F3-B3 auto-collect + idempotency), `§2` (F3-B4 routes + `PriceService`/`SupplierPriceRepository`), `§3` (F3-F1/F3-F2 UI), `§5 AC-1/2/5/6/7/8/9`, "Статус реализации (2026-07-08)" (NOT built list).
- `APP_OVERVIEW.md §10` (suppliers + criteria), `§11` (data model — `suppliers`, `invoices`, `packings`).
- `mvp.be/app/services/invoice_service.py` (`submit()` — the auto-collect hook point).
