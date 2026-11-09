# Owlz Corner customer push setup

This adds browser push for customers while keeping the existing admin new-order push separate. Vercel serves the static site and `/api` functions. Production delivery is not enabled until the configuration below is applied.

## Supabase

Run [`supabase-notifications.sql`](supabase-notifications.sql) in the Supabase SQL editor. The migration creates RLS-protected subscription, template, campaign, settings, and private delivery-log tables. It uses `pg_cron`, `pg_net`, `pgcrypto`, and Supabase Vault. Confirm these extensions are available for the project. No browser role receives table access; Vercel uses the service-role key.

The scheduled jobs use Vault values named `owlzz_notification_url` and `owlzz_notification_cron_secret`. Create them with the commented `vault.create_secret` examples at the bottom of the SQL file, replacing the URL with `https://YOUR_DOMAIN/api/notifications-admin`. The same secret must be configured in Vercel as `NOTIFICATION_CRON_SECRET`.

The existing site computes cafe status from the clock in `index.html` (6 PM–3 AM Asia/Kolkata). It has no manual early-close/open setting. Scheduled campaigns use that current rule; if actual early closure must suppress the 2:55 AM campaign, first add a shared server-readable status setting and make both the storefront and campaign function use it.

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

Deploy the files, run the migration, configure the secrets and Vercel variables, then redeploy. The customer controls are in the storefront footer. Permission is requested only after the visitor clicks **Enable notifications**; **Unsubscribe** removes the server record and browser subscription. The root `/sw.js` handles push and click events and skips displaying a notification when it can see an open same-origin site client.

The admin notification section is available to signed-in users whose email is listed in `ADMIN_NOTIFICATION_EMAILS`. Add the same addresses administrators use with the existing Supabase login. The current project otherwise has no explicit admin role enforcement.

## Schedule and limits

Supabase Cron invokes opening at `12:30 UTC` (6 PM IST) and closing at `21:25 UTC` (2:55 AM IST). The database function takes a transaction advisory lock and writes a unique campaign row per type and IST business day before delivery, preventing repeat sends if cron runs twice. It checks the current clock-based open interval and the automatic enable flags. Each target is attempted independently; 404/410 subscriptions are deactivated and other failures are logged.

The site suppresses notifications when the service worker can observe any open same-origin tab/window. Browsers can limit client visibility while suspended, so this is best effort.

## Verification

JavaScript syntax checks were run locally. End-to-end subscription, unsubscribe, real push delivery, cron timing, and browser client suppression require a deployed HTTPS origin, configured VAPID/Supabase secrets, a real browser permission grant, and a Supabase project. They have not been production-tested here.
