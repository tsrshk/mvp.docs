---
id: LCOS-F37
type: feature
title: purchase_orders + lines + status machine + prefill
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[purchase_orders]]", "[[purchase_order_lines]]", "[[suppliers]]", "[[ingredients]]", "[[packings]]", "[[invoice_lines]]"]
requirements: ["[[erp-esupl-integration]]", "[[invoice-status-machine]]", "[[multitenancy]]"]
adrs: []
legacy_refs: ["08 F4.1", "07 Э4a"]
sources: ["08_PHASE1_SPEC.md F4.1", "07_PHASES.md Э4a", "mvp.be app/db/models.py:60-66,219-220", "mvp.be app/db/models.py:247-260", "mvp.be app/api/v1/routes/invoices.py:45-49"]
updated: 2026-07-09
---
# LCOS-F37 · purchase_orders + lines + status machine + prefill
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Description

The data and API backbone of purchasing: a persisted `purchase_orders` header with its own status machine, plus `purchase_order_lines`. This is the server foundation that the ordering UI ([[LCOS-F38-orders-ui]]), the copyable supplier message ([[LCOS-F39-order-message]]) and the AI proposal ([[LCOS-F40-ai-order-proposal]]) all build on. Each order is tenant-scoped (organization + subdivision from the active JWT context, see [[multitenancy]]) and bound to one supplier from the local directory ([[LCOS-F17-supplier-cards]]).

The order lifecycle is a native Postgres enum `purchase_order_status` with values `draft → confirmed → sent_manually → received`, plus `draft|confirmed → cancelled`. It is declared exactly like the existing `InvoiceStatus` enum (the reference pattern the spec points at) so it shares the same migration and validation idiom (see [[invoice-status-machine]]). Nothing here writes to Esupl (global constraint G5): a purchase order is LCOS-internal state — the outbound channel is a copyable text, not an ERP call.

To make draft creation fast, a **prefill** endpoint returns the positions a given supplier has delivered before — derived on the backend from that supplier's `invoice_lines` (ingredient, last `unit_price`, last `quantity`). Prefill is computed server-side from real invoice history, not on the frontend, and is scoped to the supplier within the caller's organization.

## Capabilities

- `POST /purchase-orders` — create a `draft` order for a supplier (tenant scope from active context).
- `GET /purchase-orders?status=` — list orders, filterable by status.
- `GET /purchase-orders/{id}` — order header + lines (or `404`).
- `PATCH /purchase-orders/{id}` — edit header fields and **replace lines** (lines updated by full PUT-style replacement, `total_amount` recomputed).
- `POST /purchase-orders/{id}/confirm` — `draft → confirmed`, stamping `confirmed_by`/`confirmed_at`; after confirm, editing lines returns `409`.
- `POST /purchase-orders/{id}/cancel` — `draft|confirmed → cancelled`.
- `GET /purchase-orders/prefill?supplier_id=` — positions previously delivered by that supplier (ingredient, last price, last quantity), built on the backend from `invoice_lines`.
- Denormalized `total_amount` (`Numeric(14,2)`) kept equal to the sum of line totals on every line change.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Create/edit/confirm/cancel orders within their subdivision; request prefill. Any member of the subdivision (plan Э4a). |
| [[admin]] | Same, within their subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved in the ordering flow; operates config/module planes only (see [[LCOS-F3-sqladmin-operator]]). |

Tenant scope (`organization_id` / `subdivision_id`) comes from the active JWT context; cross-tenant reads are blocked (see [[multitenancy]]).

## Involved entities

- [[purchase_orders]] — header: `id (uuid pk)`, `organization_id`, `subdivision_id`, `supplier_id (FK int)`, `status` (native enum `purchase_order_status`), `total_amount Numeric(14,2)` (denormalized), `confirmed_by (FK users uuid, nullable)`, `confirmed_at`, `notes`.
- [[purchase_order_lines]] — `po_id (FK CASCADE)`, `line_no`, `ingredient_id (FK uuid)`, `packing_id (FK uuid, nullable)`, `quantity Numeric(14,3)`, `unit_price Numeric(14,4), nullable`, `origin` enum(`manual/ai/prefill`).
- [[suppliers]] — the order target; supplier cards supply delivery terms and min-order data used downstream ([[LCOS-F38-orders-ui]]).
- [[ingredients]] / [[packings]] — line references; `packing_id` lets the order carry pack-level quantities.
- [[invoice_lines]] — the only source for prefill (last price/quantity per ingredient of the supplier).

## Dependencies / links

- **Requirements:** [[erp-esupl-integration]] (G5 — purchase orders never write to Esupl; the ERP stays read-only), [[invoice-status-machine]] (`InvoiceStatus` is the declaration/transition pattern reused for `purchase_order_status`), [[multitenancy]] (org/subdivision scope + isolation).
- **Features:** consumed by [[LCOS-F38-orders-ui]] (manual draft UI), [[LCOS-F39-order-message]] (confirm → message), [[LCOS-F40-ai-order-proposal]] (proposals write `origin='ai'` lines through this API), [[LCOS-F42-receipt-reconciliation]] (invoice links back to an open PO). Prefill reuses invoice history from [[LCOS-E2-invoice-intake]]; lines carry POS-durable identity via [[sku_mapping]] (moat from [[LCOS-E3-sku-identity]]).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. Migration adds `purchase_orders` + `purchase_order_lines` with native enum `purchase_order_status` (declared like `InvoiceStatus`); applies and rolls back cleanly.
- [ ] AC-BE-2. Status machine: all valid transitions (`draft→confirmed→sent_manually→received`, `draft|confirmed→cancelled`) accepted; every invalid transition → `409` (tested exhaustively).
- [ ] AC-BE-3. `total_amount` always equals the sum of line totals after any line change (recompute test).
- [ ] AC-BE-4. Editing lines of a `confirmed` (or later) order → `409` (lines frozen after confirm).
- [ ] AC-BE-5. `GET /purchase-orders/prefill?supplier_id=` returns only positions of that supplier within the caller's org, built from `invoice_lines` (ingredient, last `unit_price`, last `quantity`) — tested for org scoping.
- [ ] AC-BE-6. No Esupl write path exists anywhere in the router (G5); confirm/cancel are LCOS-internal only.
- [ ] AC-BE-7. `POST /purchase-orders` and `PATCH` are tenant-scoped from active context; order of org A not readable from org B (isolation test).

### Frontend
- [ ] AC-FE-1. `entities/purchase-draft` (FSD) exposes RTK endpoints for create/get/patch/confirm/cancel/prefill; the draft is persisted on the backend (not localStorage). (Screen composition lives in [[LCOS-F38-orders-ui]].)

## Open questions / gates
- Per-position minimum quantity / multiple is **not** a column — it is a property of the supplier×SKU pair; in Phase 1 pack rounding is handled by `packings.factor`. A supplier-level need would go through `extra_terms` ([[LCOS-F18-supplier-criteria]]).
- **Pilot-Gate ([[ADR-003]]):** this backbone must serve a real weekly order cycle used by Customer Zero.

## Sources
- `08_PHASE1_SPEC.md F4.1` (schema, API, status machine, prefill contract, AC).
- `07_PHASES.md Э4a` ("Черновик заказа руками": tables + no Esupl write).
- `mvp.be/app/db/models.py:60-66,219-220` — `InvoiceStatus` + `SAEnum(..., name="invoice_status")` (native PG-enum template for `purchase_order_status`).
- `mvp.be/app/db/models.py:247-260` — `invoice_lines` (`sku`, `quantity`, `unit_price`, `line_total`) — sufficient data for prefill.
- `mvp.be/app/api/v1/routes/invoices.py:45-49` — sample POST route (`submit_invoice`); `routes/suppliers.py` — thin-router pattern.
