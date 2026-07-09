# Esupl API — offline documentation

> Mirrored locally from the Postman collection so we don't hit the web each time.
> Source: https://documenter.getpostman.com/view/158253/2sA3JFB4y8
> Raw collection (re-importable into Postman): [raw/collection.json](raw/collection.json)

The Esupl API follows the general patterns of REST. You can use the resources of a Esupl account (items, receipts, etc.) by making HTTPS requests to URLs that represent those resources. You can find description of all the endpoints here.

## Versioning

The Esupl API uses versioning. This documentation is for version 1 of the API. Version must be specified in the base URL, for example: `https://api.esupl.com/v1`

## Authentication

Personal access tokens are a simple way to make calls to the API. This authorization method suites best e.g. for periodically running scripts on data of your own account.

You can get your personal access token on the [corresponding page](https://app.esupl.com/integrations) in the admin panel of your account. For every call to the API you must include your access token in the Authorization header:

```
{
  Authorization: Bearer e71x9Y2uWL1ZkTNPepVys5xBF6mR...
}
```

Be aware that the personal access token is available for one year.

## Pagination

Some API endpoints paginate their responses to make the result set easier to handle.

## API rate limits

The Esupl API platform applies rate limits to the API requests that it receives.

## Date and time format

All dates and times in the API are in UTC. In requests you should specify dates and times in UTC. When processing responses you should convert dates and times to your local time.

## Authentication

Default auth: **bearer**. Most endpoints inherit a bearer token (`Authorization: Bearer {access_token}`).

## Endpoint index

- [me](me.md) — 4 endpoints
- [menu](menu.md) — 35 endpoints
- [warehouse](warehouse.md) — 67 endpoints
- [loyalty](loyalty.md) — 25 endpoints
- [handbooks](handbooks.md) — 47 endpoints
- [roles](roles.md) — 5 endpoints
- [members](members.md) — 5 endpoints
- [money-transaction-categories](money-transaction-categories.md) — 5 endpoints
- [money-transactions](money-transactions.md) — 5 endpoints
- [shifts](shifts.md) — 3 endpoints
- [shift-money-transactions](shift-money-transactions.md) — 5 endpoints
- [units](units.md) — 1 endpoints
