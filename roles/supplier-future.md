---
id: role-supplier-future
type: role
title: supplier (будущая роль — только шов в схеме, ADR-017)
status: future
plane: app-plane (planned) — поведение НЕ построено
identity: Role.supplier (шов-значение enum) + suppliers.portal_user_id → users.id (nullable, шов)
sources:
  - 04_DECISIONS.md ADR-017 (Supplier self-service: door left open)
  - 08_PHASE1_SPEC.md F2.3, 07_PHASES.md Э2
  - db/models.py (Role enum seam, Supplier.portal_user_id)
updated: 2026-07-09
---
# supplier-future

**Plane:** app-plane (в будущем) · **Status:** 🔭 future — **только шов в схеме, без поведения** · **Основание:** [[ADR-017]].

## Кто это (в будущем)
Внешний поставщик, который сам заполняет свои настройки — график поставок, минимальную сумму заказа, прайс-лист. В Phase 1 такой субъект **не существует в runtime**: портал не строится, чтобы не распылять фокус соло-разработчика («одна рутина за раз»). Заложена только **дверь** — дёшево сейчас, дорогая миграция схемы потом.

## Что именно заложено (шов), а что НЕТ
**Заложено (только схема):**
- Значение `supplier` в enum `Role` (миграция `ALTER TYPE role ADD VALUE 'supplier'` — шов).
- Nullable FK `suppliers.portal_user_id → users.id` в карточке [[suppliers]].
- Отдельная таблица настроек поставщика (`supplier_settings` по ADR) — та самая, которую сам поставщик позже редактирует; условия живут отдельно от `suppliers`, остающейся зеркалом Esupl.

**НЕ построено (отложено):**
- Нет маршрутов, нет UI, нет веток в auth под `supplier`.
- Глобальный пользователь-поставщик, invite-токены, scope доступа «только свои настройки».

> Корректность (doc↔code): в текущем enum `Role` фактически **единственное значение `admin`** (см. [[admin]]); значение `supplier` — плановый шов из ADR-017, а не активная роль. Front-matter `identity` описывает целевую схему, а не то, что уже гейтит доступ. Если значение enum ещё не добавлено в коде — это остаётся backlog-миграцией, поведение не меняется.

## Плоскость аутентификации (целевая)
Когда портал будет построен — app-plane: отдельный класс пользователя приложения (глобальный пользователь-поставщик), вход через auth приложения, scope «только свои настройки». Это НЕ [[sqladmin-operator]] и не полноценный тенант [[admin]]/[[member]]. Пока — ничего из этого не активно.

## Возможности
Нет. В Phase 1 роль ничего не предоставляет и никому не назначается. Этот раздел существует, чтобы зафиксировать шов и его границы, а не текущие права.

## Features, предоставляющие/использующие роль
- [[LCOS-F19-supplier-self-service]] — сам шов (значение enum + `portal_user_id` + запись ADR), эпик [[LCOS-E4-suppliers]].
- Целевое поведение относится к Phase 2 — self-service onboarding ([[LCOS-E15-saas]] / F67), где портал поставщика может быть достроен.

## Связи / требования
[[ADR-017]] · [[suppliers]] · [[supplier-criteria-registry]] · [[users]] · [[admin]] · [[member]]

## Источники
- `04_DECISIONS.md` §ADR-017 (строки 135–140) — "door left open, portal not built"; отложено: глобальный пользователь-поставщик, invite-токены, scope «только свои настройки».
- `08_PHASE1_SPEC.md` F2.3 (шов supplier self-service), `07_PHASES.md` Э2 (строки 53–57, 138).
- `09_PHASE1_TASKS.md` F2.3 (T-2.3.1 миграция enum/FK, T-2.3.2 ADR).
- `APP_OVERVIEW.md` §Phase 1 Non-goals (портал поставщика — только шов в схеме, ADR-017).
