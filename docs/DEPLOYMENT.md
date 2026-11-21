# Deployment

Three deployable pieces: `parishioner/` (React PWA), `admin/` (React admin
portal), `backend/` (Laravel API). This is the **actual live setup**, not a
plan — it's deployed and verified working end-to-end as of this writing.

## Live URLs

| Piece | URL |
|---|---|
| Backend (Render) | `https://sakramentohub-backend.onrender.com` |
| Parishioner (Vercel) | `https://sakramentohub-parishioner.vercel.app` |
| Admin (Vercel) | `https://sakramentohub-admin.vercel.app` |

Render's free tier sleeps after ~15 min idle and takes 30-60s to wake on
the next request — hit the backend URL once before a live demo to warm it
up, or the first click will look like it hung.

## 1. Backend (Laravel, on Render, via a container image)

Render has no native PHP runtime — it only runs PHP apps through a
container image, not a repo-connected buildpack the way it does Node or
Python. The actual pipeline:

1. `backend/Dockerfile` — `php:8.4-cli-alpine` (composer.lock needs 8.4+
   even though `composer.json` declares `^8.2` — it was resolved against a
   newer local PHP), SQLite, Laravel's own dev server bound to `$PORT`.
   Not php-fpm+nginx — deliberately simple for a low-traffic demo.
2. `.github/workflows/deploy-backend.yml` builds that Dockerfile and
   pushes it to `ghcr.io/<owner>/sakramentohub-backend:latest`
   on every push to `master` that touches `backend/`.
3. GHCR packages default to **private** regardless of repo visibility —
   there's no API-based way around that (GitHub doesn't allow creating
   access tokens via API at all, by design). Render pulls the image using
   a registry credential built from a GitHub PAT with `read:packages`
   scope (Render dashboard → the service → Settings, or via
   `POST /v1/registrycredentials` if scripting it).
4. Render service is `runtime: image` (not a git-connected service), so a
   new image push does **not** auto-deploy — trigger a redeploy explicitly
   after each backend change: `POST /v1/services/<id>/deploys` with the
   Render API, or "Manual Deploy" in the dashboard.

**Required environment variables** (set in Render dashboard → the service
→ Environment, or via `PUT /v1/services/<id>/env-vars/<KEY>`):
- `APP_KEY` — `php artisan key:generate --show`, paste the output
- `APP_ENV=production`, `APP_DEBUG=false`
- `APP_URL` — **the backend's own public URL** (e.g.
  `https://sakramentohub-backend.onrender.com`). Laravel defaults
  `APP_URL` to `http://localhost`, so without it every URL the backend
  builds itself points at `localhost` and is unreachable by any real
  client. Nothing fails loudly; the link is just dead.
- `PARISHIONER_APP_URL` — **the parishioner app's public URL** (the Vercel
  URL, no trailing slash). Required: it is where PayMongo sends the payer
  back after GCash (`/payment/success` and `/payment/cancelled`), and the
  base of the email-verification and password-reset links. Unset, it
  defaults to `http://localhost:5173`, so a payer finishing GCash on the
  live site is returned to localhost.
- `ADMIN_APP_URL` — **the admin app's public URL**. Required: staff and
  admin password-reset links are built from it (default
  `http://localhost:5174`).
- Proxies: the app is behind Render's proxy and trusts it (`trustProxies(at: '*')` in `bootstrap/app.php`), so the certificate-verify throttle counts each visitor's own IP, not the proxy's. Nothing to set.
- `DB_CONNECTION=sqlite` — fine for a demo, **but the data does not persist**: on Render's free plan the
  service sleeps when idle, and waking it starts a fresh container with a blank SQLite file. The boot command then
  runs `migrate --seed`, so the demo data and default admin login come back and anything entered is lost. The same
  happens on every redeploy. For real use, point `DB_CONNECTION` at a hosted MySQL database so data is permanent.
- `LOG_CHANNEL=stderr` — so logs land in Render's log stream instead of a
  file on a disk that might not persist

**Notes for Render:**
- The new migrations (booking channel, creator, amounts paid and refunded,
  document reviews, staff notes, parish name) run on container start like
  every other migration; no manual step.
- `PARISHIONER_APP_URL` must be correct: PayMongo's return URL for a
  walk-in (`{PARISHIONER_APP_URL}/payment/received`) is built from it as
  well as the online `/payment/success` and `/payment/cancelled`.
- A push or merge that reaches `master` builds a new image, but Render does
  **not** pick it up on its own: after merging to `master`, wait for
  the `deploy-backend` workflow to finish, then press **Manual Deploy**
  (or call the deploy API) on the Render service.
- `ServiceSeeder` now only creates missing services, so fees and rules an
  admin edits in Settings survive a redeploy.

The container's boot command (`backend/Dockerfile`'s `CMD`) runs
`storage:link`, then `migrate --seed --force`, then starts the server —
all three are safe to re-run, so every boot self-heals a fresh or reset
disk instead of requiring a manual setup step. This only works because the
named-account seeders (`DatabaseSeeder`, `StaffSeeder`) use
`updateOrCreate`, not `create` — re-seeding an already-seeded database
must not throw a unique-email violation.

**Demo bookings.** `DemoBookingSeeder` creates one realistic booking per
sacrament (references `DEMO-BAPT`, `DEMO-WEDD`, `DEMO-CONF`, `DEMO-FUNE`,
`DEMO-ANOI`, `DEMO-HOUS`) for `test@example.com`. Its form data lives in
`backend/database/seeders/demo/` — copies of the `contracts/fixtures`
files, because the image contains only `backend/` (a backend test keeps
the copies equal to their source). A demo booking is created only if its
reference does not exist yet, so a reboot never undoes what staff did to
one — **except a demo booking whose state has lapsed** (cancelled by the
hold-expiry job, or still submitted/returned/approved with an appointment
day already past), which the seeder deletes and re-creates on every start.
So **redeploy shortly before a demo** to get fresh, bookable demo
rows. There is also a seventh, `DEMO-WALK` (an approved walk-in house
blessing with no account, entered by `staff@example.com`). If no free slot
is found for one of them it is logged and skipped — the boot carries on.
`DEMO-FUNE` is already completed, so it has a register entry with a fixed
verification code (derived from its reference): a certificate printed for
it keeps verifying after a redeploy reset. The container's start command
runs `php artisan register:backfill` after `migrate --seed`, which records
an entry for any completed booking that has none (idempotent).
The backfill is a repair step, not a precondition: the start command runs it as
`(php artisan register:backfill || echo "register:backfill failed")`, so a failure is printed in the
logs and the server still boots.

**Build context.** `backend/.dockerignore` keeps `.env` and `.env.*` (not `.env.example`), local
SQLite files, runtime storage (`storage/app/private`, logs, cache, sessions, compiled views),
`node_modules`, `vendor`, `tests` and `.phpunit.cache` out of the image. `vendor` and `tests` are
safe to leave out because the Dockerfile runs `composer install --no-dev` itself and nothing at
runtime reads `tests/`; the `.gitignore` placeholders in `storage/` are kept so those folders exist.

**`DEMO-DONE` for demos.** There is also an eighth demo booking, `DEMO-DONE`: a
completed baptism for `test@example.com` with its appointment 30 days before
the seed, recorded in the parish register by the seeder. Its verification
code is derived from its reference, so it never changes. On a fresh database
(checked with `migrate:fresh --seed` twice on scratch SQLite files, same
result both times) it is register number `BAP-2026-0001` with code
`CQAW-5ENB-M85T`. **For demos: verify at `{PARISHIONER_APP_URL}/verify`
with number `BAP-2026-0001` and code `CQAW-5ENB-M85T`** (lower case and no
dashes also work). The code is always the same; the number is `0001` only
while no other baptism has been recorded that year, and its year is the year
of the seed date minus 30 days, so read the number from Admin > Register if
the database already holds other baptisms or was seeded in another year.
The row is created only when missing, so a completed demo booking is never
reset.

**Scheduler and PayMongo.** The container's boot command also starts
`php artisan schedule:work` in the background beside the web server (see
`backend/Dockerfile`); it runs the booking-hold expiry job every 15 minutes
(unpaid holds after 48 hours, returned bookings after 7 days). No separate
Render worker is needed.

Set these PayMongo variables in Render (never commit them):
- `PAYMONGO_MODE` — `test` until the owner goes live; only the exact value
  `live` switches to live mode
- `PAYMONGO_SECRET_KEY` — the `sk_test_...` key (or `sk_live_...` in live mode)
- `PAYMONGO_WEBHOOK_SECRET` — the signing secret shown after registering
  `https://<backend>/api/webhooks/paymongo` as a webhook in the PayMongo
  dashboard

**Mail and queue.** Status emails (booking returned, approved, declined,
cancelled, payment received, refunds, rescheduled by the office, sacrament
recorded, a late document not accepted, certificate requests) are queued
and sent by the scheduler, so:
- `QUEUE_CONNECTION=database` is **required** on Render. The scheduler runs
  `queue:work --stop-when-empty --tries=3 --max-time=50` every minute; there
  is no worker process. An email is queued only after the booking's
  transaction commits, and a failed send is retried (3 tries, a minute
  apart) without affecting the action that caused it.
- With nothing set, `MAIL_MAILER=log` keeps every email in the log and the
  rest of the system works.
- For real delivery set `MAIL_MAILER=brevo`, `BREVO_API_KEY` and
  `MAIL_FROM_ADDRESS` (a sender address verified in a free Brevo account).
  Brevo is used over its HTTPS API (`symfony/brevo-mailer`) because free
  hosts commonly block the SMTP ports. Plain SMTP stays available through
  the usual `MAIL_*` variables (the SMTP timeout is 10 seconds).
- **Unverified on Render until tried.** Brevo over HTTPS cannot be proven
  locally (only that the mailer resolves to the Brevo API transport), and
  the free plan's limits are the provider's to change.
- Addresses at `example.com` (the seeded demo accounts) are never mailed.
  A walk-in is mailed only if the office typed a valid email.

**Admin account.** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 8 characters) on the server. The account is
created once on the first start; its password is never reset afterwards, so a password changed in the app survives
every restart. When they are set, the built-in demo admin (`admin@example.com`) is switched off. If they are not
set, a production server creates **no admin**, so always set them. Local and test runs still get the demo admin
`admin@example.com` / `password`.

`test@example.com` (password `password`) is a demo parishioner that the demo bookings belong to.

## 2. Frontends (Vercel)

Two Vercel projects, both linked to this GitHub repo, each with its own
root directory (`parishioner`, `admin`) and its own `vercel.json` (build
command, output dir, SPA rewrite so client-side routes survive a hard
refresh). Both auto-deploy on push to `master` — no manual redeploy step
needed here, unlike the backend.

Each project needs `VITE_API_URL=https://sakramentohub-backend.onrender.com/api`
set as an environment variable (Vercel dashboard → Project Settings →
Environment Variables, or `vercel env add VITE_API_URL production`) —
Vite bakes this in at **build** time, so it must be set before the build
runs, not patched in after.

**Additional demo data (walk-ins and the office desk):**
- Walk-in bookings are entered inside the **admin** app (**New walk-in booking**, and **Edit walk-in booking** on a
  returned one). Nothing extra to configure: it uses the same `VITE_API_URL` as the rest of admin. The old parishioner
  `/desk` screens still exist but nothing links to them; they can be removed.
- The parishioner app serves the public payment page for walk-ins at `/payment/received` (no login). It is a
  client-side route covered by the existing catch-all rewrite in `vercel.json`; nothing to configure.
- The office desk needs a live API: in a build without `VITE_API_URL`
  (mock mode) it shows "not available in demo mode".

## 3. CORS

`backend/config/cors.php`'s `allowed_origins` lists both production Vercel
URLs directly (they're permanent aliases, not per-deploy preview URLs) plus
the two local-dev ports. A mismatched origin fails silently as a browser
network error, not a clear 403 — if a deployed frontend can't reach the
API, check this file before anything else.

## 4. Mobile APK (optional, PWA-wrapped, not native)

The parishioner app is a real installable PWA (manifest + service worker,
confirmed building correctly) now live on HTTPS. Run it through
[PWABuilder](https://www.pwabuilder.com) or Google's
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) — paste
`https://sakramentohub-parishioner.vercel.app`, get a signed installable
APK back. This is **not** a native rebuild — it's the same web app running
inside a Trusted Web Activity (Chrome full-screen, no browser chrome), not
a separate Flutter/native codebase. No APK has actually been generated as
of this writing — this is the real path if you want one, not a promise
that one exists.

## Local dev

Nothing above affects local development — `parishioner/.env.local` and
`admin/.env.local` (both gitignored, see their `.env.local.example` /
`.env.example`) point at `http://127.0.0.1:8000/api` for running against a
local `php artisan serve`. Deleting/omitting them makes `parishioner` fall
back to its mock data layer; `admin` has no mock layer and requires a
reachable `VITE_API_URL` to run at all.

**Walk-ins locally:** run the backend (`php artisan serve`) and the admin app, sign in as `staff@example.com`, and press
**New walk-in booking**. Without a PayMongo test key the GCash payment link cannot be made (it answers 503); cash at the
counter still works.