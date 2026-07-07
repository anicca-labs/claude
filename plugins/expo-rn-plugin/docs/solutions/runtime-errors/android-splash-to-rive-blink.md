---
title: "Android splash screen blinks/gaps when transitioning to Rive animation"
problem_type: platform-limitation
platforms:
  - android
symptoms:
  - Brief white or blank flash between native splash screen and first Rive animation frame
  - Blink visible on Android 11 and Android 12+
  - iOS works perfectly with no blink using the same Rive file and setup
  - Adding longer setTimeout delays reduces but never eliminates the gap
  - Matching Rive's first frame to the splash icon does not help
tags:
  - android
  - splash-screen
  - rive
  - expo-splash-screen
  - managed-expo
  - known-limitation
---

## Problem

A brief visual blink (blank gap) appears on Android between the native splash screen and the Rive animation start. This affects **all Android versions** — confirmed on Android 11 and Android 12+.

iOS shows no blink with the exact same Rive file and `@anicca-labs/react-native-splash-view` setup.

## Root cause

The gap is **OS-level**, not a Rive timing or first-frame content issue.

iOS fades the native splash *over* the Rive `Animated.View` — the two overlap during the transition, so any brief gap is invisible. Android does not provide this overlap:

- **Android ≤11**: The OS removes the `windowBackground` abruptly with no fade or overlap, leaving a blank moment before React Native's `Animated.View` becomes visible on screen.
- **Android 12+**: Same abrupt removal, plus the OS plays a ~166ms zoom-out exit animation on top, making the blink more intense.

## What does NOT fix it

- **Matching the Rive first frame to the splash icon** — The blink is not wrong content, it is *no content* during the OS transition. iOS proves this: the same first frame works perfectly there.
- **Longer `setTimeout` before `hideAsync`** — Delays reduce the blink slightly by keeping the native splash up longer, but the OS transition itself still creates the gap when `hideAsync` finally fires.
- **Using a different animation library** — The issue is not Rive-specific; it would affect Lottie or any JS-rendered animation.
- **Using a smarter model / cleverer JS approach** — This is a hard platform constraint, not a code logic problem.

## Current mitigations (in `@anicca-labs/react-native-splash-view`)

The package applies two mitigations that reduce the visible gap:

1. **Static placeholder image** — An `<Image>` matching the native splash icon is rendered in the `Animated.View` until Rive's `onPlay` fires, so there is always *something* visible even during the OS transition.
2. **50ms delay before `hideAsync` on Android** — Keeps the native splash visible a tiny bit longer, giving the placeholder a moment to appear before the OS removes the native layer.

These reduce the blink to a "little bit" level on most devices but cannot eliminate it from a managed Expo app.

## Complete fix (requires ejecting)

```kotlin
// In MainActivity.kt — requires ejecting from managed Expo
SplashScreen.setOnExitAnimationListener { splashScreenView ->
    // Replace the OS zoom-out with your own transition
    val slideUp = ObjectAnimator.ofFloat(splashScreenView, View.TRANSLATION_Y, 0f, -splashScreenView.height.toFloat())
    slideUp.duration = 200
    slideUp.doOnEnd { splashScreenView.remove() }
    slideUp.start()
}
```

Not available in managed Expo workflow.

## References

- `@anicca-labs/react-native-splash-view` v0.1.9 — `SplashView.tsx` `handlePlay` comment documents this limitation
- Android `SplashScreen.setOnExitAnimationListener` docs: https://developer.android.com/reference/android/window/SplashScreen#setOnExitAnimationListener(android.window.SplashScreen.OnExitAnimationListener)
