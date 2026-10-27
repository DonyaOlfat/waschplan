# Waschplan: Backend Plan

The backend is split into 14 pull requests plus one manual setup step. Each step is one GitHub issue, one branch and one PR, made of small Conventional Commits. All conventions are in [AGENTS.md](../AGENTS.md); the rules of the app are in [spec.md](spec.md).

**Workflow per step:** give the step to the planning agent, review its plan, then give the approved plan to the implementation agent.

## Releases

- release-please uses the `simple` release type, a manifest starting at `0.0.0`, and `bump-minor-pre-major: true`.
- It keeps one release PR open and updates it with every merge. Merge it only after step 14, which creates **v0.1.0**.

---

## Step 0: Manual setup in GitHub (you, not an agent)

1. Install Docker Desktop.
2. Create an empty GitHub repository called `waschplan`, then in this folder run `git init`, commit the docs and push to `main`.
3. Settings → General: allow only **Rebase merging**, and turn on "Automatically delete head branches".
4. Settings → Actions → General: turn on **"Allow GitHub Actions to create and approve pull requests"** (needed by release-please).
5. Create the milestone "Backend MVP v0.1.0" and one issue per step below, using the issue titles.
6. After step 2 is merged: protect `main`, require the CI checks to pass and require linear history.

---

## Step 1: Project scaffold

- **Issue/PR:** `chore: scaffold express server` · branch `chore/1-scaffold`
- **Scope:**
  - Root `package.json` for development tools only.
  - `server/` with an Express 5 app; `app.js` (app setup) separate from `server.js` (starts listening) so tests can use Supertest.
  - Environment variables validated with Zod.
  - `GET /api/health`.
  - ESLint, Prettier, `.nvmrc`, `.editorconfig`, `.gitignore`, Vitest with Supertest.
- **Done when:** `npm run dev`, `npm run lint` and `npm test` work, and the health check test passes.

```
chore: initialize server package with es modules and scripts
chore: add eslint, prettier and editorconfig
feat(api): add express app with health endpoint
test(api): add vitest and supertest health check
docs: add readme with local setup
```

## Step 2: CI, commit linting and release automation

- **Issue/PR:** `ci: add ci, commitlint and release-please` · branch `ci/2-pipeline`
- **Scope:**
  - GitHub Actions workflow that runs lint and tests on every PR.
  - commitlint, locally through a husky `commit-msg` hook and in CI on the PR's commits.
  - release-please workflow with `release-please-config.json` and `.release-please-manifest.json` (`0.0.0`).
  - PR and issue templates.
- **Done when:** a PR with a commit like `bad message` fails CI, and a valid PR passes.

```
ci: run lint and tests on pull requests
ci: lint commit messages with commitlint
chore: add husky commit-msg hook
ci: add release-please workflow and config
chore: add pull request and issue templates
```

## Step 3: Database and schema

- **Issue/PR:** `feat(db): add postgres, prisma schema and seed` · branch `feat/3-database`
- **Scope:**
  - Docker Compose with Postgres and two databases, `waschplan_dev` and `waschplan_test`.
  - Full Prisma schema: User, Session, House, Membership (`userId` unique), Machine, Booking with `@@unique([machineId, startsAt])`, enums and indexes.
  - Initial migration and a shared Prisma client.
  - Seed script with a realistic Wuppertal house, residents and machines.
  - Helper that resets the test database between tests.
  - Postgres service in the CI test job.
- **Done when:** `docker compose up`, `prisma migrate dev` and `npm run seed` work, and CI passes with the database.

```
build(db): add docker compose for postgres
feat(db): add prisma schema for users, houses, machines and bookings
feat(db): add initial migration
feat(db): add seed script with demo house in wuppertal
test(db): set up test database and reset helper
ci: add postgres service to test job
```

## Step 4: Error handling and validation

- **Issue/PR:** `feat(api): add error handling and request validation` · branch `feat/4-errors`
- **Scope:**
  - `AppError` class and a central list of error codes.
  - Error middleware that returns `{ error: { code, message } }`.
  - Zod validation middleware for body, query and params.
  - Prisma `P2002` → `409`, `P2025` → `404`.
  - 404 response for unknown routes.
- **Done when:** tests cover a 400 for invalid input, a 404 for unknown routes and a 500 that doesn't leak the stack trace.

```
feat(api): add app error class and error codes
feat(api): add central error handler and not-found route
feat(api): add zod validation middleware
feat(api): map prisma errors to http errors
test(api): cover error responses
```

## Step 5: Authentication

- **Issue/PR:** `feat(auth): add email and password authentication` · branch `feat/5-auth`
- **Scope:**
  - `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (includes house slug and role, or `null`).
  - bcrypt password hashing.
  - Session row with a random token; cookie `httpOnly`, `SameSite=Lax`, `Secure` in production.
  - `requireAuth` middleware.
  - Rate limiting on login.
- **Done when:** tests cover a duplicate email, a wrong password, logout invalidating the session and a 401 on a protected route. The password hash never appears in a response.

```
feat(auth): add password hashing helpers
feat(auth): add register endpoint
feat(auth): add login and logout with session cookie
feat(auth): add require-auth middleware and me endpoint
feat(auth): rate limit login attempts
test(auth): cover register, login, logout and protected routes
```

## Step 6: Houses and membership

- **Issue/PR:** `feat(house): create, join and leave houses` · branch `feat/6-houses`
- **Scope:**
  - Slug and invite code generators (6 characters, no ambiguous characters).
  - `POST /houses`: house and creator's `ADMIN` membership in one transaction.
  - `POST /houses/join`: code is case-insensitive.
  - `GET /houses/:slug`.
  - `POST /houses/:slug/leave`: deletes the user's future bookings; the last admin can't leave.
  - `requireMember` (non-members get 404) and `requireAdmin` (non-admins get 403) middleware.
- **Done when:** tests cover `ALREADY_IN_HOUSE`, an invalid code, the non-member guard and `LAST_ADMIN`.

```
feat(house): add slug and invite code generators
feat(house): create house and make creator admin
feat(house): join house with invite code
feat(house): add member and admin guards
feat(house): get house details and leave house
test(house): cover create, join, leave and guards
```

## Step 7: Time and slot engine (pure functions, no HTTP)

- **Issue/PR:** `feat(slots): add berlin time slot engine` · branch `feat/7-slots`
- **Scope:** Luxon helpers that:
  - find the start of a week (Monday 00:00 Berlin) for any date;
  - generate a week's slots in UTC (Monday to Saturday, 06:00–22:00, 2 hours each);
  - check that a start time is exactly on a slot boundary;
  - check that a time is inside the booking window (current week plus 3 more);
  - check whether a slot is in the past.
- **Done when:** unit tests cover both DST switch days (29 March 2026 and 25 October 2026), Sunday being closed, start times between slots such as 07:00, and the edges of the booking window.

```
feat(slots): add berlin time helpers
feat(slots): generate weekly slots for opening hours
feat(slots): validate slot starts and booking window
test(slots): cover dst switches, sunday closure and window edges
```

## Step 8: Machines

- **Issue/PR:** `feat(machine): manage machines per house` · branch `feat/8-machines`
- **Scope:**
  - `GET /houses/:slug/machines` for all members.
  - Admin only: `POST` (create), `PATCH` (rename; not the broken flag yet), `DELETE` (also deletes its bookings).
  - Machine names unique within a house.
- **Done when:** tests cover a resident getting 403, a duplicate name getting 409, and bookings being deleted with their machine.

```
feat(machine): list machines of a house
feat(machine): let admins create and rename machines
feat(machine): let admins delete machines
test(machine): cover machine management and permissions
```

## Step 9: Creating bookings (the core engineering part)

- **Issue/PR:** `feat(booking): create bookings with conflict protection` · branch `feat/9-create-booking`
- **Scope:**
  - `POST /houses/:slug/bookings` with `{ machineId, startsAt }`.
  - One transaction:
    1. Lock the user's membership row with `SELECT … FOR UPDATE`.
    2. Check the slot is valid and in the future.
    3. Check the booking window and that the machine isn't broken.
    4. Count the user's upcoming `ACTIVE` bookings (must be fewer than 2).
    5. Insert the booking.
  - `P2002` from the unique constraint → `409 SLOT_TAKEN`.
- **Done when:** every rule has a test, plus two concurrency tests:
  - two users book the same slot at the same time with `Promise.all`: exactly one 201 and one 409;
  - one user sends 3 booking requests at the same time: exactly 2 succeed.

```
feat(booking): create booking with slot and window validation
feat(booking): enforce one booking per slot via unique constraint
feat(booking): limit users to two upcoming bookings with row lock
test(booking): cover booking rules
test(booking): cover concurrent booking requests
```

## Step 10: Week grid, My bookings and cancelling

- **Issue/PR:** `feat(booking): add week grid, my bookings and cancel` · branch `feat/10-week-grid`
- **Scope:**
  - `GET /houses/:slug/machines/:id/week?start=YYYY-MM-DD`: every slot with its status (`free`, `booked`, `mine`, `past`, `broken`, `affected`) and the booker's first name.
  - `GET /houses/:slug/bookings/me`.
  - `DELETE /houses/:slug/bookings/:id`: hard delete; owner or admin only; upcoming bookings only.
- **Done when:** tests cover each grid status, a slot becoming bookable again after cancelling, a resident cancelling someone else's booking getting 403, a past booking getting 422, and an admin cancelling any booking.

```
feat(booking): add week grid endpoint with slot statuses
feat(booking): list my upcoming bookings
feat(booking): cancel own upcoming booking
feat(admin): let admins cancel any booking
test(booking): cover week grid, my bookings and cancel
```

## Step 11: Machine broken toggle

- **Issue/PR:** `feat(machine): add broken toggle with affected bookings` · branch `feat/11-broken-machine`
- **Scope:**
  - `PATCH` with `{ isBroken }`, admin only.
  - Broken: future `ACTIVE` bookings become `AFFECTED` in one transaction.
  - Repaired: future `AFFECTED` bookings become `ACTIVE` again.
  - Bookings on a broken machine are rejected.
  - `AFFECTED` bookings don't count toward the 2-booking limit.
- **Done when:** tests cover the full cycle (break, try to book, repair, bookings restored), and past bookings are not touched.

```
feat(machine): let admins mark a machine as broken
feat(booking): mark future bookings as affected when machine breaks
feat(booking): restore affected bookings when machine is repaired
test(machine): cover broken and repair cycle
```

## Step 12: Admin members and roles

- **Issue/PR:** `feat(admin): manage members, roles and invite code` · branch `feat/12-admin-members`
- **Scope:**
  - `GET /houses/:slug/members`.
  - `PATCH /houses/:slug/members/:userId` with `{ role }`.
  - `DELETE /houses/:slug/members/:userId`, which also deletes the member's future bookings.
  - `POST /houses/:slug/invite-code` regenerates the code.
  - The house can never be left without an admin.
- **Done when:** tests cover the old invite code being rejected after regeneration, demoting the last admin returning `409 LAST_ADMIN`, and a removed member losing access.

```
feat(admin): list house members
feat(admin): regenerate invite code
feat(admin): promote and demote members
feat(admin): remove members and their upcoming bookings
test(admin): cover member management and last-admin rule
```

## Step 13: Hardening and documentation

- **Issue/PR:** `docs: add api reference and harden server` · branch `chore/13-hardening`
- **Scope:**
  - `helmet` for security headers.
  - CORS allowlist from an environment variable, with `credentials: true`.
  - Request logging with `pino-http`.
  - `docs/api.md` with every endpoint, examples and error codes.
  - Mermaid ER diagram and a short architecture section in the README.
- **Done when:** a request from an origin not on the list is blocked, and the docs match the routes.

```
feat(api): add helmet and cors allowlist
feat(api): add request logging
docs: document api endpoints and error codes
docs: add er diagram and architecture notes
```

## Step 14: Deployment

- **Issue/PR:** `build: deploy api to render with neon postgres` · branch `build/14-deploy`
- **Scope:**
  - `render.yaml`.
  - Production start command that runs `prisma migrate deploy` before starting the server.
  - `app.set('trust proxy', 1)` and secure cookies in production.
  - Health check path.
  - `docs/deployment.md`.
- **Constraint for later:** Render and Vercel domains count as different sites, so browsers may block the login cookie. Plan to route `/api/*` through the frontend's host (for example with Vercel rewrites) so the cookie is first-party.
- **Done when:** the live URL answers `/api/health`, and you can register and book through the deployed API. Then merge the release-please PR to create **v0.1.0**.

```
build: add production start script with migrate deploy
feat(api): configure secure cookies and trust proxy for production
build: add render blueprint
docs: add deployment guide
```

---

## Prompts for the agents

**Planning agent:**

> Read `AGENTS.md`, `docs/spec.md` and `docs/backend-plan.md`. Plan **Step N** only. List the files to change, the functions, the endpoint request and response examples, the test cases and the final commit list. Write no code, and list any open questions.

**Implementation agent:**

> Read `AGENTS.md`, `docs/spec.md` and `docs/backend-plan.md`. Here is the approved plan for **Step N** (issue #N). Create the branch, make exactly the planned commits with tests passing after each one, then open a PR with `gh` that says `Closes #N`.
