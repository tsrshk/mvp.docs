# warehouse

[← Back to index](README.md)

## wastes

### GET index

`GET https://api.esupl.com/v1/teams/:team_id/wastes`

**Path variables**

- `team_id` = `1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | items.limits | optional |  |
| `name` | %4% | optional |  |
| `operator[name]` | like | optional |  |

**Headers**

- `Content-Type: application/json`


### GET show

`GET https://api.esupl.com/v1/teams/:team_id/wastes/:id`

**Path variables**

- `team_id` = `1`
- `id` = `1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | user,warehouse,items | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/wastes`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
	"warehouse_id": 1,
	"reason_id": 1,
	"comment": "comment...",
	"event_date": "2019-05-26T00:00:00.000Z",
	
	"items": [
		{
			"id": 1,
			"type": "ingredient",
			"quantity": 100
		}
	]
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/wastes/1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
	"warehouse_id": 1,
	"reason_id": 1,
	"comment": "comment...",
	"event_date": "2019-05-26T00:00:00.000Z",
	
	"items": [
		{
			"id": 1,
			"type": "product",
			"quantity": 100
		}	
	]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/wastes/1`


### POST submit

`POST https://api.esupl.com/v1/teams/1/wastes/1/submit`

**Headers**

- `Content-Type: application/json`


## outgoing-invoices

### GET index

`GET https://api.esupl.com/v1/teams/1/outgoing-invoices`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[q]` | ингр | optional |  |
| `include` | items.unit,items.packing | optional |  |
| `filter[is_submitted]` | false | optional |  |

**Headers**

- `Content-Type: application/json`


### GET show

`GET https://api.esupl.com/v1/teams/1/outgoing-invoices/:id`

**Path variables**

- `id` = `1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | items.unit,items.packing | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/outgoing-invoices`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "team_id": 1,
  "supplier_id": 1,
  "warehouse_id": 1,
  "invoice_number": "1234",
  "comment": "optional comment",
  "event_date": "2024-07-27T00:00:00.000Z",
  "items": [
    {
      "id": 1,
      "type": "ingredient",
      "unit_id": 1,
      "packing_id": 1,
      "price": 10,
      "quantity": 3,
      "tax_rate": 10
    }
  ]
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/outgoing-invoices/:id`

**Path variables**

- `id` = `1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "team_id": 1,
  "supplier_id": 1,
  "warehouse_id": 1,
  "invoice_number": "1234",
  "comment": "optional comment",
  "event_date": "2024-07-27T00:00:00.000Z",
  "items": [
    {
      "id": 1,
      "type": "ingredient",
      "unit_id": 1,
      "packing_id": null,
      "price": 5,
      "quantity": 10
    }
  ]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/outgoing-invoices/:id`

**Path variables**

- `id` = `1`


### POST submit

`POST https://api.esupl.com/v1/teams/1/outgoing-invoices/:id/submit`

**Path variables**

- `id` = `1`

**Headers**

- `Content-Type: application/json`


### POST cancel

`POST https://api.esupl.com/v1/teams/1/outgoing-invoices/:id/cancel`

**Path variables**

- `id`

**Headers**

- `Content-Type: application/json`


## movements

### GET index

`GET https://api.esupl.com/v1/teams/1/movements`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | items | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/movements/:id`

**Path variables**

- `id` = `1`


### POST store

`POST https://api.esupl.com/v1/teams/1/movements`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "warehouse_from_id": 1,
  "warehouse_to_id": 2,
  "comment": "optional comment",
  "event_date": "2019-05-26T00:00:00.000Z",
  "items": [
    {
      "id": 1,
      "type": "menu_product_modification",
      "quantity": 10
    }
  ]
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/movements/:id`

**Path variables**

- `id` = `1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "warehouse_from_id": 1,
  "warehouse_to_id": 2,
  "reason_id": 1,
  "comment": "optional comment",
  "event_date": "2019-05-26T00:00:00.000Z",
  "items": [
    {
      "id": 1,
      "type": "dish",
      "quantity": 10
    }
  ]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/movements/:id`

**Path variables**

- `id` = `1`


### POST submit

`POST https://api.esupl.com/v1/teams/1/movements/:id/submit`

**Path variables**

- `id` = `1`

**Headers**

- `Content-Type: application/json`


## movement-requests

### GET index

`GET https://api.esupl.com/v1/teams/1/movement-requests`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | items | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/movement-requests/:id`

**Path variables**

- `id` = `1`


### POST store

`POST https://api.esupl.com/v1/teams/1/movement-requests`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "warehouse_from_id": 1,
  "warehouse_to_id": 1,
  "comment": "optional comment",
  "event_date": "2019-05-26T00:00:00.000Z",
  "items": [
    {
      "id": 1,
      "type": "menu_product_modification",
      "quantity": 10
    }
  ]
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/movement-requests/:id`

**Path variables**

- `id` = `1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "warehouse_from_id": 1,
  "warehouse_to_id": 2,
  "reason_id": 1,
  "comment": "optional comment",
  "event_date": "2019-05-26T00:00:00.000Z",
  "items": [
    {
      "id": 1,
      "type": "dish",
      "quantity": "1"
    }
  ]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/movement-requests/:id`

**Path variables**

- `id` = `1`


## productions

### GET index

`GET https://api.esupl.com/v1/teams/1/productions`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | items | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/productions/:id`

**Path variables**

- `id`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | items | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/productions`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "warehouse_id": 1,
  "comment": "comment...",
  "event_date": "2019-05-26T00:00:00.000Z",

  "items": [
    {
      "id": 1,
      "type": "preparation",
      "quantity": 5
    }
  ]
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/productions/:id`

**Path variables**

- `id`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
    "warehouse_id": 126,
    "comment": "",
    "event_date": "2020-10-27T18:49:03.000Z",
    "items": [
        {
            "id": 1,
            "type": "preparation",
            "quantity": 5,
            "manually_defined_gross_values": [
                {
                    "item_id": 1,
                    "item_type": "ingredient",
                    "quantity": 9.3
                }
            ]
        }
    ]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/productions/1`


### POST submit

`POST https://api.esupl.com/v1/teams/1/productions/1/submit`

**Headers**

- `Content-Type: application/json`


### POST cancel

`POST https://api.esupl.com/v1/teams/1/productions/3022/cancel`

**Headers**

- `Content-Type: application/json`


## inventory-counts

### GET index

`GET https://api.esupl.com/v1/teams/1/inventory-counts?fields=id,start_date,end_date&is_submitted=1&all=true`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | warehouse,user | optional |  |
| `include[]` | user | optional |  |
| `fields` | id,start_date,end_date | yes |  |
| `is_submitted` | 1 | yes |  |
| `all` | true | yes |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/inventory-counts/1`


### PUT update

`PUT https://api.esupl.com/v1/teams/1/inventory-counts/1`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
	"event_date": "2019-05-26T00:00:00.000Z"
}
```


### POST submit

`POST https://api.esupl.com/v1/teams/1/inventory-counts/7/submit`

**Headers**

- `Content-Type: application/json`


## inventory-count-items

### GET index

`GET https://api.esupl.com/v1/teams/1/inventory-counts/1098/items?warehouse_id=240&sort=desc.difference`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `warehouse_id` | 240 | yes |  |
| `sort` | desc.difference | yes |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/inventory-counts/1/items`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "item_id": 3,
  "item_type": "product",
  "actual_remains": 33
}
```


## remain-adjustments

### POST store

`POST https://api.esupl.com/v1/teams/1/remain-adjustments`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "warehouse_id": 20,
  "item_id": 38,
  "item_type": "ingredient",
  "type": "update",
  "actual_remains": 44,
  "comment": "optional comment"
}
```


## inventory-items

### GET index

`GET https://api.esupl.com/v1/teams/1/inventory-items`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `exclude_modification_id` | 5 | optional |  |
| `page` | 3 | optional |  |
| `name` | %25A30%25 | optional |  |
| `operator[name]` | like | optional |  |
| `type[]` | dish | optional |  |
| `type[]` | menu_product_modification | optional |  |
| `type[]` | household_good | optional |  |
| `type[]` | ingredient | optional |  |
| `include_all_modifications` | true | optional |  |
| `purpose` | outgoing_invoice_items | optional |  |
| `filter[barcode]` | 111111 | optional |  |


### GET sellable

`GET https://api.esupl.com/v1/teams/3/inventory-items/sellable`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `exclude_modification_id` | 5 | optional |  |
| `page` | 1 | optional |  |
| `per_page` | 25 | optional |  |
| `name` | %% | optional |  |
| `operator[name]` | like | optional |  |
| `warehouse_id` | 136 | optional |  |
| `include_all_modifications` | true | optional |  |
| `menu_category_id` | %00 | optional |  |


## remains

### GET index

`GET https://api.esupl.com/v1/teams/43/remains`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `name` | %бумажн% | optional |  |
| `operator[name]` | like | optional |  |
| `type[]` | ingredient | optional |  |
| `name` | %зу% | optional |  |
| `per_page` | 50 | optional |  |
| `page` | 1 | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/remains/item`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `item_id` | 38 | optional |  |
| `item_type` | ingredient | optional |  |
| `warehouse_id` | 20 | optional |  |


### GET warehouses

`GET https://api.esupl.com/v1/teams/1/remains/item/warehouses`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `item_id` | 38 | optional |  |
| `item_type` | ingredient | optional |  |
| `warehouse_id` | 20 | optional |  |


## sales

### GET index

`GET https://api.esupl.com/v1/teams/1/sales`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | user,items,terminal:fields(id%7Cname),outlet:fields(id%7Cname),table:fields(id%7Cname),customer:fields(id%7Cfull_name),payments:fields(id%7Cpayment_type%7Camount),payments.payment_method:fields(id%7Cname) | optional |  |
| `name` | %251864796%25 | optional |  |
| `operator[name]` | like | optional |  |
| `event_date[start]` | 2022-05-17+21:00:00 | optional |  |
| `event_date[end]` | 2022-05-18+20:59:59 | optional |  |
| `per_page` | 10 | optional |  |
| `page` | 1 | optional |  |
| `sort` | desc.event_date | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/wastes/7`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | user,warehouse,items | optional |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/sales`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "terminal_id": 1,
  "warehouse_id": 1,
  "type": "sale",
  "total_sum": 1000,
  "event_date": "2024-10-01T00:00:00.000Z",
  "payment_method": "cash",
  "items": [
    {
      "id": 1,
      "type": "dish",
      "quantity": 10,
      "cost": 100
    }
  ]
}
```


### PUT update

`PUT https://api.esupl.com/v1/teams/1/sales/973288`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "terminal_id": 1,
  "warehouse_id": null,
  "event_date": "2024-10-01T12:05:00.000Z",
  "type": "sale",
  "total_sum": 8.8,
  "payment_method": "card",
  "items": [
    {
      "id": 5,
      "type": "menu_product_modification",
      "quantity": 1,
      "cost": 3.5
    },
    {
      "id": 8,
      "type": "menu_product_modification",
      "quantity": 1,
      "cost": 3.5
    },
    {
      "id": 146,
      "type": "menu_product_modification",
      "quantity": 1,
      "cost": 1.8
    }
  ]
}
```


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/sales/1`


### POST submit

`POST https://api.esupl.com/v1/teams/1/sales/1864675/submit`


### POST cancel

`POST https://api.esupl.com/v1/teams/1/sales/1864864/cancel`


### GET activities

`GET https://api.esupl.com/v1/teams/1/sales/2168426/activities`


## orders

### GET index

`GET https://api.esupl.com/v1/teams/1/orders`

Gets all orders for the team.

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `fields` | id | optional |  |
| `include` | warehouse | optional |  |
| `type[]` | 3 | optional |  |
| `type[]` | 4 | optional |  |


### GET show

`GET https://api.esupl.com/v1/teams/1/orders/10171?include=products.original_product,attachments`

Gets the specified order.

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | products.original_product,attachments | yes |  |


### POST store

`POST https://api.esupl.com/v1/teams/1/orders`

Creates a new order.

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "team_to_id": 2
}
```


### POST repeat

`POST https://api.esupl.com/v1/teams/1/orders/1/repeat`

Repeats the specified order.

**Headers**

- `Content-Type: application/json`

**Request body** (raw)


### PUT update

`PUT https://api.esupl.com/v1/teams/1/orders/1`

Updates the information about the order.

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "expected_delivery_date": null
}
```


### PUT handle

`PUT https://api.esupl.com/v1/teams/1/orders/1/handle`

Handles a status change of the specified order.


### PUT complete

`PUT https://api.esupl.com/v1/teams/1/orders/42490/complete`

Handles a status change of the specified order.


### PUT cancel

`PUT https://api.esupl.com/v1/teams/1/orders/1/cancel`

Handles a status change of the specified order.


### PUT combine

`PUT https://api.esupl.com/v1/teams/1/orders/1/combine`

Combines the specified list of orders by supplier.

| Parameter | Type | Status | Description |
| --- | --- | --- | --- |
| ids | `array(integer)` | required | `max:500` |


### PUT move

`PUT https://api.esupl.com/v1/teams/1/orders/1/move`

Moves the specified orders to the specified team.

| Parameter | Type | Status | Description |
| --- | --- | --- | --- |
| ids | `array(integer)` | required | `max:500` |
| team_id | `integer` | required |  |


### POST add

`POST https://api.esupl.com/v1/teams/1/orders/add`

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
    "total": {
        "warehouse_id": 67,
        "team_from_id": 1589,
		"discount": 50,
		"discount_type": 2,
		"contract": "qwerty",
		"invoice_number": "7300779677",
		"delivery_date": "2021-02-20T00:00:00.000Z"
	},
	"supplier": {
		"id": 149,
		"name": "New Supplier",
		"currency_id": 1
	},
	"products": [
		{
			"category_id": 2,
			"unit_id": 13,
			"name": "Product name 123",
			"price": 150.37,
			"sku": "f34rot6",
			"quantity": 2,
			"id": 12
		},
        {
			"category_id": 2,
			"unit_id": 13,
			"name": "Product name 123",
			"price": 107.8,
			"sku": "f34rot6",
			"quantity": 2,
			"id": 1
		},
        {
			"category_id": 2,
			"unit_id": 13,
			"name": "Product name 123",
			"price": 107.8,
			"sku": "f34rot6",
			"quantity": 2,
			"uniqueKey": "asdas"
		}
	]
}
```


### POST scan

`POST https://api.esupl.com/v1/teams/3/orders/scan`

**Headers**

- `Content-Type: application/x-www-form-urlencoded`

**Request body** (formdata)

- `invoices[0][attachments][]` (file) = 
- `invoices[0][auto_submit_after_scanning]` (text) = 1
- `invoices[0][warehouse_id]` (text) = 163


### POST create-invoice

`POST https://api.esupl.com/v1/orders/6/invoice`

**Headers**

- `Authorization: Bearer {access_token}`

**Request body** (formdata)

- `delivery_date` (text) = 2019-03-01T00:00:00.000Z
- `invoice_number` (text) = 1111-test
- `contract` (text) = 1111
- `warehouse_id` (text) = 32


### POST submit

`POST https://api.esupl.com/v1/teams/1/orders/7/submit`


### DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/orders/28335`


## GET waste-reasons

`GET https://api.esupl.com/v1/waste-reasons`

