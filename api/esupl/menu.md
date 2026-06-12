# menu

[← Back to index](README.md)

## dishes

### GET index

`GET https://api.esupl.com/v1/teams/1/dishes`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `name` | %ЦИКЛ% | optional |  |
| `operator[name]` | like | optional |  |
| `per_page` | 150 | optional |  |
| `sort` | asc.menu_category_name | optional |  |
| `id` | 1176 | optional |  |
| `include` | menu_category:fields(id%7Cname%7Ccolor),modifiers.options.item,ingredients.unit,ingredients.product:fields(id%7Cdiscount%7Cmultiplicity%7Cname%7Con_discount%7Cprice%7Csku),preparations.ingredients.product:fields(id%7Cdiscount%7Cmultiplicity%7Cname%7Con_discount%7Cprice%7Csku),preparations.ingredients.unit,preparations.preparations:recursively%26per_page=10%26page=1 | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/dishes/18`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | ingredients,preparations | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/dishes`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Dish",
  "is_weight": false,
  "retail_price": 10,
  "outlet_prices": [],
  "ingredients": [
    {
      "id": 20,
      "type": "ingredient",
      "gross": 1,
      "net": 50,
      "cooking_methods": [
        "cleaning",
        "roasting",
        "cooking",
        "stew",
        "backing"
      ]
    }
  ]
}
```


### POST update

`POST https://api.esupl.com/v1/teams/1/dishes/18`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Updated dish",
  "is_weight": false,
  "retail_price": 15,
  "outlet_prices": [],
  "ingredients": [
    {
      "id": 20,
      "type": "ingredient",
      "gross": 1,
      "net": 50,
      "cooking_methods": [
        "cleaning",
        "roasting",
        "cooking",
        "stew",
        "backing"
      ]
    }
  ]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/dishes/20`


## menu-products

### GET index

`GET https://api.esupl.com/v1/teams/:team_id/menu-products`

Gets the menu products for the specified team.

**Path variables**

- `team_id` = `1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | modifications.product:fields(id|name|price|currency),modifications.unit,modifications.analogs | optional |  |
| `filter[menu_category_id]` | 20 | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/menu-products/:id`

Gets the specified menu product.

**Path variables**

- `id`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | modifications | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/menu-products`

Creates a new menu product.

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "id": null,
  "name": "DDD",
  "position": "",
  "is_draft": false,
  "is_archived": false,
  "is_free_price": false,
  "is_hidden_from_bill": false,
  "has_modifications": true,
  "modifications": [
    {
      "id": null,
      "product_id": null,
      "ingredient_id": null,
      "modification_id": null,
      "conversion_rate": 1,
      "name": "111",
      "markup": 0,
      "unit_id": 21,
      "retail_price": "5",
      "food_cost_limit": "",
      "menu_category_id": null,
      "cooking_place_id": null,
      "analogs": [],
      "outlet_prices": [
        {
          "outlet_id": 4,
          "price": "",
          "markup": "0"
        },
        {
          "outlet_id": 4,
          "price": "",
          "markup": "0"
        }
      ],
      "barcode": ""
    },
    {
      "id": null,
      "product_id": null,
      "ingredient_id": null,
      "modification_id": null,
      "conversion_rate": 1,
      "name": "222",
      "markup": 0,
      "unit_id": 21,
      "retail_price": "6",
      "food_cost_limit": "",
      "menu_category_id": null,
      "cooking_place_id": null,
      "analogs": [],
      "outlet_prices": [],
      "barcode": ""
    }
  ],
  "image": null
}
```


### POST update

`POST https://api.esupl.com/v1/teams/1/menu-products/:id`

**Path variables**

- `id` = `4`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
    "name": "Брокколи с сыром",
    "is_draft": false,
    "is_archived": false,
    "has_modifications": false,
    "modifications": [
        {
            "id": 4,
            "product_id": 4,
            "ingredient_id": null,
            "modification_id": null,
            "conversion_rate": 1,
            "name": "",
            "unit_id": 15,
            "retail_price": 2.1,
            "food_cost_limit": 25,
            "menu_category_id": null,
            "cooking_place_id": null,
            "analogs": [],
            "outlet_prices": [],
            "product_volume": {
                "quantity": 1,
                "unit": "liter"
            }
        }
    ]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/menu-products/:id`

**Path variables**

- `id` = `11`


## preparations

### GET index

`GET https://api.esupl.com/v1/teams/1/preparations`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | ingredients.product:fields(id%7Ccurrency%7Cdiscount%7Cmultiplicity%7Cname%7Con_discount%7Cprice%7Csku),ingredients.product.unit,ingredients.unit,preparations.ingredients.product:fields(id%7Cdiscount%7Cmultiplicity%7Cname%7Con_discount%7Cprice%7Csku),preparations.ingredients.unit,preparations:recursively | optional |  |
| `per_page` | 10 | optional |  |
| `page` | 1 | optional |  |
| `fields` | id,name | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/preparations/1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | ingredients.unit | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/preparations`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Menu product name",
  "cooking_process": "123",
  "ingredients": [
    {
      "id": 3,
      "name": "modification name",
      "gross": 1,
      "net": 100
    }
  ]
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/preparations/2`

**Headers**

- `Authorization: Bearer {access_token}`
- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Полуфабрикат",
  "is_weight": false,
  "cooking_process": "",
  "ingredients": [
    {
      "id": 2,
      "cooking_methods": [],
      "gross": 32,
      "net": 32
    }
  ]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/preparations/13`


## ingredients

### GET index

`GET https://api.esupl.com/v1/teams/1/ingredients`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | ingredient_category | optional |  |
| `fields` | id,name,barcode | optional |  |
| `sort` | ingredient_category_name | optional |  |
| `filter[name]` | 1 | optional |  |
| `filter[ingredient_category_id]` | 2 | optional |  |
| `filter[q]` | 111111 | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/ingredients/2`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | analogs,product | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/ingredients`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Ingredient name",
  "product_id": 11,
  "unit_id": 17,
  "conversion_rate": 1.01,
  "losses": {
    "cleaning": 100
  },
  "analogs": [
    {
      "id": 4,
      "unit_id": 17,
      "product_id": 11,
      "conversion_rate": 1
    }
  ]
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/ingredients/1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
	"name": "Ингредиент API",
	"product_id": 20,
	"unit_id": 17,
	"conversion_rate": 100,
	"weight_in_grams": "",
	"losses": [1],
	"analogs": [
		{
			"product_id": 23,
			"conversion_rate": 1
		}
	]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/ingredients/2`


## modifiers

### GET index

`GET https://api.esupl.com/v1/teams/1/modifiers`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | options.item,dishes:fields(id|name) | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/modifiers/23`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | options.item | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/modifiers`

**Headers**

- `Content-Type: application/json`

**Request body** (formdata)

- `name` (text) = Modifier with item 1
- `min_options_count` (text) = 0
- `max_options_count` (text) = 100
- `options[0][name]` (text) = option 1
- `options[0][image]` (file) = 
- `options[0][item_id]` (text) = 4541
- `options[0][item_type]` (text) = menu_product_modification
- `options[0][gross]` (text) = 100
- `options[1][name]` (text) = Preparation option
- `options[1][image]` (file) = 
- `options[1][item_id]` (text) = 3
- `options[1][item_type]` (text) = preparation


### POST update

`POST https://api.esupl.com/v1/teams/1/modifiers/20`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Updated name",
  "min_options_count": 0,
  "max_options_count": 0,
  "options": [
    {
      "id": 1,
      "name": "Option 1",
      "gross": 1.111
    },
    {
      "name": "Option 2",
      "price": 2
    }
  ]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/modifiers/20`


## menu-categories

### GET index

`GET https://api.esupl.com/v1/teams/1/menu-categories`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `warehouse_id` | 135 | optional |  |
| `per_page` | 1 | optional |  |
| `filter[name]` | до | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/menu-categories/174`


### POST store

`POST https://api.esupl.com/v1/teams/1/menu-categories`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Drinks",
  "color": "green"
}
```


### POST update

`POST https://api.esupl.com/v1/teams/1/menu-categories/173`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Updated drinks",
  "color": "green"
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/menu-categories/109`


## ingredient-categories

### GET index

`GET https://api.esupl.com/v1/teams/1/ingredient-categories`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `per_page` | 1 | optional |  |
| `filter[name]` | до | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/ingredient-categories/1`


### POST store

`POST https://api.esupl.com/v1/teams/1/ingredient-categories`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Ingredient category",
  "color": "green"
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/ingredient-categories/1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Ungredient category (updated)",
  "color": "green"
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/ingredient-categories/1`

