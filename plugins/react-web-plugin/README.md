# react-web-plugin

Claude Code plugin for React **web** projects — the web-stack sibling of [`expo-rn-plugin`](../expo-rn-plugin/). Provides a database MCP server, scaffolding skills, review agents, browser preview, and TypeScript code intelligence for teams building multi-tenant B2B dashboards.

## Stack

- **Next.js** (App Router) + **TypeScript** (strict), hosted on **Vercel**
- **Tailwind CSS v4** (CSS-first tokens, no `tailwind.config.js`)
- **Postgres** — any provider via `DATABASE_URL` (RDS, Neon, Vercel Postgres, Supabase). Supabase-specific pieces (`@supabase/ssr` auth, RLS conventions, `templates/src/lib/supabase/`) are optional: keep them if Supabase is the backend, delete them if not
- **AWS S3** for file storage (presigned-URL pattern — see the `storage` skill)
- **Stripe** (Checkout, webhooks, entitlements — web billing, not RevenueCat)
- **React Query** + **react-hook-form** + **zod**
- **Sentry** (`@sentry/nextjs`)
- **Vitest** (unit) + **Playwright** (e2e)

**Alternative path:** the plugin also supports a **Vite SPA + Express API + Inngest + Nx/pnpm monorepo** stack for teams that split frontend and backend into separate deployables instead of using Next.js. See the `vite-spa`, `express-api`, `inngest-jobs`, `nx-monorepo`, and `contracts` skills below — check for `vite.config.ts`, a standalone Express `app.ts`/`server.ts`, `nx.json`, or `pnpm-workspace.yaml` before assuming the Next.js conventions apply.

## Relationship to expo-rn-plugin

This is a selective port, not a fork. What moved, what didn't:

**Ported as-is**

- `mcps/database-mcp-server/` — pure Postgres, copied verbatim (schema introspection, RLS inspection, query + migration generation)
- `bin/mcp-run.sh` — Doppler-aware MCP runner
- Generated-file guard, post-edit `tsc` hook, and the Stop-hook "verify UI before finishing" pattern
- Template hygiene: husky hooks, commitlint, prettier, editorconfig, renovate, quality-checks CI

**Ported with adaptation**

- Agents: `expo-scaffolder` → `web-scaffolder`; `conventions-reviewer` now enforces Tailwind tokens, server/client boundaries, and **tenant isolation** instead of Tamagui/Lingui/offline-outbox; `auth-specialist` covers SSR cookie sessions instead of native sign-in SDKs; `payment-specialist` covers Checkout/webhooks instead of PaymentSheet; `database-specialist` and `refactor-runner` nearly as-is
- Skills: `coding-standards`, `data-fetching` (the Supabase read-after-write race applies identically), `form` (Tailwind fields replace Tamagui), `testing` (Vitest/Playwright replace jest-expo/Maestro), `stripe`, `sentry`, `scaffold`, `preview` (browser screenshot replaces simulator screenshot), `i18n` (short, optional next-intl pointer replaces the Lingui pipeline)

**Dropped** (mobile-only concerns)

- OTA updates, push notifications / FCM, IAP / RevenueCat, offline outbox / MMKV, EAS builds & store workflows, figma-tamagui token sync, speech recognition, Meta ads SDK, the expo MCP server

**Added** (web-only concerns)

- `scripts/browser-screenshot.sh` — Playwright screenshot of the running dev server
- Stripe-on-web guidance: raw-body webhook verification, Billing Portal, entitlements table
- `deployment` skill (Vercel: environments, env-var scoping, logs, Next.js-on-Vercel gotchas) and the Vercel MCP
- `storage` skill (AWS S3: presigned uploads/downloads, multi-tenant object keys)
- Agent-workflow templates: `implementer` / `reviewer` project agents, the `claude-code-review.yml` PR workflow, and `review-focus.md`

**Database MCP connection modes**

The bundled database MCP server connects via `DATABASE_URL` (any Postgres; set `DB_SCHEMA` if your schema isn't `public`), or falls back to `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (requires the `run_sql` RPC from the expo-rn-plugin setup).

## Requirements

- macOS or Linux (Windows: [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install))
- Node.js 18+
- Python 3 (`python3`) — used by `mcp-run.sh` and `guard-generated-files.sh` to parse JSON
- Yarn Berry (`corepack enable && corepack prepare yarn@stable --activate`)
- Claude Code CLI
- [`uv`](https://docs.astral.sh/uv/) (`brew install uv`) — runs the AWS MCP server; skip if you don't use AWS
- Optional: [Doppler](https://doppler.com) CLI for secret management, Stripe CLI for webhook development

## Install

```bash
# 1. Add this repo as a plugin marketplace (once per machine)
claude plugin marketplace add anicca-labs/claude

# 2. Install the plugin
claude plugin install react-web-plugin@anicca-labs --scope user
#   --scope user    → every project on this machine (recommended for individuals)
#   --scope project → recorded in the repo's committed .claude/settings.json (whole team)
#   --scope local   → this repo only, not committed

# Later: pick up new versions
claude plugin marketplace update anicca-labs && claude plugin update react-web-plugin@anicca-labs
```

Restart Claude Code (in VS Code: quit the app with Cmd+Q, not just reload the window) after installing or updating. Inside a session, `/plugin` does the same interactively.

Testing from source? `CLAUDE_PLUGIN_ROOT=/path/to/react-web-plugin claude --plugin-dir /path/to/react-web-plugin`

### Connect the MCP servers

Every server is optional — connect the ones your project uses and disable the rest in `/mcp` (per project, so they stop showing as failed). Keys go in Doppler or the project's `envFile` (see [Configuration](#configuration)), never in the repo.

| Server | What you need | Where to get it |
| --- | --- | --- |
| `vercel` | Browser login | `/mcp` → `vercel` → authenticate; pick the team that owns your projects |
| `stripe` | `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys. Prefer a **restricted test-mode** key (`rk_test_…`) |
| `render` | `RENDER_API_KEY` | Render → Account Settings → API Keys (browser login is not supported) |
| `inngest` | Nothing | Local only — the Inngest dev server must be running on `localhost:8288` |
| `aws` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | An IAM user with a **read-only** policy scoped to the buckets you need. Needs `uv` |
| `sentry` | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` | Sentry → Settings → Auth Tokens; org slug from your Sentry URL |
| `database` | `DATABASE_URL` (optional `DB_SCHEMA`) | Your Postgres connection string — point it at a local/dev database |
| `supabase` | `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens |
| `github` | `GITHUB_PERSONAL_ACCESS_TOKEN` **in your shell environment** | GitHub → Settings → Developer settings → tokens. HTTP entry: it reads Claude Code's own environment, not the `envFile` |
| `doppler` | Doppler CLI login | `doppler login` |
| `context7`, `chrome-devtools` | Nothing | `chrome-devtools` needs Google Chrome installed |

Check what connected with `/mcp`.

## New app quickstart

```bash
# 1. Create the Next.js app
yarn create next-app my-app --typescript --app && cd my-app

# 2. Install the plugin (see Install above for the one-time marketplace step)
claude plugin install react-web-plugin@anicca-labs --scope project

# 3. Seed the project from templates/ — copy what applies:
#    CLAUDE.md, .claude/, .github/, .husky/, .prettierrc, .prettierignore,
#    .editorconfig, .gitattributes, .gitignore, .vscode/, eslint.config.js,
#    commitlint.config.js, renovate.json, next.config.ts, tsconfig.json,
#    postcss.config.mjs, middleware.ts, app/globals.css, src/lib/, .env.example
#    Compare package.json scripts/deps against templates/package.json and merge.

# 4. Wire secrets — Doppler project + dev/stg/prd configs (see below), or .env.local for a spike

# 5. Point the database MCP at your Supabase project:
#    mcp.config.json in the app root with a doppler block, or SUPABASE_URL +
#    SUPABASE_SERVICE_ROLE_KEY in the environment

# 6. Start Claude
claude
```

The templates include an **Agent workflow** section in `CLAUDE.md` plus `.claude/agents/{implementer,reviewer}.md` — plan in the main loop, delegate multi-file implementation, review before committing. `.github/workflows/claude-code-review.yml` adds an automatic Claude review on every PR (set up the GitHub App with `/install-github-app`; edit `.github/review-focus.md` per project).

## Plugin components

### Skills (invoke with `/react-web-plugin:<name>`)

| Skill | Description |
| --- | --- |
| `scaffold <table>` | Generate full CRUD (types, hooks, pages, form) from a database table |
| `form <feature>` | Generate a zod schema + react-hook-form + Tailwind-styled form |
| `coding-standards` | Load project coding standards on demand (TypeScript, Tailwind, server/client boundaries, env vars) |
| `data-fetching` | Server-component vs React Query decisions, mutation strategies, Supabase read-after-write race |
| `testing` | Vitest + Playwright — what to test where, provider setup, canonical patterns |
| `stripe` | Checkout, Elements, raw-body webhook verification, `stripe listen`, entitlements pattern |
| `sentry` | `@sentry/nextjs` setup (three runtimes), source maps, capture patterns |
| `preview` | Browser screenshot of the dev server + surface errors + tsc — use after every UI change |
| `i18n` | *(optional)* next-intl pointer — adopt when a second locale is real, plus rules that keep adoption cheap |
| `vite-spa` | Vite + React Router SPA conventions — routing, persona-based `React.lazy` code-splitting, guard components, Vitest-in-`vite.config.ts` |
| `express-api` | Express API conventions — middleware order (incl. raw-body webhook routes before `express.json()`), route/service layering, singleton DB client, managed-test-server integration testing |
| `inngest-jobs` | Inngest background jobs/cron — function registry, `step.run`/`step.sendEvent`, sweep-then-dispatch, typed event catalogs, idempotent money-mutating work |
| `nx-monorepo` | Nx + pnpm monorepo conventions — workspace layout, `@nx/enforce-module-boundaries` tags, `nx affected`, caching |
| `contracts` | Zod-as-contract pattern — one schema shared as both compile-time type and runtime validation across app and API |

### Agents (available in `/agents`)

| Agent | Model | Description |
| --- | --- | --- |
| `web-scaffolder` | Haiku | Scaffolding specialist — delegates heavy CRUD generation out of main context |
| `database-specialist` | Opus | DB queries, migrations, RLS policies, tenant-scoped policy review |
| `auth-specialist` | Opus | Supabase SSR sessions, OAuth callbacks, middleware-protected routes |
| `payment-specialist` | Opus | Stripe Checkout, webhook verification, subscription lifecycle, entitlements |
| `conventions-reviewer` | Opus | Reviews a diff against project conventions (Tailwind tokens, server/client boundaries, read-after-write, zod boundaries, tenant isolation) — run before merging |
| `refactor-runner` | inherit | Long-horizon refactors and Next.js/dependency upgrades — kick off and check back |

Models are declared as **aliases** (`opus` / `haiku`), not pinned snapshots, so agents track the latest model automatically. The `refactor-runner` pins no model — it inherits the session's; for sustained multi-hour runs invoke it with `/model fable` if your plan includes Fable 5.

### MCP servers

| Server | Description |
| --- | --- |
| `database` | DB introspection, query generation, migration generation, RLS inspection. `run_query` is **read-only, enforced by Postgres** (read-only transaction, single statement, 15s timeout, always rolled back) and needs `DATABASE_URL`; in the Supabase REST fallback mode it refuses to run. Ships pre-built in `dist/`. Still point it at a dev database, ideally with a read-only role. |

Stdio servers are started by `bin/mcp-run.sh`, which gives each one a scrubbed environment: a fixed baseline (PATH, HOME, locale, proxy/CA settings) plus **only the keys that server declares** with `--keys` in `.mcp.json`. So Context7 never sees your Stripe key. Declared keys come from Claude Code's environment, then the project's secret source (Doppler via plugin `userConfig`, an `mcp.config.json` `doppler` block or `doppler setup`; otherwise the `envFile`), then `--set KEY=VALUE` pins, which nothing can override (the AWS server's `READ_OPERATIONS_ONLY=true` is one). Adding a server of your own: `mcp-run.sh --keys "MY_API_KEY" -- npx -y my-mcp-server@1.2.3`. Tests: `bash plugins/react-web-plugin/tests/mcp-run.test.sh`.

**Not using Doppler?** Many web projects keep secrets in Vercel/Render environment variables instead of a secrets manager. Since MCP servers don't read a project's `.env` on their own, point the runner at one so servers like `stripe` and `sentry` get their keys without every developer exporting them in their shell profile:

```jsonc
// mcp.config.json at the repo root
{ "envFile": "apps/api/.env" }   // relative to this file, or an absolute path
```

`CLAUDE_PLUGIN_OPTION_ENV_FILE` does the same thing as an absolute-path override. Doppler still takes precedence where it's configured; the `.env` path is the fallback. Point it at a **gitignored** `.env` — never a committed `.env.example`, which holds empty placeholders and would put a real secret in version control.

Two more have been added to `.mcp.json` for projects on the Vite/Express/Inngest path:

- **Render** — official MCP server, **API-key authenticated**: set `RENDER_API_KEY` (Render → Account Settings → API Keys) in Doppler or the `envFile`, like any other server secret. The remote endpoint is bridged over stdio with `mcp-remote` so the key goes through `mcp-run.sh` — a plain HTTP entry only sees Claude Code's own process env, which GUI-launched editors often don't inherit from the shell profile. Render's OAuth server has no dynamic client registration, so generic `/mcp` browser login fails ("does not support dynamic client registration"). Useful when the API/Express app is deployed on Render (service status, logs, deploys).
- **AWS** — official `awslabs.aws-api-mcp-server`, run with `uvx` (install `uv`: `brew install uv`). Credentials follow the boto3 chain: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` from Doppler or the `envFile`, or a local profile via `AWS_API_MCP_PROFILE_NAME`. Ships with `READ_OPERATIONS_ONLY=true` — the server refuses any API call AWS classifies as a write. IAM is still the real control: give it a read-only key scoped to the buckets you want inspected. Useful for S3 storage (list/inspect objects, bucket policy, CORS).
- **Inngest** — official MCP server, but **local-only**: it's the dev server's own MCP endpoint (`http://localhost:8288/mcp`), only reachable while `inngest-cli dev` is running. See the `inngest-jobs` skill.

### Hooks (automatic)

| Event | Hook | Effect |
| --- | --- | --- |
| `PreToolUse` (Write/Edit) | `guard-generated-files.sh` | Blocks edits to generated files (`generated/`, `database.types.ts`, `.next/`) — run the generator instead |
| `PostToolUse` (Write/Edit) | `tsc-check.sh` | Runs `tsc --noEmit` after edits to TypeScript/JS files (skips markdown, JSON, and assets) |
| `Stop` | `verify-ui-preview.sh` | If UI source files changed but weren't visually verified, blocks once and prompts to run the `preview` skill (loop-guarded; skips non-visual changes) |

## Configuration

The plugin has two optional install-time config keys:

| Key | Description |
| --- | --- |
| `doppler_project` | Your Doppler project name (e.g. `my-app`) |
| `doppler_config` | Config to use (`dev` / `stg`, default: `dev`). Production configs (`prd`, `prod`, `production`, `prd_*`) are refused unless you set `MCP_RUN_ALLOW_PRODUCTION=1` in your own environment |

Alternatively, drop an `mcp.config.json` in the app root:

```json
{
  "doppler": { "project": "my-app", "config": "dev" },
  "database": { "schema": "api" }
}
```

The `doppler` block is what connects the database MCP server to `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` without a checked-in `.env`.

**No Doppler?** Point the plugin at a private env file instead — keep it outside the repo (e.g. `~/.config/<project>/mcp.env`, `chmod 600`) and keep `mcp.config.json` out of git (add it to `.git/info/exclude` if the project's `.gitignore` doesn't cover it):

```json
{ "envFile": "/Users/you/.config/my-app/mcp.env" }
```

```bash
# ~/.config/my-app/mcp.env — one KEY=value per line
STRIPE_SECRET_KEY=rk_test_...
RENDER_API_KEY=rnd_...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-west-2
```

`envFile` takes an absolute path or one relative to `mcp.config.json`. It is read as plain `KEY=value` data (comments, `export` and quotes are fine; nothing in it is ever executed), and each server only receives the keys it declares. An env file that is committed to git is refused, so a cloned repo can't feed values to your servers. HTTP entries (`vercel`, `github`, `inngest`) don't use it.

## Development

### Build the MCP server manually

```bash
cd mcps/database-mcp-server && yarn install --immutable && yarn build
```

`dist/` is committed to git — rebuild before pushing source changes.

### Testing the plugin locally

```bash
CLAUDE_PLUGIN_ROOT=$(pwd) claude --plugin-dir .
```

### Validate the manifest

```bash
claude plugin validate
```
