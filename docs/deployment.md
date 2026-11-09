# Deployment

Do this after the deploy pull request is on `main`. Create the Neon and Render accounts then. The connection string stays out of the repo. `server/prisma/schema.prisma` keeps a single `url = env("DATABASE_URL")`.

Request and response shapes are the ones in [api.md](api.md).

## Neon

Create a Neon project in Frankfurt, `eu-central-1`.

`DATABASE_URL` is the direct `postgresql://` connection string. Use the host without `-pooler`. A host containing `-pooler` makes `prisma migrate deploy` fail. The start command on Render runs that migration before the server listens.

## Render

Create the web service from `render.yaml` on `main`. The blueprint is one free Node service, `waschplan-api`, in Frankfurt. It has no database of its own.

The dashboard prompts for `DATABASE_URL` and `CORS_ORIGINS`. Paste the direct Neon string into `DATABASE_URL`. `CORS_ORIGINS` can be `http://localhost:5173` until the frontend has an address. Leave `PORT` unset. Render sets it.

`NODE_VERSION` is 24 and `NODE_ENV` is production. The start command is `npm run start:prod -w server`.

The free service sleeps after 15 minutes without a request. The next request takes about a minute. Render's health check is `GET /api/health`.

## Live check

Use the HTTPS URL Render shows for the service, and a cookie jar. The first request after sleep can take about a minute. Curl sends no `Origin`, so this check does not depend on `CORS_ORIGINS`.

`GET /api/health` returns `200`:

```json
{ "status": "ok" }
```

Then register, log in, create a house, create one machine, and create one booking. Register leaves the jar empty. Login writes the `session` cookie. In production that cookie is `Secure`, so curl must use HTTPS.

```bash
BASE=https://waschplan-api.onrender.com
JAR=cookies.txt

curl "$BASE/api/health"

curl -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","name":"Ada","password":"correct-horse"}'

curl -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"correct-horse"}'

curl -b "$JAR" -X POST "$BASE/api/houses" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Wittensteinstraße 12"}'
```

Register returns `201` and does not send `Set-Cookie`. Login returns `200` and stores the cookie in `$JAR`. The house returns `201` with a `slug`. Set `SLUG` from that field, then create one machine:

```bash
curl -b "$JAR" -X POST "$BASE/api/houses/$SLUG/machines" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Waschmaschine 1","type":"WASHER"}'
```

That returns `201` with an `id`. Set `MACHINE_ID` from it.

For `STARTS_AT`, pick a Monday–Saturday Europe/Berlin slot that is still inside the booking window on the day of the check. The window is the current Berlin week plus the next three weeks. A week runs Monday to Sunday. Slot starts are 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, and 20:00 Europe/Berlin, and the slot must still be in the future. Send `startsAt` as an ISO-8601 datetime with the Berlin offset for that day: `+01:00` in winter and `+02:00` in summer. Use a fresh instant for the day you check. The April 2026 examples in [api.md](api.md) are outside that window.

```bash
curl -b "$JAR" -X POST "$BASE/api/houses/$SLUG/bookings" \
  -H 'Content-Type: application/json' \
  -d "{\"machineId\":\"$MACHINE_ID\",\"startsAt\":\"$STARTS_AT\"}"
```

A booking inside the window returns `201` with `"status": "ACTIVE"`.

## Frontend cookie

The Render host and a Vercel host are different sites, so the browser can refuse the session cookie. The frontend will route `/api` through its own host. This step does not build that route.

## Release

Merge the release pull request only after the live check. That merge creates v0.1.0.
