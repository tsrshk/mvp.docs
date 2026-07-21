---
id: role-manager
type: role
title: manager (Управляющий — прикладные фичи без управления)
status: built
plane: app-plane (JWT)
identity: memberships.role = Role.manager (org- или subdivision-level)
sources:
  - ADR-023
  - db/models.py (Role.manager), app/auth/rbac.py, app/api/v1/routes/roles.py
updated: 2026-07-21
---
# manager (Управляющий)

**Plane:** app-plane (приложение, JWT) · **Identity:** `memberships.role = manager` ·
**Значение enum `Role`**, добавлено в [[ADR-023]].

## Кто это
Управляющий точкой/организацией, который полноценно **пользуется** приложением, но не
администрирует людей и настройки. Строка в [[users]] + [[memberships]] с `role=manager`
(org-level, `subdivision_id IS NULL` ⇒ вся организация; либо конкретное подразделение).

## Возможности
- **Прикладные фичи (write):** приём накладных, поставки, карточки поставщиков, каталог
  SKU/маппинги, заявки на закупку — весь операционный функционал в своём scope. Гейт
  `require_app_write` (см. `app/auth/rbac.py`) допускает `admin|manager|superadmin`.
- **Активный контекст** в рамках своего membership (org-level → все подразделения орг;
  subdivision-level → конкретное подразделение).

## Ограничения (в отличие от [[admin]])
- **НЕ управляет сотрудниками:** роуты `users` (создание/редактирование/деактивация,
  назначение ролей, сброс пароля) → `403`.
- **НЕ управляет структурой/настройками:** CRUD подразделений, POS-конфиг организации,
  переименование/создание/удаление орг → `403`.
- Раздел «Управление» на фронте скрыт (`canManage()` = false).

## Отличие от других ролей
- **admin** — те же прикладные фичи ПЛЮС управление своей орг и подразделениями сверху
  вниз. См. [[admin]].
- **superadmin** — платформенный флаг, режим Бога над всеми орг. См. [[superadmin]].

## Связи / требования
[[ADR-023]] · [[ADR-007]] · [[auth]] · [[multitenancy]] · [[users]] · [[memberships]] ·
[[subdivisions]] · [[organizations]]
