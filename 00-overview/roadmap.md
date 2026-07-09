---
id: OV-ROADMAP
type: overview
title: Roadmap — a single spine of phases and epics
status: current
phase: cross-cutting
updated: 2026-07-09
owner: Ivan
trust_tier: 2
legacy_refs:
  - 07_PHASES.md (Э0–Э8)
  - plan/00_IMPLEMENTATION_PLAN.md (S1/S2/F3–F10/P2)
  - Local_OS_About.md (F1–F10)
sources:
  - 07_PHASES.md (SSOT product-phases, v1.0.0, verified 2026-07-03)
  - plan/00_IMPLEMENTATION_PLAN.md (SSOT phase-order, v1.0.1)
  - _RESTRUCTURE_PLAN.md (collision resolution 1, single spine)
---

# LCOS roadmap — a single spine

> This document **reconciles two diverging plans** — `07_PHASES.md` (stages Э0–Э8) and `plan/00_IMPLEMENTATION_PLAN.md` (stages S1/S2/F3–F10/P2) — into one delivery spine fixed in [[_RESTRUCTURE_PLAN]] (collision 1). No legacy codes are lost: each is carried into the `legacy_refs` of its epic and into the traceability map below.

## The single spine

The phase boundary is **[[glossary]]** (the product has closed the invoice pain at our own coffee shop).

- **Phase 1 — close the invoice pain at our own coffee shop = epics E1–E8.**
  Platform + the invoice wedge + SKU identity + suppliers-basic + stabilization + OCR quality + stock + purchasing. The closed loop "order → WhatsApp → receipt by photo → discrepancies → received".
- **Phase 2 — growth after Pilot-Gate = epics E9–E15.**
  Sales analytics, local context, competitors, menu ideas, strategic insights, SaaS packaging.

The boundary is taken from `07_PHASES.md` (Phase 1 = invoice pain + purchasing end to end, Phase 2 = positioning/growth), not from `plan/00` (where F3–F10 sat in "Phase 1" and Phase 2 = SaaS only). SaaS = [[LCOS-E15-saas]]; competitive positioning = [[LCOS-E11-competitor-menu]] / [[LCOS-E12-competitor-reviews]].

## Phase 1 — E1–E8 (documented in detail)

| Epic | Name | Status | What it delivers | Ladder rung |
|------|----------|--------|----------|------------------|
| [[LCOS-E1-platform]] | Platform and foundations | ✅ | Multitenancy, auth, config/secrets, provider seams, fail-closed, module gates, FE platform | (cross-cutting) |
| [[LCOS-E2-invoice-intake]] | Invoice intake (the wedge) | ✅ | Photo → OCR → matching → validation → Esupl payload + gated write | 1 |
| [[LCOS-E3-sku-identity]] | SKU identity and the learning-loop moat | ✅ | Two-context resolver, [[sku_mapping]], catalog+packings, [[ingredient_cache]] | 2 |
| [[LCOS-E4-suppliers]] | Supplier directory and terms | 🟡 | Cards CRUD, flexible criteria (JSONB), self-service groundwork, price history (planned) | 3 |
| [[LCOS-E5-stabilization]] | Stabilization and conformance | 🟡 | DEC-0011/0013/0012, fail-closed encryption, merge-blocking tests, dead-code cleanup | (cross-cutting) |
| [[LCOS-E6-ocr-quality]] | OCR capture quality | 📝 | Multi-page, context in the prompt, auto-crop, confidence gate | 1 |
| [[LCOS-E7-stock]] | Stock levels and the "running low" list | 📝 | `stock_levels` snapshots + sync, `reorder_point`, the `/stock` screen | 4 |
| [[LCOS-E8-purchasing]] | Purchasing: order drafts and loop closure | 📝 | `purchase_orders`, manual and AI drafts, WhatsApp text, receipt reconciliation, live mode | 4 |

Legend: ✅ built · 🟡 partial · 📝 planned (Phase 1, real AC exists).

**Critical path (07_PHASES §6):** Э0 → Э3 → Э4a → Э4b → Э5, i.e. along the spine **E2/API → E7 → E8**. Parallelized: E5-stabilization with E2/E3; E4 with E7. Phase 1 estimate ≈ 190 h ≈ 4 months at 10–15 h/week.

### → [[glossary]] ←

The Phase 1 → Phase 2 transition criterion (`ADR-003`; historically **Wife-Gate**, the term replaced by the neutral "Pilot-Gate"): the pilot coffee shop's owner (Customer Zero) after **4 weeks of real use** confirms "worse without it", measurably saves **≥3 h/week**, and the full cycle has been lived for 2 weeks with no notebook and no manual double-entry into Esupl. Not passed — we do not move to the second phase.

## Phase 2 — E9–E15 (light epics + feature stubs)

| Epic | Name | Status | What it delivers |
|------|----------|--------|----------|
| [[LCOS-E9-sales-analytics]] | Sales analytics and digest | 🔭 | Read-only sync of sales from Esupl, `sales_history`, a weekly digest, a `reorder_point` hint from consumption |
| [[LCOS-E10-local-context]] | Local context: weather and events | 🔭 | Weather provider, subdivision coordinates, neighborhood events, anomaly enrichment |
| [[LCOS-E11-competitor-menu]] | Competitor menu and prices | 🔭 | Competitor directory, menu OCR (doc-type menu), comparison with the neighborhood, a positioning report |
| [[LCOS-E12-competitor-reviews]] | Competitor reviews | 🔭 | Review storage+ingestion, AI analysis of sentiment/trends, a digest section |
| [[LCOS-E13-menu-ideas]] | Cross-recipe menu ideas | 🔭 | Ideas for new items from existing ingredients + a cost estimate |
| [[LCOS-E14-strategic-insights]] | Strategic insights and a weekly dialog | 🔭 | Weekly "3 questions", a free-form dialog with the context of all modules |
| [[LCOS-E15-saas]] | SaaS (Phase 2) | 🔭 | Prod hardening, self-service onboarding, billing, a second ERP connector (iiko), scaling |

Legend: 🔭 future (an epic stub + feature stubs with links, no detailed AC). Phase 2 estimate ≈ 105 h ≈ +2 months.

## Traceability map: legacy codes → LCOS-E#

Nothing from the old numbering is lost — it is consolidated here and in each epic's `legacy_refs`.

| LCOS-E# | 07_PHASES (Э) | plan/00 (S/F/P) | Local_OS_About (F) | Specs / decisions |
|---------|---------------|-----------------|--------------------|-----------------|
| E1 Platform | — (cross-cutting principles §framework) | G1–G11 (cross-cutting requirements) | Technologies/architecture | Conformance R1–R9; ADR-004/005/006/007/008/009/010/011/012 |
| E2 Invoice intake | Э0 (API contract), Э1 (partial) | F1 (OCR) | F1 OCR, F2 mapping+receipt | 08 F0.x; ADR-002/016 |
| E3 SKU identity & moat | Э1 (mapping memory) | part of F2 | F2 (learning loop) | 08 F1.1/F1.2; DEC-0011/0013/0012; ADR-018/019/020 |
| E4 Supplier directory | Э2 (supplier settings) | F3 (directory/prices) | F3 directory, F4 comparison | 08 F2.x; ADR-017 (self-service seam) |
| E5 Stabilization | Э1 (P0 debt) | S1 (stabilization) | — | 08 Ф1/F1.x; Conformance Part 2; ALIGN-01/VER-01/DEC-02/DEC-05 |
| E6 OCR capture | (inside Э5 per journal) | S2 (OCR quality) | (inside F1) | plan S2 (multi-page, confidence gate) |
| E7 Stock levels | Э3 (stock) | (in the purchasing branch) | — | 08 F3.x; ADR-016 |
| E8 Purchasing | Э4a, Э4b, Э5 (loop closure) | (in the purchasing branch) | — | 08 F4.x/F5.x |
| E9 Sales analytics | Э6 (sales history) | F5 (sales analytics) | F5 | plan F5; Q1/Q2/Q3 |
| E10 Local context | — | F6 (local context) | F6 | plan F6; Q4 |
| E11 Competitor menu | Э7, Э8 (menu + report) | F7 (competitor menu) | F7 | plan F7 |
| E12 Competitor reviews | — | F8 (reviews) | F8 | plan F8; Q5 |
| E13 Menu ideas | — | F9 (cross-recipe) | F9 | plan F9 |
| E14 Strategic insights | — | F10 (insights) | F10 | plan F10 |
| E15 SaaS | — | P2 (SaaS outline) | Phase 2 (for the market) | plan P2 |

**Reconciliation notes:**
- `07_PHASES` assigned Э6–Э8 (sales history + competitors) to its own "Phase 2" — the spine preserves that (E9, E11). Stock/orders (Э3/Э4/Э5) were in Phase 1 in `07_PHASES` → E7/E8 stay in the spine's Phase 1.
- `plan/00` counted F3–F10 as part of Phase 1, with Phase 2 = SaaS only. The spine **moves the boundary to Pilot-Gate**: after the invoice+purchasing pain is closed. Analytics/competitors/SaaS = Phase 2.
- `plan/00` stages `F3`/`F4` (suppliers + price comparison) are folded into the single epic [[LCOS-E4-suppliers]]; price comparison is one of its future features.
- The "F" collision (plan F1–F10 vs 08 F0.1–F5.3 vs strategy routine-steps) is resolved: all replaced by `LCOS-F#`, legacy only in `legacy_refs` (see [[_RESTRUCTURE_PLAN]] collision 3).

## Dependencies (as-planned)

```
Phase 1: E1 (foundation, ready)
  → E2 (the invoice wedge) ─┬→ E3 (identity/moat)   [both built]
                            └→ E4 (suppliers)
  E5 (stabilization) — in parallel, fixes the principles + the test base
  E6 (OCR quality) — per the live-use journal (inside/after E2)
  E2 → E7 (stock) → E8 (purchasing: draft → AI draft → loop closure)
  ────────────── PILOT-GATE ──────────────
Phase 2: E9 (sales) → E10 (context)
        E11 (competitor menu) → E12 (reviews)
        E9+E11 → E13 (menu ideas)
        everything → E14 (insights) → E15 (SaaS)
```

## Consciously NOT in these phases

Auto-sending orders and any write to Esupl other than the gated [[glossary]] `write_invoice`; demand forecasting (manual thresholds + hints from history); `supplier_prices`/price alerts before E4-future; a supplier portal (schema placeholder only, `ADR-017`); Celery/APScheduler (everything is button-driven in Phase 1); embeddings/pgvector matching (the `sku_embedding` column is unused, backlog `DEC-02`). Full list — [[product]] §5 dev stop-list.

## Related documents

- [[product]] — identity and strategy (routine ladder ↔ epics)
- [[architecture]] — the as-built implementation
- [[MOC]] — map of content · [[index]] — the decision log
- [[glossary]] · [[global-requirements]] (R1–R9)

## Sources

- `07_PHASES.md` v1.0.0 — stages Э0–Э8, critical path §6, forks §7.
- `plan/00_IMPLEMENTATION_PLAN.md` v1.0.1 — stages S1/S2/F3–F10/P2, cross-cutting G1–G11, the Pilot-Gate definition §2.
- `_RESTRUCTURE_PLAN.md` — collision resolution 1/2/3, the Epic→Feature ID map.
