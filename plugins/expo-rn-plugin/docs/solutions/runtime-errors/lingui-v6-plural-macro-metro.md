---
title: "Lingui v6 Plural macro crashes in Expo/Metro — use Trans ternary workaround"
date: 2026-06-05
status: solved
severity: medium
category: runtime-errors
tags:
  - lingui
  - lingui-v6
  - plural-macro
  - metro-bundler
  - expo
  - react-native
  - babel-macro
  - i18n
components:
  - "@lingui/babel-plugin-lingui-macro@6.0.0"
  - "@lingui/core@6.0.0"
  - "@lingui/react@6.0.0"
  - "@lingui/macro (v5 — do not use in v6 projects)"
  - babel-preset-expo
symptoms:
  - "TypeError: Cannot read property 'prototype' of undefined when rendering <Plural>"
  - "Both <Trans><Plural/></Trans> and standalone <Plural> crash at runtime"
  - "Crash is not resolved by clearing Metro cache"
  - "<Trans> renders correctly; only <Plural> (and <Select>, <SelectOrdinal>) is affected"
  - "Adding @lingui/macro causes duplicate @lingui/core and @lingui/react v5 copies, leading to further runtime conflicts"
environment:
  bundler: Metro (Expo)
  framework: Expo / React Native
  lingui_core: "6.0.0"
  lingui_react: "6.0.0"
  lingui_babel_plugin: "@lingui/babel-plugin-lingui-macro@6.0.0"
  babel_preset: babel-preset-expo
  note: "@lingui/macro does not exist in v6 (max published version is 5.9.5)"
---

## Root Cause

Two separate issues combine to make `<Plural>` (and `<Select>`, `<SelectOrdinal>`) crash in Expo/React Native:

**Issue 1 — ICU plural format + Hermes:**  
When `<Trans><Plural value={n} one="# entry" other="# entries" /></Trans>` is compiled correctly by the babel plugin, it generates a Trans call with an ICU plural message: `Today · {0, plural, one {# entry} other {# entries}}`. At runtime, the `Trans` component calls `i18n._()` to format this, which requires `Intl.PluralRules` for plural selection. Hermes (React Native's JS engine) has inconsistent `Intl.PluralRules` support. When it fails, the error bubbles through React's render cycle as `Cannot read property 'prototype' of undefined`.

`Trans` with plain strings (no plural ICU format) works fine because `Intl.PluralRules` is not needed.

**Issue 2 — `@lingui/macro` v5 dep (now removed):**  
`@lingui/macro@5.9.5` does not exist in v6. When present, it pulls in duplicate v5 copies of `@lingui/core` and `@lingui/react` alongside v6, causing additional runtime conflicts. This has been removed.

Note: The babel plugin (`@lingui/babel-plugin-lingui-macro`) DOES correctly compile `<Plural>` to a Trans call at build time — this was verified via direct testing. The crash is purely a runtime issue with ICU plural processing on Hermes.

## Investigation Steps

1. **Observed crash** — `Cannot read property 'prototype' of undefined` traced to `<Plural>` inside `<Trans>` and standalone `<Plural>`.
2. **Verified message extraction works** — `yarn lingui extract` compiled the catalog correctly, confirming the Babel plugin processes macros at extraction time. This narrowed the issue to Metro's runtime bundling path.
3. **Inspected `@lingui/react/macro` browser bundle** — `browser.mjs` defines `Plural = function(){}` then immediately throws. This is the runtime stub loaded when Metro does not compile the macro away.
4. **Checked babel config** — `@lingui/babel-plugin-lingui-macro` is configured directly (not via `babel-plugin-macros`). The plugin is present but Metro does not apply it to `Plural`/`Select`/`SelectOrdinal` at bundle time.
5. **Cleared Metro cache** — `expo start --clear`. Crash persisted, ruling out a stale cache issue.
6. **Inspected dependency tree** — found `@lingui/macro@5.9.5` in `package.json`. Its presence pulled in v5 copies of `@lingui/core` and `@lingui/react` alongside v6.
7. **Removed `@lingui/macro`** — cleaned the duplicate v5 packages. Runtime conflicts resolved, but `Plural` crash remained — confirming the two issues are independent.
8. **Replaced `<Plural>` with ternary `<Trans>`** — crash gone.

## Working Solution

### Step 1 — Remove `@lingui/macro` (v5-only; does not exist in v6)

```bash
yarn remove @lingui/macro
```

Confirm `package.json` no longer contains `@lingui/macro`. Only v6 versions of `@lingui/core` and `@lingui/react` should remain in the lockfile.

### Step 2 — Replace all `<Plural>` usages with ternary `<Trans>`

**Before (crashes at runtime in Metro):**
```tsx
import { Trans, Plural } from '@lingui/react/macro'

// Standalone
<Plural value={count} one="# entry" other="# entries" />

// Nested inside Trans
<Trans>Today · <Plural value={count} one="# entry" other="# entries" /></Trans>
```

**After (works correctly):**
```tsx
import { Trans } from '@lingui/react/macro'

// Simple singular/plural
{count === 1
  ? <Trans>Today · 1 entry</Trans>
  : <Trans>Today · {count} entries</Trans>}
```

For more plural forms:
```tsx
{n === 0
  ? <Trans>No entries</Trans>
  : n === 1
  ? <Trans>1 entry</Trans>
  : <Trans>{n} entries</Trans>}
```

### Step 3 — Re-extract and compile the catalog

Message IDs change when plural forms are split into separate `Trans` calls:

```bash
yarn lingui extract
yarn lingui compile
```

### Step 4 — Verify

Run `tsc --noEmit` and test the screen that previously crashed.

## Versions

| Package | Version |
|---|---|
| `@lingui/react` | 6.0.0 |
| `@lingui/core` | 6.0.0 |
| `@lingui/babel-plugin-lingui-macro` | 6.0.0 |
| `@lingui/macro` | 5.9.5 (removed — v5-only package) |
| Bundler | Metro (Expo / React Native) |

## Prevention

- Never use `<Plural>`, `<Select>`, or `<SelectOrdinal>` from `@lingui/react/macro` in a Lingui v6 + Expo/Metro project.
- Never add `@lingui/macro` as a dependency in a Lingui v6 project — it is v5-only and pulls in duplicate runtime packages.
- After any i18n change, run the `/expo-rn-plugin:i18n` skill then `tsc --noEmit` before marking done.

## Do / Don't

| Situation | Do | Don't |
|---|---|---|
| Pluralise a count in JSX | `{n === 1 ? <Trans>1 entry</Trans> : <Trans>{n} entries</Trans>}` | `<Plural value={n} one="# entry" other="# entries" />` |
| Pluralise for a prop/string | `` n === 1 ? t`entry` : t`entries` `` | `plural(n, { one: 'entry', other: 'entries' })` |
| Import i18n macros | `import { Trans } from '@lingui/react/macro'` | `import { Plural } from '@lingui/react/macro'` |
| Declare Lingui deps | `@lingui/react@^6`, `@lingui/core@^6` | `@lingui/macro` (v5-only) |

## Detection

**At install time:**
```bash
yarn why @lingui/macro  # any result = v5 package leaked in
```

**CI check — block forbidden imports:**
```bash
grep -r "from '@lingui/macro'" src/ && echo "FORBIDDEN: use @lingui/react/macro" && exit 1
grep -r "<Plural" src/ && echo "FORBIDDEN: use Trans + ternary instead" && exit 1
```

**At runtime:** crash surfaces immediately on first render of the component containing `<Plural>`. Stack trace references `prototype` access inside `@lingui/react`. `Trans` on the same screen works fine — that asymmetry is the tell.

## Related Documentation

- [docs/solutions/integration-issues/android-auth-store-builds.md](../integration-issues/android-auth-store-builds.md) — Contains related Lingui notes: ESLint stripping compiled catalog headers (item 7) and EAS build failures from missing compiled catalogs (item 8).
- `CLAUDE.md` — Project rule: wrap user-visible strings with `<Trans>` in JSX, `` t`…` `` for props, importing from `@lingui/react/macro`.
