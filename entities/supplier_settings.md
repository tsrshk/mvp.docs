---
id: supplier_settings
type: entity
title: supplier_settings — per-supplier ordering terms (planned design)
status: planned
scope: org
table: supplier_settings
pk: int
used_by: ["[[LCOS-F19-supplier-self-service]]", "[[LCOS-F39-order-message]]", "[[LCOS-F40-ai-order-proposal]]"]
requirements: ["[[supplier-criteria-registry]]", "[[multitenancy]]"]
sources: ["08_PHASE1_SPEC.md F2.1 (archived)", "APP_OVERVIEW.md §10 (archived)"]
updated: 2026-07-09
---
# supplier_settings — per-supplier ordering terms (planned design)

> **Status: planned design.** ⚠️ **As-built diverged:** the shipped implementation stores per-supplier terms as `Supplier.criteria` JSONB validated by a registry (see [[supplier-criteria-registry]] and [[LCOS-F18-supplier-criteria]]), **not** a separate `supplier_settings` table. This note documents the originally-planned table (08 F2.1) for traceability; the criteria-registry supersedes it unless a dedicated table is later reintroduced for the supplier self-service portal ([[LCOS-F19-supplier-self-service]], [[ADR-017]]).

## Purpose (planned)
Per-supplier terms driving the order planner: delivery weekdays, lead time, minimum order amount + free-delivery threshold, preferred contact channel. In the as-built system these live in [[suppliers]]`.criteria` (JSONB) — see [[supplier-criteria-registry]].

## Scope
Org-scoped (see [[multitenancy]]).

## Relationship to as-built
| Planned (08 F2.1) | As-built |
|---|---|
| separate `supplier_settings` table + `extra_terms` JSONB | `Supplier.criteria` JSONB + `app/domain/supplier_criteria.py` registry |
| — | new criteria added without migration (registry-validated, 422 on invalid) |

## Used by
[[LCOS-F18-supplier-criteria]] (as-built), [[LCOS-F19-supplier-self-service]] (future portal), [[LCOS-F39-order-message]] (contact channel), [[LCOS-F40-ai-order-proposal]] (min-order/lead-time).

## Sources
`08_PHASE1_SPEC.md` F2.1 (archived), `APP_OVERVIEW.md` §10 (archived), [[ADR-017]].
