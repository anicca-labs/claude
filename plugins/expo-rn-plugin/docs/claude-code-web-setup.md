# Running expo-rn-plugin MCP servers on Claude Code on the web

Apps using this plugin get its MCP servers (`supabase`, `sentry`, `doppler`, `firebase`, `revenuecat`, `context7`, …) as native `mcp__*` tools locally. This guide makes them work in a Claude Code **web/cloud** session too — from a browser or phone.

The web container starts fresh every session and, importantly, sets `SKIP_PLUGIN_MARKETPLACE=true`, so the marketplace plugin is **not** installed and `CLAUDE_PLUGIN_ROOT` is unset. Everything the servers need must therefore come from (a) committed repo config or (b) the web **environment settings**.

## TL;DR

1. **Repo** (committed, scaffolded by `setup-app.sh`): `./bin/mcp-run.sh`, `.mcp.json` using `${CLAUDE_PLUGIN_ROOT:-.}/bin/mcp-run.sh`, `.claude/settings.json` with `enableAllProjectMcpServers: true` + the marketplace/plugin entries, and `mcp.config.json` with a `doppler` block.
2. **Web environment** (UI → cloud icon → gear): setup script installs `doppler`; a `DOPPLER_TOKEN` env var; a network allowlist for the backend hosts.
3. Start a **fresh** session in that environment and verify.

## Part 1 — Repo config (committed)

`setup-app.sh` writes all four of these. They are also safe to add by hand to an existing app.

- `./bin/mcp-run.sh` — the launcher, committed so the web (no plugin) can find it. It reads the Doppler project/config from `mcp.config.json` and execs the server under `doppler run`, degrading to a plain `exec` when Doppler isn't configured.
- `.mcp.json` — every command is `${CLAUDE_PLUGIN_ROOT:-.}/bin/mcp-run.sh`. The `:-` fallback is a no-op locally (the plugin is installed, so `CLAUDE_PLUGIN_ROOT` is set) and resolves to the committed `./bin/mcp-run.sh` on the web. Secrets are read by the server from env (or an inner `bash -c "… \"$VAR\""`), never via Claude Code `${VAR}` (which is empty on the web — see [Part 4](#part-4--why-secrets-must-resolve-in-process)).
- `.claude/settings.json`:

  ```json
  {
    "enableAllProjectMcpServers": true,
    "extraKnownMarketplaces": {
      "ksairi-org": {
        "source": { "source": "github", "repo": "ksairi-org/claude" }
      }
    },
    "enabledPlugins": { "expo-rn-plugin@ksairi-org": true }
  }
  ```

- `mcp.config.json`:

  ```json
  {
    "doppler": { "project": "mobile", "config": "stg" }
  }
  ```

  `project`/`config` must match the Doppler project and config your `DOPPLER_TOKEN` is scoped to. The plugin's convention is project `mobile`, config `stg`.

## Part 2 — Web environment settings (UI)

Cloud icon (top of the session) → hover the environment → gear/settings.

### a) Setup script — install the doppler CLI

```bash
curl -Ls https://cli.doppler.com/install.sh | sudo sh -s -- --no-package-manager
```

`--no-package-manager` pulls the binary from GitHub releases (allowlisted). Without it the installer uses `packages.doppler.com` (not allowlisted) and silently no-ops. A non-zero exit fails the whole session, so keep it clean.

### b) Environment variables

```text
DOPPLER_TOKEN=<service token scoped to your project / config>
```

Without it every secret-backed MCP server fails to authenticate. Use a read-only service token scoped to exactly the project/config in `mcp.config.json`.

### c) Network access → Custom (keep "include default list" on)

```text
cli.doppler.com        # setup-script install
api.doppler.com        # runtime secret fetch (doppler run)
api.supabase.com       # supabase / database servers
*.supabase.co
```

Add one host group per backend you enable: `*.sentry.io`, `api.stripe.com`, `mcp.stripe.com`, `api.figma.com`, `api.revenuecat.com`, `mcp.revenuecat.ai`, `context7.com`, `*.googleapis.com` (firebase).

## Part 3 — Verify (fresh session)

```bash
which doppler && doppler --version
doppler run -p mobile -c stg -- bash -c 'echo ${SUPABASE_ACCESS_TOKEN:+ok}'
```

`/plugin` and `/mcp` are interactive-only (not on the web). Instead ask the assistant: *"What MCP servers and tools do you have? List the `supabase`/`context7` ones."* If they appear as `mcp__*`, it works — confirm with a real call, e.g. *"Use the supabase MCP to run `select 1 as ok`."*

## Part 4 — Why secrets must resolve in-process

On the web the secrets exist only inside `doppler run`, which the launcher execs *after* Claude Code has already built the server's argv. So a `${SUPABASE_ACCESS_TOKEN}` written into an arg expands to empty. Fixes baked into `.mcp.json`:

- supabase reads `SUPABASE_ACCESS_TOKEN` from env (no `--access-token` arg);
- sentry runs under `bash -c` so `$SENTRY_AUTH_TOKEN`/`$SENTRY_ORG` expand after injection;
- stripe reads `STRIPE_SECRET_KEY` from env (the `--tools=all` flag was removed upstream);
- revenuecat / figma read their keys (`$RC_MCP_API_KEY`, `FIGMA_API_KEY`) from env.

Secrets that must exist in Doppler for a server to authenticate: `SUPABASE_ACCESS_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `RC_MCP_API_KEY`, `FIGMA_API_KEY`, `STRIPE_SECRET_KEY`, plus `FIREBASE_*`. `context7` and `doppler` need no per-server secret (`doppler` uses the ambient `DOPPLER_TOKEN`).

## Troubleshooting

- **Servers don't appear at all** → confirm `.mcp.json` uses the `${CLAUDE_PLUGIN_ROOT:-.}` form and `./bin/mcp-run.sh` exists and is executable; confirm `enableAllProjectMcpServers: true`.
- **`doppler` missing in a fresh session** → the setup script didn't run; drop a marker (`echo ran > /tmp/m` as its first line) and check it; make sure you started a *new* session in the *matching* environment.
- **A server starts but can't auth** → its secret isn't in Doppler, or its host isn't allowlisted.
- **`expo` / `database` never run on the web** → expected. They need the plugin's bundled `dist/` builds, which aren't committed in the app; they only run where the plugin is installed.
