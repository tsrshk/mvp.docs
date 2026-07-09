---
id: REQ-MULTITENANCY
type: requirement
title: Мультитенантность и scoping (organization → subdivision → membership)
status: built
scope: cross-cutting
roles: [member, admin, superadmin]
entities: ["[[organizations]]", "[[subdivisions]]", "[[memberships]]", "[[users]]"]
adrs: ["[[ADR-008]]", "[[ADR-004]]"]
requirements: ["[[auth]]", "[[global-requirements]]"]
legacy_refs: [Conformance R5, plan G-tenant]
sources: [01_ARCHITECTURE.md "org/subdivision/user hierarchy", APP_OVERVIEW.md §4, LCOS_Conformance R5]
updated: 2026-07-09
---

# REQ-MULTITENANCY · Мультитенантность и scoping

**Type:** cross-cutting SSOT · **Status:** built. Единый источник по изоляции тенантов.

## Нормативное положение

- **N1. Иерархия (модель Slack):** `organization` (граница изоляции) → `subdivision` (= склад Esupl) → `membership` (user↔subdivision+role). `users` — **единственная глобальная** таблица (без `organization_id`). Org выводится **через** subdivision, в `memberships` не хранится.
- **N2. Денормализация scope:** `organization_id` присутствует на **каждой** операционной/каталожной строке, `ondelete=RESTRICT`, `nullable=False`, индексирован (`OrganizationScopedMixin`). Операционные строки несут **также** `subdivision_id` (`SubdivisionScopedMixin`). Внутритенантные parent-child FK — `CASCADE`.
- **N3. Репозитории требуют scope в конструкторе:** tenant-репозитории (`SupplierRepository`, `IngredientRepository`, `InvoiceRepository`) принимают `organization_id` (и опционально `subdivision_id`) в `__init__` — tenant-запрос **структурно невозможен** без scope.
- **N4. Scope только из подписанного JWT:** `org`/`sub_div` берутся из access-токена (см. [[auth]] N1), **никогда** из клиентского ввода. `get_tenant_context` → **403** при отсутствии `organization_id` ("no active organization context").
- **N5. Роли:** `is_superadmin` (глобальный boolean-флаг на [[users]]) + `Role.admin` (на уровне подразделения через [[memberships]]). RBAC-матрицы нет (явный non-goal). Пользователь без membership и не superadmin входит, но контекст закрыт (403).
- **N6. Scope FE** выводится из кэша `GET /auth/me` (авторитетен backend); per-browser хранилища ключуются `orgScopeToken()` — переключение активного scope сбрасывает кэши/дефолты, поэтому данные не утекают между тенантами в одном браузере.
- **N7. Привязка Esupl:** `organization ↔ ровно одна команда Esupl` (`organizations.esupl_team_id`); `subdivision ↔ склад Esupl` (`subdivisions.esupl_warehouse_id`). Это **несекретные** ID-колонки (см. [[secret-encryption]] R6.5).

## Обоснование

Денормализованный `organization_id` + обязательный scope в конструкторе делают изоляцию структурным инвариантом, а не дисциплиной вызова: нельзя забыть фильтр, потому что репозиторий без scope не инстанцируется. Scope из подписанного токена исключает подмену тенанта клиентом. Модель «multi-tenant-ready, single-tenant-first» позволяет войти в Phase 2 без переписывания (Phase 1 — один дефолтный тенант).

## Режимы отказа

- **Запрос без org-контекста** → 403 (fail-closed), не тихая выборка глобальных данных.
- **`RESTRICT` на tenant-FK** — удаление организации/подразделения с живыми операционными строками отклоняется БД (нет каскадного стирания истории накладных).
- **Пользователь без membership** → закрытый контекст (см. N5) — ожидаемо, не ошибка.
- **Риск:** `localos.lastWarehouseId` в localStorage сейчас **без** org-scope (низкорисковый UI-дефолт, DEFER); остальные per-browser хранилища ключуются `orgScopeToken()`.

## Связи

- ADR: [[ADR-008]] (organization-as-tenant), [[ADR-004]] (привязка Esupl team/warehouse).
- Сущности: [[organizations]], [[subdivisions]], [[memberships]], [[users]].
- Требования: [[auth]] (источник scope), [[global-requirements]] R5.

## На это ссылаются

`LCOS-F1` (Multitenancy & tenant isolation), любая feature с tenant-репозиторием: `LCOS-F8`..`LCOS-F18`, каталог, поставщики, накладные.

## Источники

- 01_ARCHITECTURE.md → "The org/subdivision/user hierarchy", "Tenant scoping / query enforcement", ORM base & mixins.
- APP_OVERVIEW.md §4; LCOS_Conformance R5, V-a (tenant-isolation tests).
- Код: `app/db/{base,repositories,models}.py`, `app/auth/dependencies.py::get_tenant_context`.
