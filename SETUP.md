# Owlz Corner — background push notifications

This adds Web Push to the existing plain HTML/CSS/JS Vercel site. It uses small Vercel serverless functions under `/api`; it does not convert the frontend into a Node application.

## Files
- `admin.html` — updated admin panel; replace the current admin page with this.
- `sw.js` — service worker; deploy at the site root (`/sw.js`).
- `api/push-public-key.js` — serves the public VAPID key.
- `api/push-subscribe.js` — verifies the signed-in Supabase user and saves that browser's subscription.
- `api/create-order.js` — updated existing order endpoint; retains the existing RPC flow and starts push delivery after a successful order.
- `lib/send-push.js` — server-only push sender.
- `package.json` — dependencies required by the Vercel functions.
- `supabase-push.sql` — subscription table SQL.

## 1. Deploy files
Copy the folders/files into the root of the existing Vercel project, preserving the paths. Merge the supplied `package.json` dependencies if you already have a package.json; do not overwrite unrelated dependencies. Keep your current `supabase-config.js` and other frontend files.

## 2. Supabase SQL
Run `supabase-push.sql` in Supabase SQL Editor. The table has RLS enabled and intentionally has no browser-facing policies; only server functions using the service-role key can read/write it.

## 3. Vercel environment variables
Keep your existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Add:
- `SUPABASE_ANON_KEY` — your project's anon/public key (used only to validate the logged-in admin session).
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` — for example `mailto:you@example.com` or your site's HTTPS URL.

Generate a VAPID pair locally after installing dependencies:

```bash
npx web-push generate-vapid-keys
```

Add the generated public/private values to Vercel environment variables. Never put the private key in HTML, `supabase-config.js`, GitHub, or any `NEXT_PUBLIC`/frontend variable. The public key is okay to expose through `/api/push-public-key`.

After adding environment variables, redeploy the Vercel project.

## 4. Enable on each admin device
Open `https://YOUR-DOMAIN/admin.html`, sign in, click **Enable sound & push notifications**, and allow notifications. Repeat on every device/browser that should receive orders. The site must be HTTPS (Vercel provides this).

## 5. Test
Keep the admin page closed. Place a test order from another device/browser. A push notification should appear on the subscribed admin device. Browser/OS notification settings and battery/background restrictions can still suppress delivery.

## Important
- Push delivery is best-effort and does not block customer checkout if the push provider is unavailable.
- Web Push generally works in supported browsers; iOS requires a supported version and the site added to the Home Screen. Some browsers/OS power settings may delay notifications.
- This implementation assumes all authenticated Supabase users who can access the admin panel are authorized admins. If regular customer accounts can sign in to the same Supabase Auth project, add an explicit admin allowlist/role check before deploying this subscription endpoint.
- The order RPC response is not assumed to contain the total; the push helper reads it back from the saved order row.
