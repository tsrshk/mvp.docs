---
id: OV-PRODUCT
type: overview
title: Product — identity, strategy, market
status: current
phase: cross-cutting
updated: 2026-07-09
owner: Ivan
trust_tier: 2
sources:
  - 06_STRATEGY.md (SSOT business-strategy / product-identity, v1.1.1)
  - Local_OS_About.md (vision salvage)
  - APP_OVERVIEW.md §1 (verified_against_code 2026-07-09)
---

# Product — LCOS as an AI manager

> **The SSOT for product identity and strategy** is `06_STRATEGY.md`. This document is a navigational summary for the vault; on a strategy conflict `06_STRATEGY.md` prevails, on implementation facts the code and [[architecture]] prevail. Roadmap — [[roadmap]], architecture — [[architecture]].

## 1. Identity: a digital manager, not a tool

**LCOS is not a POS, not "yet another OCR service", and not an analytics dashboard. It is a digital manager for a small venue** — a layer that takes over the owner's routine work: entering invoices, maintaining the catalog and supplier prices, planning and preparing purchases, positioning against competitors, ideas for new menu items. The POS system (Esupl today, others later) remains the ledger; LCOS is the one who *works* with it on the owner's behalf.

The product is validated on itself: **Customer Zero** is the coffee shop of the founder's wife. First the product becomes indispensable to one real business ([[glossary]]), and only then is it packaged for the market.

### Three rules that vet every feature

1. **A feature must DO the work, not display numbers.** A "margin dashboard" is not our feature. "A draft supplier order assembled from stock levels and prices — confirm and send" is. An assistant that "shows the numbers" is an explicitly rejected anti-pattern.
2. **The AI prepares — the human confirms** ([[ADR-002]] human-in-the-loop). No automatic actions in external systems without confirmation. The manager brings a finished decision for signature rather than acting behind your back. The technical embodiment is [[ADR-002]] and the single write-point behind the [[glossary]] toggle.
3. **Every closed routine = deeper lock-in.** The business mechanics are to become indispensable through habit and accumulated data (the routine ladder, §3). Retention is not a "later" metric but the product strategy itself. The technical anchor of lock-in is the [[glossary]] (the learning-loop mapping, [[sku_mapping]]).

### Why this is the right bet

Every competitor found sits in one of two pits: either "an invoice-entry tool" (DocsInBox, RestData — a commodity a POS vendor can replicate) or "analytics/inventory" (MarginEdge, MarketMan — they show but do not do). The niche of "a manager that closes the routine end to end" is unoccupied in the CIS and, essentially, globally. That is also the defense against the main risk: a POS can add an OCR feature in a quarter, but a POS vendor will never become a manager — that is neither its role nor its business model.

### The identity trap — scope

"A smart assistant that does everything" for a single developer at 10–15 h/week is a recipe for finishing nothing. The discipline: **one routine at a time, brought to "works every day without reminders", and only then the next.**

## 2. The wedge: invoices

**Invoices are not the product but the wedge we enter with.** It is the owner's most frequent, most measurable pain, and it fills the data for all subsequent routines. The first working flow is invoice intake: photo → OCR (Claude Vision) → matching lines against the POS catalog → validation → payload to Esupl + local persistence (see [[LCOS-E2-invoice-intake]], [[invoice-status-machine]]).

Four original owner pains (from the vision doc) that the product closes along the ladder:
1. Manually entering invoices into the accounting system — the most time-consuming routine.
2. Different names for the same product across suppliers ("Coffee beans Ethiopia Yirgacheffe 1kg" = "Ethiop Yirgacheff 1000g" = one SKU) — solved by SKU identity ([[LCOS-E3-sku-identity]], [[sku-identity-resolver]]).
3. "Where is it best to order from?" — decisions based on data, not WhatsApp chatter.
4. Positioning against the neighborhood — competitors' prices/menus/reviews.

## 3. The routine ladder (lock-in mechanics)

Each rung: which routine it takes over → which data it accumulates → why leaving after it becomes more expensive. The rungs map onto the roadmap's epics ([[roadmap]]).

| # | Routine | Status | Lock-in data | Epic |
|---|--------|--------|-----------------|------|
| 1 | Invoice entry (photo → POS) | Built, live mode behind a gate | Invoices, suppliers, purchase history | [[LCOS-E2-invoice-intake]] |
| 2 | Nomenclature mapping (supplier item → SKU, auto-substitution) | Built | Mapping memory — the main early switching cost | [[LCOS-E3-sku-identity]] |
| 3 | Supplier prices (a directory that updates itself) | Partial / next rung | Price history for your own suppliers — data neither the POS nor the owner has | [[LCOS-E4-suppliers]] |
| 4 | Purchase selection and planning (a draft order for confirmation) | Not built | Consumption patterns, a purchase plan. The first routine where LCOS "thinks and proposes an action" | [[LCOS-E7-stock]], [[LCOS-E8-purchasing]] |
| 5 | Business pulse (weekly digest, anomalies, local context) | Not built | The habit loop — LCOS starts the conversation itself on a schedule | [[LCOS-E9-sales-analytics]], [[LCOS-E10-local-context]] |
| 6 | Position against the neighborhood (competitors' prices/menus/reviews) | Not built | External data the owner will not gather themselves | [[LCOS-E11-competitor-menu]], [[LCOS-E12-competitor-reviews]] |
| 7 | Development (new items from existing ingredients, strategic dialog) | Not built | The full business context — leaving = "firing a manager who knows everything" | [[LCOS-E13-menu-ideas]], [[LCOS-E14-strategic-insights]] |

By rung 4 the product is no longer sold against "$30 for OCR" but against **the cost of manager/owner hours** — hence the $99–149/month bar.

## 4. Market and channel: Esupl-BY → marketplace

The identity (a manager) is a constant. The options are a choice of **market and channel** along which to roll it out. The routine ladder is not a separate option but the pace of value growth within the chosen market.

| Option | TAM | Distribution | Verdict |
|-------|-----|-------------|---------|
| **A. Esupl-first (Belarus)** | Small | Partnership with Esupl, manual sales via the community | **Do it now.** Fast validation, first MRR, zero competition. Ceiling ~$3–10k MRR |
| **B. Poster app (BY/UA/KZ/PL)** | Medium+ | **The Poster marketplace** (an open app marketplace + API) — the only accessible scalable channel | **The next step after [[glossary]] + 5–10 customers on A.** The path to "the exponent" |
| **C. Global market (EN)** | Large | No channel; funded competitors | Not now. Come back if B gains traction and a team appears |

**Strategy:** first revenue in the niche (A), then the exponent through the channel (B). Trying to build "straight for the exponent" before [[glossary]] is the classic way to lose a year. Enter market B already with rungs 1–3 at minimum, to stand apart from "yet another OCR". The technical groundwork for switching POS is the `ErpProvider` Protocol ([[provider-abstraction]], [[erp-esupl-integration]]): every new POS integration = a new market, not a new product.

**Willingness-to-pay evidence (US):** MarginEdge ($249/mo), MarketMan ($480/mo), Restaurant365, xtraCHEF, WISK — restaurants pay $250–500/mo to close this routine. All of them are "tools with dashboards", not managers. **CIS:** DocsInBox, iikoScanning, RestData, Kontur.Market — invoice entry is solved and sold (demand confirmed), but the iiko niche in Russia is taken and everyone sits on the ladder's first rung. **Belarus:** no direct "photo of an invoice → Esupl" competitor found.

## 5. Dev stop-list (what we consciously do NOT do now)

Eats time, does not move us up the ladder — until the corresponding trigger:

- **A chat interface / conversational assistant** — before rung 4 it has nothing to "do the work" with; hands first, then a mouth. "A chat wrapper without actions" = a rejected anti-pattern.
- **Gemini as a second LLM vendor** ([DEC-01] → variant A, remove) — a backup LLM is not needed before platform scale. One implementation per seam ([[ADR-009]]).
- **Semantic matching on pgvector** ([DEC-02] → drop the column) — fuzzy+LLM works; the `invoice_lines.sku_embedding` column is unused (dead code, backlog `DEC-02`). Come back on real mapping misses.
- **Billing, self-service onboarding, prod hardening on Hetzner** — before the first third-party customer this is negative value ([[LCOS-E15-saas]] — behind [[glossary]]).
- **Any work for "the global market"** (i18n, EN interface) — before option C.
- **Auto-sending orders, any write to Esupl other than the gated `write_invoice`** — human-in-the-loop is inviolable.
- **Demand/recipe forecasting** — manual thresholds + hints from history, not an ML forecast.
- **Celery/APScheduler background jobs** — everything is button-driven in Phase 1.

## 6. Assets (a developer's view)

| Component | Value as an asset |
|-----------|--------------------|
| OCR via vision-LLM | **Commodity.** Any competitor gets the same in a week. Does not protect |
| **Mapping memory** ([[sku_mapping]], [[glossary]]) | **The core of retention** (rung 2). The main current technical asset |
| **ERP integration** (Esupl payload: supplier/item/unit/packing/warehouse resolve) | **The real barrier** and the embodiment of "works with the POS, there can be different ones". The `ErpProvider` Protocol is the right seam |
| Multi-tenant + config/secret architecture | Groundwork for Phase 2, done "minimally" — do not deepen until the second customer |
| Photo-first UX (2 steps, auto-supplier, auto-mapping) | A differentiator against "upload a scan into the back office"; the mobile scenario = the owner's real scenario |
| Supplier price data (not built) | Potentially the most valuable asset: neither the POS nor the suppliers hold a history of purchase prices |

## 7. The core principle

> **"First help Customer Zero. Then — money."**

If Phase 1 does not close the pain at our own coffee shop, we do not move to the second ([[glossary]]). This protects against the classic startup trap of "we build for the market, nobody buys": Customer Zero is right at hand, daily feedback, zero cost of a wrong direction. The architectural line — **"multi-tenant ready, single-tenant first"** — is a direct embodiment of the strategy.

## Related documents

- [[roadmap]] — the roadmap (phases, epics, Pilot-Gate)
- [[architecture]] — the as-built architecture
- [[glossary]] — terms (moat, source_key, fail-closed, …)
- [[MOC]] — the vault's map of content
- [[glossary]] · [[glossary]] · [[ADR-002]] · [[provider-abstraction]]

## Sources

- `06_STRATEGY.md` v1.1.1 — §1 identity, §2 routine ladder, §4 market, §7 options A/B/C, §9 stop-list.
- `Local_OS_About.md` — the original vision (the four pains, "First help my wife").
- `APP_OVERVIEW.md` §1 — the as-built product essence (verified_against_code 2026-07-09).
