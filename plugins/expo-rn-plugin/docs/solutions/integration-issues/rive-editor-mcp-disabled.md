---
title: "Rive Editor MCP unavailable for external clients — don't add a Rive MCP server"
problem_type: integration-issues
symptoms:
  - "Want to automate authoring .riv files (state machines, view models, layouts) via Claude Code / Cursor"
  - "Considering adding @rive-mcp/server-core (official Rive Editor MCP) to .mcp.json"
  - "Considering adding a Rive docs MCP (e.g. StormXX/rive-docs-mcp)"
technologies:
  - "Rive"
  - "rive-react-native"
  - "MCP"
tags:
  - rive
  - animations
  - mcp
  - tooling
  - watch
status: blocked
severity: low
date_solved: "2026-06-18"
---

## Decision

Do **not** add any Rive MCP server to the plugin right now.

## Why

**Editor MCP (the only one with real value) is disabled for external clients.**
Rive removed external MCP access to the editor in favor of their own built-in AI Agent.
As of 2026-06, MCP connectivity is unavailable on *every* plan (free and paid) — it is not
a tier/account issue. Open feature request to re-enable it:
[rive-runtime#87](https://github.com/rive-app/rive-runtime/issues/87) (opened 2026-03-23,
no official re-enablement). Rive says they're "exploring" external-agent connection and
bring-your-own-API-key, but nothing shipped.

- The official editor MCP (`@rive-mcp/server-core`) also requires the Early Access **desktop
  editor app running locally** — it drives that app, it cannot generate `.riv` headlessly or in CI.
- Free Rive accounts get the built-in **Rive Agent** (capacity-based, hourly recharge), but it
  runs *inside the editor*, driven by the user — Claude Code cannot orchestrate it.

**Docs MCP is redundant.** `context7` already fetches live Rive docs (runtimes, state machines,
`rive-react-native` API) on demand, and the `animations` skill encodes our actual conventions
(`SplashView`, `Fit`/`Alignment`, state machine inputs). A docs MCP adds config to maintain with
no new capability.

## Revisit when

Rive re-enables external MCP access **or** ships bring-your-own-API-key for the editor agent.
At that point the Editor MCP becomes genuinely useful for authoring splash/onboarding `.riv`
files by prompt — wire it into `expo-rn-plugin`'s `.mcp.json` then (it'll require a local
running editor, so it's authoring-time only, never CI).

## References

- [Rive MCP integration docs](https://rive.app/docs/editor/mcp/integration)
- [Free Rive AI Agent announcement](https://rive.app/blog/free-rive-ai-agent)
- [rive-runtime#87 — re-enable MCP access](https://github.com/rive-app/rive-runtime/issues/87)
