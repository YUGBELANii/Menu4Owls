# Supabase and Vercel deployment

This repository had no prior `supabase/migrations` directory. The following file establishes that conventional migration location for the new feature:

1. `supabase/migrations/20261111000100_admin_store_and_banners.sql` (store settings and banners)
2. `supabase/migrations/20261111000200_manual_orders.sql` (manual orders)

Execute the SQL files, in full and in the order above, in the Supabase SQL Editor before deploying the frontend/API changes. The first is additive and rerunnable for its tables, seed rows, indexes, policies, and function. It creates the settings and banner tables, seeds the default 6:00 PM–3:00 AM schedule and current Diwali copy, and installs `get_store_status()`.

The second migration depends on the pre-existing Supabase order infrastructure confirmed from the provided schema: `orders`, `products`, `order_token_reservations`, `order_token_seq`, and `generate_order_token(uuid,jsonb)`. This project's repository did not contain migrations defining that existing infrastructure. The new manual-order RPC adds only nullable customer/source columns to the existing `orders` table and uses the existing token reservation/generator; it creates no parallel order or token tables.

The reported sequence state was `order_token_seq.last_value = 52`; with no concurrent allocation, its next generated token is `053`. Do not reset the sequence to match the largest visible order token: existing reservations may have already consumed numbers, and reusing them could collide.

## Verification queries

Run these after the migration. The SQL Editor runs with elevated database access, so these queries verify installed state and grants; they do not by themselves exercise RLS as an anonymous browser user.

```sql
select id, operating_mode, opening_time, closing_time
from public.store_settings
where id = 1;
```

Expected: one row, `operating_mode = 'schedule'`, `opening_time = 18:00:00`, and `closing_time = 03:00:00`.

```sql
select title, visible, display_order
from public.banners
where title = '🪔 HAPPY DIWALI 🪔';
```

Expected: one visible row at display order `0`, containing the existing Diwali greeting copy.

```sql
select public.get_store_status();
```

Expected: a JSON object with only `is_open`, `is_late`, and `message`. It does not expose the settings row. With default settings, `is_open` is true from 6:00 PM through 2:59:59 AM Asia/Kolkata, and false otherwise. `message` reflects the current state.

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('store_settings', 'banners')
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;
```

Expected: `anon` and `authenticated` have `SELECT` on `banners` only, with RLS limiting rows to `visible = true`; they have no privileges on `store_settings`. `service_role` has access for the server API. Public table writes must not be granted.

```sql
select has_function_privilege('anon', 'public.get_store_status()', 'EXECUTE') as anon_can_read_status,
       has_function_privilege('authenticated', 'public.get_store_status()', 'EXECUTE') as signed_in_can_read_status,
       has_function_privilege('service_role', 'public.get_store_status()', 'EXECUTE') as service_can_read_status;
```

Expected: all three values are true. Admin changes go through the server API, which checks the bearer session against `ADMIN_NOTIFICATION_EMAILS` before using the service role.

```sql
select has_function_privilege('anon', 'public.create_manual_order_with_token(uuid,text,text,text,jsonb,boolean)', 'EXECUTE') as anon_can_create,
       has_function_privilege('authenticated', 'public.create_manual_order_with_token(uuid,text,text,text,jsonb,boolean)', 'EXECUTE') as authenticated_can_call;
```

Expected: `anon_can_create = false` and `authenticated_can_call = true`. The function also checks the two existing administrator email identities internally; a signed-in non-admin must receive an authorization error.

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
  and column_name in ('customer_name','customer_phone','source')
order by column_name;
```

Expected: all three nullable `text` fields exist, preserving compatibility with older orders that did not store these values.

```sql
select last_value from public.order_token_seq;
```

Expected immediately after migration: unchanged from the pre-migration value (`52` in the supplied schema output). This query does not allocate a token. A successful manual order should consume the next sequence value (normally `053` if no checkout allocates concurrently).

Then verify with a logged-out browser that `GET /api/admin-content?type=banners` returns only visible banners, `GET /api/admin-content?type=settings` is rejected, and writes are rejected. Verify the Diwali banner renders from the API, the store status agrees with the schedule, and checkout rejects an order while closed. Log into the admin pages with an allowlisted account and verify settings persist, banner show/hide works, and a non-allowlisted account receives an authorization error. In a controlled setup with test products, create one test manual order from the admin page and verify it appears in the existing `orders` history as `pending`, includes its name/phone and `whatsapp` or `phone` source, has server-derived item prices, and has a reservation linked to the same order ID. Do not use a real customer order as a test.

For a late opening, leave the normal 6:00 PM opening time unchanged. Set the override mode to `late`, the override start to the scheduled opening time in Asia/Kolkata, the override end to the delayed opening time, and expiry no later than 30 days out. The evaluator reports the late message during that interval, then resumes the normal schedule and accepts orders when it opens.

## Configuration and app deployment

Configure these Vercel environment variables for the deployment environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `SUPABASE_ANON_KEY`
- `ADMIN_NOTIFICATION_EMAILS` (comma-separated administrator email allowlist)

After the SQL checks pass, commit the prepared repository changes and push them through the existing GitHub-to-Vercel workflow. If that workflow is configured for automatic deployments, Vercel will build from the pushed branch; otherwise use the project's existing Vercel deployment procedure. Do not add service-role credentials to client files. The migration is prepared locally only; neither Supabase nor Vercel has been changed by this work.
