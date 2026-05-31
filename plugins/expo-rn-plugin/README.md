# expo-rn-plugin

Claude Code plugin for React Native / Expo projects. Provides MCP servers, scaffolding skills, Figma sync, i18n review, and TypeScript code intelligence — all in one installable plugin. Supports Supabase, Firebase, and REST backends.

## Requirements

- macOS or Linux (Windows: [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install))
- Node.js 18+
- Python 3 (`python3`) — used by `mcp-run.sh` and `guard-generated-files.sh` to parse JSON
- Yarn Berry (`corepack enable && corepack prepare yarn@stable --activate`)
- [Homebrew](https://brew.sh) — setup-app.sh installs `jq` and `doppler` via brew
- Claude Code CLI

## New app quickstart

> **Before step 3:** you need a [Doppler](https://doppler.com) account and workspace. If you haven't set it up yet:
>
> 1. Create a free account and workspace at [doppler.com](https://doppler.com)
> 2. Run `doppler login` in your project folder — this authenticates the CLI and links the folder to your workspace
>
> `setup-app.sh` then runs the service wizard interactively to collect credentials for each optional MCP (Doppler, Supabase, Figma, Sentry, Stripe, Firebase). Skip any you don't need yet — their MCP servers will show red until configured, which is intentional. Re-run `setup-app.sh` any time to fill in more.
>
> **`CLAUDE_PLUGIN_ROOT`** is set automatically by the marketplace installer inside `claude` sessions. When testing from source with `--plugin-dir`, it is **not** set automatically — prefix the command as shown below.

```bash
# 0. Pre-requisites (one-time, outside the project)
#    - Create a Doppler account + workspace at doppler.com
#    - doppler login   ← authenticate the CLI in your project folder

# 1. Create your Expo app
yarn create expo-app my-app && cd my-app

# 2. Install the plugin
claude plugin install expo-rn-plugin --scope project
# Testing from source? Set CLAUDE_PLUGIN_ROOT explicitly:
#   CLAUDE_PLUGIN_ROOT=/path/to/expo-rn-plugin claude --plugin-dir /path/to/expo-rn-plugin

# 3. Run one-time setup — interactive, takes ~2 min
bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup-app.sh"
# When testing from source (CLAUDE_PLUGIN_ROOT not set), run directly:
#   bash /path/to/expo-rn-plugin/scripts/setup-app.sh
# → Copies CLAUDE.md, mcp.config.json, .mcp.json, .claude/settings.json, .claude/commands/
# → Auto-fills CLAUDE.md with project name from package.json
# → Detects actual dir structure and writes mcp.config.json
# → Adds sync-env-vars + sync-design-tokens to package.json; wires prestart
# → Scaffolds env.template.yaml; ensures .env is gitignored
# → Installs typescript-language-server and typescript
# → Runs doppler setup (interactive); auto-fills Figma file ID,
#    Supabase project ref, and Sentry project into CLAUDE.md

# 4. Edit CLAUDE.md — in the "## Project context" section, fill in:
#    - api: https://api.your-domain.com
#    (project name, Figma file ID, Supabase ref, Sentry project are auto-filled)

# 5. Start Claude
claude
```

## Production setup (new app)

Delegate as much as possible to EAS — it handles certificates, provisioning profiles, App Store app creation, and keystore management automatically.

> **i18n compiled catalogs:** do NOT gitignore `src/i18n/locales/compiled/`. EAS local builds archive the project via git — gitignored files never reach the build temp directory, causing Metro to fail resolving `locales/compiled/en`. Commit the compiled output. Add `"postinstall": "yarn i18n:compile"` as a safety net for local dev.

### 1. iOS — App Store Connect API key (do this first)

Create an App Store Connect API key with **App Manager** role and give it to EAS:

```bash
eas credentials --platform ios
# Choose: "Add new App Store Connect API Key" → paste Key ID + Issuer ID + upload .p8
```

With this in place, EAS will automatically:

- Register the bundle ID in the Apple Developer portal
- Create the app in App Store Connect (sets `ascAppId` in `eas.json`)
- Generate and manage provisioning profiles and certificates
- No Xcode or manual portal work needed

### 2. Android — let EAS manage the keystore

On first `eas build --platform android`, EAS generates and stores the keystore automatically. After the build, get the SHA-1 it used:

```bash
eas credentials --platform android  # shows the SHA-1 fingerprint
```

Add it to Firebase → Authentication → Google → re-enable to create the Android OAuth client.

### 3. What still requires manual steps

| Step | Where |
| --- | --- |
| Apple Merchant ID (Apple Pay) | [developer.apple.com](https://developer.apple.com) → Identifiers → Merchant IDs |
| RC iOS In-App Purchase key | App Store Connect → Users & Access → Integrations → In-App Purchase |
| RC Android service account | Google Cloud Console → IAM → Service Accounts → download JSON → Play Console → Users & permissions → grant access |
| RC paywalls | `app.revenuecat.com` → Paywalls → New (dashboard only, no API) |

### 4. RevenueCat — platform-specific API keys

RC requires separate public SDK keys per platform. Use `Platform.OS` in `configureRevenueCat`:

```ts
// src/services/revenue-cat/index.ts
const apiKey =
  Platform.OS === 'android' && process.env.EXPO_PUBLIC_RC_ANDROID_API_KEY
    ? process.env.EXPO_PUBLIC_RC_ANDROID_API_KEY
    : process.env.EXPO_PUBLIC_RC_API_KEY
```

Set both `REVENUECAT_API_KEY` (iOS `appl_…`) and `REVENUECAT_ANDROID_API_KEY` (Android `goog_…`) in Doppler prd. Stg can use a single `test_…` key for both platforms.

### 5. Release workflow

| Script | Output | What it does |
| --- | --- | --- |
| `yarn dev-client-ios` / `yarn dev-client-android` | `sim-dev-client-stg.{tar.gz,apk}` | Dev client for simulator / emulator (stg) |
| `yarn dev-client-ios:prd` / `yarn dev-client-android:prd` | `sim-dev-client-prd.{tar.gz,apk}` | Dev client for simulator / emulator (prd — real purchases, real auth) |
| `yarn dev-client-ios-device` / `yarn dev-client-android-device` | `device-dev-client-stg.{ipa,apk}` | Dev client for physical device (stg) |
| `yarn dev-client-ios-device:prd` / `yarn dev-client-android-device:prd` | `device-dev-client-prd.{ipa,apk}` | Dev client for physical device (prd) |
| `yarn build-sim` / `yarn build-sim:prd` | `sim-app-build-{stg,prd}.tar.gz` | Bundled iOS app for simulator — no dev server needed; use for splash/startup testing (OTA excluded — sim can't test OTA) |
| `yarn build-ipa` / `yarn build-ipa:prd` | `device-app-build-{stg,prd}.ipa` | Bundled IPA for iOS device — required for OTA testing |
| `yarn build-apk` / `yarn build-apk:prd` | `device-app-build-{stg,prd}.apk` | Bundled APK for Android device/emulator — required for OTA testing |
| `yarn push-ota` / `yarn push-ota:prd` | — | Export JS bundle and push as an OTA update — requires `build-ipa` or `build-apk` binary installed, no dev server running |
| `yarn build-store-ios` / `yarn build-store-android` | `store-build-stg.{ipa,aab}` | Store build for stg — submits to TestFlight / Play internal track |
| `yarn build-store-ios:prd` / `yarn build-store-android:prd` | `store-build-prd.{ipa,aab}` | Store build for prd without submitting |
| `yarn deploy-store-all:prd-internal` | — | **Recommended release flow** — build prd + submit to TestFlight / Play internal testing for final verification with real purchases |
| `yarn deploy-store-all:prd` | — | Submit directly to App Store / Play Store production (use only after `prd-internal` sign-off) |

**Installing iOS simulator builds:** EAS local builds for the simulator are `.tar.gz` archives containing the `.app` bundle. Extract and install with:

```bash
tar -xf sim-dev-client-stg.tar.gz
xcrun simctl install booted *.app
rm -rf *.app
```

**Recommended release steps:**

```bash
# 1. Build + submit to internal testing (real purchases, closed testers)
yarn deploy-store-all:prd-internal

# 2. Testers verify on TestFlight / Play internal track

# 3. Promote to production — from the console, not CLI
#    Android: Play Console → Internal testing → Promote release → Production
#    iOS: App Store Connect → TestFlight build → Submit for Review
```

Fill in `YOUR_STG_ASC_APP_ID` and `YOUR_PRD_ASC_APP_ID` in `eas.json` with the numeric App IDs from App Store Connect → App Information.

## CI / GitHub Actions

The workflow templates (`.github/workflows/`) wire up automatic deploys: push to `stg` → deploy stg builds, push to `main` → deploy prd builds. Manual dispatch also supported.

### Required GitHub secrets

| Secret | Where to get it |
| --- | --- |
| `EXPO_TOKEN` | expo.dev → Account Settings → Access Tokens |
| `DOPPLER_TOKEN` | Doppler → project → Access → Service Tokens |
| `EXPO_APPLE_ID` | Your Apple ID email |
| `EXPO_APPLE_APP_SPECIFIC_PASSWORD` | [appleid.apple.com](https://appleid.apple.com) → App-Specific Passwords |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Google Cloud → Service Accounts → JSON key (EAS submit role only) |

> Org-level secrets need **explicit repo access** — go to org Settings → Secrets → grant the repo. A secret set at org level is not automatically inherited by private repos.

### Xcode version

The Expo SDK version dictates the minimum Xcode. Running `expo-doctor` in CI will report the required version. **SDK 55 requires Xcode ≥ 26.0** — using an older Xcode causes Swift incompatibilities in `expo-modules-core` and pre-built XCFrameworks. Set `xcode-version: '26.0'` (or newer) in the iOS workflow.

### i18n compiled catalogs

EAS local builds archive the project via `git`, so gitignored files are excluded from the build temp directory. **Commit `src/i18n/locales/compiled/`** — do not gitignore it. The compiled `.ts` files are small and deterministic; excluding them causes Metro to fail resolving `locales/compiled/en` at bundle time.

### expo-doctor in pre-build

Do NOT include `yarn doctor` in the `pre-build` script. `expo-doctor` runs environment-specific checks (network, tool availability) that fail in CI. Keep it as a standalone `yarn doctor` command for local use only.

## Install (existing project)

```bash
claude plugin install expo-rn-plugin --scope project
bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup-app.sh"
```

MCP servers ship with pre-built `dist/` — no build step required after install.

## Plugin components

### Skills (invoke with `/expo-rn-plugin:<name>`)

Skills with a matching project command (e.g. `/form`) can also be invoked via the short form — the command is a thin stub that delegates to the skill. Skills without a project command **must** use the full `/expo-rn-plugin:<name>` prefix.

| Skill                    | Project command | Description                                                                                                                                                                    |
| ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scaffold <table>`       | `/scaffold`     | Generate full CRUD (types, hooks, screens, routes, form) from a database table                                                                                                 |
| `form <feature>`         | `/form`         | Generate a zod schema, react-hook-form hook, and Tamagui form component                                                                                                        |
| `figma <url_or_node_id>` | `/figma`        | Compare screen implementation against Figma design and fix discrepancies                                                                                                       |
| `sentry`                 | `/sentry`       | Sentry error monitoring — setup, capture patterns, and MCP usage                                                                                                               |
| `stripe`                 | `/stripe`       | Stripe payments — PaymentSheet flow, PCI rules, and MCP usage                                                                                                                  |
| `preview`                | `/preview`      | Screenshot the running simulator, check device errors, and run tsc — use after every UI change                                                                                 |
| `coding-standards`       | —               | Load project coding standards on demand (TypeScript, Tamagui, Zustand, Lingui)                                                                                                 |
| `analytics`              | —               | Load analytics standards — event naming, screen tracking, user identification, privacy rules (Firebase default; PostHog, Amplitude alternatives)                               |
| `testing`                | —               | Write or fix component and hook tests using jest-expo and @testing-library/react-native                                                                                        |
| `animations`             | —               | Animation standards — react-native-reanimated for UI motion, Rive for illustration/splash, rules for when to use each                                                          |
| `libs`                   | —               | _(optional)_ Full reference for `@ksairi-org/*` libraries fetched live from GitHub. Load before writing any utility, hook, or layout code if your project uses these packages. |
| `iap`                    | —               | Mobile in-app purchases and subscriptions via RevenueCat — setup, customer identification, product configuration for App Store and Google Play                                 |
| `feature-flags`          | —               | Feature flags via Firebase Remote Config — naming conventions, per-environment values, gradual rollouts, and reading values in the app                                         |
| `push-notifications`     | —               | FCM push notifications — setup, token registration, permission flow, daily reminders, and MCP tooling (`inspect_push_tokens`, `send_test_push`)                                |
| `ota`                    | —               | Self-hosted OTA updates via Supabase — Edge Function manifest server, upload script, CI workflow, Doppler config. No EAS Update subscription needed.                           |

### Project commands (standalone, no skill file)

These commands are copied to `.claude/commands/` by `setup-app.sh` and are available as `/command-name` after setup. They are self-contained guides — no skill prefix needed.

| Command                             | Description                                                 |
| ----------------------------------- | ----------------------------------------------------------- |
| `/auth <google\|apple\|email\|all>` | Wire up Supabase auth (Google, Apple, email sign-in)        |
| `/zustand`                          | Canonical Zustand store pattern (typed, MMKV-persisted)     |
| `/doppler <VAR=value>`              | Add a new secret to Doppler and sync it to `.env`           |
| `/orval`                            | Regenerate OpenAPI hooks from the backend spec              |
| `/notifications`                    | Set up push notifications (expo-notifications + FCM)        |
| `/sync-tokens`                      | Pull latest design tokens from Figma mid-session            |
| `/preview [screen]`                 | Screenshot the running simulator and verify the UI visually |

Skill-backed stubs (thin wrappers — see Skills table above for full docs): `/form`, `/scaffold`, `/figma`, `/sentry`, `/stripe`.

### Agents (available in `/agents`)

| Agent                 | Model  | Description                                                                  |
| --------------------- | ------ | ---------------------------------------------------------------------------- |
| `expo-scaffolder`     | Haiku  | Scaffolding specialist — delegates heavy CRUD generation out of main context |
| `database-specialist` | Sonnet | DB queries, migrations, RLS policies                                         |
| `i18n-reviewer`       | Haiku  | Audit Lingui catalogs for missing translations and hardcoded strings         |
| `auth-specialist`     | Sonnet | Supabase auth flows, Google/Apple sign-in, token lifecycle                   |
| `payment-specialist`  | Sonnet | Stripe PaymentSheet, PCI compliance, webhooks                                |

### MCP Servers

| Server     | Description                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `expo`     | React Native / Expo tools: config, routes, components, scaffolding, i18n, EAS, push notifications |
| `database` | DB introspection, query generation, migration generation, RLS inspection                          |
| `figma`    | Figma design data and asset export                                                                |
| `github`   | GitHub PR/issue management                                                                        |
| `sentry`   | Error monitoring                                                                                  |
| `stripe`   | Stripe API access                                                                                 |
| `doppler`  | Secret management                                                                                 |
| `firebase` | Firebase services                                                                                 |
| `context7` | Up-to-date library docs (React Native, Expo, etc.)                                                |

All servers that require secrets are wrapped via Doppler (`bin/mcp-run.sh`).

### Hooks (automatic)

| Event                      | Hook                         | Effect                                                                                                |
| -------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `SessionStart`             | `build-mcp-servers.sh`       | Builds MCP servers if outdated (first run or plugin update)                                           |
| `SessionStart`             | `figma/sync-figma-tokens.sh` | Syncs Tamagui design tokens from Figma if `FIGMA_FILE_ID` + `FIGMA_API_KEY` are set (no-op otherwise) |
| `PreToolUse` (Write/Edit)  | `guard-generated-files.sh`   | Blocks edits to auto-generated files (`src/api/generated/`, `src/theme/`) — run the generator instead |
| `PostToolUse` (Write/Edit) | `tsc-check.sh`               | Runs `tsc --noEmit` after file edits in TypeScript projects                                           |
| `Stop`                     | `context-warning.sh`         | Warns when context window ≥ 70% — prompts for `/compact`                                              |

### Monitors (automatic)

| Monitor              | When active                                               | Effect                                                                             |
| -------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pending-migrations` | Always                                                    | Emits a warning when Supabase migration files are unapplied; re-checks every 5 min |
| `eas-active-builds`  | Always (no-ops when `eas` CLI absent or no active builds) | Polls EAS for in-progress builds and prints status updates every 60 s              |

### LSP

TypeScript Language Server (`typescript-language-server`) — provides go-to-definition, find references, and live diagnostics for `.ts`, `.tsx`, `.js`, `.jsx` files.

`setup-app.sh` installs `typescript-language-server` and `typescript` as devDependencies automatically.

## Configuration

The plugin has two optional install-time config keys:

| Key               | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `doppler_project` | Your Doppler project name (e.g. `my-app`)              |
| `doppler_config`  | Config to use (`dev` / `stg` / `prod`, default: `dev`) |

You do not need to fill these in manually. `setup-app.sh` runs `doppler setup` interactively and writes both values to `mcp.config.json` automatically. The install-time prompts are a fallback only.

## mcp.config.json

`mcp.config.json` (at your app root) tells the MCP servers where to find your project's files and secrets. `setup-app.sh` auto-detects most values, but you can edit it at any time:

```json
{
  "doppler": { "project": "my-app", "config": "dev" },
  "database": { "schema": "api" },
  "routesDir": "app",
  "components": {
    "atoms": "src/components/atoms",
    "molecules": "src/components/molecules",
    "organisms": "src/components/organisms",
    "screens": "src/screens"
  },
  "orval": { "sdkLib": "src/api/generated" }
}
```

The `doppler` block is what connects MCP servers to your secrets — without it, servers that need env vars (Sentry, Stripe, etc.) will start without credentials.

## Doppler setup

Doppler stores all secrets (API keys, Supabase URLs, etc.) so nothing lives in `.env` files checked into git.

1. Create a free account at [doppler.com](https://doppler.com) if you don't have one
2. Create a project (e.g. `my-app`) with a `dev` config
3. Add these secrets to the `dev` config:
   - `FIGMA_API_KEY`, `FIGMA_FILE_ID`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     (`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are derived automatically in `env.template.yaml` — never expose the service role key client-side)
   - `SUPABASE_ACCESS_TOKEN` — personal access token from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens); used by the Supabase MCP server to manage projects (different from the service role key)
   - Optional: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
   - Optional: `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
4. When `setup-app.sh` runs `doppler setup`, select your project and `dev` config

After setup, `yarn start` automatically writes `.env` from Doppler secrets via the `prestart` script. Design tokens also sync on `yarn start` (via `doppler run` inside the script — no extra flags needed).

## Social auth (Apple + Google via Supabase)

Configure in Supabase → Authentication → Providers for each environment (stg + prd separately).

### Apple

- Client IDs: comma-separated bundle ID + Services ID (e.g. `com.myapp.stg, com.myapp.stg.sign-in`)
- Secret Key: generate a `.p8` key in Apple Developer → Keys
- ⚠️ **Apple OAuth secret keys expire every 6 months** — set a calendar reminder; expired keys silently break web OAuth sign-in
- Callback URL shown by Supabase → register it in Apple Developer Center → your Services ID → Return URLs

### Google

- Client IDs: your Web client ID (from Google Cloud Console → OAuth 2.0 Client IDs)
- Client Secret: Web client's secret
- ✅ **Enable "Skip nonce checks"** — required for native iOS since `@react-native-google-signin` doesn't pass the nonce back to Supabase
- Callback URL shown by Supabase → add it to Google Cloud → OAuth → Authorised redirect URIs

### Doppler keys required per env (stg + prd)

```bash
GOOGLE_WEB_CLIENT_ID              # Web OAuth client ID
GOOGLE_IOS_CLIENT_ID              # iOS OAuth client ID
GOOGLE_ANDROID_CLIENT_ID          # Android OAuth client ID
ANDROID_APPLE_SIGN_IN_CLIENT_ID   # Apple Services ID (Android OAuth)
ANDROID_APPLE_SIGN_IN_CALLBACK    # Supabase callback URL
```

### Supabase URL Configuration

In Authentication → URL Configuration, set the redirect URL per env:

- stg: `{slug}-stg://`
- prd: `{slug}://`

## Updating existing apps

When the plugin updates, apps built from it don't auto-update. Apply changes manually:

1. **MCP servers** — rebuild if `mcps/*/src/` changed: `cd mcps/expo-mcp-server && yarn build`
2. **Scripts** — re-run `setup-app.sh` to merge updated `package.json` scripts; review the git diff before committing
3. **Templates** — compare `templates/` files against your project manually (no auto-merge); key files to check: `app/_layout.tsx`, `app.config.ts`, `.gitignore`, `eas.json`
4. **tsconfig paths** — add new aliases manually (e.g. `@sentry`, `@fonts`) when adopting new services
5. **CLAUDE.md** — pull in new "Never do" / "Always do" rules from `templates/CLAUDE.md`
6. **Skills** — always up to date automatically (loaded fresh each session from the plugin root)

Reference implementation for patterns not covered here: [ksairi-org/virtual-wallet](https://github.com/ksairi-org/virtual-wallet).

## Project CLAUDE.md

Keep your project's `CLAUDE.md` lean (under 80 lines). Move detailed standards to the on-demand skill:

```markdown
# Project

React Native / Expo app. For coding standards, run `/expo-rn-plugin:coding-standards`.

## Project Context

- Expo Router for navigation
- Tamagui for styling (`src/theme/`)
- Lingui for i18n
- Database `api` schema (not public)
```

This keeps session startup context small and only loads standards when needed.

## Cost tips

- `coding-standards` skill loads on demand — not burned on every session
- `expo-scaffolder` and `i18n-reviewer` use Haiku — cheap for high-volume generation/audit tasks
- `context-warning` hook reminds you to `/compact` at 70% context — prevents wasteful re-reads
- Install [RTK](https://github.com/rtk-ai/rtk) (`rtk init -g`) — wraps all CLI commands to strip verbose output, cutting per-command token usage by 60–90%

## Development

### First-time setup (contributors)

Install Claude Code plugins (compound-engineering, expo, github) — run from the plugin root:

```bash
bash scripts/setup-claude.sh
```

### Build MCP servers manually

```bash
cd mcps/expo-mcp-server && yarn install --immutable && yarn build
cd mcps/database-mcp-server && yarn install --immutable && yarn build
```

`dist/` is committed to git. CI will fail if you push source changes without rebuilding. The pre-push hook handles this for you automatically.

### Testing the plugin locally

```bash
CLAUDE_PLUGIN_ROOT=$(pwd) claude --plugin-dir .
```

### Validate the manifest

```bash
claude plugin validate
```

## Adding a new MCP server

1. Create a directory under `mcps/` (e.g. `mcps/my-mcp-server/`)
2. Follow the structure of `mcps/expo-mcp-server/` (`src/index.ts`, `src/tools/`, `package.json`, `tsconfig.json`)
3. Add an entry to `.mcp.json` using `${CLAUDE_PLUGIN_ROOT}/bin/mcp-run.sh` as the command
4. Add `build_server "my-mcp-server"` to `scripts/build-mcp-servers.sh` — the script hardcodes server names, it does not auto-discover new ones
