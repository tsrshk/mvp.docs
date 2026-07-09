---
id: LCOS-F7
type: feature
title: Frontend-платформа (FSD / RTK / PWA)
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[users]]", "[[organizations]]", "[[subdivisions]]"]
requirements: ["[[auth]]", "[[multitenancy]]", "[[provider-abstraction]]", "[[global-requirements]]"]
adrs: ["[[ADR-012]]"]
legacy_refs: [plan/00 G8, LCOS_Conformance R9, APP_OVERVIEW §16 §17]
sources: ["APP_OVERVIEW.md (Frontend internals, integration modules, cross-cutting)", "01_ARCHITECTURE.md (Frontend architecture internals, shared modules)", "LCOS_Conformance_Alignment_GlobalRequirements.md R9 G8", "mvp.fe src/main.tsx", "mvp.fe src/app/store/index.ts", "mvp.fe src/app/observers/configSync.ts", "mvp.fe src/shared/api/baseApi.ts", "mvp.fe src/shared/api/backendRequest.ts", "mvp.fe vite.config.ts"]
updated: 2026-07-09
---
# LCOS-F7 · Frontend-платформа (FSD / RTK / PWA)
**Эпик:** [[LCOS-E1-platform]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Фундамент фронтенда, на котором строятся продуктовые экраны: **mobile-first React PWA**, организованный по строгому **Feature-Sliced Design** (pages → widgets → features → entities → shared), состояние в **Redux Toolkit + RTK Query**, слой **наблюдателей RxJS**, который согласует конфигурацию настроек/scope/провайдера, транспорт на HttpOnly-cookie и Vite + `vite-plugin-pwa`. Он сам по себе **не несёт доменных фич** — это обвязка, которая делает каждую продуктовую фичу безопасной, демонстрируемой офлайн и ограниченной по арендатору.

Его определяют три сквозных инварианта. **Нет секретов в браузере:** auth — только HttpOnly-cookie (`backendRequest` отправляет `credentials:'include'`, делает refresh один раз при 401), а env-переменные `VITE_*` — несекретные переключатели endpoint/провайдера — в JS нет ни API-ключа, ни ERP-токена ([[ADR-012]]). **Один реактивный хребет конфига:** `startConfigSync(store)` выполняется перед первым рендером и зеркалит наложение настроек, активный scope арендатора (из кэша `/auth/me`) и конфиг провайдера в RxJS BehaviorSubject-ы (`ocrConfig$`, `posConfig$`, `activeScope$`), чтобы во время вызова не-React-код (`queryFn`-ы, хелперы хранилища) мог их разрешить; изменение POS-конфига триггерит `resetApiState()` для перезапроса от вновь выбранного провайдера. **Паттерн провайдера сжат до `backend|mock`:** `shared/ocr`, `shared/match`, `shared/pos` каждый предоставляет интерфейс + реализации `backend`/`mock` + конфиг + фабрику; вся эпоха «browser-direct LLM/ERP» мертва (рудиментарные `shared/llm`, `ocr/prompt+parse`, `match/prompt+parse`), и один тумблер `mockData` переключает всё в офлайн-демо.

Арендность проецируется здесь: хранилища на уровне браузера (выученные маппинги, реестр отправленных инвойсов) ключуются по `orgScopeToken()`, а login/logout/switch инвалидируют кэши арендатора (см. [[LCOS-F1-multitenancy]]).

## Возможности

- Строгое слоение FSD с алиасом `@/* → src/*`; правила импорта обеспечиваются **соглашением + ревью** (нет ESLint/dependency-cruiser в репозитории).
- Bootstrap (`main.tsx`): `startConfigSync(store)` → `<StrictMode><Provider><App/>`; `App.tsx` монтирует `RouterProvider` + глобальный `<Toaster/>`; `AuthGuard` защищает непубличные маршруты через `useMeQuery()`.
- Store: один `baseApi` (`fakeBaseQuery`, `tagTypes`) + `invoiceSession` + `settings`; слушатель `fileSync` держит несериализуемые бинарники `File` вне Redux (вне-store `fileHolder`, выровнен по индексам с метаданными сессии).
- RTK Query с `injectEndpoints` + обёртками `queryFn` (`backendQueryFn`/`aiQueryFn`/`posQueryFn`); каждый endpoint вызывает `backendRequest` (реальный HTTP) или провайдера, разрешённого фабрикой.
- Транспорт `backendRequest`: `fetch` с `credentials:'include'`, refresh один раз при 401 затем повтор, `BackendError(message,status,code)`, базовый URL из `VITE_BACKEND_API_URL`. Единственный auth-«перехватчик».
- RxJS config-sync: наложение настроек → localStorage; BehaviorSubject-ы `ocrConfig$`/`posConfig$`/`activeScope$`; изменение POS-конфига → `resetApiState()`; межвкладочно через события `storage` под префиксом `localos.`.
- Двухосевая модель провайдера, обе `backend|mock`: ось OCR/AI (`ocrConfig$`, также управляет матчингом) и ось POS/ERP (`posConfig$`); управляется единым демо-тумблером `mockData`.
- PWA: `VitePWA(autoUpdate)`, прекэшированная оболочка приложения, `navigateFallback:'/index.html'`, `manualChunks.vendor`, страницы, разбитые по маршрутам через `React.lazy`; SW отключён в dev.
- Нет секретов в браузере: HttpOnly-cookie для auth; `VITE_*` только несекретные; хранилища на уровне браузера ограничены по арендатору через `orgScopeToken()`.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Использует PWA на телефоне; видит только свои subdivision (scope из `/auth/me`); mobile-first потоки. |
| [[admin]] | Та же оболочка + действия со scope admin внутри своих subdivision; `ContextSwitcher` по membership. |
| [[superadmin]] | Та же оболочка с полным деревом org/subdivision в переключателе (из `/auth/me`). |
| [[sqladmin-operator]] | Не потребитель этого PWA — работает с отдельной панелью SQLAdmin ([[LCOS-F3-sqladmin-operator]]). |

## Задействованные сущности

- [[users]] — проецируется через `/auth/me` (идентичность, флаг superadmin), питая сайдбар и guard.
- [[organizations]] / [[subdivisions]] — активный scope (`activeScope$`, `orgScopeToken()`), спроецированный из кэша `/auth/me`; хранилища на уровне браузера ключуются по нему.

(FE не держит авторитетных данных — бэкенд авторитетен для всего состояния арендатора/сущностей; это проекции.)

## Зависимости / связи

- **Требования:** [[auth]] (транспорт на HttpOnly-cookie, refresh один раз), [[multitenancy]] (проекция scope, ключевание по `orgScopeToken()`, инвалидация кэша), [[provider-abstraction]] (паттерн провайдера FE `backend|mock`, зеркалящий швы бэкенда), [[global-requirements]] (R9 / plan G8).
- **Фичи:** потребляет [[LCOS-F2-app-auth]] (`/auth/me`, refresh) и [[LCOS-F1-multitenancy]] (scope); хостит продуктовые поверхности [[LCOS-F8-ocr-recognition]], [[LCOS-F9-line-matching]], [[LCOS-F10-invoice-status-machine]]; паттерн провайдера FE зеркалит [[LCOS-F5-provider-seams]].
- **ADR:** [[ADR-012]] (нет секретов в браузере; живые пути провайдеров только `backend`/`mock`).

## Критерии приёмки (AC)

### Frontend
- [ ] AC-FE-1. Слоение FSD соблюдается (pages → widgets → features → entities → shared); единственная санкционированная ссылка вверх — это `import type` типов store (стирается при компиляции).
- [ ] AC-FE-2. `startConfigSync(store)` выполняется перед первым рендером и заполняет `ocrConfig$`, `posConfig$`, `activeScope$`; изменение настройки разрешимо во время вызова в не-React-коде.
- [ ] AC-FE-3. Изменение POS-конфига диспатчит `baseApi.util.resetApiState()`, чтобы данные перезапрашивались от вновь выбранного провайдера.
- [ ] AC-FE-4. Все endpoint-ы используют `injectEndpoints` + обёртку `queryFn`; базовый query — заглушка (`fakeBaseQuery`).
- [ ] AC-FE-5. `backendRequest` отправляет `credentials:'include'`, делает refresh один раз при 401 (кроме `/auth/refresh`,`/auth/login`) затем повтор и бросает `BackendError` при non-ok.
- [ ] AC-FE-6. В браузере не существует секрета: нет `VITE_*` API-ключа/ERP-токена; auth — только HttpOnly-cookie.
- [ ] AC-FE-7. Каждый модуль интеграции (`ocr`/`match`/`pos`) предоставляет реализации `backend` + `mock`; тумблер `mockData` переключает всё приложение в офлайн-демо.
- [ ] AC-FE-8. Хранилища на уровне браузера ключуются по `orgScopeToken()`; login/logout/switch инвалидируют `['Me','Invoice','Supplier','Ingredient']`.
- [ ] AC-FE-9. PWA собирается зелёно (`tsc -b && vite build`); оболочка приложения прекэширована, страницы разбиты по маршрутам, SW отключён в dev.

### Прочее (очистка / инфра)
- [ ] AC-OTHER-1. Мёртвый browser-direct-код не несёт живых потребителей — транспорт `shared/llm`, `ocr/prompt.ts`+`parse.ts`, `match/prompt.ts`+`parse.ts` и legacy-путь `VITE_POS_PROVIDER=esupl` рудиментарны (живые хелперы `rules.ts` сохранены). Удаление отслеживается в [[LCOS-F25-deadcode-cleanup]].

## Открытые вопросы / гейты

- **A2 (открыто):** мёртвые browser-direct-модули всё ещё поставляются (с устаревшими комментариями «mock/Gemini/Claude») — Conformance A2 предписывает удаление с сохранением живых хелперов `rules.ts`; отслеживается как [[LCOS-F25-deadcode-cleanup]].
- Правила импорта FSD — только ревью (нет линтера); шаг steiger/dependency-cruiser отложен (Conformance DEFER).
- **D-g:** `BackendOcrProvider` отправляет только `pages[0]` — многостраничные инвойсы молча теряют страницы 2–3; промежуточный фикс [[LCOS-F26-multipage-fix]], полная поддержка [[LCOS-F29-multipage-recognize]].
- В CI не наблюдалось шага теста/линта FE; «build green» = `tsc + vite build` (Conformance V/DEFER).

## Источники

- `APP_OVERVIEW.md` — Frontend architecture internals, integration modules (`shared/ocr|match|pos|llm|api`), cross-cutting (проекция мультиарендности).
- `01_ARCHITECTURE.md` — «Frontend architecture internals», «Frontend integration modules», «Cross-cutting concerns».
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R9 + plan G8 + Part 2 A2/D-e/D-g.
- `mvp.fe/src/main.tsx` (`startConfigSync` перед рендером), `src/app/store/index.ts` (store + `fileSync`), `src/app/observers/configSync.ts` (хребет RxJS).
- `mvp.fe/src/shared/api/baseApi.ts` (`fakeBaseQuery`, tagTypes), `src/shared/api/backendRequest.ts` (транспорт, refresh один раз), `src/shared/api/queryFn.ts` (обёртки).
- `mvp.fe/vite.config.ts` (VitePWA, manualChunks).
