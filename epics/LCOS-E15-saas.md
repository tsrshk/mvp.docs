---
id: LCOS-E15
type: epic
title: SaaS (Phase 2)
status: future
phase: "Phase 2"
features: ["[[LCOS-F66-prod-hardening]]", "[[LCOS-F67-onboarding]]", "[[LCOS-F68-billing]]", "[[LCOS-F69-iiko-connector]]", "[[LCOS-F70-tenancy-scaling]]", "[[LCOS-F71-product-packaging]]"]
legacy_refs: [plan P2]
sources: [06_STRATEGY.md, plan/00_IMPLEMENTATION_PLAN.md P2, 07_PHASES.md]
updated: 2026-07-09
---

# LCOS-E15 · SaaS (Phase 2)

**Статус:** 🔭 future · **Фаза:** Phase 2 (после Pilot-Gate + первых нишевых клиентов)

## Описание

Превращение продукта, валидированного на Customer Zero, в продаваемый SaaS: production hardening и деплой (уход с локального Docker в облако), self-service-онбординг, биллинг, второй ERP-коннектор (iiko) поверх существующего провайдерского шва ([[LCOS-F5-provider-seams]]), масштабирование мультиарендности ([[LCOS-F1-multitenancy]]) и упаковка продукта. Именно этот эпик, а не что-либо более раннее, реализует «Phase 2 = SaaS» из старых планов (разрешение коллизии #2).

Стратегия прямо запрещает строить это до Pilot-Gate: попытка пойти «сразу за экспонентой» (глобальный рынок, self-service, биллинг) до валидации — способ потерять год (06_STRATEGY §roadmap).

## Цель / ценность

Выход на растущий поток пользователей и приличный доход основателя ($3–8k/месяц: 30–80 платящих × $99–149/месяц в ценовой точке «управляющий»). Канал масштабирования — маркетплейс Poster после Pilot-Gate + 5–10 нишевых клиентов.

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F66 | Production hardening и деплой | 🔭 future | [[LCOS-F66-prod-hardening]] |
| LCOS-F67 | Self-service-онбординг | 🔭 future | [[LCOS-F67-onboarding]] |
| LCOS-F68 | Биллинг | 🔭 future | [[LCOS-F68-billing]] |
| LCOS-F69 | Второй ERP-коннектор (iiko) | 🔭 future | [[LCOS-F69-iiko-connector]] |
| LCOS-F70 | Масштабирование мультиарендности | 🔭 future | [[LCOS-F70-tenancy-scaling]] |
| LCOS-F71 | Упаковка продукта | 🔭 future | [[LCOS-F71-product-packaging]] |

## Ключевые сущности / требования

- Сущности: [[organizations]], [[subdivisions]], [[users]], [[memberships]], [[integration_credentials]] (масштабирование существующей иерархии арендаторов).
- Требования: [[multitenancy]], [[auth]], [[config-secrets]], [[secret-encryption]], [[provider-abstraction]], [[erp-esupl-integration]].
- Роли: [[superadmin]], [[admin]], [[sqladmin-operator]], [[supplier-future]] (self-service поставщика активируется здесь).

## Гейты

- **Сначала Pilot-Gate ([[ADR-003]]):** SaaS не стартует, пока не пройден Pilot-Gate и не появились первые платящие нишевые клиенты — жёсткий стратегический гейт.
- **Второй ERP через шов:** коннектор iiko реализует существующий `Protocol` без переписывания сервисов ([[ADR-009]]).
- **Self-service поставщика:** активирует заглушку [[ADR-017]] (роль `supplier`, `portal_user_id`).
- AC: TBD (Phase 2).

## legacy_refs

plan P2 (SaaS-фаза); 06_STRATEGY roadmap и рыночные опции A/B/C.

## Источники

- 06_STRATEGY.md (roadmap, выручка, канал), plan/00_IMPLEMENTATION_PLAN.md P2, 07_PHASES.md
- ADR: [[ADR-003]], [[ADR-009]], [[ADR-017]]
