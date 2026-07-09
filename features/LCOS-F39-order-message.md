---
id: LCOS-F39
type: feature
title: Confirm → copyable supplier message
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[purchase_orders]]", "[[purchase_order_lines]]", "[[suppliers]]"]
requirements: ["[[erp-esupl-integration]]", "[[supplier-criteria-registry]]"]
adrs: []
legacy_refs: ["08 F4.3", "07 Э4a"]
sources: ["08_PHASE1_SPEC.md F4.3", "07_PHASES.md Э4a"]
updated: 2026-07-09
---
# LCOS-F39 · Confirm → copyable supplier message
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Description

Turns a confirmed order into a ready-to-send text the owner copies and pastes to the supplier. Suppliers use different channels (WhatsApp / Telegram / Viber / phone / email — captured as `contact_channel` / `contact_value` on the supplier card, see [[LCOS-F18-supplier-criteria]]). Phase 1 is deliberately **channel-agnostic**: LCOS composes a universal, human-readable text that is copied and sent manually. There are **no messenger/email integrations** (global constraint G7); the channel is used only as a hint about *where* to send, never as a way to send.

"Confirm order" calls confirm on the backend (`draft → confirmed`, from [[LCOS-F37-purchase-orders]]) and opens a modal with the generated message: greeting, one line per position ("item — quantity in packs/units"), total, and the shop's signature, in plain Russian. A "Copy" button uses `navigator.clipboard` and marks the order `sent_manually`. The channel hint (e.g. "send to Telegram @…") is shown from the supplier's `contact_channel`/`contact_value`, and a `tel:` / `https://t.me/…` deep link is allowed as a convenience — but the message text itself stays universal.

## Capabilities

- "Confirm order" → backend confirm (`draft → confirmed`) → modal with the composed text.
- Composed message: greeting, per-line "position — quantity (packs/units)", total, shop signature; human-readable Russian.
- "Copy" (`navigator.clipboard`) → also transitions the order to `sent_manually` (manual mark that the order went out).
- Channel hint from `contact_channel` / `contact_value` ("send to Telegram @…"); optional deep link (`tel:` / `t.me`) when a value exists.
- No messenger/email API integration (G7) — text only.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Confirm an order, copy the message, mark it `sent_manually`. |
| [[admin]] | Same, within their subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved. |

Scope from active JWT context; a member confirms only their subdivision's orders.

## Involved entities

- [[purchase_orders]] — confirm (`draft → confirmed`) then `sent_manually`; `confirmed_by`/`confirmed_at` stamped on confirm.
- [[purchase_order_lines]] — the source of message lines (position, quantity, pack/unit).
- [[suppliers]] — `contact_channel` / `contact_value` supply the channel hint and optional deep link (from [[LCOS-F18-supplier-criteria]]).

## Dependencies / links

- **Requirements:** [[erp-esupl-integration]] (G5/G7 — no ERP write, no messenger integration; the order leaves LCOS as copyable text only), [[supplier-criteria-registry]] (`contact_channel`/`contact_value` live on the supplier card).
- **Features:** consumes confirm/`sent_manually` transitions from [[LCOS-F37-purchase-orders]]; opens from the `/orders` screen [[LCOS-F38-orders-ui]]; reused unchanged by AI-proposed drafts [[LCOS-F41-ai-order-ui]]; channel fields from [[LCOS-F17-supplier-cards]] / [[LCOS-F18-supplier-criteria]]. A `sent_manually` order is later reconciled against the arriving invoice in [[LCOS-F42-receipt-reconciliation]].

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. Confirm transition `draft → confirmed` stamps `confirmed_by`/`confirmed_at`; a subsequent "sent" mark transitions `confirmed → sent_manually` (rejects illegal transitions with `409`, per [[LCOS-F37-purchase-orders]]).

### Frontend
- [ ] AC-FE-1. Message contains all lines, quantities with units, and the total; pasting into any messenger preserves line breaks.
- [ ] AC-FE-2. After "Copy", the order moves to `sent_manually` and appears in the list with its date.
- [ ] AC-FE-3. The channel hint matches the supplier's `contact_channel` (or is hidden when unset); optional deep link opens the channel.
- [ ] AC-FE-4. No messenger/email is called — the only outbound action is clipboard copy (G7).

## Open questions / gates
- **Human confirms sending:** LCOS composes and marks; the actual send is a human action in the supplier's channel (cross-cutting principle of [[LCOS-E8-purchasing]]).
- Owner acceptance (whole Э4a): the supplier accepts the copied text without questions about its format.

## Sources
- `08_PHASE1_SPEC.md F4.3` (channel-agnostic approach, confirm→modal, clipboard + `sent_manually`, channel hint, G7 no-integration, AC).
- `07_PHASES.md Э4a` ("Скопировать текст для WhatsApp" — channel is text, no auto-send).
