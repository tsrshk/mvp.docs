---
id: organizations
type: entity
title: organizations — арендатор (организация)
status: built
scope: org
table: organizations
pk: id (uuid)
used_by: ["[[LCOS-F1-multitenancy]]", "[[LCOS-F2-app-auth]]", "[[LCOS-F3-sqladmin-operator]]", "[[LCOS-F4-config-secrets]]", "[[LCOS-F11-esupl-read]]"]
requirements: ["[[multitenancy]]", "[[auth]]"]
sources: [mvp.be/app/db/models.py:84-98, 01_ARCHITECTURE.md#data-model, APP_OVERVIEW.md]
updated: 2026-07-09
---
# organizations · арендатор

**Scope:** org (корень изоляции) · **Status:** built

## Назначение
Организация — это **арендатор (tenant)** и корень жёсткой границы изоляции.
`organization_id` денормализован в каждую строку арендатора; запрос арендатора НЕВОЗМОЖЕН
без ограничения областью по `organization_id` (см. [[multitenancy]]). Одна организация привязана к
одной команде Esupl (POS/ERP), см. [[erp-esupl-integration]].

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4`, генерируется приложением |
| `name` | varchar(512) | no | отображаемое имя |
| `legal_name` | varchar(512) | yes | юридическое наименование |
| `esupl_team_id` | integer | yes | привязка POS: организация = одна команда Esupl |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

Токен доступа арендатора к POS **здесь не хранится** — секрет вынесен в
[[integration_credentials]] (scope=org, provider=esupl); SSOT секретов — одна
таблица (см. [[secret-encryption]]).

## Отношения, FK, уникальность
- `subdivisions` — one-to-many, `cascade="all, delete-orphan"` (удаление организации
  каскадно удаляет её subdivisions).
- Собственных FK нет (это корневая сущность).
- Дочерние таблицы арендатора ссылаются на `organizations.id` через `OrganizationScopedMixin` с
  **`ondelete="RESTRICT"`** — организацию с операционными данными нельзя удалить, пока
  эти данные существуют.

## Используется фичами
[[LCOS-F1-multitenancy]] (multitenancy / изоляция), [[LCOS-F2-app-auth]] (активный контекст в JWT),
[[LCOS-F3-sqladmin-operator]] / [[LCOS-F4-config-secrets]] (конфиг и секреты по scope=org), [[LCOS-F11-esupl-read]] (чтение Esupl —
`esupl_team_id`).

## Источники
- `mvp.be/app/db/models.py:84-98` (модель `Organization`)
- `mvp.be/app/db/base.py:43-48` (`OrganizationScopedMixin`, RESTRICT)
- [[architecture]] — data-model
