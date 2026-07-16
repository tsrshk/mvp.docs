---
doc: FE_TEST_BUGS_2026-07-10
title: "Баги ручного тестирования FE (2026-07-10)"
status: archived
archived: 2026-07-15
archived_from: repo-root (d:/_work/mvp)
reason: "Все 5 багов исправлены 2026-07-10"
trust_tier: 3
---

> Архивировано 2026-07-15 из корня репозитория. Документ инертен — не читается как актуальный. Хранится для истории.
# Баги, найденные при покрытии фронта тестами (2026-07-10)

> ✅ **ВСЕ 5 ИСПРАВЛЕНЫ 2026-07-10.** Каждый `.skip`/`.todo` снят и превращён в реальный
> регрессионный тест. Полный сьют: 327 тестов зелёные (0 skipped/todo), `tsc -b --noEmit` чистый.
> Ниже — исходное описание для истории; статус каждого помечен ✅.

Написано ~281 новых unit-тестов на 15 модулей чистой логики (сьют: 45 → 326 тестов, 0 падений).
По ходу написания вскрылось 5 реальных дефектов. Все задокументированы прямо в тестах
через `it.skip`/`it.todo` с пояснением — сьют остаётся зелёным, а тесты станут регрессией
после починки (просто снять `.skip`).

Ранжировано по влиянию.

---

## BUG-1 (HIGH, живой для Customer Zero) — `parseIsoDate` ломается в поясах восточнее UTC
`mvp.fe/src/entities/invoice/model/validate.ts:64-70`

`parseIsoDate` строит `Date` из локальной полуночи (`new Date(\`${value}T00:00:00\`)`),
но сверяет round-trip через `d.toISOString().slice(0,10)` (UTC). В любом поясе восточнее UTC
(у нас Минск, UTC+3) локальная полночь → предыдущий день в UTC, round-trip не совпадает →
**любая корректная дата помечается как «дата в непонятном формате»**.
Подтверждено: `parseIsoDate('2026-07-09') === null` при offset −180.

Последствие: в браузере владельца (Минск) **каждая накладная получает паразитный warning по дате**.
CI тоже в Минске — поэтому happy-path тесты валидатора написаны так, чтобы не падать на этом
(ассертят конкретные issue-id, а не пустой список).

Тест-регрессия: `validate.test.ts` → `it.skip('BUG: a valid ISO date should produce NO date issue')`.
Фикс: сравнивать по локальным компонентам (`getFullYear/getMonth/getDate`), а не через `toISOString()`.

## BUG-2 (MEDIUM, следствие BUG-1) — ветка «дата в будущем» недостижима
`mvp.fe/src/entities/invoice/model/validate.ts:130`

Проверка `d.getTime() > Date.now()` мертва в поясах восточнее UTC: `parseIsoDate` возвращает
`null` раньше, поэтому будущая дата даёт «непонятный формат» вместо задуманного «дата в будущем».
Чинится вместе с BUG-1. Тест: `it.skip('BUG: a future date should warn в будущем')`.

## BUG-3 (MEDIUM) — `fmtDateLong` бросает исключение на shape-валидной, но невалидной дате
`mvp.fe/src/shared/lib/format.ts`

Guard-регексп `^\d{4}-\d{2}-\d{2}$` проверяет только форму, не диапазон. Вход вида `'2026-13-01'`
или `'2026-00-09'` (правдоподобно от OCR) проходит guard → `Invalid Date` →
`Intl.DateTimeFormat#format` бросает `RangeError: Invalid time value` — **непойманное исключение
вызывающему** вместо fallback-строки.
Тест: `format.test.ts` → `it.todo('BUG: ...')`.
Фикс: после парсинга проверять `Number.isNaN(d.getTime())` и возвращать исходную строку.

## BUG-4 (MEDIUM) — `BackendMatchProvider` падает без верхнеуровневого guard
`mvp.fe/src/shared/match/providers/backend.ts:30`

Если backend вернёт объект без `matches` (или `matches` не массив), `res.matches.map(...)`
бросает `TypeError` вместо мягкой деградации к пустому списку предложений.
Тест: `match/providers/backend.test.ts` фиксирует текущее (падающее) поведение через `rejects.toThrow`.
Фикс: `Array.isArray(res.matches) ? res.matches : []`.

> Связанное (по строке ниже, `backend.ts:36`): `confidence: best?.score ?? 0` пробрасывает сырой
> score без `clamp01` — в отличие от mock/parse-путей. Если backend отдаст нечисловой или
> вне-[0,1] score, он пройдёт без защиты. Это и есть, вероятно, цель флага «unguarded float on score»
> из код-ревью. Обернуть в `clamp01`.

## BUG-5 (MEDIUM, ранее флагнут код-ревью) — `BackendOcrProvider` падает на нештатном `lines`
`mvp.fe/src/shared/ocr/providers/backend.ts:64`

`draft.lines.map(...)` без guard: если ответ опускает `lines`, шлёт `lines: null` или не-массив —
`extractInvoice` бросает сырой `TypeError` вместо деградации к пустому списку строк.
Воспроизведено прямо против модуля. Тесты: `ocr/providers/backend.test.ts` — 3 `it.skip` с
BUG-комментарием (снять после фикса).
Фикс: `Array.isArray(draft.lines) ? draft.lines.map(...) : []`.

---

## Замечания по контрактам (не баги, к сведению)

- **Валидатор не проверяет валюту.** `header.currency` нигде не читается в `validate.ts` —
  если это осознанно, ок; если нет — пробел в валидации. Добавлен документирующий тест.
- **«Mapping state gating» идёт по `l.skuId`, а не по `mappingState`.** Строка с
  `mappingState='none'`, но заданным `skuId` считается замапленной. Поведение зафиксировано тестом —
  убедиться, что это и задумано.
