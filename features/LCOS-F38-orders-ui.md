---
id: LCOS-F38
type: feature
title: /orders manual draft UI + min-order indicator
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[purchase_orders]]", "[[purchase_order_lines]]", "[[suppliers]]", "[[ingredients]]", "[[packings]]"]
requirements: ["[[multitenancy]]"]
adrs: []
legacy_refs: ["08 F4.2", "07 Э4a"]
sources: ["08_PHASE1_SPEC.md F4.2", "07_PHASES.md Э4a", "mvp.fe src/features/lines-table/ui/SkuSelect.tsx", "mvp.fe src/features/lines-table/ui/LinesTable.tsx:24-38", "mvp.fe src/app/App.tsx", "mvp.fe src/widgets/app-layout/ui/AppLayout.tsx"]
updated: 2026-07-09
---
# LCOS-F38 · /orders manual draft UI + min-order indicator
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Description

The `/orders` screen is where a coffee-shop owner assembles a real order by hand from a phone. It lists purchase orders by status and starts a **new order** by picking a supplier (suppliers with filled-in cards first). On draft creation it offers to "add what this supplier has delivered before" (prefill from [[LCOS-F37-purchase-orders]]), and it shows a live **min-order indicator**: total vs the supplier's `min_order_amount` with a "you need X more to reach the minimum" warning. Draft state is persisted on the backend (via `entities/purchase-draft`), so a reload never loses lines.

The line editor deliberately does **not** reuse `features/lines-table` as a whole: that component is hard-wired to the invoice Redux slice (`LinesTable.tsx` reads `s.invoiceSession.lines`). Instead this feature builds its own order-lines table (a new feature slice, or UI inside `entities/purchase-draft`) that **reuses the subcomponents** — `SkuSelect` (catalog search) and the `LineRow`/`LineCard` markup patterns (desktop table + mobile cards). `LinesTable` itself is not refactored.

This screen is channel-agnostic about *sending*: confirmation and the copyable supplier message are the sibling feature [[LCOS-F39-order-message]]; the AI "Propose order" entry point is [[LCOS-F41-ai-order-ui]].

## Capabilities

- Route `/orders` ("Orders") in nav (sidebar + mobile drawer): list of purchase orders grouped by status.
- "New order" flow: supplier picker (cards with settings shown first).
- Prefill on draft creation: "add what was delivered before" → lines with `origin=prefill` (from [[LCOS-F37-purchase-orders]] `GET /prefill`).
- Editable order-lines table: add/remove lines, catalog search via reused `SkuSelect`, quantity + pack (`packing_id`) per line.
- Live totals: `total_amount` and the min-order indicator recompute on every quantity change.
- Min-order indicator: progress toward `min_order_amount` with a shortfall warning.
- Backend-persisted draft (`entities/purchase-draft`), not localStorage — survives reload.
- Mobile-first layout suitable for composing an order from a phone.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Open `/orders`, create/edit drafts for their subdivision, run prefill, watch the min-order indicator. |
| [[admin]] | Same, within their subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved; no `/orders` access in the app plane. |

Scope (`organization_id` / `subdivision_id`) comes from the active JWT context (see [[multitenancy]]); the screen only shows the caller's own orders and suppliers.

## Involved entities

- [[purchase_orders]] — the listed/edited header; `total_amount` drives the min-order indicator.
- [[purchase_order_lines]] — the editable rows (`origin` = `manual` when hand-added, `prefill` when seeded).
- [[suppliers]] — supplier picker + `min_order_amount` / `min_order_note` for the indicator (from [[LCOS-F17-supplier-cards]]).
- [[ingredients]] / [[packings]] — catalog search targets and pack selection per line.

## Dependencies / links

- **Requirements:** [[multitenancy]] (screen is tenant-scoped from active context).
- **Features:** built on [[LCOS-F37-purchase-orders]] (all persistence + prefill API); confirmation + supplier message is [[LCOS-F39-order-message]]; AI proposal entry point is [[LCOS-F41-ai-order-ui]] (reuses this exact screen with no branching). Supplier cards and `min_order_amount` come from [[LCOS-F17-supplier-cards]]. Subcomponent reuse (not full reuse) from `features/lines-table` of [[LCOS-F9-line-matching]].

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. No new backend surface beyond [[LCOS-F37-purchase-orders]]; this screen consumes existing endpoints (create/patch/get/prefill). (Covered by F37 AC.)

### Frontend
- [ ] AC-FE-1. Full path works: new order → supplier pick → prefill → edit quantities → `total_amount` and min-order indicator recompute live.
- [ ] AC-FE-2. Reload does not lose lines (draft persisted on backend, not localStorage).
- [ ] AC-FE-3. Min-order indicator shows progress vs `min_order_amount` with a "need X more" message; hidden/neutral when the supplier has no minimum.
- [ ] AC-FE-4. Order-lines table is a **new** slice/UI reusing `SkuSelect` and `LineRow`/`LineCard` patterns; `features/lines-table`/`LinesTable` is not modified.
- [ ] AC-FE-5. Mobile layout is usable for composing an order from a phone (touch targets, cards).
- [ ] AC-FE-6. `/orders` nav item present in sidebar + drawer; list shows orders grouped by status.

## Open questions / gates
- Owner acceptance (whole Э4a, with [[LCOS-F39-order-message]]): assemble a real weekly order — prefill → edit → "need X to reach minimum" → top up → confirm → copy → send in the supplier's channel; supplier accepts the format without questions.

## Sources
- `08_PHASE1_SPEC.md F4.2` (route, prefill, min-order indicator, no-reuse decision, `entities/purchase-draft`, AC).
- `07_PHASES.md Э4a` (own editable table reusing subcomponents; SSOT is the spec).
- `mvp.fe/src/features/lines-table/ui/SkuSelect.tsx` (reused), `LineRow.tsx`/`LineCard.tsx` (patterns), `LinesTable.tsx:24-38` (why the whole table is not reused — bound to `invoiceSession`).
- `mvp.fe/src/app/App.tsx`, `src/widgets/app-layout/ui/AppLayout.tsx` — route + navigation.
