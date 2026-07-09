---
id: LCOS-F60
type: feature
title: Reviews API + digest section + negative alert
epic: "[[LCOS-E12-competitor-reviews]]"
status: future
phase: "Phase 2"
roles: [admin, member, superadmin]
entities: ["[[subdivisions]]", "[[system_settings]]"]
requirements: ["[[multitenancy]]", "[[fail-closed]]", "[[provider-abstraction]]"]
adrs: ["[[ADR-012]]"]
legacy_refs: [plan F8, "plan F8-B4", "plan F8-F1"]
sources: ["plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B4", "plan/PHASE_F8_COMPETITORS_REVIEWS.md §2 F8-F1", "plan/PHASE_F8_COMPETITORS_REVIEWS.md §3"]
updated: 2026-07-09
---
# LCOS-F60 · Reviews API + digest section + negative alert
**Epic:** [[LCOS-E12-competitor-reviews]] · **Status:** future · **Phase:** Phase 2

## Description

The read/surface layer of the reviews epic. Exposes `GET /api/v1/reviews?subject=&competitor_id=&sentiment=` (paginated) and `GET /api/v1/reviews/trends?weeks=8`, and adds a "Reviews" section to the weekly digest ([[LCOS-F48-weekly-digest]]): new own reviews this week (count, average rating, negatives listed out), trends, and mentioned menu items for competitors. To hit the "react in <48 h" goal, a negative **own** review raises an alert immediately on import/analysis — it does not wait for the digest.

On the frontend, a "Reviews" tab under the Competitors section shows own/competitor reviews with sentiment badges and filters, a simple weekly trends screen (plain bars/counters, no heavy chart libraries), and a manual import form (paste text/JSON) with a preview of the parsed records. Negative-review alerts flow through the shared alert mechanism. The section is module-gated (`module_competitors_enabled`, shared with [[LCOS-E11-competitor-menu]], or a separate `module_reviews_enabled` — implementer's choice, recorded).

**Out of scope:** automated replies to reviews (never without a human — G7), social networks (Instagram/VK/TikTok), and scraping competitor Google Maps.

## Capabilities

- `GET /reviews` (filters: `subject`, `competitor_id`, `sentiment`; paginated) and `GET /reviews/trends?weeks=8`.
- "Reviews" digest section: weekly new own reviews (count, average rating, negatives listed), trends, competitor menu-item mentions.
- Immediate alert on a negative own review at import/analysis time (does not wait for the digest) — supports the <48 h reaction goal.
- Frontend "Reviews" tab (own/competitor lists, sentiment badges, filters), lightweight weekly trends view, manual import form with parsed-record preview.
- Module gate (`module_competitors_enabled` shared with menu, or dedicated `module_reviews_enabled`).

## Access by role

| Role | What they can do |
|---|---|
| [[admin]] | Views reviews and trends, receives negative-review alerts, uses the import form for their subdivision. |
| [[member]] | Views reviews/trends and receives alerts within their subdivision. |
| [[superadmin]] | Same across all tenants; toggles the reviews/competitors module gate. |
| [[sqladmin-operator]] | Sets the module gate flag in the SQLAdmin plane (see [[LCOS-F3-sqladmin-operator]]). |

## Involved entities

- Future `reviews` and `review_analyses` tables — the read source for the API, digest section and alerts; owned by [[LCOS-F58-review-storage]] and [[LCOS-F59-review-analysis]].
- [[subdivisions]] — tenant scope of every query and of the digest section.
- [[system_settings]] — REGISTRY-backed module gate (`module_competitors_enabled` / `module_reviews_enabled`).
- Competitor rows (for `competitor_id` filtering and mentions) live in the directory of [[LCOS-E11-competitor-menu]] ([[LCOS-F54-competitor-directory]]).

## Dependencies / links

- **Requirements:** [[multitenancy]] (every read tenant-scoped and gated), [[fail-closed]] (the digest section only appears when data exists; absent digest infra defers the section, no silent partials), [[provider-abstraction]] (alerts and digest reuse the shared mechanisms, not a bespoke egress).
- **Features:** depends on [[LCOS-F58-review-storage]] (data) and [[LCOS-F59-review-analysis]] (sentiment/trends); the digest section plugs into [[LCOS-F48-weekly-digest]] (if the digest is absent, the section is deferred).
- **Epics:** part of [[LCOS-E12-competitor-reviews]]; the Competitors UI is shared with [[LCOS-E11-competitor-menu]].
- **ADR:** [[ADR-012]] (live provider paths / secrets backend-only; the frontend renders results only).

## Acceptance criteria

- Acceptance criteria: TBD (Phase 2 — detailed on activation). API/pagination, digest-section, immediate negative-alert, module-gate and tenant-isolation criteria are drafted when the epic is activated (digest section depends on [[LCOS-F48-weekly-digest]] being live).

## Sources

- `plan/PHASE_F8_COMPETITORS_REVIEWS.md §1 F8-B4` (API endpoints, digest section, negative-review alert, module gate).
- `plan/PHASE_F8_COMPETITORS_REVIEWS.md §2 F8-F1` (Reviews tab, sentiment badges/filters, trends screen, import form).
- `plan/PHASE_F8_COMPETITORS_REVIEWS.md §3` (out of scope: auto-replies, social networks, competitor scraping).
