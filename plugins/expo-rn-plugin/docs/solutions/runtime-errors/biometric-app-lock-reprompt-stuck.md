---
title: 'Biometric app-lock: user stranded behind a button-less cover after backgrounding'
problem_type: logic-error
platforms:
  - ios
  - android
symptoms:
  - After the Face ID / biometric prompt shows once, backgrounding and reopening leaves the lock cover with no prompt and no unlock button
  - Returning from the iOS app switcher (long-press home / swipe up) shows only the branded cover — no way to retry
  - Biometric prompt fires only once per lock engagement and never re-appears on subsequent foregrounds
  - App stuck locked with no escape hatch; user must force-quit
tags:
  - biometric
  - face-id
  - touch-id
  - app-lock
  - expo-local-authentication
  - appstate
  - lifecycle
  - ios-app-switcher
severity: high
---

## Context

A full-screen biometric lock overlay (`expo-local-authentication`) that engages when the app goes to `background`/`inactive` and auto-prompts on the next foreground. It has three moving parts: an `isLocked` store flag, an `autoPrompted` ref (so it prompts once per lock), and a manual "Unlock" button shown only after a failed/dismissed prompt.

## Root Cause

Two independent decisions combined to strand the user:

1. **The auto-prompt is gated to once per lock** via an `autoPrompted` ref. If the user backgrounds *while the OS prompt is up* and returns, `autoPrompted` is still `true`, so the prompt never re-fires.
2. **The retry button's visibility hangs off a fragile flag.** It's shown only after a failed auth (`retryVisible`), and `setLocked(true)` resets that flag on **every** `background` *and* `inactive` transition. Returning from the iOS **app switcher** is an `inactive` blip — it clears the button *without* triggering a re-prompt. Result: only the branded cover, no prompt, no button → stuck.

Why the once-per-lock gate existed at all: the biometric system UI itself flips the app `active → inactive → active`, so naively re-prompting on every `active` transition **loops** (prompt → inactive → active → prompt → …).

## The Fix

Two changes, both about **always leaving an escape hatch** and **distinguishing a real background from the prompt's own flicker**.

### 1. Show the Unlock button whenever the OS prompt isn't up

Gate the button on `!authenticating` (is the system Face ID/passcode sheet currently presented?) instead of a resettable `retryVisible` flag. The moment the OS prompt is dismissed or fails, the button reappears — there is always a way to retry.

```tsx
// BEFORE: button tied to a flag that setLocked() clears on background AND inactive
{retryVisible ? <UnlockButton /> : null}

// AFTER: button shown whenever the OS prompt isn't presented — never strandable
{!authenticating ? <UnlockButton /> : null}
```

### 2. Re-arm the auto-prompt on a *real* background, not the `inactive` flicker

```tsx
const sub = AppState.addEventListener('change', (next) => {
  if (next === 'background') {
    // A genuine backgrounding — re-arm so the prompt fires again on return. The
    // biometric system UI only flips us to `inactive` (never `background`), so this
    // can't re-arm mid-prompt and can't loop.
    autoPrompted.current = false
  } else if (next === 'active') {
    tryAutoPrompt() // guarded by autoPrompted + splashComplete + AppState === 'active'
  }
})
```

## Why This Works

- The **prompt** re-fires after a real background (re-armed on `'background'`), but not on the `inactive → active` cycle the Face ID sheet itself causes — so no loop.
- The **button** is a permanent fallback: any time the OS sheet isn't up and the app is locked, it's visible. Even if the auto-prompt logic has an edge case, the user can always tap Unlock. No stuck state.

## Prevention

- **`background` ≠ `inactive`.** On iOS a real backgrounding hits `AppState === 'background'`; the biometric system prompt (and app-switcher/control-center) only reach `'inactive'`. When you need to react to "the user actually left," key on `'background'`. Keying re-prompt/reset logic on `'inactive'` will loop or fire spuriously.
- **Never depend on a single flag that a lifecycle handler can reset** for the *only* escape hatch. Tie the manual unlock affordance to a state you can always derive (is the OS prompt up?), not to a transient "we failed once" flag.
- **Always keep a manual retry visible** behind a biometric lock. Auto-prompt is a convenience; a user who dismisses it, or hits an OS throttle, must never be trapped in their own app.
