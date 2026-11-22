# React Migration Preparation — Owlz Corner

## Status
Preparation only. The existing production site remains unchanged. This branch records the migration approach before implementation.

## Current architecture (audited on 2026-11-22)
- The default branch is `main`.
- The storefront is `index.html` (about 69.9 KB) with substantial inline CSS/JavaScript and direct DOM rendering.
- Admin pages are separate HTML documents:
  - `admin.html`
  - `admin-orders.html`
  - `admin-products.html`
  - `admin-notifications.html`
  - `admin-promotions.html`
  - `admin-store-status.html`
  - `admin-finance.html`
- Shared styles are in `style.css` and `admin-ui.css`.
- Theme behavior is currently managed by `theme.js` and localStorage.
- Admin navigation/disclosures are injected by `admin-navigation.js`.
- Supabase is initialized in `supabase-config.js`; the existing project/schema and anon-key approach must be preserved.
- Push behavior includes `sw.js`, `customer-push.js`, `admin-notifications.js`, and `admin-push-campaigns.js`.
- `package.json` currently has `@supabase/supabase-js` and `web-push`, but no React/Vite scripts or dependencies.
- Vercel Analytics is loaded by the current storefront.

## Migration decisions
1. Use React + Vite for the new frontend.
2. Keep Supabase, database tables, policies, and existing business rules unchanged during the frontend migration.
3. Migrate incrementally; do not replace the live static site until the React version passes feature-parity checks.
4. Keep the service worker and push subscription/click behavior working. Avoid changing its scope or URL until tested.
5. Preserve existing URLs where practical, especially customer-facing and admin entry points.
6. Keep secrets out of the browser bundle. The existing Supabase anon key is a public client key; never introduce a service-role key into frontend code.

## Proposed application structure
- `src/app/` — app shell, route definitions, route guards
- `src/components/` — shared navigation, buttons, dialogs, loading/error/empty states
- `src/features/storefront/` — menu, categories, cart, checkout, reviews, customer order history
- `src/features/admin/` — admin shell and existing admin sections
- `src/lib/supabase/` — Supabase client and shared query helpers
- `src/lib/analytics/` — Vercel Analytics integration
- `src/styles/` — design tokens, global styles, storefront/admin styles
- `public/` — brand assets, manifest, service worker and other static assets

## Implementation sequence
1. **Foundation:** Vite, React, routing, lint/build checks, environment configuration, theme provider, shared layout primitives.
2. **Storefront shell:** migrate navigation, theme, hero, menu loading and category navigation without changing data semantics.
3. **Storefront interactions:** cart, checkout/WhatsApp flow, rewards, reviews, customer order history and push opt-in.
4. **Admin shell:** Supabase auth/session handling, sidebar, route protection and theme persistence.
5. **Admin features:** migrate each existing admin page one at a time, preserving its current permissions and workflows.
6. **PWA/production integration:** service worker, push notifications, analytics, metadata, redirects/rewrites and Vercel deployment configuration.
7. **Cutover:** regression testing on mobile/desktop, verify every Supabase workflow, then switch production only after explicit approval.

## Regression checklist
- Store open/closed status and schedule.
- Menu, category filters, product availability and images.
- Cart quantity, totals, delivery fee, minimum order rules and checkout.
- WhatsApp order payload and order-history/token behavior.
- Rewards, reviews and weekly leaderboard.
- Customer push permission, subscription, notifications and notification click navigation.
- Admin sign-in, session persistence and sign-out.
- Orders: view, filter, update status, create/order actions and analytics.
- Products: CRUD, availability, category assignment and inventory-related behavior.
- Notifications, promotions, store status and finance.
- Light/dark theme across every customer/admin route.
- Vercel Analytics and current production URLs.

## Guardrails
- No database migrations as part of the initial frontend conversion.
- No redesign or feature additions mixed into the migration unless required for compatibility.
- No production cutover until the old and new flows have been compared.
- Each feature migration should be a small reviewable commit/PR with a test checklist.
