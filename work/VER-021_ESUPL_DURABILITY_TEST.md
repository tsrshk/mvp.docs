# VER-021: гейт-тест долговечности pos_ingredient_id в Esupl

**Status:** GATE TEST (гейт-тест) — блокирует всю нижестоящую работу (PRE-2) до подтверждения.  
**Team ID:** 17957 (песочница Esupl)  

> **Запускаемый пробник:** `mvp.be/scripts/ver021_durability_probe.py` реализует S1–S3 (создание →
> редактирование(переименование/единица/коэффициент) → удаление → повторное создание) с жёсткой защитой «только песочница». Он отказывается запускаться
> без `VER021_CONFIRM=yes-write-to-sandbox-17957` (записи направлены наружу). Он печатает
> таблицу «операция → id до/после» + вердикт DURABLE/NOT-DURABLE (годен/не годен), затем выполняет очистку.
> **Владелец T1 (Иван) запускает его** и вставляет таблицу в `01_ARCHITECTURE.md` (раздел VER-021) и
> в комплект доказательств PR. До этого момента мёрдж остаётся заблокированным гейтом (DoD T1).

**Target:** Проверить, что идентификаторы ингредиентов Esupl остаются стабильными при мутациях (редактирование, удаление+повторное создание, сценарии разделения/слияния).

---

## Цель теста

Установить, обладает ли `pos_ingredient_id` (идентификатор ингредиента Esupl) **долговечностью** — то есть:
- Сохраняется ли он неизменным при редактировании записи ингредиента (имя, единица, категория)?
- Переиспользуется ли тот же id после удаления + повторного создания?
- Фрагментируется/сливается ли он при разделении или слиянии (если поддерживается)?

**Критерии приёмки:**
- **PASS (годен) (переход к PRE-2):** id долговечен во всех сценариях (сохраняется при редактировании, переиспользуется при повторном создании).
- **FAIL (не годен) (СТОП, эскалировать):** id меняется при редактировании или не может быть переиспользован после удаления.

---

## Предварительные требования

1. **Доступ к команде Esupl 17957** с API-токеном (чтение + запись включены через `ERP_WRITE_ENABLED=true`)
2. **Тестовые ингредиенты созданы в песочнице** (не в продакшене)
3. **Базовый URL API:** `https://api.esupl.com/v1`
4. **Авторизация:** Bearer-токен из `mvp.fe/.env` → `VITE_ESUPL_API_TOKEN`
5. **Никаких записей в продакшен-команду** (проверяйте team_id=17957 перед каждым запросом)

---

## Тестовые сценарии

### Сценарий 1: Создать ингредиент, записать id

**Шаги:**
1. POST на `/teams/17957/ingredients`
   ```json
   {
     "name": "Test Ingredient VER-021-S1",
     "product_id": <valid_product_id_in_sandbox>,
     "unit_id": <valid_unit_id>,
     "conversion_rate": 1.0
   }
   ```
2. Записать возвращённый `id` → **`CREATED_ID_S1`**
3. GET `/teams/17957/ingredients/{CREATED_ID_S1}` → проверить имя и метаданные

**Приёмка:**
- Статус 201 или 200 (создание успешно)
- Ответ содержит поле `id` (не null)
- GET извлекает ингредиент

**Записать в лог:**
- `CREATED_ID_S1` (строка или int)
- Временная метка, статус ответа, полное тело ответа

---

### Сценарий 2: Редактировать ингредиент, проверить сохранение id

**Шаги:**
1. Отправить PUT на `/teams/17957/ingredients/{CREATED_ID_S1}` (тот же id из S1)
   ```json
   {
     "name": "Test Ingredient VER-021-S1-RENAMED",
     "product_id": <same_or_different_product_id>,
     "unit_id": <different_unit_id_if_available>,
     "conversion_rate": 1.5
   }
   ```
2. Проверить статус ответа (200 или похожий)
3. GET `/teams/17957/ingredients/{CREATED_ID_S1}` → подтвердить:
   - поле `id` = **`CREATED_ID_S1`** (без изменений)
   - поле `name` = "Test Ingredient VER-021-S1-RENAMED"
   - `unit_id` изменился (если был передан)

**Приёмка:**
- id НЕ меняется после PUT
- Новые значения отражены в GET

**Интерпретация результата:**
- **✓ DURABLE (долговечен):** id не изменился → продолжаем
- **✗ NON-DURABLE (не долговечен):** id изменился или эндпоинт возвращает новый id → сценарий FAIL (не годен)

**Записать в лог:**
- Тело PUT-запроса
- Статус ответа и возвращённый id
- Подтверждающий id из GET
- Временная метка

---

### Сценарий 3: Удалить и создать заново, проверить переиспользование id

**Шаги:**
1. DELETE `/teams/17957/ingredients/{CREATED_ID_S1}`
   - Проверить 204 или 200 (успех)
2. GET `/teams/17957/ingredients/{CREATED_ID_S1}` → ожидать 404 (ингредиент отсутствует)
3. POST на `/teams/17957/ingredients` с **идентичным телом запроса из S1** (или похожим):
   ```json
   {
     "name": "Test Ingredient VER-021-S1",
     "product_id": <same_as_S1>,
     "unit_id": <same_as_S1>,
     "conversion_rate": 1.0
   }
   ```
4. Записать возвращённый id → **`RECREATED_ID_S1`**
5. Сравнить `RECREATED_ID_S1` и `CREATED_ID_S1`

**Критерии приёмки (3a: переиспользование id):**
- **✓ ПЕРЕИСПОЛЬЗОВАН:** `RECREATED_ID_S1` == `CREATED_ID_S1` → Esupl переиспользует id (долговечен на протяжении жизненного цикла)
- **✗ НОВЫЙ ID:** `RECREATED_ID_S1` != `CREATED_ID_S1` → Esupl выдаёт новые id (не переиспользуемые)

**Интерпретация результата:**
- **Переиспользование OK:** Если id переиспользуются, вызывающая сторона может безопасно считать, что «то же имя ингредиента/продукт = тот же id» после повторного создания. ✓ DURABLE (долговечен) (вариант: переиспользование)
- **Никогда не переиспользуется:** Если id никогда не переиспользуются, вызывающая сторона должна вести внешнее отслеживание или принимать новые id при повторном создании. ⚠ SEMI-DURABLE (частично долговечен) (безопасно для журнала аудита, риск для кэширования)
- **Непоследовательно:** Часть повторных созданий переиспользует, часть нет → ✗ NOT DURABLE (не долговечен) (FAIL, не годен)

**Записать в лог:**
- DELETE-запрос + статус ответа
- Тело POST-запроса (должно совпадать с S1)
- Статус ответа и `RECREATED_ID_S1`
- Временная метка
- Сравнение: `CREATED_ID_S1` и `RECREATED_ID_S1` (равны? да/нет)

---

### Сценарий 4: Использовать ингредиент в товаре меню (Опционально, проверяет ссылочную целостность)

**Назначение:** Проверить, что id ингредиента пригоден для использования в качестве внешнего ключа в товарах меню после редактирований.

**Шаги:**
1. Создать товар меню со ссылкой на ингредиент:
   ```json
   POST /teams/17957/menu-products
   {
     "name": "Test Dish VER-021",
     "is_draft": false,
     "modifications": [
       {
         "name": "Standard",
         "ingredient_id": <CREATED_ID_S1>,
         "conversion_rate": 1,
         "unit_id": <unit_from_ingredient>,
         "retail_price": 10.0
       }
     ]
   }
   ```
2. Записать возвращённый id товара меню → **`MENU_PRODUCT_ID`**
3. GET `/teams/17957/menu-products/{MENU_PRODUCT_ID}?include=modifications.product`
4. Проверить, что модификация по-прежнему корректно ссылается на ингредиент `CREATED_ID_S1`

**Приёмка:**
- Товар меню создан (201 или 200)
- GET показывает модификацию с ingredient_id = `CREATED_ID_S1`

**Интерпретация результата:**
- ✓ DURABLE (долговечен): id пригоден для использования как внешний ключ в других сущностях → долговечность подтверждена на практике

---

### Сценарий 5: Изменения категории и единицы (расширенный тест редактирования)

**Назначение:** Проверить долговечность id при систематических изменениях свойств.

**Шаги:**
1. Создать ингредиент с категорией и базовой единицей (S1)
2. Отредактировать и изменить:
   - `name` → добавить " [v2]"
   - `unit_id` → другая единица (если доступно несколько)
   - `ingredient_category_id` → другая категория (если применимо)
   - `conversion_rate` → другой множитель
3. GET полного ингредиента после каждого редактирования
4. Проверить, что `id` не изменился после каждого изменения свойства

**Приёмка:**
- Все редактирования успешны (200)
- id стабилен при всех изменениях свойств
- Обновления метаданных отражены

**Записать в лог:**
- Список изменений свойств на каждое редактирование
- id до/после каждого редактирования (все одинаковые)

---

### Сценарий 6: Разделение/слияние (если поддерживается)

**Назначение:** Понять поведение API при сложных мутациях ингредиентов.

**Шаги:**
1. Проверить документацию API Esupl или попробовать:
   - POST `/teams/17957/ingredients/{CREATED_ID_S1}/split` (если эндпоинт существует)
   - POST `/teams/17957/ingredients/{CREATED_ID_S1}/merge` (если эндпоинт существует)
2. Если таких эндпоинтов нет: **отметить как «не поддерживается»** и пропустить.
3. Если поддерживается:
   - Записать все сгенерированные новые id
   - Проверить статус исходного id (сохраняется, осиротел, удалён?)

**Приёмка:**
- Если не поддерживается: **N/A** (отметить в отчёте)
- Если поддерживается:
  - Чётко задокументировать правила генерации новых id
  - Отметить, становится ли исходный id недоступным

**Записать в лог:**
- HTTP-ответ (404 для неподдерживаемых эндпоинтов)
- Если поддерживается: полные детали мутации

---

## Шаги выполнения теста

### Чек-лист предварительных требований
- [ ] Учётные данные команды Esupl 17957 доступны
- [ ] API-токен в `.env` или в скрипте
- [ ] Подтверждено окружение песочницы (не продакшен)
- [ ] Готов инструмент для HTTP-запросов (curl, Postman, Python requests, Node.js fetch)

### Запуск тестов (рекомендуемый порядок)
1. **S1 + S2 + S3** (базовая долговечность: создание → редактирование → удаление/повторное создание)
2. **S4** (проверка ссылочной целостности)
3. **S5** (расширенные редактирования)
4. **S6** (продвинутые возможности, если API поддерживает)

### Метод выполнения, вариант A: вручную (Curl/Postman)

**Настройка:**
```bash
export TEAM_ID="17957"
export BASE_URL="https://api.esupl.com/v1"
export TOKEN="<your_api_token>"
export HEADER_AUTH="Authorization: Bearer ${TOKEN}"
```

**Пример S1 (Create):**
```bash
curl -X POST "${BASE_URL}/teams/${TEAM_ID}/ingredients" \
  -H "Content-Type: application/json" \
  -H "${HEADER_AUTH}" \
  -d '{
    "name": "Test Ingredient VER-021-S1",
    "product_id": 123,
    "unit_id": 17,
    "conversion_rate": 1.0
  }' | jq .
```

**Пример S1 (Get):**
```bash
curl -X GET "${BASE_URL}/teams/${TEAM_ID}/ingredients/{CREATED_ID_S1}" \
  -H "${HEADER_AUTH}" | jq .
```

**Пример S2 (Edit):**
```bash
curl -X PUT "${BASE_URL}/teams/${TEAM_ID}/ingredients/{CREATED_ID_S1}" \
  -H "Content-Type: application/json" \
  -H "${HEADER_AUTH}" \
  -d '{
    "name": "Test Ingredient VER-021-S1-RENAMED",
    "product_id": 123,
    "unit_id": 21,
    "conversion_rate": 1.5
  }' | jq .
```

**Пример S3 (Delete):**
```bash
curl -X DELETE "${BASE_URL}/teams/${TEAM_ID}/ingredients/{CREATED_ID_S1}" \
  -H "${HEADER_AUTH}" -w "\nStatus: %{http_code}\n"
```

### Метод выполнения, вариант B: Python-скрипт

```python
#!/usr/bin/env python3
import requests
import json
from datetime import datetime

BASE_URL = "https://api.esupl.com/v1"
TEAM_ID = "17957"
TOKEN = "<your_token>"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

results = {}

# S1: Create
print("\n=== SCENARIO 1: CREATE ===")
payload_s1 = {
    "name": "Test Ingredient VER-021-S1",
    "product_id": 123,
    "unit_id": 17,
    "conversion_rate": 1.0
}
resp = requests.post(f"{BASE_URL}/teams/{TEAM_ID}/ingredients", 
                     json=payload_s1, headers=headers)
print(f"Status: {resp.status_code}")
result_s1 = resp.json()
print(json.dumps(result_s1, indent=2))
CREATED_ID_S1 = result_s1.get("id")
results["S1_created_id"] = CREATED_ID_S1
results["S1_response"] = result_s1

# S1: Get to confirm
print(f"\n=== S1: GET Confirmation ===")
resp = requests.get(f"{BASE_URL}/teams/{TEAM_ID}/ingredients/{CREATED_ID_S1}", 
                    headers=headers)
print(f"Status: {resp.status_code}")
print(json.dumps(resp.json(), indent=2))

# S2: Edit
print(f"\n=== SCENARIO 2: EDIT ===")
payload_s2 = {
    "name": "Test Ingredient VER-021-S1-RENAMED",
    "product_id": 123,
    "unit_id": 21,
    "conversion_rate": 1.5
}
resp = requests.put(f"{BASE_URL}/teams/{TEAM_ID}/ingredients/{CREATED_ID_S1}", 
                    json=payload_s2, headers=headers)
print(f"Status: {resp.status_code}")
result_s2 = resp.json()
print(json.dumps(result_s2, indent=2))
AFTER_EDIT_ID = result_s2.get("id")
results["S2_after_edit_id"] = AFTER_EDIT_ID
results["S2_id_stable"] = (CREATED_ID_S1 == AFTER_EDIT_ID)
print(f"ID stable after edit? {CREATED_ID_S1 == AFTER_EDIT_ID}")

# S3: Delete
print(f"\n=== SCENARIO 3: DELETE ===")
resp = requests.delete(f"{BASE_URL}/teams/{TEAM_ID}/ingredients/{CREATED_ID_S1}", 
                       headers=headers)
print(f"Status: {resp.status_code}")
results["S3_delete_status"] = resp.status_code

# Verify deletion
resp = requests.get(f"{BASE_URL}/teams/{TEAM_ID}/ingredients/{CREATED_ID_S1}", 
                    headers=headers)
print(f"GET after delete - Status: {resp.status_code} (expect 404)")
results["S3_confirm_404"] = (resp.status_code == 404)

# S3: Recreate
print(f"\n=== S3: RECREATE ===")
resp = requests.post(f"{BASE_URL}/teams/{TEAM_ID}/ingredients", 
                     json=payload_s1, headers=headers)
print(f"Status: {resp.status_code}")
result_s3 = resp.json()
print(json.dumps(result_s3, indent=2))
RECREATED_ID_S1 = result_s3.get("id")
results["S3_recreated_id"] = RECREATED_ID_S1
results["S3_id_reused"] = (CREATED_ID_S1 == RECREATED_ID_S1)
print(f"\nID Reused? {CREATED_ID_S1 == RECREATED_ID_S1}")
print(f"  Original:  {CREATED_ID_S1}")
print(f"  Recreated: {RECREATED_ID_S1}")

# Summary
print(f"\n=== SUMMARY ===")
print(json.dumps({
    "created_id": results.get("S1_created_id"),
    "id_stable_after_edit": results.get("S2_id_stable"),
    "id_reused_after_recreate": results.get("S3_id_reused"),
    "delete_confirmed": results.get("S3_confirm_404"),
}, indent=2))

# Verdict
print(f"\n=== VERDICT ===")
if results.get("S2_id_stable") and results.get("S3_confirm_404"):
    if results.get("S3_id_reused"):
        print("✓ DURABLE (ID persists on edit, reuses on recreate)")
    else:
        print("⚠ SEMI-DURABLE (ID persists on edit, but NOT reused on recreate)")
        print("  → Safe for audit, risk for caching; escalate for clarification")
else:
    print("✗ NOT DURABLE (ID changes on edit or delete fails)")
    print("  → STOP — escalate to Esupl support")
```

### Метод выполнения, вариант C: Node.js-скрипт

```javascript
const BASE_URL = "https://api.esupl.com/v1";
const TEAM_ID = "17957";
const TOKEN = process.env.ESUPL_API_TOKEN;

if (!TOKEN) {
  console.error("Error: ESUPL_API_TOKEN not set");
  process.exit(1);
}

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json"
};

async function test() {
  const results = {};
  
  // S1: Create
  console.log("\n=== SCENARIO 1: CREATE ===");
  const payloadS1 = {
    name: "Test Ingredient VER-021-S1",
    product_id: 123,
    unit_id: 17,
    conversion_rate: 1.0
  };
  
  let resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients`,
    { method: "POST", headers, body: JSON.stringify(payloadS1) }
  );
  console.log(`Status: ${resp.status}`);
  let resultS1 = await resp.json();
  console.log(JSON.stringify(resultS1, null, 2));
  
  const CREATED_ID_S1 = resultS1.id;
  results.S1_created_id = CREATED_ID_S1;
  
  // S1: Get
  console.log(`\n=== S1: GET Confirmation ===`);
  resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients/${CREATED_ID_S1}`,
    { method: "GET", headers }
  );
  console.log(`Status: ${resp.status}`);
  console.log(JSON.stringify(await resp.json(), null, 2));
  
  // S2: Edit
  console.log(`\n=== SCENARIO 2: EDIT ===`);
  const payloadS2 = {
    name: "Test Ingredient VER-021-S1-RENAMED",
    product_id: 123,
    unit_id: 21,
    conversion_rate: 1.5
  };
  
  resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients/${CREATED_ID_S1}`,
    { method: "PUT", headers, body: JSON.stringify(payloadS2) }
  );
  console.log(`Status: ${resp.status}`);
  let resultS2 = await resp.json();
  console.log(JSON.stringify(resultS2, null, 2));
  
  const AFTER_EDIT_ID = resultS2.id;
  results.S2_after_edit_id = AFTER_EDIT_ID;
  results.S2_id_stable = (CREATED_ID_S1 === AFTER_EDIT_ID);
  console.log(`ID stable after edit? ${CREATED_ID_S1 === AFTER_EDIT_ID}`);
  
  // S3: Delete
  console.log(`\n=== SCENARIO 3: DELETE ===`);
  resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients/${CREATED_ID_S1}`,
    { method: "DELETE", headers }
  );
  console.log(`Status: ${resp.status}`);
  results.S3_delete_status = resp.status;
  
  // Verify 404
  resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients/${CREATED_ID_S1}`,
    { method: "GET", headers }
  );
  console.log(`GET after delete - Status: ${resp.status} (expect 404)`);
  results.S3_confirm_404 = (resp.status === 404);
  
  // S3: Recreate
  console.log(`\n=== S3: RECREATE ===`);
  resp = await fetch(
    `${BASE_URL}/teams/${TEAM_ID}/ingredients`,
    { method: "POST", headers, body: JSON.stringify(payloadS1) }
  );
  console.log(`Status: ${resp.status}`);
  let resultS3 = await resp.json();
  console.log(JSON.stringify(resultS3, null, 2));
  
  const RECREATED_ID_S1 = resultS3.id;
  results.S3_recreated_id = RECREATED_ID_S1;
  results.S3_id_reused = (CREATED_ID_S1 === RECREATED_ID_S1);
  
  console.log(`\nID Reused? ${CREATED_ID_S1 === RECREATED_ID_S1}`);
  console.log(`  Original:  ${CREATED_ID_S1}`);
  console.log(`  Recreated: ${RECREATED_ID_S1}`);
  
  // Summary
  console.log(`\n=== SUMMARY ===`);
  console.log(JSON.stringify({
    created_id: results.S1_created_id,
    id_stable_after_edit: results.S2_id_stable,
    id_reused_after_recreate: results.S3_id_reused,
    delete_confirmed: results.S3_confirm_404,
  }, null, 2));
  
  // Verdict
  console.log(`\n=== VERDICT ===`);
  if (results.S2_id_stable && results.S3_confirm_404) {
    if (results.S3_id_reused) {
      console.log("✓ DURABLE (ID persists on edit, reuses on recreate)");
    } else {
      console.log("⚠ SEMI-DURABLE (ID persists on edit, but NOT reused on recreate)");
      console.log("  → Safe for audit, risk for caching; escalate for clarification");
    }
  } else {
    console.log("✗ NOT DURABLE (ID changes on edit or delete fails)");
    console.log("  → STOP — escalate to Esupl support");
  }
}

test().catch(console.error);
```

---

## Критерии приёмки и дерево решений

### Матрица исходов

| Сценарий | Результат | Следствие |
|----------|--------|-------------|
| S1 + S2 + S3: id стабилен при редактировании + удаление 404 + id переиспользован при повторном создании | **PASS (годен)** | ✓ **DURABLE (долговечен)** → Переход к PRE-2 |
| S1 + S2: id стабилен при редактировании; S3: id НЕ переиспользован (новый id) | **SEMI-PASS (частично годен)** | ⚠ **SEMI-DURABLE (частично долговечен)** → Эскалировать в Esupl для уточнения семантики переиспользования; можно продолжать со снижением риска |
| S1 + S2: id меняется при редактировании ИЛИ S3: удаление не удаётся | **FAIL (не годен)** | ✗ **NOT DURABLE (не долговечен)** → СТОП, не продолжать; эскалировать в поддержку Esupl |
| S4: ссылка в товаре меню нарушается | **FAIL (не годен)** | ✗ **ID не пригоден для ссылок** → СТОП |
| S5: любое изменение свойства вызывает изменение id | **FAIL (не годен)** | ✗ **NOT DURABLE (не долговечен)** → СТОП |
| S6: разделение/слияние создаёт осиротевшие id | **FAIL (не годен)** (если поддерживается) | ✗ **Фрагментация id** → СТОП, если не обработано на уровне приложения |

### Гейт решения

**ПЕРЕХОДИТЬ к PRE-2, если:**
- ✓ id сохраняется неизменным при редактировании (S2)
- ✓ Удаление возвращает 404 (S3)
- ✓ id переиспользован при повторном создании с тем же телом запроса (S3) **ИЛИ** задокументировано и риск снижен, если не переиспользуется

**СТОП и ЭСКАЛАЦИЯ, если:**
- ✗ id меняется при редактировании (S2 не пройден)
- ✗ Удаление не удаляет ингредиент (S3 не пройден)
- ✗ Ссылочная целостность нарушена (S4 не пройден)
- ✗ Поведение непоследовательно по свойствам (S5 не пройден)

---

## Шаблон отчёта о тесте

**Дата:** `<test_date>`  
**Исполнитель:** `<tester_name>`  
**Team ID:** 17957  
**API Version:** v1  

| Тест-кейс | Ввод | Ожидается | Фактически | Статус | Примечания |
|-----------|-------|----------|--------|--------|-------|
| S1 Create | POST /ingredients тело запроса | 201, id=X | 201, id=X | ✓ PASS (годен) | X = 12345 |
| S1 Get | GET /ingredients/12345 | 200, имя совпадает | 200, имя совпадает | ✓ PASS (годен) | |
| S2 Edit | PUT /ingredients/12345 с изменением имени | 200, id=12345 | 200, id=12345 | ✓ PASS (годен) | id сохраняется |
| S2 Verify | GET /ingredients/12345 | имя обновлено | имя обновлено | ✓ PASS (годен) | |
| S3 Delete | DELETE /ingredients/12345 | 204 или 200 | 204 | ✓ PASS (годен) | |
| S3 Confirm | GET /ingredients/12345 | 404 | 404 | ✓ PASS (годен) | Удаление подтверждено |
| S3 Recreate | POST /ingredients то же тело запроса, что в S1 | 201, id=Y | 201, id=12345 | ✓ PASS (годен) | id ПЕРЕИСПОЛЬЗОВАН (Y == X) |
| S4 Ref | Товар меню с ingredient_id=12345 | 200, ссылка валидна | 200, ссылка валидна | ✓ PASS (годен) | Ссылочная целостность OK |
| S5 Category Change | PUT /ingredients/12345 category=2 | 200, id=12345 | 200, id=12345 | ✓ PASS (годен) | |
| S5 Unit Change | PUT /ingredients/12345 unit_id=21 | 200, id=12345 | 200, id=12345 | ✓ PASS (годен) | |
| S6 Split/Merge | POST /ingredients/12345/split (если существует) | 404 или валидно | 404 | N/A | Не поддерживается |

**Verdict:** `✓ DURABLE — Ready for PRE-2`

---

## Процедура эскалации (если FAIL, не годен)

Если какой-либо тест не пройден:

1. **Чётко задокументировать сбой:**
   - Точный HTTP-запрос (метод, путь, тело)
   - Статус и тело ответа
   - Ожидаемое vs фактическое поведение
   - Временная метка

2. **Эскалировать в поддержку Esupl:**
   - Сослаться на этот план тестирования (VER-021)
   - Приложить детали сбоя + отчёт о тесте
   - Спросить: «Гарантирована ли долговечность pos_ingredient_id? Могут ли id переиспользоваться после удаления?»

3. **Промежуточное снижение риска (если SEMI-DURABLE, частично долговечен):**
   - Кэшировать сопоставления ингредиентов (имя/продукт → id) на стороне клиента
   - Отслеживать мутации в mvp.be (таблица ingredient_mutations)
   - Использовать внешнее сопоставление UUID, если переиспользование id нестабильно

4. **Заблокировать нижестоящую работу:**
   - Не переходить к PRE-2, пока Esupl не подтвердит контракт долговечности
   - Реализовать обходное решение в бэкенде до релиза фичи

---

## Очистка

После завершения теста:

1. **Удалить тестовые ингредиенты** из команды 17957:
   ```bash
   curl -X DELETE "https://api.esupl.com/v1/teams/17957/ingredients/{CREATED_ID_S1}" \
     -H "Authorization: Bearer ${TOKEN}"
   ```

2. **Удалить тестовые товары меню** (если созданы в S4):
   ```bash
   curl -X DELETE "https://api.esupl.com/v1/teams/17957/menu-products/{MENU_PRODUCT_ID}" \
     -H "Authorization: Bearer ${TOKEN}"
   ```

3. **Проверить чистоту песочницы:** Вывести список ингредиентов и подтвердить, что тестовые данные удалены:
   ```bash
   curl "https://api.esupl.com/v1/teams/17957/ingredients?filter[name]=VER-021" \
     -H "Authorization: Bearer ${TOKEN}" | jq '.data | length'
   ```

---

## Ссылки

- **Документация API Esupl:** `mvp.docs/api/esupl/menu.md` (эндпоинты ingredients)
- **Провайдер Esupl в mvp.be:** `mvp.be/app/providers/erp/esupl.py` (интеграционный код)
- **Memory:** заметки о реальном доступе к API Esupl в memory/MEMORY.md
- **Итог гейта:** Блокирует PRE-2 при FAIL (не годен); разрешает PRE-2 при PASS (годен)

---

**Created:** 2026-07-08  
**Version:** 1.0  
**Status:** ГОТОВ К ВЫПОЛНЕНИЮ
