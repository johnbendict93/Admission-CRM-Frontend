# Admission CRM — Frontend (Next.js)

Phase A scaffold: auth/session wiring + Leads, Applicants, Applications
pages, built against a typed client generated from the live
Admission-CRM-API OpenAPI schema (see `src/lib/api-client/generated/`,
sourced from `Admission-CRM-API/typed-client/` - see that folder's README
for regeneration steps whenever the backend schema changes).

## Stack

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui (manually vendored - see
`src/components/ui/`) + TanStack Query v5 + React Hook Form + Zod.

## Running locally

1. Start the API backend first (separate terminal, in the
   `admission-crm-api` conda env, from the `Admission-CRM-API` repo):

   ```
   uvicorn app.main:app --reload
   ```

   Confirm `.env` there has `ENVIRONMENT=development` so it talks to dev
   Supabase, not prod.

2. Install and run this app:

   ```
   npm install
   npm run dev
   ```

3. Open http://localhost:3000 - you'll be redirected to `/login`. Sign in
   with a dev test account (see `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`
   etc. in `Admission-CRM-API/.env` - created via
   `scripts/create_test_users.py` earlier in the project).

`.env.local` already points `BACKEND_API_URL` at `http://localhost:8000`
for local dev - update it (or set it in your deploy platform) for other
environments.

## How auth works

- `/api/auth/login` (`src/app/api/auth/login/route.ts`) calls the real
  FastAPI `/auth/login`, then sets an **httpOnly** `session` cookie
  holding the Supabase access token (never readable from client JS) plus
  a plain `user_info` cookie (role/name/email only, for UI display and
  gating - not a security boundary).
- Every generated hook's request goes through `/api/backend/[...path]`
  (`src/app/api/backend/[...path]/route.ts`), which attaches the bearer
  token server-side from the httpOnly cookie and forwards to the real
  API. The browser never sees the token.
- `middleware.ts` redirects to `/login` when the `session` cookie is
  absent - a presence check only; the FastAPI backend is the real
  authorization boundary on every request regardless.
- Shared 401/403 handling lives in
  `src/lib/api-client/api-mutator.ts` (see the comment there): a 401
  (dead session) or 403 (forbidden role, including a stale cached role
  after a mid-session role change) both trigger the same toast + forced
  logout + redirect to `/login`, rather than bespoke handling per page.

## Structure

```
src/
  app/
    (app)/            route group: shared sidebar shell + nav
      leads/           Leads: full CRUD (list, create, edit, delete)
      applicants/       Applicants: list + minimal create
      applications/     Applications: list only (create needs an
                         applicant picker - follow-up)
    api/
      auth/login, auth/logout   BFF auth routes
      backend/[...path]         BFF proxy to the real API
    login/            Sign-in page
  components/
    providers.tsx     QueryClientProvider + Toaster + 401/403 handler wiring
    ui/               Manually vendored shadcn/ui primitives (shadcn's own
                       CLI `init` currently fails in this environment - see
                       git history - so these were hand-added to match its
                       conventions; safe to replace with CLI-added ones later)
  lib/
    api-client/       Copied from Admission-CRM-API/typed-client - re-sync
                       manually when the backend schema changes
    session.ts        Client-side cookie read + role-gating helpers
```

## Not yet built (Phase B/C/D, per the scoping doc)

document_types, settings, lookup_values, scholarships, hostel_allotments,
telecallers, call_schedules, campus_visits, followups,
counseling_sessions, dashboard, reports.
