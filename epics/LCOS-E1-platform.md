---
id: LCOS-E1
type: epic
title: Платформа и фундамент
status: built
phase: "Phase 1"
features: ["[[LCOS-F1-multitenancy]]", "[[LCOS-F2-app-auth]]", "[[LCOS-F3-sqladmin-operator]]", "[[LCOS-F4-config-secrets]]", "[[LCOS-F5-provider-seams]]", "[[LCOS-F6-module-gates]]", "[[LCOS-F7-frontend-platform]]", "[[LCOS-F76-user-org-management]]"]
legacy_refs: [plan/00 G1–G11, LCOS_Conformance R1–R9]
sources: [APP_OVERVIEW.md §2–§5 §11, 01_ARCHITECTURE.md, LCOS_Conformance_Alignment_GlobalRequirements.md]
updated: 2026-07-09
---

# LCOS-E1 · Платформа и фундамент

**Статус:** built · **Фаза:** Phase 1 · **Тип:** сквозной

## Описание

Несущий каркас, на котором держится каждый другой эпик: мультиарендность, две независимые плоскости аутентификации, трёхуровневая конфигурация с шифрованием секретов, провайдерские швы за интерфейсами, гейты модулей на этапе запроса и фронтенд-платформа (FSD/RTK/PWA). Это не «пользовательская фича», а набор архитектурных инвариантов; нарушение любого из них ломает изоляцию арендаторов, безопасность секретов или fail-closed-поведение.

Арендатор = организация; `organization_id` денормализован в каждую операционную строку — запрос арендатора без скоупа невозможен by design. Операционные строки также несут `subdivision_id`. Провайдеры (OCR, ERP) скрыты за `Protocol` + реестром; сервисы зависят только от интерфейсов. Актуальный as-built SSOT см. в [[architecture]].

## Цель / ценность

Дать каждой продуктовой фиче безопасный, изолированный, конфигурируемый фундамент, который не придётся переписывать при переходе на SaaS ([[LCOS-E15-saas]]). Инварианты платформы (изоляция, fail-closed, разделение плоскостей аутентификации) покрыты merge-блокирующими тестами — их регрессия физически не может попасть в main.

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F1 | Мультиарендность и изоляция арендаторов | ✅ built | [[LCOS-F1-multitenancy]] |
| LCOS-F2 | Аутентификация приложения (JWT + refresh) | ✅ built | [[LCOS-F2-app-auth]] |
| LCOS-F3 | Операторская плоскость SQLAdmin + config API | ✅ built | [[LCOS-F3-sqladmin-operator]] |
| LCOS-F4 | Трёхуровневая конфигурация и шифрование секретов | ✅ built | [[LCOS-F4-config-secrets]] |
| LCOS-F5 | Провайдерские швы + fail-closed egress | ✅ built | [[LCOS-F5-provider-seams]] |
| LCOS-F6 | Гейты модулей | ✅ built | [[LCOS-F6-module-gates]] |
| LCOS-F7 | Фронтенд-платформа (FSD/RTK/PWA) | ✅ built | [[LCOS-F7-frontend-platform]] |
| LCOS-F76 | Управление юзерами/организациями (RBAC, 3 роли) | ✅ built | [[LCOS-F76-user-org-management]] |

## Ключевые сущности / требования

- Сущности: [[organizations]], [[subdivisions]], [[users]], [[memberships]], [[integration_credentials]], [[system_settings]].
- Требования: [[multitenancy]], [[auth]], [[config-secrets]], [[secret-encryption]], [[fail-closed]], [[vpn-egress]], [[provider-abstraction]], [[global-requirements]].
- Роли: [[superadmin]], [[admin]], [[manager]], [[member]], [[sqladmin-operator]].

## Гейты

- **Инварианты, покрытые тестами (VER-01):** изоляция арендаторов, fail-closed VPN, admin-auth — покрыты и **merge-блокирующие**. Регрессия не может попасть в main.
- **DEC-0011/0013:** двухконтекстная модель идентичности опирается на скоупы платформы (`scope_type/scope_id`) — см. [[LCOS-E3-sku-identity]].
- **Kill-критерии (Pilot-Gate / ADR-003):** платформа существует, чтобы Customer Zero ежедневно пользовался конвейером накладных; если фундамент мешает скорости разработки фич — упрощать, а не наращивать его (не-цели Phase 1: Celery, cloud, OAuth; RBAC-матрица — ранее не-цель — реализована в [[ADR-023]] / [[LCOS-F76-user-org-management]]).

## legacy_refs

plan/00 глобальные требования G1–G11; нормативные R1–R9 из LCOS_Conformance (консолидированы в [[global-requirements]]).

## Источники

- APP_OVERVIEW.md §2 (стек), §3 (архитектура), §4 (мультиарендность/аутентификация), §5 (секреты/fail-closed), §11 (модель данных)
- 01_ARCHITECTURE.md (нормативная архитектура)
- LCOS_Conformance_Alignment_GlobalRequirements.md (R1–R9)
- ADR: [[ADR-004]], [[ADR-005]], [[ADR-006]], [[ADR-007]], [[ADR-008]], [[ADR-009]], [[ADR-010]], [[ADR-011]], [[ADR-012]]
