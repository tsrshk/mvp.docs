---
id: REQ-ERP-ESUPL
type: requirement
title: Интеграция с ERP Esupl (read-only + gated write)
status: built
scope: cross-cutting
roles: [member, admin, superadmin]
entities: ["[[organizations]]", "[[subdivisions]]", "[[ingredients]]", "[[integration_credentials]]", "[[invoices]]"]
adrs: ["[[ADR-004]]", "[[ADR-001]]", "[[ADR-006]]", "[[ADR-021]]"]
requirements: ["[[fail-closed]]", "[[invoice-status-machine]]", "[[secret-encryption]]", "[[provider-abstraction]]", "[[global-requirements]]"]
ssot_for: ["erp-esupl-integration", "esupl-read-endpoints", "gated-erp-write", "esupl-access-resolution"]
legacy_refs: [Conformance R6.2/R8.3, plan Э0, APP §9]
sources: [01_ARCHITECTURE.md "Esupl ERP", APP_OVERVIEW.md §9, reference/esupl-api]
updated: 2026-07-20
---

# REQ-ERP-ESUPL · Интеграция с Esupl

**Type:** cross-cutting SSOT · **Status:** built. LCOS — **точка записи накладных** поверх Esupl, **read-only** к остальным данным Esupl ([[ADR-001]]). Единственный ERP в Phase 1 ([[ADR-004]]).

## Нормативное положение

- **N1. Привязка:** `organization ↔ ровно одна команда Esupl` (`organizations.esupl_team_id`); `subdivision ↔ склад Esupl` (`subdivisions.esupl_warehouse_id`). Оба — **несекретные** ID-колонки; единственный секрет Esupl — Bearer-токен в [[integration_credentials]] (scope=org, provider=esupl). См. [[secret-encryption]] R6.5.
- **N2. `EsuplErpProvider` — единственная реализация ERP** ([[provider-abstraction]] N5), `requires_vpn=False` (Esupl доступен напрямую).
- **N3. Реальные read-эндпоинты** (tenant Bearer-токен на каждом чтении; `get_esupl_access(session, org_id) → (team_id, token)` — SSOT доступа, 4 места):
  - каталог: `GET /teams/{id}/products` (серверный поиск `product_name` LIKE)
  - одна позиция: `GET /teams/{id}/products?id=` (валидация на commit — см. [[sku-identity-resolver]])
  - накладные: `GET /teams/{id}/orders`
  - поставщики (matching-only): `GET /teams/{id}/following?is_virtual=1` — **НЕ источник справочника**. Справочник поставщиков читается из локальной таблицы `suppliers` (`GET /suppliers`, `/suppliers/search`); Esupl following используется ТОЛЬКО для matching и durable `supplier_external_id` в `sku_mapping`, а `POST /suppliers/sync` лишь обогащает локальную карточку. Это частичный реверс [[DEC-0011]]: «POS = SSOT» сохраняется для каталога ИНГРЕДИЕНТОВ, но НЕ для справочника ПОСТАВЩИКОВ. См. [[ADR-021]].
- **N4. Запись `write_invoice` за toggle `ERP_WRITE_ENABLED` (по умолчанию OFF):**
  - OFF: логирует warning и возвращает синтетический `esupl-prepared-<number>` **без egress** — не тихая подделка, а short-circuit до сети.
  - ON: `POST /teams/{id}/outgoing-invoices` с per-org Bearer, сериализация `json.loads(payload.model_dump_json())` (корректно обрабатывает Decimal/datetime), `raise_for_status()`, извлечение `id` (или `data.id`). **Один и тот же путь кода в обоих режимах** — toggle делает запись реальной без переписывания.
- **N5. Fail-closed по токену:** нет активного POS-токена → провайдер идёт **без аутентификации** → Esupl **401**, без env fallback. См. [[fail-closed]] N3.
- **N6. Human-in-the-loop:** без записи в POS нет без подтверждения человеком ([[ADR-002]]); отправка накладной = подтверждение сопоставлений (moat, [[sku-identity-resolver]]).
- **N7. Payload:** `EsuplOutgoingInvoice` собирается в `prepare()` из числовых FK Esupl (`esupl_item_id`, `esupl_unit_id`, `esupl_packing_id`, `team_id`, `warehouse_id`) + tax_rate; сохраняется в `invoices.esupl_payload` при статусе `prepared` (см. [[invoice-status-machine]]).
- **N8. Поставщик в payload:** `_resolve_supplier` — приоритет `tax_id`, затем **смешанный trigram 0.65 + token-Jaccard 0.35, min 0.4** по имени (НЕ "Jaccard≥0.5" — устаревшая формулировка в старых доках/docstring `prepare`; авторитетен код). `external_id` приводится к int.

## Обоснование

Esupl — POS Customer Zero; LCOS не дублирует учёт, но записывает в него накладные. Read-only + gated write означает: систему можно гонять на живом токене без риска повреждения данных, пока `ERP_WRITE_ENABLED=OFF`, а запись можно включить одним toggle. Один путь кода в обоих режимах исключает «работало в dry-run, сломалось в prod». `get_esupl_access` как SSOT доступа удерживает четыре места чтения токена от расхождения.

## Режимы отказа

- **Нет токена** → 401 (fail-closed), не тихий пропуск записи.
- **`list_suppliers`/`list_ingredients` без токена** (вне критического пути: справочник поставщиков читается из локальной таблицы `suppliers` — [[ADR-021]], каталог из локальных `ingredients`) — legacy-пути в провайдере всё ещё вызывают `_auth_headers()` без токена; долг D-f: удалить/закрыть за guard, чтобы не осталось пути неаутентифицированного egress.
- **VER-021 (durability) — OPEN GATE:** стабильность `pos_ingredient_id` при edit/delete-recreate в Esupl эмпирически не подтверждена; проба требует WRITE в sandbox team 17957 → **owner-run**, merge gated. Расхождение между эндпоинтами `/products?id=` (валидация на commit) vs `/ingredients/{id}` (проба) задокументировано; подтвердить read-only фильтры.
- **Запись в ERP не удалась** → не 500 клиенту: `submit` перехватывает и пишет `status=failed` + `validation_errors`.

## Связи

- ADR: [[ADR-004]] (Esupl как основной ERP), [[ADR-001]] (точка записи, не POS), [[ADR-002]] (human-in-the-loop), [[ADR-006]] (fail-closed), [[ADR-021]] (поставщики — локальный SSOT, следование из Esupl только для matching).
- Требования: [[invoice-status-machine]], [[sku-identity-resolver]], [[secret-encryption]], [[provider-abstraction]], [[fail-closed]], [[global-requirements]] R6.2/R8.3.
- Сущности: [[organizations]], [[subdivisions]], [[ingredients]], [[integration_credentials]], [[invoices]].
- Reference: `reference/esupl-api/` (зеркало контрактов).

## На это ссылаются

`LCOS-F10` (Invoice status machine + Esupl payload + gated write), `LCOS-F11` (Esupl read integration), `LCOS-F12` (warehouse-target), `LCOS-F28` (Э0 Esupl API contracts), `LCOS-F69` (second ERP connector).

## Источники

- 01_ARCHITECTURE.md → "Esupl ERP: read-only vs write, ERP_WRITE_ENABLED gating", "prepare()→payload".
- APP_OVERVIEW.md §9; LCOS_Conformance R6.2, R8.3, ADR-016 (remains/sales — proposed).
- Код: `app/providers/erp/esupl.py`, `app/services/invoice_service.py`; `VER-021_ESUPL_DURABILITY_TEST.md`.
