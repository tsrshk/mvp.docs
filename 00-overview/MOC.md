---
id: OV-MOC
type: moc
title: Map of Content — карта хранилища LCOS
status: current
phase: cross-cutting
updated: 2026-07-09
owner: Ivan
trust_tier: 3
sources:
  - _RESTRUCTURE_PLAN.md (Epic→Feature ID map, target tree)
---

# MOC — карта содержимого хранилища LCOS

> Обзорный индекс всего хранилища: overview-документы, эпики E1–E15, фичи F1–F71, сущности, роли, требования и решения. Обычный вход — из эпика или overview-документа, а оттуда глубже через `[[README]]`. Структура по типу + вики-ссылки (без физической вложенности), см. [[_RESTRUCTURE_PLAN]].

## Overview

- [[product]] — идентичность продукта (AI-управляющий), стратегия, рынок, dev stop-list
- [[roadmap]] — единый хребет фаз, эпики E1–E15, [[glossary]], карта легаси-кодов
- [[architecture]] — as-built архитектура (слои, потоки, состояние)
- [[glossary]] — термины (moat, source_key, fail-closed, ProviderContext, …)
- [[README]] — карта хранилища и реестр документов
- [[speckit-workflow]] — мост vault ↔ spec-kit: где что живёт, соответствие артефактов, слэш-команды
- [[dev-workflow]] — как работать с проектом: три репо + workspace, локальный запуск, баг-трекинг, CI/CD

## Эпики

### Фаза 1 (E1–E8) — закрыть боль накладных, детально

- [[LCOS-E1-platform]] ✅ — Платформа и основания
- [[LCOS-E2-invoice-intake]] ✅ — Приёмка накладных (клин)
- [[LCOS-E3-sku-identity]] ✅ — SKU identity и moat обучающей петли
- [[LCOS-E4-suppliers]] 🟡 — Справочник поставщиков и условия
- [[LCOS-E5-stabilization]] 🟡 — Стабилизация и conformance
- [[LCOS-E6-ocr-quality]] 📝 — Качество захвата OCR
- [[LCOS-E7-stock]] 📝 — Остатки и список «заканчивается»
- [[LCOS-E8-purchasing]] 🟡 — Закупки: черновики заказов и замыкание петли (F37/F43 построены)

**→ [[glossary]] ←**

### Фаза 2 (E9–E15) — рост после Pilot-Gate, заглушки

- [[LCOS-E9-sales-analytics]] 🔭 — Аналитика продаж и дайджест
- [[LCOS-E10-local-context]] 🔭 — Локальный контекст: погода и события
- [[LCOS-E11-competitor-menu]] 🔭 — Меню и цены конкурентов
- [[LCOS-E12-competitor-reviews]] 🔭 — Отзывы конкурентов
- [[LCOS-E13-menu-ideas]] 🔭 — Кросс-рецептурные идеи меню
- [[LCOS-E14-strategic-insights]] 🔭 — Стратегические инсайты и еженедельный диалог
- [[LCOS-E15-saas]] 🔭 — SaaS (Фаза 2)

## Фичи по эпикам

**E1 — Платформа:** [[LCOS-F1-multitenancy]] · [[LCOS-F2-app-auth]] · [[LCOS-F3-sqladmin-operator]] · [[LCOS-F4-config-secrets]] · [[LCOS-F5-provider-seams]] · [[LCOS-F6-module-gates]] · [[LCOS-F7-frontend-platform]]

**E2 — Приёмка накладных:** [[LCOS-F8-ocr-recognition]] · [[LCOS-F9-line-matching]] · [[LCOS-F10-invoice-status-machine]] · [[LCOS-F11-esupl-read]] · [[LCOS-F12-warehouse-target]]

**E3 — SKU identity / moat:** [[LCOS-F13-sku-identity-resolver]] · [[LCOS-F14-learning-loop]] · [[LCOS-F15-sku-catalog]] · [[LCOS-F16-ingredient-cache]]

**E4 — Поставщики:** [[LCOS-F17-supplier-cards]] · [[LCOS-F18-supplier-criteria]] · [[LCOS-F19-supplier-self-service]] · [[LCOS-F20-price-history]] · [[LCOS-F21-price-change-signal]]

**E5 — Стабилизация:** [[LCOS-F22-sku-stabilization]] · [[LCOS-F23-failclosed-encryption]] · [[LCOS-F24-merge-gate-tests]] · [[LCOS-F25-deadcode-cleanup]] · [[LCOS-F26-multipage-fix]] · [[LCOS-F27-receipts-rename]] · [[LCOS-F28-esupl-contracts]]

**E6 — Качество OCR:** [[LCOS-F29-multipage-recognize]] · [[LCOS-F30-recognition-context]] · [[LCOS-F31-auto-crop]] · [[LCOS-F32-camera-capture]] · [[LCOS-F33-confidence-gate]]

**E7 — Остатки:** [[LCOS-F34-stock-levels]] · [[LCOS-F35-reorder-point]] · [[LCOS-F36-stock-screen]]

**E8 — Закупки:** [[LCOS-F37-purchase-orders]] · [[LCOS-F38-orders-ui]] · [[LCOS-F39-order-message]] · [[LCOS-F40-ai-order-proposal]] · [[LCOS-F41-ai-order-ui]] · [[LCOS-F42-receipt-reconciliation]] · [[LCOS-F43-idempotency]] · [[LCOS-F44-live-closeout]]

**E9 — Аналитика продаж (заглушки):** [[LCOS-F45-sales-read]] · [[LCOS-F46-sales-storage]] · [[LCOS-F47-scheduler]] · [[LCOS-F48-weekly-digest]] · [[LCOS-F49-reorder-suggestion]]

**E10 — Локальный контекст (заглушки):** [[LCOS-F50-weather]] · [[LCOS-F51-coordinates]] · [[LCOS-F52-local-events]] · [[LCOS-F53-digest-enrichment]]

**E11 — Меню конкурентов (заглушки):** [[LCOS-F54-competitor-directory]] · [[LCOS-F55-menu-ocr]] · [[LCOS-F56-positioning]] · [[LCOS-F57-places-prefill]]

**E12 — Отзывы конкурентов (заглушки):** [[LCOS-F58-review-storage]] · [[LCOS-F59-review-analysis]] · [[LCOS-F60-reviews-api]]

**E13 — Идеи меню (заглушки):** [[LCOS-F61-menu-idea-generation]] · [[LCOS-F62-menu-ideas-ui]]

**E14 — Стратегические инсайты (заглушки):** [[LCOS-F63-insight-context]] · [[LCOS-F64-weekly-questions]] · [[LCOS-F65-freeform-dialog]]

**E15 — SaaS (заглушки):** [[LCOS-F66-prod-hardening]] · [[LCOS-F67-onboarding]] · [[LCOS-F68-billing]] · [[LCOS-F69-iiko-connector]] · [[LCOS-F70-tenancy-scaling]] · [[LCOS-F71-product-packaging]]

## Сущности данных

Иерархия тенанта: [[organizations]] · [[subdivisions]] · [[users]] · [[memberships]]
Каталог и identity: [[ingredients]] · [[packings]] · [[ingredient_cache]] · [[sku_mapping]]
Накладные: [[invoices]] · [[invoice_lines]]
Поставщики: [[suppliers]]
Конфигурация/секреты: [[integration_credentials]] · [[system_settings]]
Остатки (Фаза 1): [[stock_levels]]

## Роли

Плоскость приложения (JWT): [[superadmin]] · [[admin]] · [[member]]
Плоскость оператора: [[sqladmin-operator]]
Placeholder (будущее): [[supplier-future]]

## Требования (сквозной SSOT)

- [[auth]] — авторизация приложения (JWT+refresh, детекция повторного использования)
- [[multitenancy]] — изоляция тенантов (scope org/subdivision)
- [[config-secrets]] — три уровня конфигурации
- [[secret-encryption]] — Fernet-конверт `enc:v2`, версионированный KEK
- [[fail-closed]] — явная ошибка вместо тихого fallback
- [[vpn-egress]] — fail-closed egress к AI (VPN-сайдкар)
- [[provider-abstraction]] — провайдеры за Protocol + registry, ProviderContext
- [[erp-esupl-integration]] — Esupl read-only + единственная гейтированная write-point
- [[sku-identity-resolver]] — двухконтекстный resolver (draft/commit)
- [[invoice-status-machine]] — статусы накладной
- [[supplier-criteria-registry]] — registry гибких критериев (JSONB)
- [[global-requirements]] — нормативные R1–R9

## Решения (ADR)

- [[index]] — журнал решений ADR-001…020 + записи `DEC-0011` / `DEC-0013`
- Ключевые: [[ADR-002]] (human-in-the-loop) · [[ADR-003]] ([[glossary]]) · [[ADR-006]] (fail-closed) · [[ADR-007]] (две плоскости auth) · [[ADR-008]] (multitenancy) · [[ADR-009]] (по одной реализации на шов) · [[ADR-016]] (источник остатков) · [[ADR-017]] (шов self-service поставщика) · [[ADR-018]] (DEC-0013 вариант A) · [[ADR-019]] (DEC-0012 составной ключ) · [[ADR-020]] (persist-then-commit)

## Справочник и процесс

- `reference/esupl-api/` — контракты Esupl API (перенесены из `api/esupl/`)
- `work/` — живые процессные документы (согласованный ТЗ, журнал правок, gate `VER-021`, backlog)
- `archive/` — инертные и вытесненные документы

## Sources

- `_RESTRUCTURE_PLAN.md` — карта Epic→Feature ID (E1–E15 / F1–F71), целевое дерево, диспозиции миграции.
