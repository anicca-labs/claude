---
title: "Android deep link password reset shows journal screen before reset-password"
problem_type: logic-error
platforms:
  - android
  - ios
symptoms:
  - Journal (home) screen flashes briefly when tapping a Supabase password reset deep link on cold start
  - reset-password screen appears after a visible delay following the home screen render
  - Race condition between SIGNED_IN auth event and router.replace('/reset-password') call
  - isRecoveryMode flag silently reset by asynchronous SIGNED_OUT from clearStaleKeychainOnFreshInstall
  - On sign-in screen instead of reset-password after tapping link on fresh install
tags:
  - deep-link
  - supabase
  - auth
  - password-reset
  - expo-router
  - android-cold-start
  - linking
  - race-condition
  - oauth-code-exchange
  - keychain
severity: high
related:
  - ../integration-issues/supabase-password-reset-deep-link-expo.md
---

## Context

Supabase password reset flow using PKCE in a React Native / Expo Router app. The email contains a Supabase verify URL (`https://[ref].supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=yourapp://`). When the user taps the link, the browser hits Supabase's server which generates a short-lived PKCE `?code=` and redirects to the app's custom URL scheme.

See also: [Supabase Password Reset Deep Link Routing in Expo](../integration-issues/supabase-password-reset-deep-link-expo.md) for the earlier fix covering the `isRecoveryMode` flag pattern and `detectSessionInUrl: false`.

---

## Root Cause

Two independent bugs combined to produce the flash.

### Bug 1 — Navigation happened after the async code exchange

In `handleAuthUrl`, `router.replace('/reset-password')` was placed **after** `await supabase.auth.exchangeCodeForSession(code)`. On Android cold start, deep links arrive via `Linking.addEventListener('url')` — **not** `Linking.getInitialURL()`. The `init()` function's early-navigation path only covered the `getInitialURL` branch, so on Android it was silently skipped.

The sequence that caused the flash:

1. `handleAuthUrl` called, `isRecoveryMode.current = true` set
2. `await exchangeCodeForSession(code)` begins (async, ~300–500ms)
3. Exchange completes → Supabase emits `SIGNED_IN`
4. `onAuthStateChange` fires → `setSession(newSession)` → nav effect runs → journal renders
5. *Then* `router.replace('/reset-password')` fires — too late

### Bug 2 — `clearStaleKeychainOnFreshInstall` wiped isRecoveryMode

On a fresh install, `clearStaleKeychainOnFreshInstall` called `supabase.auth.signOut()`. This fired `SIGNED_OUT` **asynchronously on its own tick** — *after* `isRecoveryMode.current` had been set to `true` and even after a re-assertion. The `SIGNED_OUT` handler set `isRecoveryMode.current = false`, causing the nav effect to redirect to sign-in instead of holding for reset-password.

---

## The Fix

**File:** `src/hooks/useAuthSession.ts`

### Fix 1 — Navigate before the async exchange (in `handleAuthUrl`)

```ts
// BEFORE — navigation after exchange, loses the race to SIGNED_IN
if (code) {
  if (queryType === 'recovery') isRecoveryMode.current = true
  await supabase.auth.exchangeCodeForSession(code)
  if (queryType === 'recovery') router.replace('/reset-password') // too late
  return
}

// AFTER — navigation enqueued before any async work
if (code) {
  if (queryType === 'recovery') {
    isRecoveryMode.current = true
    router.replace('/reset-password') // enqueued before exchange
  }
  await supabase.auth.exchangeCodeForSession(code)
  return
}
```

Same pattern for the hash fragment (implicit) flow:

```ts
if (accessToken && refreshToken) {
  if (type === 'recovery') {
    isRecoveryMode.current = true
    router.replace('/reset-password') // before setSession
  }
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
}
```

### Fix 2 — Skip stale-keychain cleanup on recovery URLs (in `init()`)

```ts
const isRecoveryUrl = !!initialUrl && (
  new URLSearchParams(initialUrl.split('#')[1] ?? '').get('type') === 'recovery' ||
  new URLSearchParams(initialUrl.split('?')[1] ?? '').get('type') === 'recovery'
)

if (isRecoveryUrl) {
  isRecoveryMode.current = true
  router.replace('/reset-password') // immediate — before any async work
}

// Recovery creates a fresh session anyway; skipping prevents the async
// SIGNED_OUT from clearStaleKeychainOnFreshInstall resetting isRecoveryMode
if (!isRecoveryUrl) await clearStaleKeychainOnFreshInstall()
```

---

## Why This Works on Both Platforms

| Platform | Deep link delivery | Why the fix helps |
|---|---|---|
| **iOS cold start** | `Linking.getInitialURL()` — reliable | `init()` enqueues `router.replace` before any async call; `clearStaleKeychainOnFreshInstall` is skipped |
| **Android cold start** | `Linking.addEventListener('url')` — arrives after mount | `handleAuthUrl` now enqueues `router.replace` before `exchangeCodeForSession`; beats SIGNED_IN in all paths |
| **Foreground deep link** (both) | `'url'` event | Same `handleAuthUrl` fix applies |

The invariant enforced: **`router.replace('/reset-password')` is always enqueued before any awaited Supabase call**, ensuring no intermediate auth-state navigation can win the race.

---

## Prevention

### Android cold-start deep links are not like iOS

On iOS, `Linking.getInitialURL()` reliably returns the launch URL. On Android, cold-start deep links frequently arrive via the `'url'` event listener instead — meaning any logic gated solely on `getInitialURL()` **silently no-ops on Android cold starts**. Always subscribe to both and deduplicate with a handled ref.

### The rule: navigate first, then do async auth work

Auth state listeners (`onAuthStateChange`, etc.) are async and fire on their own tick. If your deep link handler `await`s anything before navigating, the auth listener may fire in between and reroute the user. Navigate first, then do the async work.

### General rules for deep link handling in RN/Expo

- **Combine `getInitialURL` + `'url'` event** — use a `handled` ref to prevent double-processing the same URL
- **Never assume `SIGNED_OUT` means user intent** — your own code may have triggered it; use explicit flags, not just the event type
- **Use `router.replace` not `router.push`** on deep links — avoids leaving unexpected screens in the back stack on Android
- **Test cold starts on Android explicitly** — `adb shell am start -W -a android.intent.action.VIEW -d "<deep-link>"` with the app fully killed; iOS simulator behavior is not a substitute
