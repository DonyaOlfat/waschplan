# Waschplan: Backend Spec (v0.1, JavaScript)

A laundry room booking app for German apartment buildings. Residents join their building with an invite code and book washing machine or dryer slots on a weekly grid.

The core engineering problem: two people must never book the same slot. This is enforced by a database unique constraint, not only by a UI check.

## Stack

- **Runtime:** Node.js LTS, Express 5, JavaScript with ES modules. No TypeScript.
- **Database:** PostgreSQL with Prisma. Postgres runs locally with Docker Compose (separate `waschplan_dev` and `waschplan_test` databases).
- **Validation:** Zod for request bodies, query strings and route params.
- **Auth:** email + password. Passwords hashed with bcrypt. Sessions stored in the database, sent as an `httpOnly` cookie.
- **Time:** Luxon for all Europe/Berlin date handling.
- **Tests:** Vitest + Supertest against the test database.
- **Tooling:** ESLint, Prettier, commitlint, husky, GitHub Actions, release-please.
- **Deployment:** Render (API) + Neon (Postgres).
- **Repo layout:** `server/` now, `client/` (React + Vite) later.

## Domain rules

### Houses and membership

- A logged-in user creates a house and becomes its `ADMIN`.
- **One house per user.** `Membership.userId` is unique. Creating or joining while already in a house returns `409 ALREADY_IN_HOUSE`.
- Each house gets a unique slug from its name (for example `wittensteinstr-12`), with a suffix if the name is taken.
- Each house gets a 6-character invite code:
  - characters A–Z and 2–9, without the look-alikes 0, O, 1, I and L;
  - unique across all houses;
  - case-insensitive when entered;
  - the admin can regenerate it, and the old code stops working.
- Joining with a valid code creates a `RESIDENT` membership.
- Members can leave with `POST /houses/:slug/leave`. Leaving deletes their future bookings.
- A house must always keep at least one admin. Anything that would leave it without one returns `409 LAST_ADMIN`.
- Every `/houses/:slug/...` endpoint requires membership. Non-members get `404`, so the API doesn't reveal which houses exist. Members without the admin role get `403` on admin endpoints.

### Machines

- Fields: `type` (`WASHER` or `DRYER`), `name` (unique within the house), `isBroken`.
- Admins can create, rename and delete machines. Deleting a machine deletes its bookings.

### Slots

- Slots are computed, not stored.
- **Opening hours:** Monday to Saturday, 06:00–22:00 Europe/Berlin, 2-hour slots (8 per day, 48 per week). Sunday is closed (Sonntagsruhe).
- A week runs Monday to Sunday in Berlin time.
- `startsAt` and `endsAt` are stored in UTC.
- The server rejects a `startsAt` that is not exactly on a slot boundary, and any slot outside opening hours (`422 OUTSIDE_OPENING_HOURS`).
- **Booking window:** the current week plus the next 3 weeks, in Berlin time. Anything outside returns `422 OUTSIDE_BOOKING_WINDOW`.
- Tests must cover both daylight-saving switch Sundays (last Sunday of March and of October).

### Booking rules

All checked on the server, inside one database transaction:

1. The user is a member of the house, and the machine belongs to that house.
2. The machine is not broken (`409 MACHINE_BROKEN`).
3. `startsAt` is in the future and inside the booking window.
4. The user has fewer than 2 upcoming `ACTIVE` bookings in the house. This check must be race-safe: lock the user's membership row with `SELECT … FOR UPDATE` inside the transaction.
5. No double bookings: the database enforces `@@unique([machineId, startsAt])`. Prisma error `P2002` becomes `409 SLOT_TAKEN`.

### Cancelling

- The owner can cancel their own upcoming booking. Admins can cancel any upcoming booking.
- Cancelling **hard-deletes** the row. Soft-deleted rows would keep blocking the slot because of the unique constraint.
- Past bookings can't be cancelled (`422`).

### Machine broken

- Admins toggle `isBroken`.
- **Broken:** in one transaction, every future `ACTIVE` booking on that machine becomes `AFFECTED`. New bookings on the machine are rejected.
- **Repaired:** every future `AFFECTED` booking on that machine becomes `ACTIVE` again. The 2-booking limit is checked only at booking time, not when bookings are restored.
- `AFFECTED` bookings don't count toward the 2-booking limit.
- Past bookings are never changed.

### Admin powers

- Create, rename and delete machines.
- Toggle a machine as broken.
- Regenerate the invite code.
- List and remove members. Removing a member deletes their future bookings.
- Cancel anyone's booking.
- Promote and demote members (the last admin rule applies).

### My bookings

- The user's upcoming bookings in their house, `ACTIVE` and `AFFECTED`, sorted by start time.

### Week grid

- Each slot has a ready-made status: `free`, `booked`, `mine`, `past`, `broken` or `affected`.
- Other members can see who booked a slot by first name only.

## Data model (sketch)

```prisma
model User       { id, email @unique, name, passwordHash, createdAt }
model Session    { id, userId, expiresAt }
model House      { id, name, slug @unique, inviteCode @unique, createdAt }
model Membership { id, userId @unique, houseId, role Role, createdAt }
model Machine    { id, houseId, name, type MachineType, isBroken, createdAt   @@unique([houseId, name]) }
model Booking    { id, machineId, userId, startsAt, endsAt, status BookingStatus, createdAt
                   @@unique([machineId, startsAt])  @@index([userId, startsAt]) }

enum Role          { ADMIN RESIDENT }
enum MachineType   { WASHER DRYER }
enum BookingStatus { ACTIVE AFFECTED }
```

## API

REST with JSON, all routes under `/api`.

| Area | Endpoints | Frontend page (later) |
|---|---|---|
| Health | `GET /health` | |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | `/login` |
| Houses | `POST /houses`, `POST /houses/join`, `GET /houses/:slug`, `POST /houses/:slug/leave` | `/`, `/join` |
| Machines | `GET /houses/:slug/machines`, `POST /houses/:slug/machines`, `PATCH /houses/:slug/machines/:id`, `DELETE /houses/:slug/machines/:id` | `/house/[slug]`, `/house/[slug]/admin` |
| Week grid | `GET /houses/:slug/machines/:id/week?start=YYYY-MM-DD` | `/house/[slug]` |
| Bookings | `POST /houses/:slug/bookings`, `DELETE /houses/:slug/bookings/:id`, `GET /houses/:slug/bookings/me` | `/house/[slug]/me` |
| Admin | `GET /houses/:slug/members`, `PATCH /houses/:slug/members/:userId`, `DELETE /houses/:slug/members/:userId`, `POST /houses/:slug/invite-code` | `/house/[slug]/admin` |

`GET /auth/me` returns the user plus their house slug and role, or `null` if they're not in a house.

### Error format

```json
{ "error": { "code": "SLOT_TAKEN", "message": "This slot is already booked." } }
```

Status codes: `400` invalid input, `401` not logged in, `403` not allowed, `404` not found or not a member, `409` conflict, `422` rule violation, `500` unexpected (never leaks a stack trace).

## Out of scope for backend v0.1

Frontend, iCal export, email reminders, password reset and email verification.
