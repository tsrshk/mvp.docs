---
id: LCOS-F27
type: feature
title: Frontend entities/order → receipts rename
epic: "[[LCOS-E5-stabilization]]"
status: planned
phase: "Phase 1"
roles: [member, admin]
entities: ["[[invoices]]"]
requirements: ["[[global-requirements]]", "[[erp-esupl-integration]]"]
adrs: []
legacy_refs: [08 F1.6, plan S1]
sources: ["08_PHASE1_SPEC.md F1.6", "APP_OVERVIEW.md §9", "mvp.fe src/entities/order", "mvp.fe src/pages/invoices-list/ui/InvoicesListPage.tsx:4"]
updated: 2026-07-09
---
# LCOS-F27 · Frontend entities/order → receipts rename

**Epic:** [[LCOS-E5-stabilization]] · **Status:** planned · **Phase:** Phase 1

## Description

The frontend has an FSD slice named `entities/order` that models **incoming Esupl receipts** (`GET /teams/{id}/orders`, exposed as `useGetOrdersQuery` / `PosOrder`). This name will collide with the *purchase order draft* concept coming in the purchasing epic ([[LCOS-E8-purchasing]], `entities/purchase-draft`). To avoid an ambiguous "order" meaning two different things, this feature renames the slice `entities/order → entities/receipts` **before** purchase orders arrive.

The scope is intentionally tiny: the slice is imported from exactly one place outside itself — `pages/invoices-list/ui/InvoicesListPage.tsx` (`useGetOrdersQuery`, `PosOrder`). It is a pure rename with no behaviour change: the same Esupl read endpoint, the same query hook semantics, the same list rendering. This is bookkeeping debt paid down during stabilization so the later purchasing work starts on unambiguous names.

## Capabilities

- The FSD slice is renamed `entities/order` → `entities/receipts` (directory, module barrel, and internal symbol names as appropriate).
- The single external import site is updated; no other consumer exists.
- Behaviour is byte-for-byte unchanged: the invoices list still reads Esupl receipts via the same endpoint and renders identically.
- Name collision with the future `entities/purchase-draft` is pre-empted.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | No change in what they can do: the invoices/receipts list behaves identically after the rename. |
| [[admin]] | Same within their subdivision. |
| [[superadmin]] | Same across tenants. |

This is an internal refactor; there is no change to roles, scope, or any endpoint.

## Involved entities

- [[invoices]] — the receipts list (Esupl `orders`) is the read-side view over incoming documents; the renamed slice is its FE representation. No data-model or table change is involved.

## Dependencies / links

- **Requirements:** [[global-requirements]] (`R9`: clean, non-colliding module structure), [[erp-esupl-integration]] (the slice wraps the read-only `GET /teams/{id}/orders` receipts endpoint).
- **Features:** clears the naming runway for [[LCOS-E8-purchasing]] (`entities/purchase-draft`); the read endpoint it wraps is [[LCOS-F11-esupl-read]]; the list screen it feeds is part of [[LCOS-F10-invoice-status-machine]]'s surface.
- **Decisions:** none (pure rename).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. No backend change: the Esupl `GET /teams/{id}/orders` receipts endpoint and its wiring are untouched.

### Frontend
- [ ] AC-FE-1. `src/entities/order` no longer exists; the slice lives at `src/entities/receipts`.
- [ ] AC-FE-2. The single external import in `pages/invoices-list/ui/InvoicesListPage.tsx` is updated (query hook + `PosOrder`/renamed type); no dangling references to `entities/order` remain (`grep` clean).
- [ ] AC-FE-3. `npm run build` green; behaviour unchanged (the invoices/receipts list renders and queries exactly as before).

### Other
- [ ] AC-OTHER-1. The rename is a no-op for tests beyond import-path updates; the FE suite stays green.

## Open questions / gates

- **Symbol renaming depth:** whether to rename `useGetOrdersQuery`/`PosOrder` to receipts-flavoured names or keep them for minimal churn — owner choice; the directory/slice rename is the required part.
- Sequencing: land this before starting [[LCOS-E8-purchasing]] to avoid a double-rename.

## Sources

- `08_PHASE1_SPEC.md F1.6` (rename rationale — pre-empt `entities/purchase-draft` collision; single external import; AC-1).
- `APP_OVERVIEW.md §9` (Esupl receipts read: `GET /teams/{id}/orders`).
- Current state: `mvp.fe/src/entities/order` still present; imported by `mvp.fe/src/pages/invoices-list/ui/InvoicesListPage.tsx:4` (`useGetOrdersQuery`, `PosOrder`).
