# Project Name

## Never do

- `any`, `as` casts, `eslint-disable` — fix at source
- Tamagui: no hardcoded colors/dims, no `StyleSheet.create()`, no inline `style={{…}}` — use `$tokens` and `styled()` everywhere; raw `Text` → `@fonts` semantic components (Heading, Body, Label variants); set `disableExtraction: true` in `@tamagui/babel-plugin` (Babel can't resolve TS path aliases → empty extraction cache → "Missing theme" crash in production)
- `react-native` / `expo-image` primitives when a Tamagui or `@ksairi-org/` equivalent exists — priority: tamagui → `@ksairi-org/` → project-local → `react-native`
- `FlatList` — use `FlashList` with `estimatedItemSize`
- `TouchableOpacity` / `Pressable` — use your team's touchable wrapper
- `GoogleSigninButton` — it ignores text alignment; use a custom `BaseTouchable` + inline SVG Google logo (`react-native-svg`)
- `AppleButton` on Android — it's iOS-only; render a custom `BaseTouchable` + `FontAwesome` apple icon gated on `Platform.OS === 'android' && !!process.env.EXPO_PUBLIC_ANDROID_APPLE_SIGN_IN_CLIENT_ID`; hardcode `bg="black"` — semantic tokens like `$color12` invert in dark mode making white text invisible
- `KeyboardAvoidingView` — use `react-native-keyboard-controller`
- `Alert.alert` for non-destructive feedback — use `burnt.toast()`
- `npm` / `npx` / `pnpm` — always `yarn`
- `yarn add` for Expo SDK packages — use `yarn expo install <pkg>` to get the SDK-compatible version
- Edit files in `src/api/generated/` — run `yarn generate:open-api-hooks`
- Store auth tokens in MMKV or AsyncStorage — use `expo-secure-store`
- Handle raw card data — use Stripe `PaymentSheet` only
- Use Stripe for digital goods/features consumed in-app — Apple/Google require IAP; use RevenueCat (`@revenue-cat`) instead
- Log PII in Sentry tags or breadcrumbs
- Log PII or payment data in analytics events — use opaque internal IDs only
- Put logic in route files — route files are thin wrappers (`export { default } from '@screens/FooScreen'`); all UI lives in `src/screens/`
- Network calls in Zustand stores — server state → react-query hooks in `src/hooks/`; Zustand is for UI/local state + MMKV persistence only
- Raw `supabase.auth.*` in screens or stores — encapsulate in a dedicated auth hook
- Use `src/lib/` — correct dirs are `src/services/{supabase,analytics,firebase-messaging}/` and `src/stores/` (plural) with `utils.ts` for `createZustandMmkvStorage`

## Always do

- Run `tsc --noEmit` after every change — zero errors before done
- Run `yarn expo install --check` after adding packages — fixes SDK version mismatches before they break builds; updates `yarn.lock`, so re-test before deploying
- Run `yarn doctor` before triggering any store build — catches duplicate native modules early
- Wrap user-visible strings: `<Trans>` in JSX, `` t`…` `` for props (import from `@lingui/react/macro`)
- Keep files under 500 lines

## Stack quick-ref

Run `/expo-rn-plugin:coding-standards` to load full standards. Quick pointers:

- **State:** server state → react-query hooks; UI state → Zustand + MMKV
- **Forms:** RHF + zod + Tamagui fields — `/expo-rn-plugin:form`
- **Auth:** Supabase auth + Google/Apple — `/auth`
- **Payments:** Stripe `PaymentSheet` — `/expo-rn-plugin:stripe`
- **Errors:** Sentry — `/expo-rn-plugin:sentry`
- **API hooks:** orval-generated hooks in `src/api/generated/`
- **Env vars:** Doppler — workspace = app name, project = `mobile` (web = `web`)
- **Typography:** `@fonts` → semantic components (Heading, Body, Label variants) — never raw `Text` with `fontSize`
- **Design:** Figma tokens in `src/theme/` — `/expo-rn-plugin:figma`
- **Scaffold:** CRUD from DB table — `/expo-rn-plugin:scaffold`
- **Push notifications:** FCM + expo-notifications
- **Tests:** jest-expo + React Testing Library + `renderWithProviders` — `/expo-rn-plugin:testing`
- **Analytics:** Firebase Analytics (default), PostHog, Amplitude — `/expo-rn-plugin:analytics`

## Reference implementation

When a pattern isn't covered here, check [ksairi-org/virtual-wallet](https://github.com/ksairi-org/virtual-wallet) — the canonical production app built on this stack.

## Splash screen assets (designer spec)

Both assets **must have transparent backgrounds** — the app's theme controls the background color at runtime.

- **`assets/images/splash.png`** — static first frame shown by the OS before JS loads. Export directly from the Rive first frame; must be pixel-identical for a seamless transition.
- **`assets/animations/splash.riv`** — Rive animation. Transparent artboard background. Animation name: `Settle` (or project equivalent).
- **Code:** use `@ksairi-org/react-native-splash-view` in `app/_layout.tsx`. Set `animationViewStyle` for Android only: `Platform.OS === "android" ? { width: 288, height: 288, alignSelf: "center" } : undefined` — matches the native splash size (288dp is the Android 12+ icon clip limit; larger values clip without enlarging). iOS is `undefined` because `enableFullScreenImage_legacy` makes the splash full-screen, and Rive fills it identically via `Fit.Contain`.
- **`app.config.ts`:** use the `expo-splash-screen` plugin. Hoist `backgroundColor`, `image`, and `dark.backgroundColor` to the top level (shared); put only platform-specific overrides in `ios` / `android` keys. iOS: `enableFullScreenImage_legacy: true`. Android: `imageWidth: 288` (Android 12+ clip limit). The `dark` key is natively supported (iOS 13+, Android 10+) — no custom config plugin needed. Do not use the top-level `splash` key — the plugin supersedes it.
- **Android splash icon circle background** is not reliably controllable — Samsung and other OEMs override `windowSplashScreenIconBackgroundColor` and ignore `values-night/` overrides for `iconBackground`. Accept the limitation; the circle is visible for under 1 s before the Rive animation.

## Project context

<!-- Fill in: API base URL, Supabase project ref, Sentry project, Figma file ID -->

- DB schema: `api` (not `public`); every `CREATE TABLE` migration must include explicit GRANTs (`anon`, `authenticated`, `service_role`) + `enable row level security` — Supabase drops auto-grants for new tables from 2026-05-30 / 2026-10-30. The `generate_migration` tool adds this automatically.
- **Routes:** `app/` (expo-router) — route files are 1-line wrappers; screens in `src/screens/`
- **Components:** atomic design — `src/components/{atoms,molecules,organisms}/`
- **Services:** `src/services/{supabase,analytics,firebase-messaging}/` — never `src/lib/`
- **Stores:** `src/stores/` (plural) + `utils.ts` with `createZustandMmkvStorage` — UI state only
- **i18n:** full module at `src/i18n/` — root `lingui.config.ts` is a thin re-export only
- **Theme:** Figma tokens in `src/theme/{themes,tamagui.config}/` — root `tamagui.config.ts` is a thin re-export only
- Storage: `expo-secure-store` (tokens) · MMKV/Zustand (UI) · AsyncStorage (cache)
- OTA: `eas update --channel production --message "…"`
