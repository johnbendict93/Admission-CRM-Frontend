# Admission CRM — Frontend (Next.js)

Web app for an **admissions CRM for engineering colleges and coaching
centres**: telecallers, counselors and admins manage every enquiry from the
first call to fee payment, with AI insights built into the pages they
already use.

**Live demo:** https://admission-crm-demo-tau.vercel.app
(synthetic demo data — read-only login available on request)
**Backend + ML repo:** https://github.com/johnbendict93/admission-crm-api

## Features

- **16 data modules**: Leads, Applicants, Applications, Fee Payments, Fee Due
  Schedule, Scholarships, Hostel Allotments, Telecallers, Call Schedules,
  Campus Visits, Follow-ups, Counseling Sessions, Enquiry Monthly History,
  Settings, Lookup Values, Document Types — plus Users (admin-only).
- **Dashboard**: funnel counts, overdue calls and follow-ups, enquiry-source
  ROI and a 3-month demand forecast.
- **AI Insights embedded in context** (not a separate "AI page"):
  - Leads: enrolment likelihood, fraud check, best time to call, best
    telecaller for *this* lead
  - Applications: dropout risk · Follow-ups: call sentiment ·
    Fee Due Schedule: default risk · Telecallers: ranked call list
  - Closed (Enrolled/Lost) leads deliberately get no forward-looking
    predictions.
- **Role-based UI** (admin / counselor / staff / viewer), CSV reports,
  paginated tables, staff pickers instead of raw IDs.

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui ·
TanStack Query v5 · React Hook Form + Zod · orval-generated typed API
client · deployed on Vercel.

## How auth works (BFF pattern — the browser never sees the token)

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

## Structure

```
src/
  app/
    (app)/        one folder per module page + dashboard, reports, users
    api/          BFF routes: auth/login, auth/logout, backend/[...path] proxy
    login/        sign-in page
  components/     providers + vendored shadcn/ui primitives
  lib/
    api-client/   orval-generated typed client (synced from the API repo)
    hooks/        shared hooks (e.g. paging through all leads)
    session.ts    client-side role helpers (UI gating only)
```

## Author

**John Bendict** — designed the product, architecture and deployment;
built with AI-assisted development (Claude).
