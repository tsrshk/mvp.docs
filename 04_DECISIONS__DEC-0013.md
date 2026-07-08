# DEC-0013 — commit требует ПОДТВЕРЖДЁННОЙ идентичности SKU (вариант A)

- **Status:** Accepted
- **Date:** 2026-07-08
- **Decided by:** Ivan (veto-окно TZ `TZ__DEC-0011_merge-gate_2026-07-08.md`)
- **Depends on:** DEC-0011 (POS как SoT идентичности; двухфазная авторитетность)
- **Relates to:** VER-021 (durability, GATE, открыт), VER-022 (scope кэша, закрыт этим решением)

## Context

Строка накладной без подтверждённого `sku_mapping`, но с точным совпадением в `ingredient_cache`
(Tier 3), — коммитить автоматически или нет? TZ предлагал по умолчанию **вариант C** (авто-резолв
exact-match + авто-создание mapping). Открытый вопрос §3.4 патча.

## Decision — вариант A (block until manual confirmation)

**Commit разрешён ТОЛЬКО для подтверждённой идентичности.** Строка без commit-eligible
`sku_mapping` (`method=manual` **OR** `confirmed_by IS NOT NULL`) на commit → **block + review**,
не запись. Exact `ingredient_cache`-match и fuzzy/AI — подсказки draft-фазы; они **не**
авто-коммитятся и **не** авто-создают mapping. Moat растёт через явное подтверждение человеком
(создание manual-mapping или подтверждение подсказки → `confirmed_by`).

Это строже рекомендации патча (§3.4) и строже варианта C: максимально fail-closed прочтение
принципа «накладная — ответственный этап; ИИ показывает, человек решает».

### Рассмотренные варианты

| Вариант | UX-трение | Moat | Fail-closed | Выбор |
|---|---|---|---|---|
| A. Block до ручного подтверждения | высокое (на каждой новой позиции) | да (через подтверждение) | да | **✅ принят** |
| B. Авторезолв exact без mapping | нет | нет | да | отклонён |
| C. Авторезолв exact + авто-mapping | нет | да | да | отклонён (был default TZ) |

## Normative rules

**MUST**
- Commit-резолв: `normalize_source_key(line.description)` → `sku_mapping`, приоритет subdivision → org.
- Commit-eligible = `method == manual` OR `confirmed_by IS NOT NULL`.
- Нет commit-eligible mapping → block+review (status `rejected`), приход НЕ пишется, валидация НЕ пропускается.

**MUST NOT**
- Cache exact-match / fuzzy / AI MUST NOT авто-коммитить и MUST NOT авто-создавать `sku_mapping`.
- Commit-путь MUST NOT читать `ingredient_cache` как источник authority (совпадает с DEC-0011).

## Consequences

- (+) Ни одна неподтверждённая догадка не попадает в POS. Откат не нужен — мусор не пишется.
- (+) VER-022 закрыт: кэш вне commit-пути → scope-асимметрия «cache только org» невозможна.
- (−) Каждая новая позиция требует одноразового подтверждения (ожидаемое трение; это и есть «review»).
- Реализация: `invoice_service._resolve_commit_identity`; тесты `test_dec0013_commit_gate.py`
  (`test_exact_cache_match_does_not_commit_and_creates_no_mapping`,
  `test_fuzzy_mapping_without_confirmation_blocks_commit`, `test_confirmed_mapping_commits`) — merge_gate.

> Merge-инструкция: скопировать в `04_DECISIONS`. При конфликте номера — перенумеровать здесь и в ссылках.
