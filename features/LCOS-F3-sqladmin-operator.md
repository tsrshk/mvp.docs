---
id: LCOS-F3
type: feature
title: Плоскость оператора SQLAdmin + config API
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [sqladmin-operator, superadmin]
entities: ["[[system_settings]]", "[[integration_credentials]]", "[[users]]", "[[memberships]]", "[[organizations]]", "[[subdivisions]]", "[[refresh_sessions]]"]
requirements: ["[[config-secrets]]", "[[secret-encryption]]", "[[auth]]", "[[global-requirements]]"]
adrs: ["[[ADR-007]]", "[[ADR-005]]"]
legacy_refs: [LCOS_Conformance R4, APP_OVERVIEW §3 §4]
sources: ["APP_OVERVIEW.md §3 §4", "01_ARCHITECTURE.md (Admin panel, Keys/Secrets)", "LCOS_Conformance_Alignment_GlobalRequirements.md R4", "mvp.be app/admin/setup.py", "mvp.be app/core/security.py", "mvp.be app/api/v1/routes/admin_system.py:41"]
updated: 2026-07-09
---
# LCOS-F3 · Плоскость оператора SQLAdmin + config API
**Эпик:** [[LCOS-E1-platform]] · **Статус:** built · **Фаза:** Phase 1

## Описание

**Плоскость управления оператора/superadmin**: панель SQLAdmin, смонтированная на `/admin`, плюс config API superadmin под `/api/v1/admin/*`. Это второй из двух раздельных механизмов аутентификации — единственный «чёрный ход» разработчика/оператора, управляемый env-переменными `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` (**bcrypt**), на основе session-cookie (`SessionMiddleware`, `session_secret`). Принципиально важно: у него **нет строки в `users`**, и его нельзя смешивать с плоскостью аутентификации приложения ([[LCOS-F2-app-auth]], которая использует argon2 + JWT).

Через SQLAdmin ModelViews оператор редактирует всё состояние платформы, которое не является кодом: `Organization`, `Subdivision`, `User`, `Membership`, `Supplier`, `Invoice`, `InvoiceLine`, `SystemSetting`, `IntegrationCredential` и read-only-представление `RefreshSession`. Два ModelView несут логику безопасности: `UserAdmin.on_model_change` принимает **открытый текст** в поле `password_hash` и argon2-хеширует его при сохранении (именно так операторы создают реальных пользователей приложения), а `IntegrationCredentialAdmin.on_model_change` **шифрует перед сохранением**, маскирует значение до последних 4 символов при чтении и обеспечивает инвариант единственного активного credential (см. [[LCOS-F4-config-secrets]]).

Config API (`routes/admin_system.py`) предоставляет superadmin ручки времени выполнения без редеплоя: `GET /admin/status`, `POST /admin/ai-vpn` (переключить fail-closed VPN-тумблер) и `GET /admin/modules` (состояние гейтов модулей — см. [[LCOS-F6-module-gates]]). Изменение `system_settings` здесь вступает в силу во время выполнения, потому что резолвер читает БД по требованию ([[config-secrets]]).

## Возможности

- Панель SQLAdmin на `/admin`; форма логина `AdminAuth` проверяет `authenticate_admin` (`username == settings.admin_username`, bcrypt-проверка `admin_password_hash`), сохраняет `admin_authenticated=True` в сессии Starlette.
- ModelView для всех структурных/операционных/конфигурационных таблиц; `RefreshSessionAdmin` — read-only (только инспекция).
- `UserAdmin.on_model_change`: поле `password_hash` с открытым текстом → argon2 при сохранении (пропускает, если уже `$argon2`) — операторы создают/сбрасывают реальных пользователей.
- `IntegrationCredentialAdmin.on_model_change`: открытый текст на входе → `encrypt()` перед сохранением (идемпотентно) → установка `rotated_at` → деактивация других активных строк того же (scope, provider, org, subdivision); списки/детали маскируются до последних 4 символов; поле write-only для открытого текста, read-masked.
- `SystemSettingAdmin`: ключи выбираются из белого списка (выпадающий список `SETTING_TYPES`), не вводятся свободно; правки меняют поведение во время выполнения без редеплоя.
- Config API: `GET /admin/status`, `POST /admin/ai-vpn`, `GET /admin/modules` (защищено для superadmin через `require_admin`).
- Ни один endpoint или представление никогда не возвращает расшифрованный секрет за пределы процесса.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[sqladmin-operator]] | Логин на `/admin` с env-учётными данными (bcrypt); CRUD всех ModelView; создание пользователей приложения (открытый текст→argon2); установка/ротация секретов (открытый текст→зашифровано, замаскировано). У него **нет строки в `users`**. |
| [[superadmin]] | God-mode-аналог на плоскости приложения; управляет конфигурацией времени выполнения через config API (`/admin/status`, `/admin/ai-vpn`, `/admin/modules`) и изменениями OCR-промпта/`ai_provider`. |
| [[admin]] | Не в этой плоскости, кроме записи POS-конфига со scope арендатора (`PUT /organizations/{id}/pos-config`), задокументированной в [[LCOS-F4-config-secrets]]. |
| [[member]] | Нет доступа. |

Две плоскости никогда не аутентифицируют друг друга: `admin`/`admin` (env) — это оператор SQLAdmin, и он намеренно **не** засеян в `users`; `iter` — засеянный superadmin приложения.

## Задействованные сущности

- [[system_settings]] — несекретный KV времени выполнения, редактируемый через `SystemSettingAdmin`; только ключи из белого списка.
- [[integration_credentials]] — все секреты интеграций; `IntegrationCredentialAdmin` шифрует/маскирует/обеспечивает единственный активный.
- [[users]] / [[memberships]] — операторы создают пользователей и назначают membership subdivision.
- [[organizations]] / [[subdivisions]] — структура арендатора создаётся здесь.
- [[refresh_sessions]] — read-only-представление для инспекции.

## Зависимости / связи

- **Требования:** [[config-secrets]] (уровни runtime-настроек + секретов, которые редактирует эта плоскость), [[secret-encryption]] (шифрование-перед-сохранением, маскировка-при-чтении), [[auth]] (разделение плоскости оператора), [[global-requirements]] (R4).
- **Фичи:** отдельная плоскость от [[LCOS-F2-app-auth]]; семантика хранения секретов/настроек живёт в [[LCOS-F4-config-secrets]]; тумблеры модулей проявляются через [[LCOS-F6-module-gates]]; редактируемая структура изолирована [[LCOS-F1-multitenancy]].
- **ADR:** [[ADR-007]] (две плоскости auth), [[ADR-005]] (трёхуровневый конфиг, которым управляет оператор).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Логин `/admin` использует `ADMIN_USERNAME` + bcrypt `ADMIN_PASSWORD_HASH` из env с session-cookie; у оператора нет строки в `users`, и он не может аутентифицироваться как пользователь приложения (и наоборот).
- [ ] AC-BE-2. `UserAdmin.on_model_change` argon2-хеширует открытый `password_hash` при сохранении (пропускает, если уже `$argon2`).
- [ ] AC-BE-3. `IntegrationCredentialAdmin.on_model_change` шифрует открытый текст перед сохранением, устанавливает `rotated_at` и деактивирует другие активные строки того же (scope, provider, org, subdivision).
- [ ] AC-BE-4. Списки/детальные представления credential маскируют значение до последних 4 символов; ни одно представление или endpoint не возвращает открытый текст.
- [ ] AC-BE-5. `SystemSettingAdmin` ограничивает ключи белым списком реестра; изменение наблюдается во время выполнения без редеплоя (резолвер читает БД по требованию).
- [ ] AC-BE-6. `RefreshSessionAdmin` — read-only.
- [ ] AC-BE-7. Config API `GET /admin/status`, `POST /admin/ai-vpn`, `GET /admin/modules` защищены для superadmin/оператора (`require_admin`) и отклоняют неаутентифицированных вызывающих.

### Прочее (инфра / конфиг)
- [ ] AC-OTHER-1. Конфиг живёт в `lcos.env` (примонтирован bind-mount read-only как `/app/.env`), не в `./.env`, так что нагруженный `$` bcrypt-хеш `ADMIN_PASSWORD_HASH` не искажается интерполяцией compose.
- [ ] AC-OTHER-2. `SessionMiddleware` разделяет `session_secret` с SQLAdmin; запуск отказывает при слабом/дефолтном `SESSION_SECRET`.

## Открытые вопросы / гейты

- Панель SQLAdmin — это поверхность оператора/разработчика, а не продукт для конечного пользователя Phase 1; более богатый UI superadmin — будущая работа.
- Должен ли org-admin (а не только superadmin) сохранять запись POS-конфига — это пункт подтверждения Phase 1 (Conformance D-h) — решено в [[LCOS-F4-config-secrets]].
- `wtforms>=3.1,<3.2` закреплён (3.2 ломает boolean-виджет SQLAdmin) — известное инфраограничение.

## Источники

- `APP_OVERVIEW.md §3` (маршруты, включая `admin_system`), `§4` (две плоскости auth, засеянные аккаунты).
- `01_ARCHITECTURE.md` — «Admin panel (SQLAdmin)», «Keys, Secrets & Credential Management» (путь записи).
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R4 / Part 4 (сценарии тестов superadmin).
- `mvp.be/app/admin/setup.py:45+` (ModelViews; `on_model_change` у `UserAdmin`/`IntegrationCredentialAdmin`/`SystemSettingAdmin`; `RefreshSessionAdmin` read-only).
- `mvp.be/app/core/security.py` (`AdminAuth`, `authenticate_admin`, bcrypt).
- `mvp.be/app/api/v1/routes/admin_system.py:41` (`system_status`), `:60` (`set_ai_vpn`), `:68` (`list_modules`), `:21` (`require_admin`).
