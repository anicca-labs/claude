---
name: argent-testing
description: Set up or use Argent (Software Mansion) for deep interactive testing of the running iOS Simulator or Android emulator — tap/swipe gestures, recorded E2E flows replayed as smoke tests, visual regression diffing, deep-link testing, and native performance profiling (Hermes, React DevTools, Xcode Instruments, Perfetto). Use when a bug needs live interaction to reproduce, when a flow needs a repeatable regression test, or when investigating jank/memory/hangs. For a quick "does this screen look right after my change" check, use the `preview` skill instead — it's faster and doesn't require any setup.
---

Argent (`@swmansion/argent`) is a third-party agentic toolkit — a CLI plus its own MCP server — that gives an agent live control of the iOS Simulator or Android emulator: tapping, swiping, typing, hardware buttons, recorded-flow replay, screenshot diffing, and native profiling. It goes well beyond this plugin's own `preview` skill, which only screenshots whatever is already on screen.

## When to reach for Argent vs `preview`

- **`preview`** (bundled, no setup): screenshot the current screen, check for device errors, run tsc. Use after almost every UI change — this is the default.
- **Argent** (opt-in, one-time setup per project): the task needs the agent to *drive* the app — reproduce a bug that only appears after a sequence of taps, replay a login flow as a regression check, diff a screen against a visual baseline, or profile why something is janky/leaking memory. Don't reach for this for routine "did my change land correctly" checks.

## One-time setup (per project, not per plugin)

Argent's MCP server is registered in the *app's own* editor/workspace config, not this plugin's — each project that wants it opts in individually:

```bash
npx @swmansion/argent@latest init
```

This wizard registers Argent's MCP server and agent definitions for the current project. For the `argent` binary itself to be resolvable on PATH (some workflows expect this), install it globally:

```bash
npm install -g @swmansion/argent
```

Expo's own docs recommend pairing Argent with the Expo MCP server this plugin already provides — Argent drives the simulator/emulator, the Expo tooling supplies Expo-specific conventions (routes, config, design tokens). They're complementary, not overlapping.

Note: Argent's core CLI is Apache-2.0, but the platform-specific native binaries are proprietary Software Mansion IP with redistribution restrictions — read their license before including it in a build pipeline.

## Using it

Once initialized, Argent's tools appear as `mcp__argent__*` (or similarly namespaced) in the session — invoke them directly for the task at hand: recording a flow, replaying a smoke test, diffing a screenshot against a baseline, or pulling a native performance profile. Refer to `argent.swmansion.com` for the current tool list and exact invocation shape, since it evolves independently of this plugin.

## If Argent isn't installed

Don't fail silently — tell the user the task would benefit from Argent, give them the `init` command above, and fall back to `preview` plus manual reasoning in the meantime.
