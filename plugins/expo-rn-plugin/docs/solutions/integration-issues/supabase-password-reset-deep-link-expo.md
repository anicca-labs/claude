---
title: "Supabase Password Reset Deep Link Routing in React Native / Expo (detectSessionInUrl: false)"
slug: supabase-password-reset-deep-link-routing-react-native
date: 2026-06-03
tags: [supabase, deep-linking, auth, react-native, expo]
symptoms:
  - PASSWORD_RECOVERY auth event never fires despite valid reset link
  - App lands on home screen instead of reset-password screen after tapping email link
  - Sign-in screen flashes briefly before navigating to reset-password
  - setSession() completes successfully but triggers SIGNED_IN, not PASSWORD_RECOVERY
root_cause: >
  supabase-js requires detectSessionInUrl: false in React Native, which disables automatic
  URL parsing. After Supabase verifies the token it redirects to the app with
  access_token, refresh_token, and type=recovery in the URL hash. Calling
  supabase.auth.setSession() with those tokens fires SIGNED_IN unconditionally — the
  PASSWORD_RECOVERY event is only emitted when detectSessionInUrl: true handles the URL
  internally. Without pre-checking the initial URL before getSession() resolves, the
  router treats the session as a normal sign-in and flashes to home screen first.
component: src/hooks/useAuthSession.ts
---

## Symptoms

- Tapping the password reset email link opens the app and lands on the home screen (user appears logged in) instead of the reset-password screen
- Sign-in screen (or home screen) flashes for a moment before the app settles
- `PASSWORD_RECOVERY` event handler in `onAuthStateChange` never executes
- `supabase.auth.setSession()` succeeds but the session type is lost

## Root Cause

`detectSessionInUrl: false` is required in React Native (setting it to `true` causes `window.location` parsing errors in Hermes/JSC). This flag disables Supabase's internal URL detection entirely, which means:

1. **`PASSWORD_RECOVERY` event never fires.** Supabase only emits it through `_getSessionFromURL()` — the internal mechanism disabled by this flag.
2. **`setSession()` always emits `SIGNED_IN`**, regardless of the token's intended purpose (recovery, invite, etc.). The event type is not derived from the JWT claims.
3. **Race condition:** `getSession()` returns `null` on cold start before the deep link URL is processed. The routing effect fires immediately with a null session, sending the user to sign-in, before `handleAuthUrl` has a chance to set `isRecoveryMode`.

## Solution

### Step 1 — Pre-check the initial URL *before* `getSession()`

This is the critical fix for the screen flash. Resolve `getInitialURL()` first and set `isRecoveryMode` before any session state is written:

```typescript
const init = async () => {
  // Resolve URL first so isRecoveryMode is set before setSession(null) triggers routing
  const initialUrl = await Linking.getInitialURL()
  if (initialUrl) {
    const hashType = new URLSearchParams(initialUrl.split('#')[1] ?? '').get('type')
    const queryType = new URLSearchParams(initialUrl.split('?')[1] ?? '').get('type')
    if (hashType === 'recovery' || queryType === 'recovery') {
      isRecoveryMode.current = true
    }
  }

  await clearStaleKeychainOnFreshInstall()
  const { data: { session: s } } = await supabase.auth.getSession()
  setSession(s) // routing effect fires here — isRecoveryMode already true

  if (initialUrl) await handleAuthUrl(initialUrl)
}
```

### Step 2 — Detect `type=recovery` from the URL in `handleAuthUrl`

Support both implicit (hash fragment) and PKCE (query param) flows:

```typescript
const handleAuthUrl = useCallback(async (url: string) => {
  // PKCE flow: ?code=...&type=recovery
  const queryParams = new URLSearchParams(url.split('?')[1] ?? '')
  const code = queryParams.get('code')
  const queryType = queryParams.get('type')
  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
    if (queryType === 'recovery') {
      isRecoveryMode.current = true
      router.replace('/reset-password')
    }
    return
  }

  // Implicit flow: #access_token=...&type=recovery
  const hashParams = new URLSearchParams(url.split('#')[1] ?? '')
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')
  const type = hashParams.get('type')
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    if (type === 'recovery') {
      isRecoveryMode.current = true
      router.replace('/reset-password')
    }
  }
}, [router])
```

### Step 3 — Guard the routing effect against recovery mode

```typescript
useEffect(() => {
  if (session === undefined) return
  const inAuth = segments[0] === 'sign-in'
    || segments[0] === 'forgot-password'
    || segments[0] === 'reset-password'

  if (!session && !inAuth && !isRecoveryMode.current) router.replace('/sign-in')
  else if (session && inAuth && !isRecoveryMode.current) router.replace('/(tabs)')
}, [session, segments, router])
```

### Step 4 — Use `useRef` not `useState` for the recovery flag

A `ref` is mutated synchronously, so `isRecoveryMode.current = true` is visible in the very next read within the same synchronous tick — before React processes the batched state update from `setSession(s)`.

```typescript
const isRecoveryMode = useRef(false)
```

Reset it on sign-out:

```typescript
if (event === 'SIGNED_OUT') {
  isRecoveryMode.current = false
}
```

## Why Earlier Attempts Failed

| Attempt | What was tried | Why it failed |
|---|---|---|
| 1 | Listen for `PASSWORD_RECOVERY` in `onAuthStateChange` | Event never fires — `detectSessionInUrl: false` disables it |
| 2 | Set `isRecoveryMode` ref inside `PASSWORD_RECOVERY` handler | Same root cause — handler never executes |
| 3 | Detect `type=recovery` in `handleAuthUrl`, set ref there | Correct detection, but `handleAuthUrl` runs *after* `getSession()` already set session state and routing effect sent user to sign-in |
| 4 ✓ | Pre-check URL before `getSession()` | Flag set before routing effect fires — no flash, correct destination |

## Prevention

### Core invariants

- **`detectSessionInUrl: false` permanently kills `PASSWORD_RECOVERY`** on React Native. Never expect it to fire.
- **`setSession()` always emits `SIGNED_IN`** — do not branch routing logic on auth events after a manual `setSession()` call.
- **Deep link resolution races with initial render** — `getInitialURL()` must be awaited before any routing decisions are made on cold start.

### Checklist for any new deep-link auth flow

- [ ] Check which Supabase event actually fires (read the source, not just docs)
- [ ] If the event is ambiguous (`SIGNED_IN`), extract intent from the URL `type` param *before* calling `setSession()`
- [ ] Handle both cold-start (`getInitialURL`) and warm-start (foreground `addEventListener`) paths
- [ ] Ensure `isRecoveryMode` (or equivalent flag) is set before `setSession()` triggers the routing effect
- [ ] Add `forgot-password` and `reset-password` to the `inAuth` guard in the routing effect

### What to watch for

- Any future auth flow arriving via URL (magic link, invite, SSO) has this same `PASSWORD_RECOVERY` blind spot — verify independently
- Upgrading `@supabase/supabase-js` may change which events are emitted — review auth changelog before upgrading
- Never re-enable `detectSessionInUrl: true` as a shortcut — it breaks in React Native's JS environment
