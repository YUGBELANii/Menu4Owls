# Owlz Corner customer push setup

This adds browser push for customers while keeping the existing admin new-order push separate. Vercel serves the static site and `/api` functions. Production delivery is not enabled until the configuration below is applied.

## Supabase

Run [`supabase-notifications.sql`](supabase-notifications.sql) in the Supabase SQL editor. It creates the five customer-push tables, enables RLS, revokes access from `PUBLIC`, `anon`, and `authenticated`, and grants the Vercel `service_role` schema/table/sequence access. There are deliberately no client RLS policies: browsers call the Vercel API, which uses the service-role key. The migration creates `pg_cron`, `pg_net`, `pgcrypto`, and `supabase_vault` (in schema `vault`); confirm these extensions are available to the project.

The scheduled jobs use Vault values named `owlzz_notification_url` and `owlzz_notification_cron_secret`. Create them with the commented `vault.create_secret` examples at the bottom of the SQL file, replacing the URL with `https://YOUR_DOMAIN/api/notifications-admin`. The same secret must be configured in Vercel as `NOTIFICATION_CRON_SECRET`. Create both Vault entries before running the migration. If either is absent, the migration removes only the two notification jobs and does not recreate them; after adding the secrets, rerun the migration to install those jobs.

The migration also defines `public.claim_automatic_notification(text)`, grants execution only to `service_role`, seeds the opening/closing templates idempotently, and replaces only the named `owlzz-opening-push` and `owlzz-closing-push` jobs (opening at 12:30 UTC, closing at 21:25 UTC). No triggers are required. It sends `NOTIFY pgrst, 'reload schema'` at the end so PostgREST refreshes its schema cache after a successful run.

The existing site computes cafe status directly from the clock in `index.html` (`hour >= 18 || hour < 3`, Asia/Kolkata). There is no stored/manual open flag and no way to mark an early closure or a missed opening. The SQL mirrors the current scheduled-hours rule, so it cannot detect either real-world exception. Do not treat these campaigns as respecting actual operating overrides until the storefront and campaign function are both wired to the same operational status source.

## Vercel environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `SUPABASE_ANON_KEY` (used by the server to verify Supabase sessions)
- `ADMIN_NOTIFICATION_EMAILS` (comma-separated exact email allowlist for notification admin actions)
- `NOTIFICATION_CRON_SECRET` (random secret shared with Supabase Vault)
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY` (server only)
- `VAPID_SUBJECT` (for example `mailto:you@example.com`)

Generate VAPID keys using `npx web-push generate-vapid-keys` after dependencies are installed. Put the pair in Vercel environment variables and redeploy. The public key is served by `/api/push-public-key`; never put the private key or service-role key in frontend files.

## Browser and delivery

Deploy the files, run the migration, configure the secrets and Vercel variables, then redeploy. Customers can enable notifications from the storefront navigation; permission is requested only after they click **Enable notifications**. The footer **Unsubscribe** control deactivates the server record and removes the browser subscription. The root `/sw.js` handles push and click events and skips displaying a notification when it can see an open same-origin site client.

The admin notification section is available to signed-in users whose email is listed in `ADMIN_NOTIFICATION_EMAILS`. Add the same addresses administrators use with the existing Supabase login. The current project otherwise has no explicit admin role enforcement.

## Schedule and limits

Supabase Cron invokes opening at `12:30 UTC` (6 PM IST) and closing at `21:25 UTC` (2:55 AM IST). The database function takes a transaction advisory lock and writes a unique campaign row per type and IST business day before delivery, preventing repeat sends if cron runs twice. It checks the current clock-based open interval and the automatic enable flags. Each target is attempted independently; 404/410 subscriptions are deactivated and other failures are logged.

For each automatic run, the function creates a `sending` campaign before Vercel attempts delivery. The API records a log row per attempted subscription, counts delivered and failed sends, and finalizes the campaign as `sent`, `partial`, `failed`, or `no_subscriptions`. Log-write failures are counted separately. If processing fails after a campaign is claimed, the API makes a best-effort `failed` update. A hard process termination or database outage can still leave a campaign in `sending`; automatic retries are intentionally not performed because retrying after partial delivery could duplicate notifications.

Cron calls are asynchronous through `pg_net`. If the endpoint is unavailable, no campaign is created and Cron does not automatically retry the HTTP request. Inspect the `cron` run and `net._http_response` entry, then recover the missed campaign through a controlled process. If Vault secrets are missing when a cron job runs, it logs a warning and skips the request. If the endpoint receives a request with a mismatched Vercel cron secret, it returns 403 before creating a campaign.

The site suppresses notifications when the service worker can observe any open same-origin tab/window. Browsers can limit client visibility while suspended, so this is best effort.

## Verification

JavaScript syntax checks were run locally. End-to-end subscription, unsubscribe, real push delivery, cron timing, and browser client suppression require a deployed HTTPS origin, configured VAPID/Supabase secrets, a real browser permission grant, and a Supabase project. They have not been production-tested here.
