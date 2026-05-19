---
name: animations
description: Animation standards for React Native / Expo projects. Covers react-native-reanimated for UI motion, Rive for illustration/splash animations, and rules for when to use each. Use when building animated components, transitions, gestures, or splash screens.
---

Apply the following animation standards to all code in this project.

## Libraries

| Library | Package | When to use |
| --- | --- | --- |
| Reanimated | `react-native-reanimated` | UI motion: layout transitions, gestures, shared element transitions, scroll-driven effects |
| Rive | `rive-react-native` | Illustration-quality animations: splash screen, onboarding, lottie-style playback from `.riv` files |

Never use the built-in `Animated` API from React Native — always prefer Reanimated.

## react-native-reanimated

Install via Expo:

```bash
yarn expo install react-native-reanimated
```

Add the Babel plugin in `babel.config.js` — it must be last:

```js
plugins: ['react-native-reanimated/plugin'],
```

### Core patterns

**Layout animation (enter/exit):**

```tsx
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

<Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={LinearTransition}>
  {children}
</Animated.View>
```

**useAnimatedStyle + useSharedValue:**

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const scale = useSharedValue(1);
const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

// Trigger: scale.value = withSpring(1.05);
```

**Gesture handler (press feedback):**

```tsx
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const scale = useSharedValue(1);
const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

const tap = Gesture.Tap()
  .onBegin(() => { scale.value = withSpring(0.96); })
  .onFinalize(() => { scale.value = withSpring(1); });

<GestureDetector gesture={tap}>
  <Animated.View style={style}>{children}</Animated.View>
</GestureDetector>
```

### Rules

- All animated values must live in `useSharedValue` — never in `useState`
- Never read `.value` on the JS thread inside render — only inside `useAnimatedStyle` or `runOnJS` callbacks
- Prefer built-in presets (`FadeIn`, `SlideInRight`, `ZoomIn`) over custom worklets for standard transitions
- Durations: enter 200–300 ms, exit 100–200 ms, spring stiffness 120–180 for snappy feel

## Rive

Rive files (`.riv`) go in `assets/animations/`. Import and play:

```tsx
import Rive, { Fit, Alignment } from 'rive-react-native';

<Rive
  resourceName="splash"   // assets/animations/splash.riv
  fit={Fit.Cover}
  alignment={Alignment.Center}
  autoplay
/>
```

Use state machines for interactive Rive animations — pass `stateMachineName` and control inputs via the `RiveRef`.

### Splash screen pattern

For the app splash screen, use `@ksairi-org/react-native-splash-view` (wraps `rive-react-native`) in `app/_layout.tsx`:

```tsx
import { SplashView } from "@ksairi-org/react-native-splash-view";
import { Platform } from "react-native";
import splash from "../assets/animations/splash.riv";

<SplashView
  source={splash}
  style={{ backgroundColor: themes[colorScheme].splashBackground }}
  animationViewStyle={Platform.OS === "android" ? { width: 288, height: 288, alignSelf: "center" } : undefined}
  fadeOutDelay={1500}
  fadeOutDuration={500}
/>
```

Place `SplashView` as the last child inside `QueryClientProvider` (outside all navigation providers) so it overlays the entire screen. The 288dp `animationViewStyle` is Android-only — it matches the 288dp Android 12+ native splash icon clip limit for a seamless transition.

## When to use which

| Use case | Library |
| --- | --- |
| Button press feedback | Reanimated gesture |
| Modal / sheet enter-exit | Reanimated layout preset |
| Scroll-driven header collapse | Reanimated scroll handler |
| Shared element between screens | Reanimated shared transition |
| Splash / onboarding illustration | Rive |
| Loading skeleton shimmer | Reanimated (loop worklet) |
| Lottie-style branded animation | Rive (preferred over Lottie) |
