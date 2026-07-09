---
id: LCOS-F41
type: feature
title: "'Propose order' UI + AI-line marking"
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[purchase_orders]]", "[[purchase_order_lines]]", "[[suppliers]]", "[[ingredients]]"]
requirements: ["[[multitenancy]]"]
adrs: []
legacy_refs: ["08 F4.5", "07 Э4b"]
sources: ["08_PHASE1_SPEC.md F4.5", "07_PHASES.md Э4b"]
updated: 2026-07-09
---
# LCOS-F41 · 'Propose order' UI + AI-line marking
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Description

The frontend entry point for the planner: a "Propose order" button next to a supplier on `/orders`. Pressing it calls `POST /purchase-orders/propose?supplier_id=` ([[LCOS-F40-ai-order-proposal]]) and the result is **an ordinary draft** — the same screen and controls as a manual order ([[LCOS-F38-orders-ui]]), with no separate branch. AI-suggested lines are shown with a badge and their `reason` ("stock 1.2 kg below threshold 2 kg"). Editing an AI line flips its `origin` from `ai` to `manual`, which both removes the badge and feeds the close-out metric ([[LCOS-F44-live-closeout]]) that measures how much of the AI proposal the human kept untouched.

When the proposal is empty ("everything's fine"), the UI says so and links to `/stock` ([[LCOS-F36-stock-screen]]) rather than opening an empty draft. The whole value of this feature is that the human reviews and confirms — the AI prepares, the person decides — reusing confirmation and the copyable message ([[LCOS-F39-order-message]]) without any AI-specific code path.

## Capabilities

- "Propose order" button per supplier on `/orders`.
- Result rendered as a normal editable draft (reuses [[LCOS-F38-orders-ui]] with no branching).
- AI lines shown with a badge + `reason`; editing an AI line sets `origin='manual'` and drops the badge.
- Empty proposal → "everything's fine" message + link to `/stock`.
- Confirm / copy path is the shared [[LCOS-F39-order-message]] flow (no AI-specific send code).

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Request a proposal, review AI lines + reasons, edit, confirm and copy. |
| [[admin]] | Same, within their subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved. |

Scope from the active JWT context (see [[multitenancy]]).

## Involved entities

- [[purchase_orders]] / [[purchase_order_lines]] — the proposed draft; `origin` (`ai` → `manual` on edit) drives badge display and the close-out metric.
- [[suppliers]] — the supplier the "Propose order" button belongs to.
- [[ingredients]] — line subjects surfaced with reasons.

## Dependencies / links

- **Requirements:** [[multitenancy]] (proposal + draft scoped to the caller's org).
- **Features:** calls [[LCOS-F40-ai-order-proposal]] (`/propose`); renders through [[LCOS-F38-orders-ui]]; confirms via [[LCOS-F39-order-message]]; the "empty" state links to [[LCOS-F36-stock-screen]] ([[LCOS-E7-stock]]); `origin` marking is consumed by [[LCOS-F44-live-closeout]].

## Acceptance Criteria (AC)

### Frontend
- [ ] AC-FE-1. A draft from a proposal is edited and confirmed exactly like a manual one (reuses [[LCOS-F38-orders-ui]]/[[LCOS-F39-order-message]] with no branching).
- [ ] AC-FE-2. Badges and reasons are visible on AI lines; editing a line removes the badge and sets `origin='manual'`.
- [ ] AC-FE-3. "Propose order" button appears per supplier on `/orders`.
- [ ] AC-FE-4. Empty proposal shows "everything's fine" + a link to `/stock`, without opening an empty draft.

## Open questions / gates
- **Kill-check (owner, whole Э4b):** before a real order, "Propose order" should yield a draft of what's running out with reasonable quantities (edits ≤30% of lines), 2–3 weeks running; edits >70% for three cycles → revert to a checklist.

## Sources
- `08_PHASE1_SPEC.md F4.5` (button, badges + reasons, edit → `origin='manual'`, empty-state link to `/stock`, reuse-without-branching AC).
- `07_PHASES.md Э4b` ("кнопка «Предложить заказ», пометка AI-строк").
