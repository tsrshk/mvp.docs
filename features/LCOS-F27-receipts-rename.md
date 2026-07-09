---
id: LCOS-F27
type: feature
title: Frontend-переименование entities/order → receipts
epic: "[[LCOS-E5-stabilization]]"
status: planned
phase: "Phase 1"
roles: [member, admin]
entities: ["[[invoices]]"]
requirements: ["[[global-requirements]]", "[[erp-esupl-integration]]"]
adrs: []
legacy_refs: [08 F1.6, plan S1]
sources: ["08_PHASE1_SPEC.md F1.6", "APP_OVERVIEW.md §9", "mvp.fe src/entities/order", "mvp.fe src/pages/invoices-list/ui/InvoicesListPage.tsx:4"]
updated: 2026-07-09
---
# LCOS-F27 · Frontend-переименование entities/order → receipts

**Epic:** [[LCOS-E5-stabilization]] · **Status:** planned · **Phase:** Phase 1

## Описание

На frontend есть FSD-слайс с именем `entities/order`, моделирующий **входящие Esupl-приёмки** (`GET /teams/{id}/orders`, экспонируемые как `useGetOrdersQuery` / `PosOrder`). Это имя столкнётся с концепцией *черновика заказа на закупку*, приходящей в эпик закупок ([[LCOS-E8-purchasing]], `entities/purchase-draft`). Чтобы избежать неоднозначного «order», означающего две разные вещи, эта фича переименовывает слайс `entities/order → entities/receipts` **до** прихода заказов на закупку.

Scope намеренно крохотный: слайс импортируется ровно из одного места помимо себя самого — `pages/invoices-list/ui/InvoicesListPage.tsx` (`useGetOrdersQuery`, `PosOrder`). Это чистое переименование без изменения поведения: тот же Esupl read-endpoint, та же семантика query-хука, тот же рендер списка. Это бухгалтерский долг, выплаченный во время стабилизации, чтобы более поздняя работа по закупкам стартовала на однозначных именах.

## Возможности

- FSD-слайс переименован `entities/order` → `entities/receipts` (директория, барель модуля и внутренние имена символов по необходимости).
- Единственное место внешнего импорта обновлено; других потребителей нет.
- Поведение побайтово неизменно: список счетов-фактур по-прежнему читает Esupl-приёмки через тот же endpoint и рендерит идентично.
- Коллизия имени с будущим `entities/purchase-draft` предупреждена.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[member]] | Никаких изменений в возможностях: список счетов-фактур/приёмок ведёт себя идентично после переименования. |
| [[admin]] | То же в пределах своего subdivision. |
| [[superadmin]] | То же по всем тенантам. |

Это внутренний рефакторинг; нет изменений ролей, scope или какого-либо endpoint.

## Задействованные сущности

- [[invoices]] — список приёмок (Esupl `orders`) — это read-представление над входящими документами; переименованный слайс — его FE-представление. Изменений модели данных или таблицы нет.

## Зависимости / связи

- **Требования:** [[global-requirements]] (`R9`: чистая, неколлизийная структура модулей), [[erp-esupl-integration]] (слайс оборачивает read-only endpoint приёмок `GET /teams/{id}/orders`).
- **Фичи:** расчищает именную взлётную полосу для [[LCOS-E8-purchasing]] (`entities/purchase-draft`); read-endpoint, который он оборачивает — [[LCOS-F11-esupl-read]]; экран списка, который он питает — часть поверхности [[LCOS-F10-invoice-status-machine]].
- **Решения:** нет (чистое переименование).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Изменений на бэкенде нет: Esupl endpoint приёмок `GET /teams/{id}/orders` и его обвязка не тронуты.

### Frontend
- [ ] AC-FE-1. `src/entities/order` больше не существует; слайс живёт в `src/entities/receipts`.
- [ ] AC-FE-2. Единственный внешний импорт в `pages/invoices-list/ui/InvoicesListPage.tsx` обновлён (query-хук + `PosOrder`/переименованный тип); не осталось висячих ссылок на `entities/order` (`grep` чист).
- [ ] AC-FE-3. `npm run build` зелёный; поведение неизменно (список счетов-фактур/приёмок рендерит и запрашивает ровно как раньше).

### Прочее
- [ ] AC-OTHER-1. Переименование — no-op для тестов помимо обновления путей импорта; FE-набор остаётся зелёным.

## Открытые вопросы / гейты

- **Глубина переименования символов:** переименовывать ли `useGetOrdersQuery`/`PosOrder` в receipts-ориентированные имена или сохранить их для минимального churn — выбор владельца; переименование директории/слайса — обязательная часть.
- Последовательность: приземлить это до старта [[LCOS-E8-purchasing]], чтобы избежать двойного переименования.

## Источники

- `08_PHASE1_SPEC.md F1.6` (обоснование переименования — предупредить коллизию `entities/purchase-draft`; единственный внешний импорт; AC-1).
- `APP_OVERVIEW.md §9` (чтение Esupl-приёмок: `GET /teams/{id}/orders`).
- Текущее состояние: `mvp.fe/src/entities/order` всё ещё присутствует; импортируется из `mvp.fe/src/pages/invoices-list/ui/InvoicesListPage.tsx:4` (`useGetOrdersQuery`, `PosOrder`).
