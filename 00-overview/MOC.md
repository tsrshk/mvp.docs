---
id: OV-MOC
type: moc
title: Map of Content — the LCOS vault map
status: current
phase: cross-cutting
updated: 2026-07-09
owner: Ivan
trust_tier: 3
sources:
  - _RESTRUCTURE_PLAN.md (Epic→Feature ID map, target tree)
---

# MOC — the LCOS vault map of content

> An overview index of the whole vault: overview docs, epics E1–E15, features F1–F71, entities, roles, requirements, and decisions. The usual entry is from an epic or an overview doc, and from there deeper via `[[README]]`. The structure is by type + wikilinks (no physical nesting), see [[_RESTRUCTURE_PLAN]].

## Overview

- [[product]] — product identity (an AI manager), strategy, market, dev stop-list
- [[roadmap]] — the single spine of phases, epics E1–E15, [[glossary]], the legacy-code map
- [[architecture]] — the as-built architecture (layers, flows, state)
- [[glossary]] — terms (moat, source_key, fail-closed, ProviderContext, …)
- [[README]] — the vault map and the document registry

## Epics

### Phase 1 (E1–E8) — close the invoice pain, in detail

- [[LCOS-E1-platform]] ✅ — Platform and foundations
- [[LCOS-E2-invoice-intake]] ✅ — Invoice intake (the wedge)
- [[LCOS-E3-sku-identity]] ✅ — SKU identity and the learning-loop moat
- [[LCOS-E4-suppliers]] 🟡 — Supplier directory and terms
- [[LCOS-E5-stabilization]] 🟡 — Stabilization and conformance
- [[LCOS-E6-ocr-quality]] 📝 — OCR capture quality
- [[LCOS-E7-stock]] 📝 — Stock levels and the "running low" list
- [[LCOS-E8-purchasing]] 📝 — Purchasing: order drafts and loop closure

**→ [[glossary]] ←**

### Phase 2 (E9–E15) — growth after Pilot-Gate, stubs

- [[LCOS-E9-sales-analytics]] 🔭 — Sales analytics and digest
- [[LCOS-E10-local-context]] 🔭 — Local context: weather and events
- [[LCOS-E11-competitor-menu]] 🔭 — Competitor menu and prices
- [[LCOS-E12-competitor-reviews]] 🔭 — Competitor reviews
- [[LCOS-E13-menu-ideas]] 🔭 — Cross-recipe menu ideas
- [[LCOS-E14-strategic-insights]] 🔭 — Strategic insights and a weekly dialog
- [[LCOS-E15-saas]] 🔭 — SaaS (Phase 2)

## Features by epic

**E1 — Platform:** [[LCOS-F1-multitenancy]] · [[LCOS-F2-app-auth]] · [[LCOS-F3-sqladmin-operator]] · [[LCOS-F4-config-secrets]] · [[LCOS-F5-provider-seams]] · [[LCOS-F6-module-gates]] · [[LCOS-F7-frontend-platform]]

**E2 — Invoice intake:** [[LCOS-F8-ocr-recognition]] · [[LCOS-F9-line-matching]] · [[LCOS-F10-invoice-status-machine]] · [[LCOS-F11-esupl-read]] · [[LCOS-F12-warehouse-target]]

**E3 — SKU identity / moat:** [[LCOS-F13-sku-identity-resolver]] · [[LCOS-F14-learning-loop]] · [[LCOS-F15-sku-catalog]] · [[LCOS-F16-ingredient-cache]]

**E4 — Suppliers:** [[LCOS-F17-supplier-cards]] · [[LCOS-F18-supplier-criteria]] · [[LCOS-F19-supplier-self-service]] · [[LCOS-F20-price-history]] · [[LCOS-F21-price-change-signal]]

**E5 — Stabilization:** [[LCOS-F22-sku-stabilization]] · [[LCOS-F23-failclosed-encryption]] · [[LCOS-F24-merge-gate-tests]] · [[LCOS-F25-deadcode-cleanup]] · [[LCOS-F26-multipage-fix]] · [[LCOS-F27-receipts-rename]] · [[LCOS-F28-esupl-contracts]]

**E6 — OCR quality:** [[LCOS-F29-multipage-recognize]] · [[LCOS-F30-recognition-context]] · [[LCOS-F31-auto-crop]] · [[LCOS-F32-camera-capture]] · [[LCOS-F33-confidence-gate]]

**E7 — Stock:** [[LCOS-F34-stock-levels]] · [[LCOS-F35-reorder-point]] · [[LCOS-F36-stock-screen]]

**E8 — Purchasing:** [[LCOS-F37-purchase-orders]] · [[LCOS-F38-orders-ui]] · [[LCOS-F39-order-message]] · [[LCOS-F40-ai-order-proposal]] · [[LCOS-F41-ai-order-ui]] · [[LCOS-F42-receipt-reconciliation]] · [[LCOS-F43-idempotency]] · [[LCOS-F44-live-closeout]]

**E9 — Sales analytics (stubs):** [[LCOS-F45-sales-read]] · [[LCOS-F46-sales-storage]] · [[LCOS-F47-scheduler]] · [[LCOS-F48-weekly-digest]] · [[LCOS-F49-reorder-suggestion]]

**E10 — Local context (stubs):** [[LCOS-F50-weather]] · [[LCOS-F51-coordinates]] · [[LCOS-F52-local-events]] · [[LCOS-F53-digest-enrichment]]

**E11 — Competitor menu (stubs):** [[LCOS-F54-competitor-directory]] · [[LCOS-F55-menu-ocr]] · [[LCOS-F56-positioning]] · [[LCOS-F57-places-prefill]]

**E12 — Competitor reviews (stubs):** [[LCOS-F58-review-storage]] · [[LCOS-F59-review-analysis]] · [[LCOS-F60-reviews-api]]

**E13 — Menu ideas (stubs):** [[LCOS-F61-menu-idea-generation]] · [[LCOS-F62-menu-ideas-ui]]

**E14 — Strategic insights (stubs):** [[LCOS-F63-insight-context]] · [[LCOS-F64-weekly-questions]] · [[LCOS-F65-freeform-dialog]]

**E15 — SaaS (stubs):** [[LCOS-F66-prod-hardening]] · [[LCOS-F67-onboarding]] · [[LCOS-F68-billing]] · [[LCOS-F69-iiko-connector]] · [[LCOS-F70-tenancy-scaling]] · [[LCOS-F71-product-packaging]]

## Data entities

Tenant hierarchy: [[organizations]] · [[subdivisions]] · [[users]] · [[memberships]]
Catalog and identity: [[ingredients]] · [[packings]] · [[ingredient_cache]] · [[sku_mapping]]
Invoices: [[invoices]] · [[invoice_lines]]
Suppliers: [[suppliers]]
Configuration/secrets: [[integration_credentials]] · [[system_settings]]
Stock (Phase 1): [[stock_levels]]

## Roles

Application plane (JWT): [[superadmin]] · [[admin]] · [[member]]
Operator plane: [[sqladmin-operator]]
Placeholder (future): [[supplier-future]]

## Requirements (cross-cutting SSOT)

- [[auth]] — application authorization (JWT+refresh, reuse detection)
- [[multitenancy]] — tenant isolation (org/subdivision scope)
- [[config-secrets]] — the three configuration tiers
- [[secret-encryption]] — the Fernet envelope `enc:v2`, a versioned KEK
- [[fail-closed]] — an explicit error instead of a silent fallback
- [[vpn-egress]] — fail-closed egress to the AI (VPN sidecar)
- [[provider-abstraction]] — providers behind a Protocol + registry, ProviderContext
- [[erp-esupl-integration]] — Esupl read-only + the single gated write-point
- [[sku-identity-resolver]] — the two-context resolver (draft/commit)
- [[invoice-status-machine]] — invoice statuses
- [[supplier-criteria-registry]] — the flexible criteria registry (JSONB)
- [[global-requirements]] — normative R1–R9

## Decisions (ADR)

- [[index]] — the decision log ADR-001…020 + the `DEC-0011` / `DEC-0013` records
- Key ones: [[ADR-002]] (human-in-the-loop) · [[ADR-003]] ([[glossary]]) · [[ADR-006]] (fail-closed) · [[ADR-007]] (two auth planes) · [[ADR-008]] (multitenancy) · [[ADR-009]] (one implementation per seam) · [[ADR-016]] (stock source) · [[ADR-017]] (supplier self-service seam) · [[ADR-018]] (DEC-0013 variant A) · [[ADR-019]] (DEC-0012 composite key) · [[ADR-020]] (persist-then-commit)

## Reference and process

- `reference/esupl-api/` — Esupl API contracts (moved from `api/esupl/`)
- `work/` — live process docs (aligned TZ, the fix journal, the `VER-021` gate, backlog)
- `archive/` — inert and superseded docs

## Sources

- `_RESTRUCTURE_PLAN.md` — the Epic→Feature ID map (E1–E15 / F1–F71), target tree, migration dispositions.
