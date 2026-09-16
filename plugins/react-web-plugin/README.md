# react-web-plugin

Claude Code plugin for React **web** projects — the web-stack sibling of [`expo-rn-plugin`](../expo-rn-plugin/). Provides a database MCP server, scaffolding skills, review agents, browser preview, and TypeScript code intelligence for teams building multi-tenant B2B dashboards.

## Stack

- **Next.js** (App Router) + **TypeScript** (strict)
- **Tailwind CSS v4** (CSS-first tokens, no `tailwind.config.js`)
- **Postgres / Supabase** (`@supabase/ssr` cookie sessions, RLS, `api` schema)
- **Stripe** (Checkout, webhooks, entitlements — web billing, not RevenueCat)
- **React Query** + **react-hook-form** + **zod**
- **Sentry** (`@sentry/nextjs`)
- **Vitest** (unit) + **Playwright** (e2e)

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
- Agent-workflow templates: `implementer` / `reviewer` project agents, the `claude-code-review.yml` PR workflow, and `review-focus.md`

## Requirements

- macOS or Linux (Windows: [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install))
- Node.js 18+
- Python 3 (`python3`) — used by `mcp-run.sh` and `guard-generated-files.sh` to parse JSON
- Yarn Berry (`corepack enable && corepack prepare yarn@stable --activate`)
- Claude Code CLI
- Optional: [Doppler](https://doppler.com) CLI for secret management, Stripe CLI for webhook development

## Install

```bash
claude plugin install react-web-plugin --scope project
# Testing from source? Set CLAUDE_PLUGIN_ROOT explicitly:
#   CLAUDE_PLUGIN_ROOT=/path/to/react-web-plugin claude --plugin-dir /path/to/react-web-plugin
```

## New app quickstart

```bash
# 1. Create the Next.js app
yarn create next-app my-app --typescript --app && cd my-app

# 2. Install the plugin (project scope)
claude plugin install react-web-plugin --scope project

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
| `database` | DB introspection, query generation, migration generation, RLS inspection (ships pre-built in `dist/` — no build step) |

The server is wrapped by `bin/mcp-run.sh`, which injects secrets from Doppler when a project is configured (via plugin `userConfig`, an `mcp.config.json` `doppler` block, or `doppler setup`) and runs the command directly otherwise. Add project-level MCP servers (supabase, sentry, stripe, github, context7) in the app's own `.mcp.json` as needed — the expo plugin's entries are a good reference.

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
| `doppler_config` | Config to use (`dev` / `stg` / `prd`, default: `dev`) |

Alternatively, drop an `mcp.config.json` in the app root:

```json
{
  "doppler": { "project": "my-app", "config": "dev" },
  "database": { "schema": "api" }
}
```

The `doppler` block is what connects the database MCP server to `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` without a checked-in `.env`.

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
