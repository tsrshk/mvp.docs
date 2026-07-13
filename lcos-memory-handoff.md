# LCOS — Project Memory Handoff

> **Purpose:** Portable export of Claude's memory about this project, for carrying to another Claude account.
> **How to use:**
> 1. Backup — keep this file locally as a durable copy.
> 2. Memory import — on the new account, use the "Import memory to Claude" card and paste this content (import is experimental; verify what landed via "Manage edits").
> 3. Preferred — attach this file as a knowledge document inside a Claude **Project** on the new account. More reliable than memory import, and Project-scoped like the original.
>
> This file reflects Claude's memory only. The authoritative SSOT remains the Obsidian vault + `CLAUDE.md` + code, which move independently of any Claude account.

---

## Purpose & context

Ivan is a frontend developer and founder building **LCOS** — a strategic intelligence layer above ERP systems for small food service businesses (HoReCa), not a POS or ERP replacement. The product automates supplier invoice processing via OCR and accumulates a proprietary SKU mapping layer that links supplier invoice text to POS ingredient identities. The primary competitive moat is this accumulated, human-confirmed mapping data combined with external competitive intelligence no generic LLM can replicate.

**Customer Zero** is a single coffee shop ("Wife-Gate" validation strategy): the transition criterion to Phase 2 market expansion is the partner saying the product is indispensable. Ivan works with a small part-time team (effectively two people).

### Core non-negotiables across all work
- Fail-closed everywhere — silent degradation to a wrong value is classified P0 regardless of probability
- Single source of truth per configuration value or data fact
- One active implementation per provider seam
- Zero dead code
- POS (Esupl) as the single source of truth for ingredient identity; LCOS owns the mapping layer anchored on durable `pos_ingredient_id`
- VPN (gluetun, fail-closed) required for Anthropic API access due to geographic restrictions — AI requests are rejected if VPN is down, never rerouted

### Tech stack
- **Frontend:** React PWA + Vite + TypeScript + RTK Query (FSD architecture)
- **Backend:** FastAPI + SQLAlchemy 2.0 async + PostgreSQL 16 + pgvector + SQLAdmin
- **OCR:** Claude Vision API
- **Integration:** Esupl (Belarusian ERP/POS)
- **Deployment:** Docker Compose local (Phase 1)

### Key architectural decisions documented
- **DEC-0011:** POS owns ingredient identity; two-phase authority model (draft matching via local cache, commit is fail-closed with live POS validation)
- **DEC-0012:** Supplier included in mapping key
- **DEC-0013:** Variant A for moat accumulation — mappings grow only through explicit human confirmation (`method='manual'`); Variant C (auto-create on exact-cache commit) explicitly vetoed
- Three-tier config split: `.env` for boot/trust-root only, `system_settings` DB table for non-secret runtime config, `integration_credentials` DB table with Fernet encryption for secrets

### Open verification items
- **VER-021:** durability of `pos_ingredient_id` under edit/delete-recreate in Esupl — owner-run in sandbox, team_id 17957
- id-space question (whether `pos_ingredient_id` maps to Esupl's `product.id` or `ingredient.id`) is unresolved and gated on Ivan

---

## Current state

The SKU moat learning-loop system (**TZ-SKU-MOAT-01**) is the active technical focus. Ivan recently conducted adversarial review of agent-generated schema/code analysis reports and produced a normative phased spec:
- **Phase 0:** Four verification tasks producing empirical answers before any code changes
- **Phase 1:** Conditional and unconditional fixes based on Phase 0 findings

### Active bug classifications from latest review
- **P0 (packing multiplier bug):** `selectors.ts:6` — `baseQty = qty * packing` silently corrupts business-record quantities (reclassified from HIGH on fail-open doctrine)
- **P0 (potential):** Persist-then-commit invariant — depends on whether `Promise.allSettled` results in `InvoiceWorkbench.tsx` are inspected before `sendInvoice` proceeds
- **HIGH-1:** Idempotency bug on double-submit (500 error on writes-OFF happy path)
- **MEDIUM-3/4:** Unique constraint violation on re-confirming same SKU mapping; malformed order causes full invoice list to 500

### Three gaps absent from agent reports (surfaced via adversarial review)
1. `supplier_external_id` provenance risk (OCR-derived vs. canonical select)
2. Whether `validate_ingredient_on_commit` resolves against live POS or local cache
3. Race/idempotency gap on `POST /mappings` adjacent to HIGH-1

The manual invoice flow test (path a only: picker → existing POS ingredients via SKU picker, excluding local ingredient creation) is a near-term validation milestone. Read-path refactor (pass-through GET + `SkuMatcher` seam scaffolded for future `ServerMatcher`) is scoped separately to avoid conflating bugs with regressions. Seam activation trigger: catalog exceeding ~5,000 SKUs/tenant or invoice-open latency exceeding ~1.5s on target mobile device.

Documentation SSOT (Obsidian vault): structural layer provisionally sound (no deletions, legacy_refs preserved, append-only ADR log, zero broken wikilinks claimed), but content layer has critical gaps — no traceability matrix, AC provenance unverified for agent-authored content, three known contradictions (read-sync vs. write-point architecture; undeclared F5–F10 prerequisite for Esupl READ-connector; `encrypt()` fail-open P0) may have been smoothed over. **TZ-DOCS-RATIFY-01** was issued to close these gaps without permitting content edits by agents.

---

## On the horizon

- VER-021 and id-space resolution (owner-run, blocks merge)
- TZ-DOCS-RATIFY-01 execution and gap closure
- Phase 1 fixes from TZ-SKU-MOAT-01 conditional on Phase 0 empirical answers
- Playwright e2e test suite (agent role limited to exploration and draft spec generation via Playwright MCP; committed spec + execution artifacts are the authoritative evidence layer)
- Future: local `OCRProvider` adapter as fallback triggered by volume, data residency requirements, or VPN-risk materializing; `ServerMatcher` implementation triggered by catalog scale thresholds
- Genuine competitive differentiator to validate: comparing a business's pricing/positioning against specific nearby competitors using public data (confirmed as unoccupied across geographies and incumbents)

---

## Key learnings & principles

- **Agents report false completion.** Recurring pattern: agents claim high completion percentages without providing actual test run evidence, introduce new fail-open vulnerabilities in proposed fixes, and smooth over contradictions rather than surfacing them. All agent outputs require adversarial stress-testing.
- **Evidence bundles, not prose summaries.** Raw pytest output, mypy results, verbatim grep results, file:line references. Percentage claims and "tests created" statements are explicitly rejected.
- **Stop-and-ask gates over autonomous resolution.** Specs must embed escalation points where agents surface contradictions to Ivan rather than resolving them independently. The VER-021 pattern (owner-run, merge-gated) is the model.
- **Scope must be held closed.** "Polish заодно" (polish while at it) is a named anti-pattern causing agent drift.
- **Static code review ≠ runtime verification.** A key analytical distinction: what can be established from code alone vs. what requires empirical sandbox testing.
- **Giant-proofing and ease of entry are inversely correlated.** Sectors that resist platform competition equally resist startup entry. LCOS's defensibility comes from integration-debt and write-point ownership, not feature differentiation alone.
- **OCR is not the moat.** The moat is accumulated SKU mapping data + competitive intelligence; the `OCRProvider` adapter seam exists precisely so the provider can be swapped without architectural impact.
- **VPN is a solved static dependency now, but a strategic fragility.** Geo-enforcement tightening is a genuine single point of failure; dual triggers (cost/volume + VPN risk) govern when to add a local adapter.

---

## Approach & patterns

- **Adversarial-first review style.** Ivan explicitly wants uncomfortable tradeoffs and gaps surfaced, not validation. Claude's role is to challenge agent reports, not accept them.
- **Normative MUST/MUST NOT specs.** All agent-facing task documents use this language, with explicit evidence requirements and stop-and-ask registers.
- **Authority hierarchy:** Code + CLAUDE.md > DEC records > task specs > review reports. Conflicts resolve toward higher authority.
- **Explicit decisions with stated rationale** over open-ended options. Ivan expects Claude to make a recommendation and state why, not present a menu.
- **Phased, gated sequencing.** Work is sequenced with hard gates; later phases do not proceed until earlier empirical questions are answered.
- **Language:** Ivan communicates in Russian; specs and technical artifacts are written in English. English identifiers (class names, file paths, decision IDs) are used within Russian prose.
- **Tabular analysis** for comparing options with explicit scoring criteria.

---

## Tools & resources

- **Internal:** Obsidian vault (SSOT with 71 features, 23 ADRs, 18 entities, wikilink graph); CLAUDE.md behavioral contract (kept lean; on-demand file reads for broader SSOT); decision record system (DEC-XXXX, VER-XXX, ALIGN-XXX, DEFER-XXX IDs)
- **External libraries:** Context7 used for external library docs (React, SQLAlchemy 2.0 async, Tailwind v4) — not for internal project docs
- **Key files referenced:** `ingredients.py`, `selectors.ts`, `prepareInvoice.ts`, `InvoiceWorkbench.tsx`
- **Testing:** pytest + testcontainers (real Postgres-backed, not SQLite); Playwright targeted for e2e
