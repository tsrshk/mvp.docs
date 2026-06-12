# me

[← Back to index](README.md)

## GET show

`GET https://api.esupl.com/v1/me`

Gets information about the current user.

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `fields` | id,full_name | optional |  |
| `include` | role,roles,current_team:fields(id) | optional |  |


## GET warehouses

`GET https://api.esupl.com/v1/me/warehouses`

Gets assigned warehouses for the current user.


## PUT update

`PUT https://api.esupl.com/v1/me`

Updates information for the current user.

| Parameter | Type | Status | Description |
| --- | --- | --- | --- |
| full_name | `string` | required | `min:3`, `max:255` |
| email | `email` | required | `max:32` |
| phone | `string` | optional |  |
| phone_country | `string` | optional | Required if the parameters `phone` are present. `in:BY` |
| language | `string` | optional | `in:en,ru` |
| timezone | `string` | required | A valid timezone. `max:255` |

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "full_name": "Jphn Smith",
  "timezone": "Europe/Minsk",
  "email": "j.smith@gmail.com",
  "phone": "80336346766",
  "phone_country": "BY"
}
```


## PUT password

`PUT https://api.esupl.com/v1/me/password`

Updates the current user's password.

| Parameter | Type | Status | Description |
| --- | --- | --- | --- |
| current_password | `string` | required |  |
| password | `string` | required | `min:6`, `max:32` |
| password_confirmation | `string` | required | Should be equal with `password`. |

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "current_password": "1234567",
  "password": "gWwD3Vz759e2",
  "password_confirmation": "gWwD3Vz759e2"
}
```

