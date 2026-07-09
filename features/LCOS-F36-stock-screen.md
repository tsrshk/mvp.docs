---
id: LCOS-F36
type: feature
title: /stock screen (low list + manual adjust)
epic: "[[LCOS-E7-stock]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[stock_levels]]", "[[ingredients]]"]
requirements: ["[[multitenancy]]", "[[provider-abstraction]]"]
adrs: ["[[ADR-016]]"]
legacy_refs: [07 Э3, "08 F3.3"]
sources: ["07_PHASES.md Э3", "08_PHASE1_SPEC.md F3.3", "mvp.fe src/shared/pos/provider.ts", "mvp.fe src/app/App.tsx", "mvp.fe src/app/AppLayout.tsx"]
updated: 2026-07-09
---
# LCOS-F36 · /stock screen (low list + manual adjust)

**Epic:** [[LCOS-E7-stock]] · **Status:** planned · **Phase:** Phase 1

## Description

The human-facing surface of the stock epic: a `/stock` screen that shows current ingredient levels, makes snapshot freshness obvious, presents a ready-made "Low" shopping-list at the top, and lets the user fix reality inline from a phone at the shelf. It is designed for the pre-purchase walk-through — open `/stock`, tap "Refresh", read the "Low" block against the shelf — and is the guaranteed-working manual path from [[ADR-016]] (variant C).

The screen consumes [[LCOS-F34-stock-levels]] (`GET /stock`, `POST /stock/sync`) through a new `PosProvider.listStock()`/`syncStock()` seam and edits thresholds via [[LCOS-F35-reorder-point]]. Inline quantity corrections write a new snapshot with `source='manual'`; the conflict rule between a manual correction and a later Esupl sync is "latest `as_of` wins" (`max(as_of)`), so a manual fix survives until the next real refresh supersedes it in time.

This is a mobile-first screen: the owner acceptance is that a refresh from a phone takes ≤1 minute from tap to result, and that the "Low" block matches the shelf well enough that only isolated discrepancies need an inline fix. A >50% mismatch is the kill-check that sends the epic back to [[ADR-016]].

## Capabilities

- `/stock` route plus a "Stock" navigation entry (`App.tsx`, `AppLayout.tsx`).
- Table per ingredient: name, quantity, unit, `reorder_point`, and snapshot freshness (visibly flagged when older than 24 h).
- "Low" block pinned at the top: everything with `is_low`, sorted by quantity/threshold — a ready shopping-list.
- "Refresh stock" button → `POST /stock/sync` with a spinner and a result toast ("updated M, unmatched K").
- Inline quantity correction (writes a `source='manual'` snapshot) and inline threshold set from the same row; conflict rule `max(as_of)` wins.
- Data access via the `PosProvider.listStock()` / `syncStock()` seam (`backend` + `mock` implementations); mobile layout for shelf-side use.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | View stock, refresh, correct quantities inline within their subdivision. |
| [[admin]] | Same, plus curating `reorder_point` thresholds from the screen. |
| [[superadmin]] | Same across all tenants. |
| [[sqladmin-operator]] | Not involved. |

Scope (`organization_id` / `subdivision_id`) comes from the active JWT context (see [[auth]], [[multitenancy]]).

## Involved entities

- [[stock_levels]] — read for the table (latest snapshot per ingredient) and written by inline corrections (`source='manual'`) and by the refresh (`source='esupl'`).
- [[ingredients]] — supplies name/unit and the `reorder_point` shown and edited on each row (via [[LCOS-F35-reorder-point]]).

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (all stock data flows through the `PosProvider` seam — `backend`/`mock`), [[multitenancy]] (reads and manual snapshots scoped by tenant).
- **Features:** consumes [[LCOS-F34-stock-levels]] (`GET /stock`, `POST /stock/sync`, the `listStock` seam) and [[LCOS-F35-reorder-point]] (threshold edit + `is_low` derivation). The "Low" list is the direct input to [[LCOS-E8-purchasing]] ([[LCOS-F38-orders-ui]], [[LCOS-F40-ai-order-proposal]]).
- **ADR:** [[ADR-016]] (manual adjust = variant C, the always-working path; owner acceptance and >50% kill-check live here).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. Inline quantity correction posts a snapshot with `source='manual'` (reuses the `stock_levels` write path from [[LCOS-F34-stock-levels]]); no new table.
- [ ] AC-BE-2. A manual snapshot and a later Esupl snapshot for the same ingredient resolve by `max(as_of)` on read (`GET /stock` returns the latest).
- [ ] AC-BE-3. Threshold set from the screen goes through `PATCH /ingredients/{id}` ([[LCOS-F35-reorder-point]]); the "Low" block re-derives from the updated `is_low`.

### Frontend
- [ ] AC-FE-1. `/stock` route + "Stock" nav entry exist; the screen reads via a new `PosProvider.listStock()` seam method with `backend` and `mock` implementations (`shared/pos/factory.ts`).
- [ ] AC-FE-2. Table shows name, quantity, unit, `reorder_point`, and snapshot freshness — with an unmistakable marker when the snapshot is older than 24 h.
- [ ] AC-FE-3. The "Low" block sits at the top, is populated from `is_low`, sorted by quantity/threshold, and correctly fills/empties as thresholds change.
- [ ] AC-FE-4. "Refresh stock" calls `POST /stock/sync` (via `syncStock()`), shows a spinner, and reports the summary ("updated M, unmatched K").
- [ ] AC-FE-5. Inline quantity correction is visible immediately and survives the next sync (`max(as_of)`).
- [ ] AC-FE-6. The screen is usable on a phone (shelf-side layout); a refresh from tap to result completes in ≤1 minute.

### Other
- [ ] AC-OTHER-1 (owner acceptance, whole Э3). Before a purchase: open `/stock`, refresh, walk the "Low" block at the shelf — the list matches reality, isolated discrepancies cured inline. **Kill-check:** >50% of positions mismatched and not curable inline → stop, return to [[ADR-016]].

## Open questions / gates

- **Owner acceptance is deferred** until the Esupl token is saved in settings (variant A live). Until then the screen runs on manual entry (C), which is fully functional.
- Freshness threshold (24 h) is a first cut; may be tuned after real shelf use.
- The `mock` provider must return demo snapshots so the screen is developable without a live token.

## Sources

- `07_PHASES.md Э3` (`/stock` page: freshness, "Low" block, manual correction `source=manual`).
- `08_PHASE1_SPEC.md F3.3` (route/nav, table, "Low" block, refresh button, inline adjust, `listStock` seam, mobile — REQ-1..6, AC-1..3, owner acceptance + kill-check).
- `mvp.fe/src/shared/pos/provider.ts` (seam alongside `listSuppliers`/`sendInvoice`), `shared/pos/providers/{backend,mock}.ts`, `shared/pos/factory.ts`.
- `mvp.fe/src/app/App.tsx`, `src/app/AppLayout.tsx` (route + navigation).
