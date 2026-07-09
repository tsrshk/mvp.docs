---
id: LCOS-F58
type: feature
title: Review storage + ingestion
epic: "[[LCOS-E12-competitor-reviews]]"
status: future
phase: "Phase 2"
roles: [admin, member, superadmin]
entities: ["[[subdivisions]]", "[[integration_credentials]]"]
requirements: ["[[multitenancy]]", "[[provider-abstraction]]", "[[fail-closed]]", "[[secret-encryption]]", "[[vpn-egress]]"]
adrs: ["[[ADR-009]]", "[[ADR-012]]", "[[ADR-006]]"]
legacy_refs: [plan F8, "plan F8-B1", "plan F8-B2"]
sources: ["plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B1", "plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B2", "plan/00_IMPLEMENTATION_PLAN.md §6 Q5"]
updated: 2026-07-09
---
# LCOS-F58 · Review storage + ingestion
**Epic:** [[LCOS-E12-competitor-reviews]] · **Status:** future · **Phase:** Phase 2

## Description

The data-model and ingestion foundation of the reviews epic. Introduces two org-scoped tables: `reviews` (`OrganizationScopedMixin`, uuid pk) holding `subject` (`self` | `competitor`), an optional `competitor_id` FK (NULL for own reviews), `source` (`google` | `manual` | `import`), an `external_id` unique within the org for deduplication, plus `author?`, `rating?`, `text`, `posted_at`, `lang?`; and `review_analyses` (1:1 FK→`reviews` CASCADE), which is written by [[LCOS-F59-review-analysis]] and deliberately kept separate so a re-analysis with a newer model never mutates the source review.

Ingestion has two paths, both landing in the same `reviews` table. The primary MVP path is manual/bulk import: `POST /api/v1/reviews/import` accepts a JSON array (own reviews or reviews copied/exported for a competitor) and deduplicates by `external_id` / text hash so re-importing the same batch creates no duplicates. The optional path is an authenticated fetch of the shop's own reviews via Google Business Profile behind a `reviews` provider Protocol; if the OAuth credential is not configured the feature falls back to manual import, and the API provider may be deferred by owner decision at phase start (recorded in the journal).

**Legal boundary (plan §6 Q5):** the MVP works only on officially available data — own reviews via Google Business Profile (API/export), competitor reviews via manual import. Automated scraping of Google Maps is explicitly out of scope.

## Capabilities

- `reviews` and `review_analyses` tables, org-scoped; analysis stored separately from the source review (re-analysis never touches the original).
- Bulk import endpoint `POST /api/v1/reviews/import` (JSON array) with deduplication by `external_id` / text hash — idempotent re-import.
- `self` vs `competitor` subject discrimination; competitor reviews link to the competitor directory ([[LCOS-F54-competitor-directory]]).
- Optional Google Business Profile fetch of own reviews behind a single-implementation provider seam; disabled by default (`reviews_sync_enabled` REGISTRY, default False).
- No Google Maps scraping; competitor data enters only by manual/bulk import.

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Import own and competitor reviews for their subdivision; configure the Google Business connection (if enabled). |
| [[member]] | Import reviews within their subdivision; consumes stored reviews downstream. |
| [[superadmin]] | Same across all tenants; manages the Google Business credential and sync enable flag. |
| [[sqladmin-operator]] | Sets the `reviews_sync_enabled` flag and provider credentials in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- Future storage tables `reviews` and `review_analyses` — introduced here; `review_analyses` is populated by [[LCOS-F59-review-analysis]] and read by [[LCOS-F60-reviews-api]].
- [[subdivisions]] — tenant scope of every review row (org-scoped mixin); isolation is a hard requirement.
- [[integration_credentials]] — Fernet-encrypted Google Business Profile OAuth credential (`scope=org`, new `google_business` provider value), read backend-only when the optional fetch path is enabled.
- Competitor rows referenced by `competitor_id` live in the competitor directory of [[LCOS-E11-competitor-menu]] ([[LCOS-F54-competitor-directory]]).

## Dependencies / links

- **Requirements:** [[multitenancy]] (org-scoped rows, isolation tested), [[provider-abstraction]] (Google fetch behind a one-implementation `reviews` provider seam), [[fail-closed]] (fetch enabled without a credential → explicit sync error, never a silent skip), [[secret-encryption]] (`enc:v2` OAuth credential), [[vpn-egress]] (any live provider egress routed and gated on the backend).
- **Features:** feeds [[LCOS-F59-review-analysis]] (analysis of unprocessed reviews) and [[LCOS-F60-reviews-api]] (list/trends/digest/alert); scheduled fetch, when enabled, runs under the digest scheduler shared with [[LCOS-F48-weekly-digest]].
- **Epics:** part of [[LCOS-E12-competitor-reviews]]; complements the quantitative menu/price signal of [[LCOS-E11-competitor-menu]].
- **ADR:** [[ADR-009]] (provider seam, one implementation), [[ADR-012]] (live provider paths backend-only), [[ADR-006]] (fail-closed egress).

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). Import idempotency, tenant-isolation and (if built) Google-fetch fail-closed criteria are drafted when the epic is activated and the Q5 legal boundary is re-confirmed with the owner.

## Sources

- `plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B1` (data model: `reviews`, `review_analyses`).
- `plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B2` (ingestion: `/reviews/import`, dedup, Google Business provider, `reviews_sync_enabled`).
- `plan/00_IMPLEMENTATION_PLAN.md §6 Q5` (legal boundary — official data only, no Google Maps scraping).
