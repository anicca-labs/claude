# Project Name

## Never do

- `any`, `as` casts, `eslint-disable` — fix at source
- Inline `style={{…}}`, ad-hoc hex/rgb colors, or arbitrary Tailwind values (`p-[13px]`) when a token exists — tokens live in `app/globals.css` `@theme`; conditional classes go through `cn()` (`src/lib/utils.ts`)
- `"use client"` on a component with no interactivity — server components are the default; push the directive to the leaves
- Import a server-only module (service-role client, `src/lib/stripe.ts`) from a client component — those modules carry `import "server-only"` so the build fails; don't remove that line to "fix" it
- Trust a client-supplied `business_id` — resolve the tenant server-side from the caller's membership; this is a multi-tenant app and cross-tenant leakage is the worst bug we can ship
- Skip zod parsing on a boundary — route handler bodies, server action inputs, search params, and webhook payloads are untrusted
- Read a webhook body with `request.json()` — Stripe signature verification needs the raw `request.text()`
- Flip entitlements from the checkout success page — the webhook is the source of truth
- `useEffect` + `fetch` for server data — server component fetch or a React Query hook
- `invalidateQueries` in `onSettled` on a **create** mutation — Supabase read-after-write race makes the new row flash and disappear; `onSuccess` + `setQueryData` (see `/react-web-plugin:data-fetching`)
- Edit `src/lib/database.types.ts` or anything under `generated/` — regenerate (`yarn generate:db-types`)
- `getSession()` for authorization on the server — `getUser()` revalidates the JWT; `getSession()` trusts the cookie
- Store tokens in `localStorage` — `@supabase/ssr` owns cookie storage
- `npm` / `npx` / `pnpm` — always `yarn` (Berry); one-offs via `yarn dlx`
- `<img>` / `<a>` for internal use — `next/image` and `next/link`
- Log PII in Sentry tags, breadcrumbs, or analytics — opaque internal IDs only
- Business logic in `app/` route files — pages/layouts stay thin and compose from `src/features/` and `src/components/`
- Create a migration without explicit GRANTs + `enable row level security` + tenant-scoped policies

## Always do

- Run `tsc --noEmit` after every change — zero errors before done
- Verify UI changes with `/react-web-plugin:preview` (browser screenshot + dev-server errors + tsc) before reporting done
- New tables: tenant column + RLS scoped through the membership table; then regenerate DB types
- Every list page ships all four states: loading, error, empty, data
- Apply server-side changes (migrations, RLS, edge functions) to **both** stg and prd Supabase projects
- Keep files under 500 lines
- Check `docs/solutions/` before implementing auth flows, billing, or webhooks — solved problems are documented there to prevent repeating known mistakes

## Stack quick-ref

Run `/react-web-plugin:coding-standards` to load full standards. Quick pointers:

- **Framework:** Next.js App Router — routes in `app/`, everything else in `src/`
- **Styling:** Tailwind v4, CSS-first tokens in `app/globals.css` — no `tailwind.config.js`
- **Data:** server components for first paint; React Query for interactive data — `/react-web-plugin:data-fetching`
- **Forms:** react-hook-form + zod + Tailwind fields — `/react-web-plugin:form`
- **Auth:** Supabase SSR cookie sessions (`@supabase/ssr`), refresh in `middleware.ts`
- **Payments:** Stripe Checkout + webhooks + entitlements table — `/react-web-plugin:stripe`
- **Errors:** Sentry (`@sentry/nextjs`, three runtime configs) — `/react-web-plugin:sentry`
- **Tests:** Vitest colocated + Playwright in `e2e/` — `/react-web-plugin:testing`
- **Scaffold:** CRUD from DB table — `/react-web-plugin:scaffold`
- **Env vars:** Doppler — `NEXT_PUBLIC_` only for browser-safe values; inlined at build time

## How to work in this repo

- **Plan in the main loop.** Architecture, data-model, and access-control decisions are made here, not delegated. Break features into well-scoped tasks before implementing.
- **Delegate implementation.** For any multi-file implementation task, spawn the `implementer` agent with a clear spec (what to build, which files/areas, what "done" means). Do not implement large tasks directly in the main loop — keep this context for decisions and review.
- **Review before committing.** After the implementer reports back, run the `reviewer` agent on the diff (quick in-loop gate). Every PR is also reviewed automatically by the Claude GitHub workflow (`.github/workflows/claude-code-review.yml`) — address its inline comments before merging. For big or risky merges, additionally run `/code-review ultra` locally.
- One review layer is the policy. Do not stack additional review passes; vary the lens (correctness, security), not the count.
- Trivial edits (one file, a few lines) skip the ceremony: just do them in the main loop.

## Project context

<!-- Fill in: production domain, Supabase project refs (stg + prd), Sentry project, Stripe account -->

- DB schema: `api` (not `public`); every `CREATE TABLE` migration must include explicit GRANTs (`authenticated`, `service_role`) + `enable row level security` — Supabase drops auto-grants for new tables from 2026-05-30 / 2026-10-30. The `generate_migration` tool adds this automatically.
- **Tenant model:** `businesses` ← `memberships` (user ↔ business, with role) — every tenant-owned table carries `business_id`
- **Routes:** `app/` — route groups `(auth)` / `(dashboard)`; route files are thin wrappers
- **Features:** `src/features/<feature>/` — schema, hooks, and components per feature
- **Components:** shared UI in `src/components/`
- **Lib:** `src/lib/` — `supabase/{client,server}.ts`, `stripe.ts`, `utils.ts` (`cn`), `database.types.ts` (generated)
- **Middleware:** `middleware.ts` — Supabase session refresh + protected-route redirects; Stripe webhook excluded from the matcher
