# Local development and checkout

## Start the Vercel application locally

The customer site can be served as static files for layout work, but a static server such as VS Code Live Server cannot execute the Vercel Functions in `api/`. Checkout calls `POST /api/create-order`; on a static server that path is not routed to `api/create-order.js` and can return 404 or 405.

Use Vercel CLI from the project directory:

1. Install the project dependencies with `npm install`.
2. Install Vercel CLI with `npm install --global vercel` (or use the documented `npx vercel` form).
3. Run `vercel login` and `vercel link` to associate this checkout with its Vercel project.
4. Pull the Development environment values with `vercel env pull .env.local`.
5. Start the local Vercel runtime with `vercel dev --listen 3000` and open `http://localhost:3000`.

Keep `.env.local` out of version control. Do not put server keys in HTML or browser JavaScript. If you do not want to link or authenticate this machine, Vercel CLI's `vercel dev --local` can run with manually supplied local configuration, but it will not retrieve the project's environment variables.

## Environment variables

The order function requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The service role key is server-only. The function calls the Supabase PostgREST RPC `create_order_with_token` with `p_request_id`, `p_items` (each item has `id` and a string `qty`), and `p_policy_accepted`.

Push notifications are optional to order creation. The push endpoints use `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`; admin notification features may also use `ADMIN_NOTIFICATION_EMAILS`. The customer page's Supabase client may require `SUPABASE_ANON_KEY` depending on its configured client initialization. Use the project’s Vercel Development variables as the source of truth; never copy a service role key or VAPID private key into client code.

## Checkout behavior and diagnostics

Checkout validates policy acceptance, cart contents, the chai minimum, and store hours before calling the order API. It calls the API once per attempt; a session request ID is reused for a retry of the same cart. Notification opt-in is optional and errors are caught independently. A successful API response must contain `order_id` and `token` before the WhatsApp message opens.

The API responds with JSON for method, input, configuration, database, and upstream failures. It logs a request ID plus bounded Supabase error diagnostics; it never logs credentials. A 405 from a static server means the Vercel function was not invoked. Missing environment configuration under Vercel Dev produces a 500 JSON response; a Supabase RPC error is a separate response and server log.

Vercel Analytics and Speed Insights are skipped on local/private hosts and loaded on regular hosted pages. They are optional and do not participate in checkout.

## What has and has not been verified

The request shape and RPC name have been inspected in the client and function. The actual `create_order_with_token` function, its database schema/permissions, and successful order creation require access to the live Supabase project. Do not use a real customer order as a connectivity probe. Test a successful checkout only with an approved test setup and test data.
