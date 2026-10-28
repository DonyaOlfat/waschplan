# Waschplan

A laundry room booking app for German apartment buildings. Residents join their building with an invite code and book washing machine or dryer slots on a weekly grid. Two people can never book the same slot: the database guarantees it.

**Status:** backend in progress. The backend is built first, then the React frontend.

## Local setup

Prerequisites: Node.js 24. From the repo root, `nvm use` selects it from `.nvmrc`.

```bash
npm install
cp server/.env.example server/.env
npm run dev
```

The API listens on `http://localhost:3000`. Health check:

```bash
curl localhost:3000/api/health
```

```json
{"status":"ok"}
```

Other commands:

```bash
npm test
npm run lint
npm run format
```

## server/

- `src/server.js` starts the HTTP server.
- `src/app.js` builds the Express app without listening, so tests can call it directly.
- `src/config/env.js` checks environment variables with Zod.
- `src/modules/health/routes.js` serves `GET /api/health`.
- `tests/` holds the Vitest tests.

## Docs

- [docs/spec.md](docs/spec.md): what the backend does, its rules, data model and API.
- [docs/backend-plan.md](docs/backend-plan.md): the build plan, split into one issue and one pull request per step.
- [AGENTS.md](AGENTS.md): conventions for code, commits and pull requests.
- [docs/project-selection.md](docs/project-selection.md): how this project was chosen from three candidates.
