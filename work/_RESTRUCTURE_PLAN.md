---
doc: DOCS_RESTRUCTURE_PLAN
title: Documentation restructure — plan, ID map, templates, migration (Obsidian/Jira vault)
version: 0.1.0
status: in_progress
updated: 2026-07-09
owner: Ivan
trust_tier: 4
notes: Generation SSOT + progress journal for the mvp.docs restructure. Owner-approved decisions locked below.
---

# Docs restructure — plan & generation SSOT

## Locked decisions (owner-approved 2026-07-09)
- **Numbering:** grouped-typed with project key — epics `LCOS-E#`, features `LCOS-F#`. Obsidian `[[wikilinks]]` resolve by these IDs.
- **Scope now:** Phase 1 (E1–E8) documented FULLY (description, capabilities, role-access, entities, AC by BE/FE/other). Future (E9–E15) = light epic + feature stubs with links, no detailed AC.
- **Migration:** restructure IN PLACE in `mvp.docs/` (own git repo; no commit unless asked).
- **Structure:** folders BY TYPE + wikilinks (no physical epic/feature nesting).

## Collision resolutions (from inventory `wf_23ea3cfb-73b`)
1. **Two roadmaps** (07_PHASES Э0–Э8 vs plan/00 S1/S2/F3–F10/P2) → single delivery spine:
   **Phase 1 = close invoice pain on own shop** (platform + invoice wedge + SKU identity + suppliers-basic + stabilization + OCR-quality + stock + ordering) = **E1–E8**.
   **Phase 2 = post-Pilot-Gate growth** (analytics, local context, competitors, menu ideas, strategic insights, SaaS) = **E9–E15**.
   Legacy Э/F/S codes preserved in each doc's `legacy_refs` front-matter — nothing lost.
2. **"Phase 2" ambiguity** resolved by the spine above (SaaS = E15; competitive-positioning = E11/E12).
3. **"F" code collision** (plan F1–F10 stages vs 08 F0.1–F5.3 feature codes vs strategy routine-steps) → all replaced by `LCOS-F#`; legacy codes only in `legacy_refs`.
4. **As-built diverged from plan:** learning-loop moat (DEC-0012 composite key, ADR-019/020) and supplier criteria-registry (Supplier.criteria JSONB) are BUILT designs that SUPERSEDE 08_PHASE1_SPEC F1.1/F1.2 and F2.1. Docs describe as-built; superseded plan text noted as history.
5. **Gate rename:** Wife-Gate (ADR-003) == Pilot-Gate. Use "Pilot-Gate", cross-ref ADR-003.
6. **Requirements SSOT:** normative R1–R9 (Conformance) + Phase-1 AC (08_PHASE1_SPEC) consolidate into `requirements/` (fills the never-created 02_REQUIREMENTS slot).

## Target tree (by-type + wikilinks)
```
mvp.docs/
├─ README.md              vault map + doc regime + rebuilt registry (MOC entry)
├─ 00-overview/           product.md · architecture.md · roadmap.md · glossary.md · MOC.md
├─ epics/                 LCOS-E1..E15
├─ features/              LCOS-F1..F71 (full E1–E8 / stub E9–E15)
├─ entities/              14 data-model docs
├─ roles/                 superadmin · admin · member · sqladmin-operator · supplier-future
├─ requirements/          cross-cutting SSOT (auth, multitenancy, config-secrets, fail-closed,
│                         vpn-egress, provider-abstraction, erp-esupl, sku-identity-resolver,
│                         invoice-status-machine, secret-encryption, supplier-criteria,
│                         global-requirements R1–R9)
├─ adr/                   index.md + ADR-001..020 (one file per ADR) + DEC-0011/DEC-0013 records
├─ reference/esupl-api/   (moved from api/esupl/)
├─ work/                  live process docs (aligned TZ, fix journal, VER-021 gate)
└─ archive/               inert + superseded process docs
```

## Epic → Feature ID map
Legend: ✅ built · 🟡 partial · 📝 planned (Phase 1, real AC exists) · 🔭 future (stub).

**E1 — Platform & foundations** ✅ (cross-cutting) — legacy: plan/00 G1–G11, Conformance R1–R9
- F1 Multitenancy & tenant isolation ✅ · F2 App auth (JWT+refresh) ✅ · F3 SQLAdmin operator plane + config API ✅ · F4 Three-level config & secret encryption ✅ · F5 Provider seams + fail-closed egress ✅ · F6 Module gates ✅ · F7 Frontend platform (FSD/RTK/PWA) ✅

**E2 — Invoice intake (the wedge)** ✅ — legacy: 07 Э0/Э1, plan F1, 08 F0.x
- F8 OCR recognition (photo→InvoiceDraft) ✅ · F9 Line↔catalog matching (draft-resolve) ✅ · F10 Invoice status machine + Esupl payload + gated write ✅ · F11 Esupl read integration ✅ · F12 Warehouse-target selection 📝(08 F0.6)

**E3 — SKU identity & learning-loop moat** ✅ — legacy: DEC-0011/0013/0012, 08 F1.1/F1.2
- F13 Two-context SKU identity resolver ✅ · F14 Learning-loop mapping moat ✅ · F15 SKU catalog & packings ✅ · F16 Ingredient cache (draft-only) ✅

**E4 — Supplier directory & terms** 🟡 — legacy: 07 Э2, plan F3, 08 F2.x, APP §10
- F17 Supplier cards CRUD + delivery terms ✅ · F18 Supplier flexible criteria registry ✅ · F19 Supplier self-service seam 📝(ADR-017) · F20 Price history + auto-collect 📝(plan F3) · F21 Price-change signal in invoice flow 📝

**E5 — Stabilization & conformance** 🟡 — legacy: plan S1, 08 Э1/F1.x, Conformance Part 2
- F22 SKU-identity stabilization (DEC-0011/0013/0012) ✅ · F23 Fail-closed encryption (ALIGN-01) 📝 · F24 Merge-blocking non-negotiable tests (VER-01) 🟡 · F25 Dead-code/seam cleanup bundle 📝 · F26 Multi-page silent-loss interim fix 📝 · F27 entities/order→receipts rename 📝 · F28 Э0 Esupl API contracts 📝

**E6 — OCR capture quality** 📝 — legacy: plan S2
- F29 Multi-page recognize · F30 Recognition context in prompt · F31 Auto-crop (OpenCV.js) · F32 Camera capture · F33 Post-recognition confidence gate

**E7 — Stock levels & shortage list** 📝 — legacy: 07 Э3, 08 F3.x, ADR-016
- F34 get_stock + stock_levels snapshots + sync · F35 reorder_point on ingredients · F36 /stock screen (low list + manual adjust)

**E8 — Purchasing: order drafts & loop closure** 📝 — legacy: 07 Э4a/Э4b/Э5, 08 F4.x/F5.x
- F37 purchase_orders + lines + status machine + prefill · F38 /orders manual draft UI + min-order indicator · F39 Confirm → copyable supplier message · F40 AI order proposal (order_planning_service) · F41 'Предложить заказ' UI + AI-line marking · F42 Receipt↔order reconciliation · F43 Server-side idempotency (DEFER-04) · F44 Live mode + close-out metrics

**E9 — Sales analytics & digest** 🔭 — legacy: plan F5, 07 Э6
- F45 Sales read + history backfill · F46 Sales storage + daily aggregates · F47 Scheduler + sync job · F48 Weekly digest · F49 reorder_point suggestion from consumption

**E10 — Local context: weather & events** 🔭 — legacy: plan F6
- F50 Weather provider + storage · F51 Subdivision coordinates · F52 Local events (manual) · F53 Digest anomaly enrichment

**E11 — Competitor menu & prices** 🔭 — legacy: plan F7, 07 Э7/Э8
- F54 Competitor directory · F55 Menu OCR (doc-type menu) · F56 Neighborhood comparison/positioning · F57 Google Places prefill (optional)

**E12 — Competitor reviews** 🔭 — legacy: plan F8
- F58 Review storage + ingestion · F59 AI review analysis · F60 Reviews API + digest section + negative alert

**E13 — Cross-recipe menu ideas** 🔭 — legacy: plan F9
- F61 Menu idea generation · F62 Menu ideas UI + statuses

**E14 — Strategic insights & weekly dialog** 🔭 — legacy: plan F10
- F63 Insight context builder · F64 Weekly '3 questions' session · F65 Free-form dialog

**E15 — SaaS (Phase 2)** 🔭 — legacy: plan P2
- F66 Prod hardening & deploy · F67 Self-service onboarding · F68 Billing · F69 Second ERP connector (iiko) · F70 Multitenancy scaling · F71 Product packaging

## Doc templates

### Feature (`features/LCOS-F#-slug.md`)
```
---
id: LCOS-F#
type: feature
title: <name>
epic: "[[LCOS-E#-slug]]"
status: built | partial | planned | future
phase: "Phase 1" | "Phase 2"
roles: [member, admin, ...]
entities: ["[[sku_mapping]]", ...]
requirements: ["[[fail-closed]]", ...]
adrs: ["[[ADR-018]]", ...]
legacy_refs: [08 F0.6, plan F3-B2, ...]
sources: [APP_OVERVIEW.md §7, 08_PHASE1_SPEC.md F0.6]
updated: 2026-07-09
---
# LCOS-F# · <name>
**Эпик:** [[LCOS-E#-slug]] · **Статус:** … · **Фаза:** …
## Описание            (what & why; 1–3 para)
## Возможности         (bullet capabilities)
## Доступ по ролям      (table: role → what they can do)
## Задействованные сущности  ([[entity]] links + how used)
## Зависимости / связи  ([[requirements]], other [[features]], [[ADR]])
## Критерии приёмки (AC)
### Backend
- [ ] AC-BE-1 …
### Frontend
- [ ] AC-FE-1 …
### Other (data/infra/QA — only if needed)
## Открытые вопросы / gates   (VER-*, DEC-*, kill-criteria)
## Источники                  (doc:section, code file:line)
```
Stub features (E9–E15): front-matter + Описание + Возможности + Доступ по ролям + Сущности + a single "AC: TBD (Phase 2)" note + Источники. No detailed AC.

### Epic (`epics/LCOS-E#-slug.md`)
front-matter (id, type: epic, title, status, phase, features: [[...]], sources) + Описание + Цель/ценность + Список фич (linked table) + Ключевые сущности/требования + Gates.

### Entity / Role / Requirement / ADR
Entity: purpose, scope (org/subdivision/global), key fields, FK/uniqueness, used-by features, source file:line.
Role: who, plane (app JWT vs SQLAdmin operator), capabilities, features granting access.
Requirement (cross-cutting SSOT): normative statement, rationale, fail-modes, referenced-by, source + ADR.
ADR: id, status, date, context, decision, consequences, links (folded from 04_DECISIONS + DEC fragments).

## Migration dispositions
| Source | Disposition |
|---|---|
| README.md | rewrite as vault map + rebuilt registry |
| 01_ARCHITECTURE.md + APP_OVERVIEW.md | merge → 00-overview/architecture.md (single as-built SSOT); originals → archive |
| 06_STRATEGY.md (+ Local_OS_About salvage) | → 00-overview/product.md; strategy stays as SSOT, About archived |
| 07_PHASES.md + plan/00_IMPLEMENTATION_PLAN.md | reconcile → 00-overview/roadmap.md |
| 08_PHASE1_SPEC.md + LCOS_Conformance (R1–R9) | → requirements/* + feature AC; originals → archive after extraction |
| 09_PHASE1_TASKS.md | → work/ (task decomposition, plan-tier) |
| 04_DECISIONS.md + __DEC-0011 + __DEC-0013 | split → adr/ (index + per-ADR); DEC fragments folded |
| 05_BACKLOG.md + __append | fold append → keep as work/backlog.md |
| plan/PHASE_*.md | source for epics/features; kept under work/plan-archive after extraction |
| TZ__STABILIZATION…__ALIGNED, TZ__FIX_DISCREPANCY_BUCKET1, VER-021 | → work/ (live) |
| TZ__DEC-0011, TZ__STABILIZATION (unaligned), EVIDENCE, IMPLEMENTATION_REVIEW*, *_AUDIT, SKU_MECHANISM | → archive (SKU_MECHANISM false-completeness claims dropped, durable mechanism → architecture) |
| OBSOLETE_DOCS.md | fold mapping into this note, then archive |
| api/esupl/ | → reference/esupl-api/ |
| archive/ | keep as-is |

## Build stages
- **A (skeleton+backbone):** folders + moves + generate 00-overview, entities, roles, requirements, adr, epics + 3 exemplar features → CHECKPOINT (template review).
- **B:** mass-generate F1–F44 (full).
- **C:** generate F45–F71 (stub) + README/MOC + archive consumed sources + migration note. Verify all wikilinks resolve.

## FROZEN canonical basename registry (Stage A ground truth — Stage B/C MUST use these verbatim)
Epics: LCOS-E1-platform, LCOS-E2-invoice-intake, LCOS-E3-sku-identity, LCOS-E4-suppliers, LCOS-E5-stabilization, LCOS-E6-ocr-quality, LCOS-E7-stock, LCOS-E8-purchasing, LCOS-E9-sales-analytics, LCOS-E10-local-context, LCOS-E11-competitor-menu, LCOS-E12-competitor-reviews, LCOS-E13-menu-ideas, LCOS-E14-strategic-insights, LCOS-E15-saas.
Features (basename = these EXACT strings):
- F1-multitenancy F2-app-auth F3-sqladmin-operator F4-config-secrets F5-provider-seams F6-module-gates F7-frontend-platform
- F8-ocr-recognition F9-line-matching F10-invoice-status-machine F11-esupl-read F12-warehouse-target
- F13-sku-identity-resolver F14-learning-loop F15-sku-catalog F16-ingredient-cache
- F17-supplier-cards F18-supplier-criteria F19-supplier-self-service F20-price-history F21-price-change-signal
- F22-sku-stabilization F23-failclosed-encryption F24-merge-gate-tests F25-deadcode-cleanup F26-multipage-fix F27-receipts-rename F28-esupl-contracts
- F29-multipage-recognize F30-recognition-context F31-auto-crop F32-camera-capture F33-confidence-gate
- F34-stock-levels F35-reorder-point F36-stock-screen
- F37-purchase-orders F38-orders-ui F39-order-message F40-ai-order-proposal F41-ai-order-ui F42-receipt-reconciliation F43-idempotency F44-live-closeout
- F45-sales-read F46-sales-storage F47-scheduler F48-weekly-digest F49-reorder-suggestion
- F50-weather F51-coordinates F52-local-events F53-digest-enrichment
- F54-competitor-directory F55-menu-ocr F56-positioning F57-places-prefill
- F58-review-storage F59-review-analysis F60-reviews-api
- F61-menu-idea-generation F62-menu-ideas-ui
- F63-insight-context F64-weekly-questions F65-freeform-dialog
- F66-prod-hardening F67-onboarding F68-billing F69-iiko-connector F70-tenancy-scaling F71-product-packaging
(all prefixed `LCOS-`). Entities = 14 table names. Roles = superadmin, admin, member, sqladmin-operator, supplier-future. Requirements = auth, config-secrets, erp-esupl-integration, fail-closed, global-requirements, invoice-status-machine, multitenancy, provider-abstraction, secret-encryption, sku-identity-resolver, supplier-criteria-registry, vpn-egress. ADR = ADR-001..020, DEC-0011, DEC-0013, index.
Full (E1–E8 = F1–F44): 3 done (F8,F13,F17) → 41 remaining. Stub (E9–E15 = F45–F71): 27.

## LANGUAGE (owner update 2026-07-09): ALL docs in ENGLISH — prose AND identifiers. Stage A files (generated in RU) MUST be translated to English (prose only; preserve [[wikilinks]], front-matter keys, IDs, code, file paths, numbers). Stage B/C generate directly in English.

## Progress
- [x] Inventory (wf_23ea3cfb-73b) · [x] decisions locked · [x] plan/ID-map (this doc)
- [x] Stage A (backbone + epics + 3 exemplars, wf_dd3f1d2a) · [x] registry frozen · [x] translate Stage A → EN (wf_fa8ad900)
- [x] Stage B (41 full + 27 stub features, wf_fa8ad900) · [x] Stage C: root decluttered → work//archive/, README v2, 4 planned-entity stubs, api→reference/esupl-api, plan→work/plan
- [x] link-normalize: 302 links rewritten / 49 files → 4007 wikilinks, 0 unresolved, 0 duplicate basenames, vault all-English
- STATUS: COMPLETE 2026-07-09. Vault: 00-overview(5) epics(15) features(71) entities(18) roles(5) requirements(12) adr(23) + reference/esupl-api + work + archive.
- Known drift to fix in Stage C link-normalize: overview/epic guessed slugs (e.g. LCOS-E1-platform-foundations→LCOS-E1-platform, E3-sku-identity-moat→E3-sku-identity, E6-ocr-capture→E6-ocr-quality, E7-stock-levels→E7-stock), [[erp-esupl]]→[[erp-esupl-integration]], [[F9-line-catalog-matching]]→[[F9-line-matching]], [[F26-multipage-interim-fix]]→[[F26-multipage-fix]], [[F3-sqladmin-operator-plane]]→[[F3-sqladmin-operator]], [[ADR-index]]/[[adr/index]]→[[index]], [[Pilot-Gate]] (no standalone note → point to glossary).
