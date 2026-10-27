# First Portfolio Project: Candidates, Plan and Mockups

> **Historical document.** Candidate A (Waschplan) was chosen. The stack below (Next.js + TypeScript) was replaced by Express + JavaScript; see [spec.md](spec.md) for the current decisions.

## What every candidate shares

**Shared stack.** It is chosen so you learn the things employers actually ask juniors about:

- **Next.js (App Router) + TypeScript**: you're already learning both, so this turns them into skills you can show.
- **PostgreSQL** (free hosting on Neon or Supabase) with **Prisma** as the ORM. You'll learn schema design, relations, migrations, seeding and constraints.
- **Auth.js** for login and sessions. You'll learn how to protect routes with middleware.
- **Zod** for validating forms and API input.
- **Plain CSS / CSS Modules** reusing your portfolio variables (`--accent`, `--bg`, `--surface`, Montserrat). There is deliberately no Tailwind and no UI kit, so the result looks hand-built.
- **Vitest** for a few unit tests of the business rules.
- **Vercel** for deployment, with a live URL for your CV.

**Concepts you'll learn and can talk about in interviews.** Every candidate covers all of them:

- **Routing:** layouts, dynamic routes (`[id]`), route groups, `loading.tsx` / `error.tsx` / `not-found.tsx`.
- **Server vs. client components.**
- **Server Actions vs. Route Handlers** (`app/api/...`), and when to use which.
- **Database design:** one-to-many and many-to-many relations, unique constraints, transactions.
- **Auth:** sessions, protected pages, and checking on the server that a user may edit a record (authorization).
- **Environment variables, migrations in production, and a README with an ER diagram.**

## Candidate A: "Waschplan", a laundry room booking app for apartment buildings

The pitch: in German apartment buildings, the shared laundry room is a classic source of conflict. Residents join their building with an invite code and book washing machine or dryer slots on a weekly grid.

Why it impresses: everyone in Germany understands it immediately. It also contains a real engineering problem: two people must never book the same slot. You solve that with a database unique constraint, not just a UI check.

MVP features:

- One resident creates a building, and the others join with a 6-character invite code.
- A week view per machine with 2-hour slots and the Europe/Berlin timezone.
- Rules: at most 2 upcoming bookings per person, and you can't book in the past.
- A "Machine broken" toggle (admin only) that blocks the machine and marks affected bookings.
- A "My bookings" page with cancel.

Routes:

- `/`, `/login`, `/join`
- `/house/[slug]`: the week grid
- `/house/[slug]/me`
- `/house/[slug]/admin`

Tables: `User`, `House`, `Membership (role)`, `Machine`, `Booking` with `@@unique([machineId, startsAt])`.

Stretch goals: iCal export, and an email reminder 30 minutes before a slot.

## Candidate B: "Amtspost", an AI agent that turns German official letters into a to-do list

The pitch: letters from the Finanzamt, Ausländerbehörde, health insurance or landlord are hard to read, even for Germans. You paste the text or upload a photo. A small AI agent explains the letter in plain German or English, pulls out the deadlines and required actions, and saves them to a dashboard. There you tick off tasks and see what's due next.

Why it impresses: it shows real AI agent work wrapped in a polished frontend, which is the combination companies hire for right now. It is not a generic chatbot. The model has to call tools (`createDeadline`, `createTask`) and return structured data you validate with Zod. The UI also streams the explanation in as it's generated.

MVP features:

- Paste a letter's text (photo upload with OCR comes later as a stretch goal) and pick the output language, German or English.
- A streamed plain-language summary: "What is this?", "What do I have to do?" and "By when?".
- Agent tool calls that create `Deadline` and `Task` rows. Each one shows up as a card you can edit before saving, so the human always confirms what the AI did.
- A dashboard of upcoming deadlines sorted by date, with an "overdue" badge and checkboxes for tasks.
- A letter history, plus a delete button that really deletes the letter (letters are private data).

Routes:

- `/`, `/login`
- `/letters`, `/letters/new`, `/letters/[id]`
- `/deadlines`
- `app/api/analyze` (a Route Handler that streams the agent's response)

Tables: `User`, `Letter`, `Deadline`, `Task`, plus an `AgentRun` table that logs model, tokens and duration, so you can show a usage and cost view.

Extra things you learn: the Vercel AI SDK, streaming UI, tool calling and structured output, prompt design, rate limiting per user, and handling sensitive data. A small model costs cents per letter. Add a daily limit per user so the public demo can't run up a bill.

Stretch goals: photo upload with OCR, and a "Write a reply" draft.

## Candidate C: "Leihregal", a neighbourhood lending shelf

The pitch: neighbours list things they rarely use (a drill, a ladder, a raclette set). Others request to borrow them, the owner accepts or declines, and the app tracks due dates and returns.

Why it impresses: it shows a status workflow, where a loan goes from requested to accepted to returned (or declined). It also shows multi-user interactions and image uploads.

MVP features:

- Item CRUD with a photo (Supabase Storage or UploadThing).
- Browse items filtered by postal code and category.
- The borrow request flow with status changes, which only the right user is allowed to trigger.
- Due dates and an "overdue" badge.

Routes:

- `/items`, `/items/new`, `/items/[id]`
- `/requests`
- `/u/[username]`

Tables: `User`, `Item`, `Category`, `Loan (status enum, dueAt)`.

Risk: it only looks alive with several users, so it needs good seed data.

## My recommendation

**B** is the strongest match for your profile: it puts frontend work and AI agents in one project, and that's exactly the story your CV tells. **A** is the best pure full-stack project with no AI, and it's very relatable for German recruiters. A good pairing for your two portfolio projects is **B first and A second**, or the other way round if you want to learn the database basics before adding AI. C is fine, but its image upload and multi-user setup add scope.

## Keeping it human-made, not AI-made

- **Design:** one accent colour (your red), no gradients, no glassmorphism, no purple and blue, no emoji icons, and no "3 feature cards with icons" landing page.
- **Layouts:** dense, useful layouts like a real tool, not marketing pages. Use tables and grids where they fit, and asymmetry where it helps.
- **Copy:** specific microcopy in your voice, for example "The Finanzamt wants your documents by 14 November. That's 18 days." Avoid generic lines like "Streamline your workflow" or "Powered by AI".
- **AI without the AI look:** no sparkle icons, no purple glow and no chat bubbles everywhere. The AI output should look like normal app content (cards, lists, dates) that the user can edit.
- **Data:** realistic seed data such as Wuppertal street names, real German names and realistic (made-up) letters.
- **Process:** small, honest Git commits. Write the README yourself, with "Why I built this", "What was hard" and "What I'd do next".

## Next step: visual mockups

Before deciding, I'll build one static HTML mockup per candidate, showing each one's main screen in your portfolio's style. They go in `project-mockups/` (outside `Portfolio/` so your portfolio build isn't affected):

- [project-mockups/waschplan.html](project-mockups/waschplan.html): the week grid with booked and free slots and a broken machine.
- [project-mockups/amtspost.html](project-mockups/amtspost.html): one analysed letter, with the plain-language summary on the left and the extracted deadline and task cards on the right, plus the deadlines dashboard.
- [project-mockups/leihregal.html](project-mockups/leihregal.html): the item browse grid and one item with a borrow request.

They'll reuse the CSS variables from [Portfolio/src/index.css](Portfolio/src/index.css). I'll open each one in the browser, take screenshots and show them to you. Then you pick a project, and we plan its build step by step (setup, schema, routes and auth, features, tests, deployment).
