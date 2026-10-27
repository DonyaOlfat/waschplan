# Rules for agents working on Waschplan

Read [docs/spec.md](docs/spec.md) and [docs/backend-plan.md](docs/backend-plan.md) before you start. Where they conflict, the spec wins.

## Code

- JavaScript with ES modules only. No TypeScript.
- Folder structure: `server/src/{app.js, server.js, config/, lib/, middleware/, modules/<feature>/{routes,service,schemas}.js}`, `server/prisma/`, `server/tests/`.
- Never commit secrets. Keep `.env.example` up to date.

## Scope

- Work only on the issue you were given. One issue = one branch = one pull request.
- Don't start work that belongs to another step of the plan.

## Branches, commits and pull requests

- Branch name: `<type>/<issue#>-<short-name>`, for example `feat/9-create-booking`.
- Commits follow Conventional Commits: `type(scope): imperative summary`.
  - Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`, `build`.
  - Scopes: `api`, `auth`, `db`, `house`, `machine`, `slots`, `booking`, `admin`, `deps`.
  - Lowercase, no full stop, 72 characters or fewer.
  - Add a body only when the reason isn't obvious. Footer: `Refs #<issue>`.
- Tests must pass after every single commit. Tests go in the same PR as the code they test.
- PR title uses the Conventional Commit format. PR body: what changed, why, how to test, and `Closes #<issue>`.
- PRs are merged with **rebase and merge**, so every commit lands on `main` as written.

## Planning agent

Write no code. For the given step, output:

1. Files to create or change.
2. Functions and endpoints, with example requests and responses.
3. Test cases.
4. The final list of commits.
5. Open questions.

## Implementation agent

Follow the approved plan for the given step. Create the branch, make exactly the planned commits, then open the PR with `gh`. Explain any deviation from the plan in the PR description.
