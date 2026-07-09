---
id: system_settings
type: entity
title: system_settings — несекретные настройки (KV, whitelist)
status: built
scope: global
table: system_settings
pk: id (int)
used_by: ["[[LCOS-F3-sqladmin-operator]]", "[[LCOS-F4-config-secrets]]", "[[LCOS-F5-provider-seams]]", "[[LCOS-F6-module-gates]]"]
requirements: ["[[config-secrets]]", "[[provider-abstraction]]", "[[fail-closed]]"]
sources: [mvp.be/app/db/models.py:366-377, mvp.be/CLAUDE.md, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# system_settings · несекретные настройки

**Scope:** global (KV на весь деплой) · **Status:** built

## Назначение
Key-value хранилище несекретных настроек приложения (роль `app_settings`) с
whitelist ключей (реестр `app/core/system_settings`). Здесь **НЕТ секретов** —
они живут в [[integration_credentials]] (см. [[config-secrets]], [[secret-encryption]]).
Управляется суперадмином через **операционную плоскость SQLAdmin** ([[sqladmin-operator]]), а не
пользователем приложения.

Держит runtime-выбор провайдера и module gates: `ai_provider` (разрешается
`core/effective_config.py` — OCR/AI из БД, не из env; см. [[provider-abstraction]]),
`ai_vpn_enabled` (fail-closed VPN egress, [[fail-closed]], [[vpn-egress]]),
`module_*_enabled` (module gates, [[LCOS-F6-module-gates]]).

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | int PK | no | autoincrement |
| `key` | varchar(128) | no | **UNIQUE**; должен быть в реестре whitelist |
| `value` | text | yes | сериализованное значение |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- **Уникальность:** `key` уникален (`uq_system_settings_key`).
- Нет FK — глобальная KV-таблица (без `organization_id`).
- Валидность ключа обеспечивается не DB-ограничением, а whitelist реестра
  `app/core/system_settings`.

## Используется фичами
[[LCOS-F3-sqladmin-operator]] (операционная плоскость SQLAdmin + config API), [[LCOS-F4-config-secrets]] (трёхуровневый конфиг),
[[LCOS-F5-provider-seams]] (выбор провайдера + fail-closed egress: `ai_provider`, `ai_vpn_enabled`),
[[LCOS-F6-module-gates]] (module gates `module_*_enabled`).

## Источники
- `mvp.be/app/db/models.py:366-377` (модель `SystemSetting`)
- `mvp.be/CLAUDE.md` (выбор реализации провайдера, module gates)
- [[config-secrets]], [[provider-abstraction]], [[architecture]]
