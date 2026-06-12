# loyalty

[← Back to index](README.md)

## customers

### GET index

`GET https://api.esupl.com/v1/teams/1/customers`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[q]` | 38 | optional |  |
| `per_page` | 1 | optional |  |
| `all` | true | optional |  |
| `fields` | id,name | optional |  |


### GET show/:id

`GET https://api.esupl.com/v1/teams/1/customers/:id?fields=id,name`

**Path variables**

- `id` = `1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `fields` | id,name | yes |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/customers`

**Request body** (raw)

```json
{
  "full_name": "Стаховская Ксения",
  "phone": "259564679",
  "phone_country": "BY",
  "gender": "f",
  "customer_group_id": 2,
  "bonus_program_id": 1,
  "bonuses": -1000
}
```


### PUT update/:id

`PUT https://api.esupl.com/v1/teams/1/customers/:id`

Updates the information about the custormer.

**Path variables**

- `id` = `2`

**Request body** (raw)

```json
{
  "full_name": "Стаховская Ксения",
  "phone": "259564679",
  "phone_country": "BY",
  "gender": "f",
  "customer_group_id": 2,
  "bonus_program_id": "1",
  "bonuses": -1000
}
```


### DELETE destroy/:id

`DELETE https://api.esupl.com/v1/teams/1/customers/:id`

Deletes the customer.

**Path variables**

- `id` = `1`


## customer-groups

### GET index

`GET https://api.esupl.com/v1/teams/1/customer-groups`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[name]` | 1 | optional |  |
| `per_page` | 100 | optional |  |
| `all` | true | optional |  |
| `fields` | id,name | optional |  |


### GET show/{id}

`GET https://api.esupl.com/v1/teams/1/customer-groups/1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `fields` | id,name | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/customer-groups`

**Request body** (raw)

```json
{
  "name": "Коммунальные услуги",
  "discount": 100,
  "min_total_spent_for_automatic_transition": null,
  "is_automatic_transition_allowed": false
}
```


### PUT update/{id}

`PUT https://api.esupl.com/v1/teams/1/customer-groups/1`

**Request body** (raw)

```json
{
  "name": "Коммунальные услуги 123",
  "discount": 100,
  "min_total_spent_for_automatic_transition": 100.1,
  "is_automatic_transition_allowed": 1
}
```


### DELETE destroy/{id}

`DELETE https://api.esupl.com/v1/teams/1/customer-groups/1`


## discounts

### GET index

`GET https://api.esupl.com/v1/teams/1/discounts?per_page=100&include=outlets:fields(id|name),menu_categories:fields(id|name),menu_items:fields(name|item_id|item_type)`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[q]` | 38 | optional |  |
| `per_page` | 100 | yes |  |
| `all` | true | optional |  |
| `fields` | id,name | optional |  |
| `include` | outlets:fields(id|name),menu_categories:fields(id|name),menu_items:fields(name|item_id|item_type) | yes |  |
| `sort` | customers_count | optional |  |


### GET show/{id}

`GET https://api.esupl.com/v1/teams/1/discounts/3?include=outlets:fields(id|name),menu_categories:fields(id|name),menu_items:fields(name|item_type|item_id)`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `fields` | id,name | optional |  |
| `include` | outlets:fields(id|name),menu_categories:fields(id|name),menu_items:fields(name|item_type|item_id) | yes |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/discounts`

**Request body** (raw)

```json
{
  "name": "Скидка Postman",
  "type": "absolute",
  "discount": 5,
  "is_automatic": false,
  "is_cancellable": true,
  "active_times": [
    {
      "start_time": "10:07",
      "end_time": "10:18",
      "days": [
        "mo",
        "fr"
      ]
    },
    {
      "start_time": "13:07",
      "end_time": "14:01",
      "days": [
        "tu"
      ]
    }
  ]
}
```


### PUT update/{id}

`PUT https://api.esupl.com/v1/teams/1/discounts/51`

**Request body** (raw)

```json
{
  "name": "БП 1",
  "start_date": "2021-10-26T17:44:00",
  "end_date": "2021-11-26T17:45:00",
  "bonus_rate": 30,
  "max_payable_receipt_part": 10,
  "burning_period": 30,
  "birthday_bonus": 50,
  "greeting_bonus": 15,
  "customer_group_ids": [
    1,
    3
  ],
  "menu_category_ids": [
    2,
    3,
    4
  ],
  "menu_items": [
    {
      "id": 1023,
      "type": "dish"
    },
    {
      "id": 3498,
      "type": "menu_product_modification"
    },
    {
      "id": 1021,
      "type": "dish"
    }
  ]
}
```


### DELETE destroy/{id}

`DELETE https://api.esupl.com/v1/teams/1/discounts/1`


## promotions

### GET index

`GET https://api.esupl.com/v1/teams/1/promotions?per_page=100&include=customer_groups:fields(id|name),result.items,conditions.items`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[q]` | 38 | optional |  |
| `per_page` | 100 | yes |  |
| `all` | true | optional |  |
| `fields` | id,name | optional |  |
| `include` | customer_groups:fields(id|name),result.items,conditions.items | yes |  |
| `sort` | customers_count | optional |  |


### GET show/{id}

`GET https://api.esupl.com/v1/teams/1/promotions/10?include=customer_groups:fields(id|name),menu_categories:fields(id|name),menu_items:fields(name|item_type|item_id)`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `fields` | id,name | optional |  |
| `include` | customer_groups:fields(id|name),menu_categories:fields(id|name),menu_items:fields(name|item_type|item_id) | yes |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/promotions`

**Request body** (raw)

```json
{
  "name": "6-ой кофе в подарок",
  "start_date": "2022-08-14T10:50:00",
  "end_date": "2022-09-01T00:00:00",
  "is_automatic": false,
  "can_accrue_bonuses": false,
  "customer_type": "registered",
  "accumulation_type": "without_once",
  "match_type": "or",
  "conditions": [
    {
      "match_type": "and",
      "items": [
        {
          "item_id": 5,
          "item_type": "menu_product_modification",
          "quantity": 2,
          "compare_type": "equally"
        }
      ]
    }
  ],
  "outlet_ids": [],
  "customer_group_ids": [],
  "result": {
    "type": "bonus_items",
    "value": 11,
    "options": {
      "apply_item_type": "fixed_price",
      "apply_item_value": 4
    },
    "items": [
      {
        "item_id": 5,
        "item_type": "menu_product_modification",
        "options": {
          "modifier_option_ids": [
            1,
            2,
            3
          ]
        }
      },
      {
        "item_id": 11702,
        "item_type": "dish",
        "options": {
          "modifier_option_ids": [
            1,
            2,
            3
          ]
        }
      }
    ]
  }
}
```


### PUT update/{id}

`PUT https://api.esupl.com/v1/teams/1/promotions/2`

**Request body** (raw)

```json
{
  "name": "БП 1",
  "start_date": "2021-10-26T17:44:00",
  "end_date": "2021-11-26T17:45:00",
  "bonus_rate": 30,
  "max_payable_receipt_part": 10,
  "burning_period": 30,
  "birthday_bonus": 50,
  "greeting_bonus": 15,
  "customer_group_ids": [
    1,
    3
  ],
  "menu_category_ids": [
    2,
    3,
    4
  ],
  "menu_items": [
    {
      "id": 1023,
      "type": "dish"
    },
    {
      "id": 3498,
      "type": "menu_product_modification"
    },
    {
      "id": 1021,
      "type": "dish"
    }
  ]
}
```


### DELETE destroy/{id}

`DELETE https://api.esupl.com/v1/teams/1/promotions/1`


## bonus-programs

### GET index

`GET https://api.esupl.com/v1/teams/1/bonus-programs`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[q]` | 38 | optional |  |
| `per_page` | 100 | optional |  |
| `all` | true | optional |  |
| `fields` | id,name | optional |  |
| `include` | customer_groups:fields(id|name),menu_categories:fields(id|name),menu_items:fields(name|item_id|item_type) | optional |  |
| `sort` | customers_count | optional |  |


### GET show/{id}

`GET https://api.esupl.com/v1/teams/1/bonus-programs/10`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `fields` | id,name | optional |  |
| `include` | customer_groups:fields(id|name),menu_categories:fields(id|name),menu_items:fields(name|item_type|item_id) | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/bonus-programs`

**Request body** (raw)

```json
{
  "name": "БП NEW",
  "start_date": "2021-10-26T17:44:00",
  "end_date": "2021-11-26T17:45:00",
  "bonus_rate": 30,
  "max_payable_receipt_part": 10,
  "burning_period_days": 3,
  "birthday_bonus": 50.25,
  "greeting_bonus": 15.07,
  "customer_group_ids": [
    3
  ],
  "menu_category_ids": [],
  "menu_items": [
    {
      "id": 31,
      "type": "menu_product_modification"
    }
  ]
}
```


### PUT update/{id}

`PUT https://api.esupl.com/v1/teams/1/bonus-programs/2`

**Request body** (raw)

```json
{
  "name": "БП 1",
  "start_date": "2021-10-26T17:44:00",
  "end_date": "2021-11-26T17:45:00",
  "bonus_rate": 30,
  "max_payable_receipt_part": 10,
  "burning_period": 30,
  "birthday_bonus": 50,
  "greeting_bonus": 15,
  "customer_group_ids": [
    1,
    3
  ],
  "menu_category_ids": [
    2,
    3,
    4
  ],
  "menu_items": [
    {
      "id": 1023,
      "type": "dish"
    },
    {
      "id": 3498,
      "type": "menu_product_modification"
    },
    {
      "id": 1021,
      "type": "dish"
    }
  ]
}
```


### DELETE destroy/{id}

`DELETE https://api.esupl.com/v1/teams/1/bonus-programs/1`

