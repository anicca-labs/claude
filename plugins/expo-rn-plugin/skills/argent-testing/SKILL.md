---
name: argent-testing
description: Set up or use Argent (Software Mansion) for deep interactive testing of the running iOS Simulator or Android emulator — tap/swipe gestures, recorded E2E flows replayed as smoke tests, visual regression diffing, deep-link testing, and native performance profiling (Hermes, React DevTools, Xcode Instruments, Perfetto). Use when a bug needs live interaction to reproduce, when a flow needs a repeatable regression test, or when investigating jank/memory/hangs. For a quick "does this screen look right after my change" check, use the `preview` skill instead — it's faster and doesn't require any setup.
---

Argent (`@swmansion/argent`) is a third-party agentic toolkit — a CLI plus its own MCP server — that gives an agent live control of the iOS Simulator or Android emulator: tapping, swiping, typing, hardware buttons, recorded-flow replay, screenshot diffing, and native profiling. It goes well beyond this plugin's own `preview` skill, which only screenshots whatever is already on screen.

## When to reach for Argent vs `preview`

- **`preview`** (bundled, no setup): screenshot the current screen, check for device errors, run tsc. Use after almost every UI change — this is the default.
- **Argent** (opt-in, one-time setup per project): the task needs the agent to *drive* the app — reproduce a bug that only appears after a sequence of taps, replay a login flow as a regression check, diff a screen against a visual baseline, or profile why something is janky/leaking memory. Don't reach for this for routine "did my change land correctly" checks.

## One-time setup (per project, not per plugin)

Argent's MCP server is registered in the *app's own* editor/workspace config, not this plugin's — each project that wants it opts in individually. Use yarn, not npm/npx:

```bash
yarn dlx @swmansion/argent@latest init --yes --global --no-telemetry
```

`--yes` skips the interactive wizard (editor selection, auto-approve prompts); `--global` is the CLI's default meaning ("install on PATH for this machine") but **verified: running the wizard via `yarn dlx` did not actually leave a persistent `argent` binary on PATH** in testing — the wizard still correctly wrote `.mcp.json`, `.claude/settings.json` (adds `mcp__argent` to the allow-list), `.vscode/mcp.json`, and copied rules/skills/agents into `.claude/`, but `which argent` came back empty afterward. Until that's root-caused, don't rely on a bare `argent` command being resolvable — invoke everything through `yarn dlx @swmansion/argent@latest <command>` instead (confirmed working every time, just slower per call due to yarn's resolution step). If `.mcp.json`'s `"command": "argent"` entry fails to start, rewrite it to `["yarn", "dlx", "@swmansion/argent@latest", "mcp"]`.

Expo's own docs recommend pairing Argent with the Expo MCP server this plugin already provides — Argent drives the simulator/emulator, the Expo tooling supplies Expo-specific conventions (routes, config, design tokens). They're complementary, not overlapping.

Note: Argent's core CLI is Apache-2.0, but the platform-specific native binaries are proprietary Software Mansion IP with redistribution restrictions — read their license before including it in a build pipeline.

## Using it — verified tool names (v0.25.2)

Confirmed by running `yarn dlx @swmansion/argent@latest tools` — 76 tools total, spanning iOS Simulator, Android emulator, physical devices, and Chromium. The ones you'll reach for most:

- **`list-devices`** — enumerate simulators/emulators/physical devices; get the `udid`/serial every other tool needs.
- **`screenshot --udid <id> --scale 1.0 --out <path>`** — capture the screen. Coordinates for `gesture-*` tools are **normalized 0.0–1.0 fractions of width/height, not pixels** — read them off a screenshot, don't guess pixel positions.
- **`gesture-tap` / `gesture-swipe` / `gesture-scroll` / `keyboard`** — interaction primitives. Verified: a tap call returns `{ tapped: true, timestampMs }` even when nothing observable happens on screen — a successful return does **not** guarantee the tap landed on the intended element. Always re-screenshot after interacting and check the result visually; don't trust the return value alone.
- **`launch-app` / `reinstall-app` / `restart-app`** — app lifecycle by bundle id (iOS) / package name (Android).
- **`screenshot-diff`** — visual regression: compare two PNGs.
- **`native-describe-screen` / `native-full-hierarchy` / `native-find-views`** — accessibility-tree discovery; use before tapping to get real element coordinates instead of guessing.
- **`react-profiler-start/stop` / `native-profiler-start/stop`** — Hermes CPU + React commit capture, and native (Instruments/Perfetto) profiling, respectively.
- **`run-sequence`** — chain multiple interaction steps in one call, for scripted flows.

Run `argent tools describe <name>` (or `yarn dlx @swmansion/argent@latest run <tool> --help`) for a tool's exact flags before calling it — flag names aren't always what you'd guess (e.g. `screenshot` takes `--udid`, not `--device`).

Known quirk observed in testing: a device's HID transport can die between calls ("CoreDevice HID transport is dead... reattach required") if the Simulator.app GUI isn't actually open and foregrounded — booting via `xcrun simctl boot` alone isn't enough. Run `open -a Simulator` (or launch Simulator.app manually) and keep it frontmost/visible for a stable session, not just a booted-but-headless device.

## If Argent isn't installed

Don't fail silently — tell the user the task would benefit from Argent, give them the `init` command above, and fall back to `preview` plus manual reasoning in the meantime.
