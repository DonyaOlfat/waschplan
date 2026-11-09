# Waschplan API

JSON under `/api`. A success body is a JSON object or array, or empty for `204`. An error body is:

```json
{ "error": { "code": "SLOT_TAKEN", "message": "This slot is already booked." } }
```

Timestamps in JSON are UTC ISO-8601 strings. `weekStart` is a `YYYY-MM-DD` date in Europe/Berlin.

The session cookie is named `session`. It is `httpOnly`, `SameSite=Lax`, `Path=/`, and lasts 30 days. It is `Secure` only when `NODE_ENV` is `production`. Send it as `Cookie: session=<token>`. Register does not set that cookie. Login does.

A logged-out caller on a route that uses the session gets `401 UNAUTHENTICATED`. `/houses/:slug/...` returns `404 NOT_FOUND` when the caller is not a member of that house, including when the house does not exist. A member without `ADMIN` on an admin route gets `403 FORBIDDEN`.

Invalid JSON is `400 VALIDATION_ERROR` with the message `Invalid JSON.` An unknown route is `404 NOT_FOUND`. An unexpected failure is `500 INTERNAL_ERROR`, message `Something went wrong.`, with no stack trace.

A house slug is lowercase letters and digits with single hyphens between them, no leading or trailing hyphen, at most 120 characters. Upcoming and future bookings are those with `startsAt` later than now. A booking that has already started is not upcoming.

Responses never include `password` or `passwordHash`.

## Error codes

| Code                     | Status | Message                                    |
| ------------------------ | ------ | ------------------------------------------ |
| `VALIDATION_ERROR`       | 400    | Invalid input.                             |
| `NOT_FOUND`              | 404    | Not found.                                 |
| `INVALID_INVITE_CODE`    | 404    | This invite code is not valid.             |
| `CONFLICT`               | 409    | This conflicts with existing data.         |
| `ALREADY_IN_HOUSE`       | 409    | You are already in a house.                |
| `LAST_ADMIN`             | 409    | A house must keep at least one admin.      |
| `MACHINE_NAME_TAKEN`     | 409    | A machine with this name already exists.   |
| `MACHINE_BROKEN`         | 409    | This machine is broken.                    |
| `BOOKING_LIMIT`          | 409    | You already have 2 upcoming bookings.      |
| `SLOT_TAKEN`             | 409    | This slot is already booked.               |
| `OUTSIDE_OPENING_HOURS`  | 422    | This time is outside opening hours.        |
| `OUTSIDE_BOOKING_WINDOW` | 422    | This time is outside the booking window.   |
| `SLOT_IN_PAST`           | 422    | This slot has already started.             |
| `EMAIL_TAKEN`            | 409    | An account with this email already exists. |
| `INVALID_CREDENTIALS`    | 401    | Email or password is incorrect.            |
| `UNAUTHENTICATED`        | 401    | You need to log in.                        |
| `FORBIDDEN`              | 403    | You are not allowed to do that.            |
| `TOO_MANY_REQUESTS`      | 429    | Too many login attempts. Try again later.  |
| `INTERNAL_ERROR`         | 500    | Something went wrong.                      |

`VALIDATION_ERROR` and some conflicts replace the default message. The sections below name those cases.

## Shapes

Public user for a member, from login and `GET /auth/me` when the user is in a house:

```json
{
  "id": "clxuser",
  "email": "lena@wittensteinstr.example",
  "name": "Lena",
  "createdAt": "2026-04-01T10:00:00.000Z",
  "houseSlug": "wittensteinstr-12",
  "role": "ADMIN"
}
```

`houseSlug` and `role` are `null` when the user is not in a house. Register returns this shape with those two fields set to `null`, and it does not send `Set-Cookie`. No `password` or `passwordHash`.

Public house:

```json
{
  "id": "clxhouse",
  "name": "Wittensteinstraße 12",
  "slug": "wittensteinstr-12",
  "inviteCode": "WUPP42",
  "role": "ADMIN",
  "createdAt": "2026-04-01T10:00:00.000Z"
}
```

`role` is the caller's role in that house.

Public machine:

```json
{
  "id": "clxmachine",
  "name": "Waschmaschine 1",
  "type": "WASHER",
  "isBroken": false,
  "createdAt": "2026-04-01T10:00:00.000Z"
}
```

`type` is `WASHER` or `DRYER`.

Public booking:

```json
{
  "id": "clxbooking",
  "machineId": "clxmachine",
  "startsAt": "2026-04-02T06:00:00.000Z",
  "endsAt": "2026-04-02T08:00:00.000Z",
  "status": "ACTIVE",
  "createdAt": "2026-04-01T10:00:00.000Z"
}
```

`status` is `ACTIVE` or `AFFECTED`.

## Health

### `GET /api/health`

No auth. `200`:

```json
{ "status": "ok" }
```

## Auth

### `POST /api/auth/register`

No auth. No `Set-Cookie`.

```http
POST /api/auth/register
Content-Type: application/json

{ "email": "ada@example.com", "name": "Ada", "password": "correct-horse" }
```

Email is trimmed, lowercased, a valid email address, and at most 254 characters. Name is trimmed and 1–80 characters. Password is 8–72 characters.

`201`:

```json
{
  "id": "clxada",
  "email": "ada@example.com",
  "name": "Ada",
  "createdAt": "2026-04-01T10:00:00.000Z",
  "houseSlug": null,
  "role": null
}
```

Codes: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`.

### `POST /api/auth/login`

No auth.

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "lena@wittensteinstr.example", "password": "waschplan" }
```

Email is trimmed, lowercased, a valid email address, and at most 254 characters. Password is 1–72 characters.

`200` with the public user and `Set-Cookie: session=...`. For Lena that body is the member example above.

After 10 attempts in 15 minutes from the same IP, the next login returns `429 TOO_MANY_REQUESTS`.

Codes: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 TOO_MANY_REQUESTS`.

### `POST /api/auth/logout`

No auth required. `204` with an empty body. Clears the cookie. A missing cookie still returns `204`.

### `GET /api/auth/me`

Session required. `200` with the public user. `houseSlug` and `role` are `null` when the user is not in a house.

Code: `401 UNAUTHENTICATED`.

## Houses

### `POST /api/houses`

Session required.

```http
POST /api/houses
Content-Type: application/json

{ "name": "Wittensteinstraße 12" }
```

Name is trimmed and 1–80 characters. `201` with the public house and `role` set to `ADMIN`.

A name with no letter or number is `400 VALIDATION_ERROR` with the message `Name must contain a letter or number.`

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `409 ALREADY_IN_HOUSE`, `409 CONFLICT` when a unique slug and invite code cannot be allocated.

### `POST /api/houses/join`

Session required.

```http
POST /api/houses/join
Content-Type: application/json

{ "inviteCode": "wupp42" }
```

The code is six characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, case-insensitive. `201` with the public house and `role` set to `RESIDENT`.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 INVALID_INVITE_CODE`, `409 ALREADY_IN_HOUSE`.

### `GET /api/houses/:slug`

Session and membership. `200` with the public house, including the caller's role and the invite code.

A slug that is not lowercase letters and digits with single hyphens between them, has a leading or trailing hyphen, or is longer than 120 characters, is `400 VALIDATION_ERROR`.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`.

### `POST /api/houses/:slug/leave`

Session and membership. `204`. Deletes that user's future bookings (`startsAt` later than now). The last admin cannot leave.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`, `409 LAST_ADMIN`.

## Machines

### `GET /api/houses/:slug/machines`

Session and membership. `200` with an array of public machines.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`.

### `POST /api/houses/:slug/machines`

Admin.

```http
POST /api/houses/wittensteinstr-12/machines
Content-Type: application/json

{ "name": "Trockner", "type": "DRYER" }
```

`type` is `WASHER` or `DRYER`. Name is trimmed and 1–80 characters. The body is a strict object. `201` with the public machine.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 MACHINE_NAME_TAKEN`.

### `PATCH /api/houses/:slug/machines/:id`

Admin. Two separate bodies, each a strict object. Sending both fields, or neither, is `400 VALIDATION_ERROR`.

`{ "name": "Waschmaschine 2" }` renames the machine.

`{ "isBroken": true }` marks it broken and turns future `ACTIVE` bookings on it into `AFFECTED`. `{ "isBroken": false }` restores future `AFFECTED` bookings to `ACTIVE` and does not check the 2-booking limit again. Future means `startsAt` later than now. Past bookings stay as they are.

`200` with the public machine.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND` when the machine is not in this house, `409 MACHINE_NAME_TAKEN` on rename.

### `DELETE /api/houses/:slug/machines/:id`

Admin. `204`. Deletes the machine and its bookings.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

## Week grid and bookings

Opening hours are Monday to Saturday, 06:00–22:00 Europe/Berlin, in 2-hour slots. Sunday is closed. A week runs Monday to Sunday in Berlin time. The booking window is the current Berlin week plus the next 3 weeks.

`BOOKING_LIMIT` counts upcoming `ACTIVE` bookings only, meaning `startsAt` later than now. `AFFECTED` bookings and `ACTIVE` bookings that have already started do not count.

### `GET /api/houses/:slug/machines/:id/week?start=2026-04-01`

Session and membership. `start` is `YYYY-MM-DD`. The grid is the Europe/Berlin week that contains that date, Monday through Sunday. `weekStart` is that Monday. There are 48 slots: Monday–Saturday, 06:00–22:00 Berlin, two hours each. Sunday is absent.

`200`. The `slots` array below is abbreviated:

```json
{
  "machineId": "clxmachine",
  "weekStart": "2026-03-30",
  "slots": [
    {
      "startsAt": "2026-03-30T04:00:00.000Z",
      "endsAt": "2026-03-30T06:00:00.000Z",
      "status": "past",
      "bookedBy": "Lena",
      "mine": true
    },
    {
      "startsAt": "2026-03-30T06:00:00.000Z",
      "endsAt": "2026-03-30T08:00:00.000Z",
      "status": "free"
    },
    {
      "startsAt": "2026-04-01T14:00:00.000Z",
      "endsAt": "2026-04-01T16:00:00.000Z",
      "status": "booked",
      "bookedBy": "Jonas",
      "mine": false
    },
    {
      "startsAt": "2026-04-02T06:00:00.000Z",
      "endsAt": "2026-04-02T08:00:00.000Z",
      "status": "affected",
      "bookedBy": "Jonas",
      "mine": false
    }
  ]
}
```

A slot that has already started has status `past`, even when someone booked it. After that, an `AFFECTED` booking is `affected`, the caller's `ACTIVE` booking is `mine`, another member's `ACTIVE` booking is `booked`, an empty slot on a broken machine is `broken`, and any other empty slot is `free`.

`bookedBy` and `mine` are included whenever a booking exists, including past and affected slots. `bookedBy` is the first word of the name. `mine` is true when the booking belongs to the caller. The slot has no booking id, email, or user id.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`.

### `POST /api/houses/:slug/bookings`

Session and membership.

```http
POST /api/houses/wittensteinstr-12/bookings
Content-Type: application/json

{ "machineId": "clxmachine", "startsAt": "2026-04-02T08:00:00.000+02:00" }
```

`startsAt` is an ISO datetime with an offset and must be a slot boundary. `201` with the public booking and `status` set to `ACTIVE`.

`409 BOOKING_LIMIT` when the caller already has 2 upcoming `ACTIVE` bookings in this house (`startsAt` later than now). `AFFECTED` bookings and `ACTIVE` bookings that have already started do not count.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`, `409 MACHINE_BROKEN`, `409 BOOKING_LIMIT`, `409 SLOT_TAKEN`, `422 OUTSIDE_OPENING_HOURS`, `422 OUTSIDE_BOOKING_WINDOW`, `422 SLOT_IN_PAST`.

### `GET /api/houses/:slug/bookings/me`

Session and membership. `200` with the caller's upcoming `ACTIVE` and `AFFECTED` bookings in this house. Upcoming means `startsAt` later than now. The list is sorted by `startsAt` and then `id`. Each booking includes `"machine": { "id", "name", "type" }`.

```json
[
  {
    "id": "clxbooking",
    "machineId": "clxmachine",
    "startsAt": "2026-04-02T06:00:00.000Z",
    "endsAt": "2026-04-02T08:00:00.000Z",
    "status": "ACTIVE",
    "createdAt": "2026-04-01T10:00:00.000Z",
    "machine": {
      "id": "clxmachine",
      "name": "Waschmaschine 1",
      "type": "WASHER"
    }
  }
]
```

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 NOT_FOUND`.

### `DELETE /api/houses/:slug/bookings/:id`

Session and membership. The owner or an admin can cancel an upcoming booking. The row is hard-deleted. `204`.

A resident who cancels someone else's booking gets `403 FORBIDDEN`. A booking that has already started gets `422 SLOT_IN_PAST`.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `422 SLOT_IN_PAST`.

## Admin

### `GET /api/houses/:slug/members`

Admin. `200` with this house's members, sorted by membership `createdAt` and then `name`:

```json
[
  {
    "userId": "clxuser",
    "name": "Lena",
    "email": "lena@wittensteinstr.example",
    "role": "ADMIN"
  }
]
```

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

### `POST /api/houses/:slug/invite-code`

Admin. No body. `200` with the public house, `role` set to `ADMIN`, and the new `inviteCode`. The old code stops working.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT` when a new unique code cannot be allocated.

### `PATCH /api/houses/:slug/members/:userId`

Admin.

```http
PATCH /api/houses/wittensteinstr-12/members/clxuser
Content-Type: application/json

{ "role": "RESIDENT" }
```

`role` is `ADMIN` or `RESIDENT`. `200` with `{ "userId", "name", "email", "role" }`.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 LAST_ADMIN`.

### `DELETE /api/houses/:slug/members/:userId`

Admin. `204`. Deletes that member's future bookings (`startsAt` later than now). The last admin cannot be removed.

Codes: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 LAST_ADMIN`.
