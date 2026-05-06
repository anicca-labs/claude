# Project Name

## Never do

- `any`, `as` casts, `eslint-disable` — fix at source
- Raw hex/rgba in Tamagui props — use `$token` references only
- Hardcoded numeric dimensions (padding, margin, fontSize, width, height, borderRadius, gap) — in Tamagui props use `$sm`/`$md`/`$lg` tokens; in non-Tamagui style objects import `sizes`/`radius` from `@theme`
- Raw `Text` with manual `fontSize` — use semantic components from `@fonts` (Heading, Body, Label variants)
- `StyleSheet.create()` — use Tamagui `styled()`
- Inline `style={{…}}` props on non-Tamagui components — wrap with `styled()` from `@tamagui/core` and use token props on the wrapper
- `FlatList` — use `FlashList` with `estimatedItemSize`
- `TouchableOpacity` / `Pressable` — use your team's touchable wrapper
- Raw `expo-image` — use your team's image wrapper (if any)
- `react-native` UI primitives when a Tamagui or `@ksairi-org/` equivalent exists — priority: tamagui → `@ksairi-org/` → project-local → `react-native` → third party
- `KeyboardAvoidingView` — use `react-native-keyboard-controller`
- `Alert.alert` for non-destructive feedback — use `burnt.toast()`
- `npm` / `npx` / `pnpm` — always `yarn`
- `yarn add` for Expo SDK packages — use `yarn expo install <pkg>` to get the SDK-compatible version
- Edit files in `src/api/generated/` — run `yarn generate:open-api-hooks`
- Store auth tokens in MMKV or AsyncStorage — use `expo-secure-store`
- Handle raw card data — use Stripe `PaymentSheet` only
- Log PII in Sentry tags or breadcrumbs
- Log PII or payment data in analytics events — use opaque internal IDs only
- Put logic in route files — route files are thin wrappers (`export { default } from '@screens/FooScreen'`); all UI lives in `src/screens/`
- Network calls in Zustand stores — server state → react-query hooks in `src/hooks/`; Zustand is for UI/local state + MMKV persistence only
- Raw `supabase.auth.*` in screens or stores — encapsulate in a dedicated auth hook
- Use `src/lib/` — the correct directory is `src/services/` (with `analytics/`, `firebase-messaging/`, `supabase/` sub-modules)
- Name stores directory `src/store/` (singular) — always `src/stores/` (plural) with `utils.ts` for `createZustandMmkvStorage`
- Leave Expo boilerplate directories at root — `components/`, `hooks/`, `constants/` at root are Expo scaffolding; clean them up or move to `src/`

## Always do

- Run `tsc --noEmit` after every change — zero errors before done
- Run `yarn expo install --check` after adding packages — fixes SDK version mismatches before they break builds
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

## Project context

<!-- Fill in: API base URL, Supabase project ref, Sentry project, Figma file ID -->

- DB schema: `api` (not `public`)
- **Routes:** `app/` (expo-router) — route files are 1-line wrappers; screens in `src/screens/`
- **Components:** atomic design — `src/components/{atoms,molecules,organisms}/`
- **Services:** `src/services/{supabase,analytics,firebase-messaging}/` — never `src/lib/`
- **Stores:** `src/stores/` (plural) + `utils.ts` with `createZustandMmkvStorage` — UI state only
- **i18n:** full module at `src/i18n/` — root `lingui.config.ts` is a thin re-export only
- **Theme:** Figma tokens in `src/theme/{themes,tamagui.config}/` — root `tamagui.config.ts` is a thin re-export only
- Storage: `expo-secure-store` (tokens) · MMKV/Zustand (UI) · AsyncStorage (cache)
- OTA: `eas update --channel production --message "…"`
