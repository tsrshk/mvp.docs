---
id: ADR-INDEX
type: adr-index
title: Architecture decision registry (ADR log)
status: current
updated: 2026-07-09
sources: [04_DECISIONS.md, 04_DECISIONS__DEC-0011.md, 04_DECISIONS__DEC-0013.md]
---
# Architecture decision registry (ADR log)

An append-only log of recorded decisions. We do not rewrite a past entry — when something changes we mark it `superseded` and add a new one with a link. The entries codify previously made decisions (gathered from the code, `CLAUDE.md`, product docs, and analysis); the codification date is 2026-07-02 unless explicitly stated otherwise. Trust order: **code > normative > descriptive** ([[ADR-015]]).

## Registry

| ID | Decision | Status | Date |
|---|---|---|---|
| [[ADR-001]] | LCOS is an invoice entry point, not a POS | accepted | 2026-07-02 |
| [[ADR-002]] | Human-in-the-loop | accepted | 2026-07-02 |
| [[ADR-003]] | Phase discipline and the Pilot-Gate (Wife-Gate) | accepted | 2026-07-02 |
| [[ADR-004]] | Esupl as the primary ERP | accepted | 2026-07-02 |
| [[ADR-005]] | Three-tier separation of configuration/secrets, no env fallback | accepted | 2026-07-02 |
| [[ADR-006]] | Fail-closed everywhere | accepted | 2026-07-02 |
| [[ADR-007]] | Two independent authentication planes | accepted | 2026-07-02 |
| [[ADR-008]] | Organization-as-tenant; multi-tenant-ready, single-tenant-first | accepted | 2026-07-02 |
| [[ADR-009]] | One implementation per provider-seam until a real trigger | accepted (excl. `gemini`) | 2026-07-02 |
| [[ADR-010]] | Secret encryption at-rest (Fernet envelope, versioned KEK) | accepted | 2026-07-02 |
| [[ADR-011]] | Secrets are read without caching | accepted | 2026-07-02 |
| [[ADR-012]] | The frontend stores no secrets | accepted | 2026-07-02 |
| [[ADR-013]] | Photo-first invoice flow | accepted | 2026-06-29 |
| [[ADR-014]] | OCR via a vision-LLM, not a classic OCR engine | accepted | 2026-06-22 |
| [[ADR-015]] | Documentation regime (trust order, archive is inert) | accepted | 2026-07-02 |
| [[ADR-016]] | Source of stock and consumption | proposed | 2026-07-03 |
| [[ADR-017]] | Supplier self-service — leave the door open, don't build the portal | accepted | 2026-07-03 |
| [[ADR-018]] | SKU-identity commit-gate: POS = SoT, mapping on a durable id, variant A | accepted | 2026-07-08 |
| [[ADR-019]] | DEC-0012: composite key for `sku_mapping` (supplier in the key) | accepted | 2026-07-09 |
| [[ADR-020]] | Moat accumulation channel: client-side `POST /ingredients/mappings` in `onSend` | accepted | 2026-07-09 |

## Detailed decision records (DEC)
Fragmentary DEC records, folded into full documents and codified by [[ADR-018]]:

| ID | Decision | Status | Codified in |
|---|---|---|---|
| [[DEC-0011]] | POS as SoT of identity; mapping on a durable POS ID; two-phase authority | accepted | [[ADR-018]] |
| [[DEC-0013]] | Commit requires confirmed SKU identity (variant A) | accepted | [[ADR-018]] |

> **DEC-0012** is ratified as [[ADR-019]] (composite key for `sku_mapping`). It has no separate DEC document.

## Open gates / debts
- **VER-021** (durability of `pos_ingredient_id`) — a GATE, requires a WRITE into the Esupl sandbox → owner-run; not closable in read-only. Linchpin of [[DEC-0011]] / [[ADR-018]].
- **BACKLOG DEC-01** — resolution of the second OCR/AI vendor `gemini` (violates [[ADR-009]]): claude-only (recommended) or complete the seam.
- **BACKLOG DEC-02** — dead-code cleanup: unused `invoice_lines.sku_embedding` (pgvector), browser-direct LLM/ERP (A2), plaintext fallback in `encrypt()` (A1). See [[LCOS-E5-stabilization]].
- **ALIGN-014** — `ERPProvider` READ seam (`list_ingredients`, `get_ingredient`).

## Changelog
- 2026-07-09 v1.4.0 — added [[ADR-020]] (moat accumulation channel = client-side `POST /ingredients/mappings` in `onSend`; persist-then-commit independent of an invoice reject; FE `save()` removed; dangling reference `ADR-013` removed from APP_OVERVIEW §8).
- 2026-07-09 v1.3.0 — added [[ADR-019]] (DEC-0012 ratified: composite key for `sku_mapping` with `supplier_external_id`; for the learning-loop migration into the backend).
- 2026-07-09 v1.2.0 — added [[ADR-018]] (SKU-identity commit-gate: codification of [[DEC-0011]] + [[DEC-0013]] variant A; the veto of variant C from `TZ__STABILIZATION_2026-07-09` recorded, variant A ratified).
- 2026-07-03 v1.1.0 — added [[ADR-016]] (source of stock/consumption — proposed, resolved by Э0 probes) and [[ADR-017]] (supplier self-service — accepted, schema groundwork without a portal).
- 2026-07-02 v1.0.0 — created; [[ADR-001]]…[[ADR-015]] codified from the code, CLAUDE.md, product docs, and analysis.

## Links
- [[README]] · [[MOC]] · [[architecture]] · [[glossary]]
