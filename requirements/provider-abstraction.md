---
id: REQ-PROVIDER-ABSTRACTION
type: requirement
title: Provider seams (Protocol + registry + ProviderContext)
status: built
scope: cross-cutting
roles: [superadmin]
entities: []
adrs: ["[[ADR-009]]"]
requirements: ["[[vpn-egress]]", "[[erp-esupl-integration]]", "[[fail-closed]]", "[[global-requirements]]"]
legacy_refs: [Conformance R7, DEC-01, CLAUDE.md "one impl per provider"]
sources: [01_ARCHITECTURE.md "Backend provider abstraction", APP_OVERVIEW.md §3, LCOS_Conformance R7]
updated: 2026-07-09
---

# REQ-PROVIDER-ABSTRACTION · Provider seams

**Type:** cross-cutting SSOT · **Status:** built. Как `services` изолируются от конкретных внешних интеграций.

## Нормативное положение

- **N1. Направление зависимостей:** `api → services → providers/repositories`. `services` зависят **только** от интерфейсов в `providers/*/base.py` (Protocol), **никогда** от конкретных классов (`claude`/`esupl`).
- **N2. Интерфейсы — `typing.Protocol` (`@runtime_checkable`), не ABC** — структурная типизация, реализациям не нужно наследование.
  - `OcrProvider`: `name`, `requires_vpn`, `extract_invoice(image_bytes, mime_type) -> InvoiceDraft`.
  - `ErpProvider`: `name`, `requires_vpn`, `list_suppliers`, `list_ingredients`, `write_invoice(payload, api_token=None) -> str`.
  - **`Protocol` для LLM намеренно отсутствует** — транспорт LLM = async-функции уровня модуля в `providers/ai.py` (`ai_complete`, `claude_complete`, `gemini_complete`); OCR-провайдеры — тонкие адаптеры поверх них.
- **N3. Registry + декораторы:** `_OCR_REGISTRY`/`_ERP_REGISTRY` (name→class); `@register_ocr("claude")`, `@register_erp("esupl")`. `get_*_provider(name)` делает `cls()` (провайдеры stateless — инфру берут из `ProviderContext` во время вызова) и бросает описательный `ValueError` при промахе. `import_providers()` явно импортирует модули (декораторы срабатывают при импорте), вызывается один раз в `lifespan`.
- **N4. Выбор реализации — две разные плоскости конфигурации (легко спутать):**
  - **ERP = статическая deploy-конфигурация из env:** `get_erp()` читает `settings.erp_provider` (`ERP_PROVIDER`, default `esupl`).
  - **OCR/AI = runtime-конфигурация из БД, не env:** `get_ocr()` вызывает `resolve_ai_provider()` (читает `system_settings.ai_provider`, default `claude`). Superadmin меняет активный OCR/LLM в SQLAdmin без redeploy.
- **N5. Одна активная реализация на шов** (`ADR-009`): сегодня OCR=`claude`, ERP=`esupl`. Альтернативы **не пишутся** без реального триггера (рост объёма, гео/costs-риск).
- **N6. `ProviderContext` (module-global `_CTX`)** несёт cross-infra, не грязнящую сигнатуры Protocol: `egress` (два httpx-клиента), `ai_vpn` (`AiVpnToggle`), `session_scope` (`SessionFactory`). Устанавливается в `lifespan`, очищается при shutdown; `get_provider_context()` бросает `RuntimeError`, если не установлен. Тесты подставляют fakes.

## Обоснование

Protocol+registry позволяют подмену/тестирование без наследования и без протекания конкретных классов в use cases. `ProviderContext` решает конкретную проблему: `claude_complete` должен вычислить `via_vpn` и взять egress-клиент, не затягивая это в сигнатуру `OcrProvider.extract_invoice` и не импортируя слой `services` (back-edge зависимость). Правило «одна реализация на шов» глушит мёртвый «для-будущего» код.

## Режимы отказа

- **Рассинхрон имени OCR и enum `ai_provider`:** `resolve_ai_provider()` играет двойную роль (одно значение выбирает и LLM в `ai_complete`, и класс OCR в `get_ocr`). Если зарегистрировать имя OCR, которого нет в `ai_provider` — скрытый баг (V-c). Долг DEC-01: рекомендация claude-only (убрать ветку gemini + снять двойную роль) ЛИБО вынести LLM за Protocol симметрично OCR/ERP с инвариантом "OCR name ≡ ai_provider enum" под тестом.
- **`get_provider_context()` до `lifespan`** → `RuntimeError` (fail-closed, не тихий None).
- **Неизвестное имя провайдера** → `ValueError` со списком зарегистрированных.
- **Долг (gemini):** зарегистрирован второй OCR/AI-вендор `gemini` — он нарушает «одну реализацию»; требует разрешения (DEC-01).

## Связи

- ADR: [[ADR-009]] (одна реализация на шов), [[ADR-004]] (статический выбор ERP).
- Требования: [[vpn-egress]] (egress/VPN через контекст), [[erp-esupl-integration]] (ErpProvider), [[fail-closed]], [[global-requirements]] R7.

## На это ссылаются

`LCOS-F5` (Provider seams + fail-closed egress), `LCOS-F8` (OCR), `LCOS-F10`/`F11` (ERP write/read), `LCOS-F69` (second ERP connector iiko — будущий триггер шва).

## Источники

- 01_ARCHITECTURE.md → "Backend provider abstraction", "Two DI mechanisms", "Registry + selection".
- APP_OVERVIEW.md §3; LCOS_Conformance R7, D-a, V-c.
- Код: `app/providers/{base,context,ai,ocr,erp}.py`, `app/api/deps.py`.
