---
doc: TZ__FIX_DISCREPANCY_BUCKET1
title: Фикс DISCREPANCY, Ведро 1 (доки + тесты) — прогресс и deliverable
version: 1.0.0
status: complete
updated: 2026-07-09
owner: Ivan
trust_tier: 4
notes: Рабочий журнал фикс-ТЗ. Scope закрыт F1–F5. Ведро 2 (V5/V9) НЕ трогается.
---

# Фикс DISCREPANCY — Ведро 1 (F1–F5)

Основание: верификация `TZ__VERIFY_APP_OVERVIEW` (17 агентов, refute upheld).
Authority: code + CLAUDE.md > DEC-0011/0013 > этот ТЗ > APP_OVERVIEW.

## Статус по задачам

| # | Задача | Статус | Evidence |
|---|---|---|---|
| F1 | Удалить мёртвый `save()` | edited (verify pending) | grep пуст (ниже); types.ts+ingredientFactory.ts правлены; tsc/vitest — в workflow |
| F2 | APP_OVERVIEW §7/§8 под реальный канал | edited | §7 без save() (grep, report); §8:92 переписан → `ADR-020` |
| F3 | Новый ADR (канал + persist-independence + save-removal) | edited | ADR-020 добавлен в 04_DECISIONS.md; changelog v1.4.0; §8 ссылка перепривязана |
| F4 | Тесты T1 (BE reject→mapping выживает) + T2 (FE onSend порядок) | in_progress (workflow) | pytest/vitest raw — ниже |
| F5 | Формулировка `sku_embedding` | edited | §11:126 выровнен к DEC-0011 + backlog DEC-02 |

## Ключевые факты (зафиксированы перед правкой)

### F1 — verbatim grep `.save(` (перед удалением)
```
$ grep -rn "\.save(" src/shared/sku   → (no matches)
$ grep -rn "\.save(" src/features      → (no matches)
$ grep -rn "\.save(" src/widgets       → (no matches)
$ grep -rn "\.save(" src (весь)        → No matches found
```
`save` как токен встречается только как объявления (не вызовы):
- `src/shared/sku/factory/types.ts:50` — член интерфейса `SKUFactory.save(...)`
- `src/shared/sku/factory/ingredientFactory.ts:91` — dead no-op (V1)
- `src/shared/sku/factory/supplierFactory.ts:55` — dead no-op (ВНЕ scope V1; см. «Дефекты вне scope»)

**Scope-нюанс F1:** `save()` объявлен в общем интерфейсе `SKUFactory<T>` (`types.ts:50`) и реализован no-op'ом в ОБЕИХ фабриках. Удаление только метода класса `IngredientSKUFactory.save()` сломает `tsc` (не реализован член интерфейса). Минимальная связная правка в scope V1:
- удалить `IngredientSKUFactory.save()` (ingredientFactory.ts);
- удалить член `save` из интерфейса `SKUFactory` (types.ts) — вынужденно, прямое следствие;
- `SupplierSKUFactory.save()` НЕ трогать (вне V1). После удаления члена интерфейса он остаётся легальным «лишним» методом класса (`tsc` зелёный), но становится dead → в отчёт «вне scope».

### F2 — §7 не содержит `save()`
`grep -n "save" mvp.docs/APP_OVERVIEW.md` → единственное совпадение §8:92 (это `POST`-канал, корректный). В §7 подачи `save()` НЕТ (framing жил в прошлых ТЗ, не в текущем APP_OVERVIEW). F2-§7 = verify-and-report, правится только §8.

### F5 — премиса ТЗ неточна против текущего файла
`grep -niE "триггер|зарезерв" mvp.docs/APP_OVERVIEW.md` рядом с `sku_embedding` → НИЧЕГО. Фразы «зарезервировано с триггером» в APP_OVERVIEW НЕТ. Текущий §11:126 уже пишет «помечена в `DEC-0011` как чистка dead-code». Реальный пробел: нет ссылки на backlog `DEC-02`. Правка минимальна: выровнять к DEC-0011 (`04_DECISIONS__DEC-0011.md:46`) + добавить `DEC-02` (`05_BACKLOG.md:49`).

## Дефекты, найденные, но НЕ исправленные (вне scope)
- `src/shared/sku/factory/supplierFactory.ts:55` — `SupplierSKUFactory.save()` тоже dead no-op. Вне V1/F1 (V1 = ingredient). После F1 (удаление члена интерфейса) остаётся легальным, но неиспользуемым методом класса; `tsc` зелёный. Не трогал — репорт.
- `src/shared/sku/README.md:77` — док всё ещё описывает `save(item, context)` как метод интерфейса `SKUFactory`; после F1 (удаление члена из `types.ts`) это устаревшая строка. Прямое следствие F1, но README не входит в перечисленный scope F1 (метод) → не правил. Тривиальный follow-up при одобрении владельца.
- `InvoiceWorkbench.onSend` — persist best-effort (`Promise.allSettled` + нота «N сопоставлений не сохранены»), проваленный persist НЕ прерывает send. Это соответствует задокументированному fail-closed-at-commit рационалу (не дефект) — отмечено для полноты.

## Результаты (workflow wtxg1dleo — 5 агентов, 0 ошибок, все PASS)

### F4-T1 (BE) — GREEN
Файл: `mvp.be/tests/features/invoice/recognition/test_persist_survives_reject.py` (новый; НЕ помечен `merge_gate` → счёт merge_gate остаётся 17).
Draft с невалидной арифметикой (сумма строк 100 ≠ заявленный total 200) → `validate_draft` отклоняет, `submit()` возвращает до commit-резолва. Ассерты: `status == rejected`, `erp.written == []`, строка `sku_mapping` присутствует и неизменна (`pos_ingredient_id`/`method`/`confirmed_by`).
```text
=== GREEN ===
$ docker compose run --rm backend pytest tests/features/invoice/recognition/test_persist_survives_reject.py -v
collected 1 item
tests/features/invoice/recognition/test_persist_survives_reject.py .     [100%]
============================== 1 passed in 1.35s ===============================

=== RED DEMO (нетавтологичность; test-only delete+flush перед финальным assert) ===
>       assert row is not None
E       assert None is not None
tests/features/invoice/recognition/test_persist_survives_reject.py:109: AssertionError
============================== 1 failed in 1.54s ===============================

=== GREEN (после отката delete) ===
1 passed in 1.26s

=== merge_gate (без изменений) ===
$ docker compose run --rm backend pytest -m merge_gate -q
17 passed
```
Нетавтологичность доказана: вставка test-only `delete+flush` перед финальным assert → RED (`assert None is not None`); откат → GREEN.

### F4-T2 (FE) + F1 verify — GREEN
Файл: `mvp.fe/src/widgets/invoice-workbench/ui/InvoiceWorkbench.onSend.test.tsx` (новый). Монтирует РЕАЛЬНЫЙ `InvoiceWorkbench` (реальные `sessionReducer`/`settingsReducer`, реальный `validateInvoice`/`countLines`/slice); мокаются только транспортные границы (`persistLineMapping`, `useSendInvoiceMutation`, `useSuggestMatchesMutation`) + read-хуки. `onSend` не рефакторился/не извлекался.
- Test 1 (порядок): записанная последовательность `['persist:call','persist:call','persist:resolved','persist:resolved','send:call']` — persist не просто вызван, а **резолвится** до send (`lastIndexOf('persist:resolved') < indexOf('send:call')`).
- Test 2: один POST на каждую сопоставленную строку с корректными `sourceKey/supplierExternalId/posIngredientId/packing`.
```text
=== F1 grep .save( ===
$ grep -rn "\.save(" src/shared/sku src/features src/widgets   → exit 1 (no matches)
$ grep -rn "\.save(" src                                        → exit 1 (no matches)
=== tsc -b === TSC_EXIT=0
=== full vitest ===
 Test Files  7 passed (7)
      Tests  45 passed (45)   (43 baseline + 2 new)
```

### Верификация DoD (независимые агенты)
- **DoD-F1-crosscheck** → PASS: `SKUFactory` без `save`; `IngredientSKUFactory` без `save()`; синглтон `ingredientSkuFactory` и потребители (`SkuSelect2`→`SKUDropdown`→`useSkuSearch`) живы и зовут `listAll/search/listBySupplier/getById`; `tsc` clean. (Нашёл stale `README.md:77` — вне scope.)
- **DoD-F2-F3-F5-docs** → PASS (вердикт агента был со stub-пруфом; перепроверено оркестратором прямыми grep — §8:92 цитирует `ADR-020` без `ADR-013`; в APP_OVERVIEW ноль вхождений `save`; `ADR-020` + changelog v1.4.0 в `04_DECISIONS.md:157/170`; §11:126 выровнен + `DEC-02`).
- **Bucket2-untouched-guard** → PASS: `_resolve_commit_identities` (commit_eligible, `pos_ingredient_id` из `by_key`=sku_mapping, не из `esupl_item_id`), `esupl.py` get_ingredient (None без items[0]; `/products?id=`), 4-компонентный UNIQUE `sku_mapping`, `invoice_lines.sku_embedding` НЕ дропнут, VER-021 probe — всё без изменений. Единственные production-правки FE — удаление `save()`.

## Изменённые/добавленные файлы (bundle)
- `mvp.fe/src/shared/sku/factory/types.ts` — removed `save` interface member.
- `mvp.fe/src/shared/sku/factory/ingredientFactory.ts` — removed `save()` no-op.
- `mvp.fe/src/widgets/invoice-workbench/ui/InvoiceWorkbench.onSend.test.tsx` — new (T2).
- `mvp.be/tests/features/invoice/recognition/test_persist_survives_reject.py` — new (T1).
- `mvp.docs/APP_OVERVIEW.md` — §8 rewrite (F2), §11 sku_embedding (F5).
- `mvp.docs/04_DECISIONS.md` — ADR-020 + changelog (F3).
- `mvp.docs/TZ__FIX_DISCREPANCY_BUCKET1_2026-07-09.md` — этот журнал.
