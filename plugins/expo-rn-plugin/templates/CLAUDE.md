# Project Name

## Never do

- `any`, `as` casts, `eslint-disable` — fix at source
- Tamagui: no hardcoded colors/dims, no `StyleSheet.create()`, no inline `style={{…}}` — use `$tokens` and `styled()` everywhere; raw `Text` → `@fonts` semantic components (Heading, Body, Label variants)
- `react-native` / `expo-image` primitives when a Tamagui or `@ksairi-org/` equivalent exists — priority: tamagui → `@ksairi-org/` → project-local → `react-native`
- `FlatList` — use `FlashList` with `estimatedItemSize`
- `TouchableOpacity` / `Pressable` — use your team's touchable wrapper
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
- One `import` statement per module path

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

Both assets **must have transparent backgrounds** — the app's theme controls the background color at runtime via `splash.backgroundColor` in `app.config.ts`.

- **`assets/images/splash.png`** — static first frame, shown by the OS before JS loads. Export directly from the Rive first frame (same logo, same size, same position). Transparent background. `resizeMode: contain` scales it identically to the Rive on all screen sizes.
- **`assets/animations/splash.riv`** — Rive animation. Transparent artboard background. Animation name: `Settle` (or project equivalent). First frame must be pixel-identical to `splash.png` for a seamless transition.
- **Code:** use `Fit.Contain` + `Alignment.Center` in `SplashView`. Do NOT use `imageWidth` in `app.config.ts` — the top-level `splash` field with `resizeMode: contain` auto-matches the Rive across all screen sizes. Use `@ksairi-org/react-native-splash-view` ≥ 0.1.7.

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
