---
doc: plan/PHASE_P2_SAAS_OUTLINE
title: Фаза P2 — SaaS для рынка (outline; гейт — Pilot-Gate)
version: 1.0.1
status: current
updated: 2026-07-03
verified_against_code: n/a
owner: Ivan
supersedes: []
superseded_by: none
trust_tier: 2
ssot_for: [phase-p2-outline]
---

# Фаза P2 — SaaS для рынка (outline)

> НЕ детальная спецификация — рамочный список работ для перехода Phase 1 → Phase 2.
> **Гейт входа: PILOT-GATE пройден** — продукт доказал ценность на собственной (пилотной)
> кофейне: 4 недели реального использования, «без этого хуже», ≥3 ч/нед экономии
> (в ADR-003 — Wife-Gate). До гейта ничего из этого не реализуется
> (ADR-009: никаких «на будущее»). Перед стартом фаза декомпозируется на детальные
> PHASE_P2_x-файлы по образцу F-фаз.
> Цели Phase 2 (из 00_PRODUCT/About): 10 платящих клиентов, MRR $1K+, retention ≥80%;
> подписка $99–149/мес; CIS HoReCa.

---

## 1. Что УЖЕ готово к Phase 2 (не переделывать)

Архитектура multi-tenant-ready с первого дня (ADR-008): org→subdivision→membership,
жёсткая изоляция по `organization_id`, per-org POS-токены (`integration_credentials`
scope=org, `PUT /organizations/{id}/pos-config` — DEC-08), модульные гейты per-deploy,
шифрование секретов, разделённые auth-плоскости.

## 2. Блоки работ (каждый станет отдельным PHASE_P2_x)

### P2-A. Прод-хардненинг и деплой (первым — без него никого нельзя пускать)
Из DEFER-01..04 и R-Deploy (Conformance):
- `Dockerfile.prod` (multi-stage), IaC/деплой на Hetzner; FE-хостинг (static + backend).
- `COOKIE_SECURE=true`; `CSRF_ENABLED=true` + доработка `backendRequest.ts`
  (чтение cookie `lcos_csrf` → заголовок `X-CSRF-Token`) — DEC-04.
- Rate-limiting `/auth/login` (DEFER-01); бэкенд-idempotency ключ отправки накладной
  (DEFER-04, замена per-browser `sentRegistry`).
- CI: pytest (non-negotiables merge-gate), ruff, FE build (DEFER-02); бэкапы Postgres.
- Реальные секреты: `SECRETS_ENC_KEY`(+ротация), `JWT_SECRET`, `SESSION_SECRET`.
- Мониторинг/алертинг ошибок (минимум: structured logs + uptime-чек).

### P2-B. Onboarding без founder'а
- Self-service регистрация: создание org+subdivision+admin-пользователя (первый
  публичный write-эндпоинт вне тенанта — отдельное security-ревью).
- Мастер подключения Esupl: ввод team_id/warehouse_id/токена (существующий pos-config),
  первичный импорт каталога SKU/фасовок, туториал первой накладной.
- Email-подтверждение / сброс пароля (сейчас отсутствуют).

### P2-C. Биллинг
- Тарифы/подписки; провайдер платежей (Stripe или белорусский эквивалент — исследование);
  таблицы subscriptions/invoices(billing); гейтинг функций по тарифу поверх существующих
  module-гейтов; grace-период и dunning.

### P2-D. Второй ERP-коннектор (iiko)
- Триггер для достройки ERP-seam (ADR-009 допускает вторую реализацию только здесь):
  `IikoErpProvider` за существующим `ErpProvider` Protocol; выбор провайдера
  переносится с deploy-уровня (`ERP_PROVIDER` env) на org-уровень (колонка/настройка
  организации) — миграция подхода, оформить ADR.

### P2-E. Масштабирование мультитенантности
- Ревизия: планировщик (F5) — per-tenant очереди/jitter; лимиты LLM-бюджета per-org;
  квоты хранения изображений; аудит-лог действий (если потребуют клиенты);
  `CredentialScope.subdivision` — вернуть, если появятся per-точечные токены (см. S1-B4).

### P2-F. Продуктовая упаковка
- Лендинг, документация для владельца кофейни, канал поддержки, аналитика использования
  (retention/économy-метрики per-tenant — основа для кейсов).

## 3. Порядок и гейты

```
PILOT-GATE → P2-A (хардненинг) → P2-B (onboarding) → 2–3 пилота (ручной онбординг)
  → gate: «2 из 3 пилотов готовы платить» → P2-C (биллинг) → P2-D/E/F по спросу
  → gate S4: 10 платящих, MRR $1K+, retention 80%+ (если нет к месяцу 12 — закрытие проекта)
```

## 4. Acceptance Criteria (уровня outline)

- [ ] AC-1. До PILOT-GATE ни один пункт P2 не реализован (проверка при ревью фаз Phase 1).
- [ ] AC-2. При старте P2: каждый блок P2-A…F декомпозирован в детальный PHASE-файл
      с собственными AC по образцу F-фаз; порядок подтверждён владельцем.
- [ ] AC-3. P2-A завершён ДО первого стороннего пользователя (чек прод-чеклиста R-Deploy
      полностью зелёный).

---

## Журнал изменений
- 2026-07-03 v1.0.1 — терминология: Wife-Gate → Pilot-Gate (проверка на собственном бизнесе).
- 2026-07-03 v1.0.0 — создан из §7 Functional_Stages, S3–S5 Specification_v04, DEFER-пунктов бэклога и R-Deploy.
