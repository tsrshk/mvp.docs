# handbooks

[← Back to index](README.md)

## cooking-places

### GET index

`GET https://api.esupl.com/v1/teams/:team_id/cooking-places`

Gets the list of the cooking places.

**Path variables**

- `team_id` = `1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[name]` | ко | optional |  |
| `per_page` | 1 | optional |  |
| `all` | true | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/:team_id/cooking-places/:id`

Gets the information about the cooking place.

**Path variables**

- `team_id` = `1`
- `id` = `1`


### POST store

`POST https://api.esupl.com/v1/teams/:team_id/cooking-places`

Creates a new cooking place.

**Path variables**

- `team_id` = `1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
    "name": "Kitchen"
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/:team_id/cooking-places/:id`

Updates the information about the cooking place.

**Path variables**

- `team_id` = `1`
- `id` = `1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
    "name": "Updated kitchen"
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/:team_id/cooking-places/:id`

Deletes the cooking place.

**Path variables**

- `team_id` = `1`
- `id` = `1`


## outlets

### GET index

`GET https://api.esupl.com/v1/teams/1/outlets`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[name]` | ка | optional |  |
| `per_page` | 1 | optional |  |
| `all` | true | optional |  |
| `include` | halls | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/outlets/153`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | default_warehouse,terminals,halls.tables | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/outlets`

**Request body** (raw)

```json
{
  "default_warehouse_id": 312,
  "name": "Кафе на Полянке",
  "address": "Минск, Независимости, 84",
  "waste_method": "by_cooking_places_and_terminals",
  "halls": [
    {
      "name": "Hall",
      "outlet_id": 14,
      "tables": [
        {
          "name": "Table",
          "options": {
            "x": 1,
            "y": 2
          }
        }
      ]
    }
  ]
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/outlets/9`

**Request body** (raw)

```json
{
  "default_warehouse_id": 136,
  "name": "Бар",
  "address": "Москва, ул. Б.Полянка 44",
  "waste_method": "by_cooking_places_and_terminals",
  "warehouse_mappings": [
    {
      "cooking_place_id": null,
      "terminal_id": 15,
      "warehouse_id": 7474
    },
    {
      "cooking_place_id": 2,
      "terminal_id": 8,
      "warehouse_id": 134
    }
  ]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/outlets/9`


## terminals

### GET index

`GET https://api.esupl.com/v1/teams/:team_id/terminals`

**Path variables**

- `team_id` = `1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[name]` | Ко | optional |  |
| `per_page` | 1 | optional |  |
| `all` | true | optional |  |
| `include` | outlet:fields(id|name) | optional |  |
| `filter[outlet_id]` | 2 | optional |  |
| `fields[outlet]` | id,name | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/:team_id/terminals/:id`

**Path variables**

- `team_id` = `1`
- `id` = `1`


### POST store

`POST https://api.esupl.com/v1/teams/:team_id/terminals`

**Path variables**

- `team_id` = `1`

**Request body** (raw)

```json
{
  "name": "Terminal",
  "outlet_id": 1
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/:team_id/terminals/:id`

Updates the information about the terminal.

**Path variables**

- `team_id` = `1`
- `id` = `1`

**Request body** (raw)

```json
{
  "name": "Updated terminal",
  "outlet_id": 1
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/:team_id/terminals/:id`

Deletes the terminal.

**Path variables**

- `team_id` = `1`
- `id` = `1`


## teams

### GET all

`GET https://api.esupl.com/v1/teams/all`

**Headers**

- `Authorization: Bearer {access_token}`


### GET owner-teams

`GET https://api.esupl.com/v1/teams/1/owner-teams`

**Headers**

- `Authorization: Bearer {access_token}`


### GET current

`GET https://api.esupl.com/v1/teams/current`

Gets the current team for the user.

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | budget,debit_settings | optional |  |
| `fields` | id,name,company_type | optional |  |


### GET index

`GET https://api.esupl.com/v1/teams`

**Headers**

- `Authorization: Bearer {access_token}`


### GET show/{id}

`GET https://api.esupl.com/v1/teams/1`

Gets the information about the team.

**Headers**

- `Authorization: Bearer {access_token}`


### GET following

`GET https://api.esupl.com/v1/teams/1/following?is_virtual=1`

Gets all following for the given team.

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `is_virtual` | 1 | yes |  |

**Headers**

- `Authorization: Bearer {access_token}`


### GET followers

`GET https://api.esupl.com/v1/teams/1/followers`

Gets all followers for the given team.

**Headers**

- `Authorization: Bearer {access_token}`


### GET products

`GET https://api.esupl.com/v1/teams/1/products?is_virtual=false&fields=id,name,cost&product_name=%колбаса%&operator[product_name]=like`

Gets products from all shared catalogs for the specified team.

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `is_virtual` | false | yes |  |
| `fields` | id,name,cost | yes |  |
| `product_name` | %колбаса% | yes |  |
| `operator[product_name]` | like | yes |  |

**Headers**

- `Authorization: Bearer {access_token}`
- `Content-Type: application/json`


### GET connections

`GET https://api.esupl.com/v1/teams/1/connections?is_virtual=1`

Gets all connections for the given team.

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `is_virtual` | 1 | yes |  |


### GET all-teams-for-owner

`GET https://api.esupl.com/v1/teams/1/all`

Gets the list of owner teams from the specified team.

**Headers**

- `Authorization: Bearer {access_token}`


### DELETE detach-team/{id}

`DELETE https://api.esupl.com/v1/teams/3/following/6852`

Detaches the specified team from the team.


### POST {id}/switch

`POST https://api.esupl.com/v1/teams/1/switch`

Switches the current team the user is viewing.

**Headers**

- `Authorization: Bearer {access_token}`


### POST store

`POST https://api.esupl.com/v1/teams`

Creates a new team.

**Headers**

- `Authorization: Bearer {access_token}`
- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "team name",
  "company_type": 1
}
```


### POST update

`POST https://api.esupl.com/v1/teams/2`

Updates the information about the team.

**Headers**

- `Authorization: Bearer {access_token}`

**Request body** (formdata)

- `name` (text) = Updated team name


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1`

Deletes the team.

**Request body** (formdata)



### POST add-virtual-supplier

`POST https://api.esupl.com/v1/teams/1/suppliers`

Adds a virtual supplier to the specified team.

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
	"name": "asdasda"
}
```


### PUT change-currency

`PUT https://api.esupl.com/v1/teams/1/currencies`

Changes the currency for the team.


## warehouses

### GET index

`GET https://api.esupl.com/v1/teams/1/warehouses`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | users | optional |  |
| `fields` | id,name | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/warehouses/164`


### POST store

`POST https://api.esupl.com/v1/teams/1/warehouses`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Простой склад",
  "address": "Москва, ул. Б.Полянка 44",
  "current_team_id": 1,
  "is_main": false,
  "is_central": false,
  "is_manufacture": false,
  "include_tax_in_product_price": false,
  "users": [1]
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/warehouses/164`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Warehouse 1",
  "address": "Babrujskaja 4, Minsk",
  "is_central": true,
  "is_manufacture": false,
  "current_team_id": 1589,
  "users": [1967]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/warehouses/3`


## packings

### GET index

`GET https://api.esupl.com/v1/teams/:team_id/packings`

**Path variables**

- `team_id` = `1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | unit | optional |  |
| `unit_id` | 2 | optional |  |
| `all` | false | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/:team_id/packings/:id`

**Path variables**

- `team_id` = `1`
- `id` = `1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | unit | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/:team_id/packings`

**Path variables**

- `team_id` = `1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "unit_id": 2,
  "name": "Box",
  "quantity": 10
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/:team_id/packings/:id`

**Path variables**

- `team_id` = `1`
- `id` = `1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "unit_id": 2,
  "name": "Box",
  "quantity": 15
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/:team_id/packings/:id`

**Path variables**

- `team_id` = `1`
- `id` = `1`


## predefined-comments

### GET index

`GET https://api.esupl.com/v1/teams/1/predefined-comments`

Gets the list of the predefined comments.

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[comment]` | ко | optional |  |
| `per_page` | 1 | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/predefined-comments/4`

Gets the information about the predefined comment.


### POST store

`POST https://api.esupl.com/v1/teams/1/predefined-comments`

Creates a new predefined comment.

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "type": "ticket_comment",
  "comment": "no sugar"
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/predefined-comments/1`

Updates the information about the unit.

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
    "type": "ticket_comment",
    "comment": "no salt"
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/predefined-comments/1`

Deletes the predefined comment.

