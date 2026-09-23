# ML UI integration — handoff (for continuing in a new Cowork session)

## Context

John asked "have we completed everything on the 22 modules?" and the honest
answer was: the FastAPI backend has all 16 CRUD modules + all 10 ML modules
(roadmap 13-22) done, tested, and deployed to Render — but the Next.js
frontend only had screens for the original 14 CRUD modules. This doc tracks
closing that frontend gap: 2 missing CRUD pages (done) + 10 ML modules'
UI (4 of 10 done, 6 remaining).

Two separate local repos, both connected as folders in this Cowork session:
- `Admission-CRM-API` (FastAPI backend) — `C:\Users\johnb\Downloads\Admission-CRM-API`
- `Admission-CRM-Frontend` (Next.js) — `C:\Users\johnb\Downloads\Admission-CRM-Frontend`

**Standing project rules** (apply to all work here, not just this doc):
- Dev-first. Read-only on prod unless told otherwise.
- Audit the real live schema/code before writing anything ("Golden Rule") —
  don't guess field names or hook names, grep the actual generated client
  and Python models first.
- Claude commits (and shows the hash); John pushes himself via his own
  PowerShell terminal (has GitHub credentials; the device shell does not).
- Only synthetic/fake dev data, never real student data.
- Communicate ONE STEP AT A TIME in plain language — John gets confused
  easily with multi-step technical instructions, so give one command at a
  time and wait for his output before the next.
- `check_*.py` ad hoc scripts are gitignored, never committed.

## What's done so far

**Backend repo (`Admission-CRM-API`):**
- `925912b` — committed `openapi.json` + `typed-client/` for the first time
  (these existed locally but were never in git before — a real gap found
  while starting this work. Keep committing these going forward whenever
  the schema changes, don't let them go stale silently again).
- `491f464` — retrained `conversion_model.joblib` to fix a scikit-learn
  version-skew bug (see "Known gotcha #2" below).
- `f1d304c` — retrained `dropout_risk_model.joblib` for the same
  version-skew bug (gotcha #2 hit again on module 16). CV metrics
  unchanged: ROC-AUC 0.605 (weak — barely better than chance, and can
  show overconfident values like 99% on individual rows).

**Frontend repo (`Admission-CRM-Frontend`):**
- `91f2081` — added the 2 missing CRUD pages: **Fee Due Schedule**
  (`src/app/(app)/fee-due-schedule/page.tsx`) and **Enquiry Monthly
  History** (`src/app/(app)/enquiry-monthly-history/page.tsx`), both added
  to the sidebar nav in `src/app/(app)/layout.tsx`. Also resynced
  `src/lib/api-client/generated/` from the backend's `typed-client/` —
  this is what unlocked the ML hooks existing on the frontend at all.
- `882eacf` — added an **"AI Insights"** button + dialog to the **Leads**
  page (`src/app/(app)/leads/page.tsx`), covering the 4 ML modules keyed
  on `lead_id`: conversion prediction (13), fraud detection (22),
  follow-up timing (14), telecaller matching (17). Lazy-loaded — the 4
  queries only fire while that lead's dialog is open, not for every row
  in the list.
- `5d3ccb7` — fixed a display bug (see "Known gotcha #1" below).

- **Applications page — Dropout Risk (module 16) DONE** — "AI Insights"
  button per row + one-section dialog in
  `src/app/(app)/applications/page.tsx`. Live-verified in the browser
  after the `f1d304c` retrain. (Commit hash: see `git log` —
  `feat: add dropout risk AI Insights to Applications page`.)

- **Followups page — Call Sentiment (module 19) DONE** — "AI Insights"
  button per row, dialog shows sentiment badge, all 3 class
  probabilities, and the notes text analysed (handles empty notes).
  `src/app/(app)/followups/page.tsx`. Live-verified — worked first try,
  no retrain needed for module 19. Caveat: module 19's CV accuracy is
  1.000 because the synthetic notes are templated; expect it to be far
  less sure on real, messy notes.
- **Known pre-existing bug (not fixed yet):** the Followups list "Lead"
  column shows raw UUIDs for most rows because `leadLabel` only looks up
  the first 200 leads (`useListLeadsLeadsGet({ limit: 200 })`) and dev
  has ~534. Same pattern may affect other pages' pickers.

**Live-verified in the browser** (all 4 Leads predictions confirmed working
with real values, not just "Not available"): conversion likelihood, fraud
check, best time to call, best telecaller match.

## Remaining work — 4 ML modules across 3 pages (Applications, Followups done)

Follow the **Leads page pattern** (`src/app/(app)/leads/page.tsx`,
commit `882eacf`) as the reference implementation: an "AI Insights" button
that opens a `Dialog`, with the prediction hook(s) called with
`{ query: { enabled: <dialog is open for this row> } }` so they're lazy —
never fetched for every row in a list on page load.

### 1. Applications page — Dropout Risk (module 16) — DONE

- Route: `GET /ml/applications/{application_id}/dropout-risk`
- Hook: `useGetDropoutRiskMlApplicationsApplicationIdDropoutRiskGet(applicationId, { query: { enabled } })`
- Response (`DropoutRiskResponse`): `application_id`, `applicant_id`,
  `application_stage` (nullable), `dropout_probability` (0-1),
  `predicted_label` (`"At risk of dropping out"` / `"Likely to complete"`),
  `model_version`.
- File to edit: `src/app/(app)/applications/page.tsx`. Single prediction,
  so this can be a simpler one-section dialog (or even a badge in a popover)
  rather than the 4-section Leads dialog.

### 2. Followups page — Call Sentiment (module 19) — DONE

- Route: `GET /ml/followups/{followup_id}/sentiment`
- Hook: `useGetCallSentimentMlFollowupsFollowupIdSentimentGet(followupId, { query: { enabled } })`
- Response (`CallSentimentResponse`): `followup_id`, `notes`,
  `predicted_sentiment` (`"positive"`/`"neutral"`/`"negative"`, lowercase),
  `scores` (array of `{label, probability}` for all 3 classes — sums to 1),
  `model_version`.
- File to edit: `src/app/(app)/followups/page.tsx`.

### 3. Fee Due Schedule page — Fee Default Risk (module 18)

- Route: `GET /ml/fee-due-schedule/{fee_due_schedule_id}/default-risk`
- Hook: `useGetFeeDefaultRiskMlFeeDueScheduleFeeDueScheduleIdDefaultRiskGet(feeDueScheduleId, { query: { enabled } })`
- Response (`FeeDefaultRiskResponse`): `fee_due_schedule_id`,
  `applicant_id`, `fee_component`, `academic_year`, `amount_due`,
  `due_date`, `default_probability` (0-1), `predicted_label`
  (`"At risk of default"` / `"Likely to pay"`), `model_version`.
- File to edit: `src/app/(app)/fee-due-schedule/page.tsx` (the page built
  in commit `91f2081` — already has the applicant picker etc., just needs
  the AI Insights addition).

### 4. Telecallers page — Ranked Leads (module 21)

Different shape from the other three — this is keyed by **telecaller
name**, not a row id, and returns a LIST of leads, not a single score.

- Route: `GET /ml/telecallers/{telecaller_name}/ranked-leads`
- Hook: `useGetRankedLeadsMlTelecallersTelecallerNameRankedLeadsGet(telecallerName, { query: { enabled } })`
- Response (`LeadRankingResponse`): `telecaller`, `lead_count`,
  `ranked_leads` (array of `{lead_id, name, phone, status, predicted_conversion_probability}`,
  best-first), `model_version`.
- Unknown telecaller name → still `200` with an empty `ranked_leads` list,
  never `404` (`assigned_to` is free text, not a real FK — confirmed in
  `app/routers/ml_lead_ranking.py`).
- File to edit: `src/app/(app)/telecallers/page.tsx`. Suggest a "View
  ranked leads" button per telecaller row opening a dialog with the
  sorted list (name, phone, status, probability).

### 5 & 6. Dashboard page — Source ROI + Demand Forecast (modules 15, 20)

Both are aggregate/summary endpoints, not tied to one row — this is why
they're on Dashboard rather than an existing list page.

**Source ROI:**
- Route: `GET /ml/source-performance` (no path param — aggregates across
  ALL leads on every request, nothing to train/load, so no `ModelNotAvailableError`
  path either)
- Hook: `useGetSourceRoiMlSourcePerformanceGet()` — no id needed, safe to
  call eagerly on Dashboard mount (it's a single request, not per-row).
- Response (`SourceROIResponse`): `sources` (array of
  `{source, total_leads, enrolled_count, lost_count, unresolved_count,
  overall_conversion_rate, resolved_conversion_rate (nullable),
  low_sample}`, sorted by `resolved_conversion_rate` desc), `note`.

**Demand Forecast:**
- Route: `GET /ml/demand-forecast/{year}/{month}`
- Hook: `useGetDemandForecastMlDemandForecastYearMonthGet(year, month, { query: { enabled } })`
- Response (`DemandForecastResponse`): `year`, `month`,
  `predicted_enquiry_count` (float, never negative), `model_version`.
- `year`/`month` are path params, not an entity id — there's no "the"
  forecast, you pick a month. Suggest a small form (or just show the next
  3 upcoming months automatically) rather than requiring the user to type
  numbers in. `BASE_YEAR` (the minimum valid year, a `ge` constraint on
  the route) is exported from `ml/features_demand_forecast.py` in the
  backend if you need to validate client-side too — see how
  `tests/test_ml_demand_forecast.py` imports it rather than hardcoding.
- File to edit: `src/app/(app)/dashboard/page.tsx` for both.

## Known gotchas (already hit once — don't repeat)

**#1 — JSX text vs. JS string escapes.** `\u2014` (em dash) or similar
unicode escapes only get interpreted inside a real JS string — e.g.
`{"\u2014"}` or inside a template literal in `${...}`. Written as plain
text inside a JSX tag like `<p>foo \u2014 bar</p>`, it prints the literal
backslash-u-2014 text. If you need a dash/special character in plain JSX
text, either type the actual character or wrap it: `{"\u2014"}`.

**#2 — scikit-learn model version skew.** A `.joblib`-pickled sklearn
pipeline can silently break if the installed `scikit-learn` version
differs from whatever trained it — symptom is something like
`AttributeError: 'SimpleImputer' object has no attribute '_fill_dtype'`
buried in a 500 response. This isn't a bug in our code. If a *new* ML
endpoint you're about to wire up returns "Not available" in the UI, ask
John to check his `uvicorn` terminal for the actual traceback before
assuming it's a frontend bug — if you see this same `AttributeError`
pattern, the fix is: `python ml/train_<whichever>_model.py` to retrain
under the currently-installed scikit-learn (pinned to `1.9.1` in
`requirements.txt`), then **restart `uvicorn`** (it caches the loaded
model in memory via `lru_cache` — a code-only `--reload` does NOT pick up
a changed `.joblib` file, has to be a manual stop + restart).

**Heads-up for the remaining modules:** only modules 13 (conversion) and
16 (dropout) have been retrained under scikit-learn 1.9.1 so far. Modules
18 (fee default) and 20 (demand forecast) are
likely to hit the same `_fill_dtype` / version-skew error the first time
they're called — if "Not available" shows up, retrain that one model and
restart uvicorn before debugging the frontend. (14, 17 and 22 were
verified live on the Leads page, and 19 on Followups, so they're fine.)

**#3 — Two servers running by accident.** While testing this live, John
once started a second `uvicorn` in a new terminal without stopping the
old one in the original terminal — the old (stale) one kept serving
requests on the same port. If live changes don't seem to take effect
after a restart, check for a second terminal tab still running the old
process.

## How to verify before committing

- After any `.tsx` edit: `cd Admission-CRM-Frontend && npx tsc --noEmit -p tsconfig.json`
  (run via `device_bash` in the Linux VM — it works fine against the
  Windows-installed `node_modules` for pure TypeScript checking, but do
  NOT try to run `npm install`/`npm run build`/`next dev` there — those
  need native binaries built for Windows and will fail with an
  esbuild/SWC platform mismatch. If you need to run `orval` codegen again
  the way commit `925912b`/`91f2081` did it, install into a *scratch*
  copy outside the mounted folder first, never `npm install` directly
  inside the real `node_modules` from the Linux VM side, or it'll break
  John's local Windows dev setup.)
- Real end-to-end testing (actually clicking through the browser) has to
  happen on John's machine, guided step by step: he runs the backend
  (`uvicorn app.main:app --reload`) in one terminal and the frontend
  (`npm run dev`) in another, then opens `http://localhost:3000`.

## Delivering this doc for a new Cowork session

Once picked up, keep this file updated as each of the 6 remaining items
gets done (mark done, add the commit hash) — same convention as the
"What's done so far" section above.
