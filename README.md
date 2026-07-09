---
doc: README
title: LCOS documentation vault — map & conventions
version: 2.0.0
status: current
updated: 2026-07-09
owner: Ivan
trust_tier: 0
---

# LCOS documentation vault

A Confluence/Jira-style knowledge base in Markdown, designed to be opened as an **Obsidian vault**. Cross-references use Obsidian wiki-links — double square brackets around a file basename. Requirements follow **SSOT**: each capability/requirement is written once and linked, never duplicated.

Start here: **[[MOC]]** (Map of Content) — the linked index to everything.

## Structure

| Folder | What lives here |
|---|---|
| `00-overview/` | [[product]] (vision/strategy), [[architecture]] (as-built SSOT), [[roadmap]] (phases), [[glossary]], [[MOC]] |
| `epics/` | `LCOS-E1..E15` — epic docs, each linking its features |
| `features/` | `LCOS-F1..F71` — feature docs (parent epic, description, capabilities, role access, entities, **AC split by Backend / Frontend / other**) |
| `entities/` | Data-model docs, one per table (SSOT for the schema) |
| `roles/` | `superadmin`, `admin`, `member`, `sqladmin-operator`, `supplier-future` |
| `requirements/` | Cross-cutting SSOT: auth, multitenancy, config-secrets, fail-closed, vpn-egress, provider-abstraction, erp-esupl-integration, sku-identity-resolver, invoice-status-machine, secret-encryption, supplier-criteria-registry, global-requirements (R1–R9) |
| `adr/` | Architecture Decision Records `ADR-001..020` + `DEC-0011`/`DEC-0013` + [[index]] |
| `reference/` | External integration reference (`esupl-api/`) |
| `work/` | Live process docs (aligned TZ, fix journals, open gates, per-phase specs `work/plan/`, backlog, tasks) |
| `archive/` | Inert historical & superseded docs — never read as current, never revived |

## Numbering & IDs
- **Epics** `LCOS-E#`, **features** `LCOS-F#` (grouped-typed, project key `LCOS`). Every feature declares its parent epic in front-matter and links back.
- Phase 1 (`E1–E8`) is documented fully with AC. Phase 2 (`E9–E15`) is documented as stubs (activated on demand). The boundary is the **Pilot-Gate** (see [[glossary]], [[ADR-003]]).
- Legacy codes from the old plans (Э0–Э8 / S1–S2 / F3–F10 / P2) are preserved in each doc's `legacy_refs` and mapped in [[roadmap]].

## Conventions
- **Language:** English (prose and identifiers).
- **Front-matter:** every doc opens with YAML (`id`/`type`/`title`/`status`/`sources`/…).
- **Wikilinks by basename:** `[[sku_mapping]]`, `[[fail-closed]]`, `[[ADR-018]]`, `[[LCOS-F8-ocr-recognition]]`.
- **Trust order (on conflict):** code + `CLAUDE.md` > `adr/` (decisions) > requirements/architecture > overview/product. When docs disagree with code, code wins and the doc is corrected.
- **Append-only decisions:** ADRs are never rewritten; supersede with a new ADR.

## Migration record (2026-07-09)
This vault replaces the previous flat pile of numbered/`TZ__`/audit docs. Nothing was deleted:
- `01_ARCHITECTURE.md` + `APP_OVERVIEW.md` → merged into [[architecture]] (originals in `archive/`).
- `06_STRATEGY.md` (+ `Local_OS_About.md`) → [[product]]; `07_PHASES.md` + `plan/00` → [[roadmap]].
- `08_PHASE1_SPEC.md` + `LCOS_Conformance…` (R1–R9) → `requirements/` + feature AC.
- `04_DECISIONS.md` (+ `__DEC-0011`/`__DEC-0013`) → `adr/` (one file per ADR + [[index]]).
- Process artefacts (`TZ__*`, `IMPLEMENTATION_REVIEW*`, `*_AUDIT`, `EVIDENCE__*`) → `archive/`; still-live ones (aligned stabilization TZ, Bucket-1 fix journal, VER-021 gate) → `work/`.
- `api/esupl/` → `reference/esupl-api/`. Per-phase specs → `work/plan/`.
- The restructure plan and generation log: `work/_RESTRUCTURE_PLAN.md`.
