---
name: coding-standards
description: Load coding standards and conventions for this React Native / Expo project. Use when you need guidance on TypeScript patterns, Tamagui tokens, Zustand stores, Lingui i18n, Doppler env vars, or Zustand state ownership rules.
---

Apply the following standards to all code in this project.

> If this project uses `@ksairi-org/*` libraries, run `/expo-rn-plugin:libs` before writing any utility, hook, or layout code — those packages replace many standard alternatives.

## Reference implementation

When a pattern isn't covered by these standards, look at **[ksairi-org/virtual-wallet](https://github.com/ksairi-org/virtual-wallet)** — the canonical production app built on this exact stack. Use it to answer "how was X solved in practice?" before inventing a new approach.

## TypeScript

- Never use `any` — use proper types, generics, or type guards
- Never use `as` assertions — fix types at the source
- After any code change, run `tsc --noEmit` and fix **all** errors (zero errors is a baseline)

## React / Components

- Follow React best practices (hooks, memoization, clean component structure)
- Never use `eslint-disable-next-line react-hooks/exhaustive-deps` — fix the dependency issue
- Keep files under **500 lines** — split into sub-components, hooks, or utils proactively

### UI component import priority

Always resolve UI needs from the highest available source before reaching for lower ones:

1. **project-local** — atoms, molecules, organisms in this project's own codebase (e.g. `@atoms`, `@molecules`, `@organisms`)
2. **`@ksairi-org/`** — shared org packages; covers buttons, touchables, images, screen containers, forms, auth
3. **tamagui** — layout and text primitives: `XStack`, `YStack`, `Text`, `Spinner`, `Stack`, …
4. **`react-native`** — only when no Tamagui or `@ksairi-org/` equivalent exists
5. **Third-party libraries** — last resort

Never import `View`, `Text`, `TouchableOpacity`, `Pressable`, or `Image` from `react-native` when a Tamagui or `@ksairi-org/` wrapper covers the use case.

### When to push a component to `@ksairi-org/`

Before adding a new component to the project-local layers, ask: **would any other app on this stack benefit from this?** If yes, and it has no app-specific tokens, data, or business logic, push it to `@ksairi-org/libs` instead and consume it remotely. Examples that belong upstream: generic wrappers around third-party primitives (`KeyboardScrollView`), shared layout primitives, utility hooks. This rule only applies when you are a member of the `ksairi-org` GitHub org and the consuming project already uses `@ksairi-org/*` packages.

### Project-local component layers

Organize project-local shared components into three layers and place new components in the correct one:

- **atoms** — single-purpose UI primitives with no business logic: typography wrappers, icon wrappers, basic input primitives, status badges, dividers, simple wrappers
- **molecules** — multi-part units with a single concern, composed from atoms: form fields (label + input + error), card items, list rows, empty-state views, search bars, notification banners
- **organisms** — full UI sections composing multiple molecules, may hold local state: forms, lists with loading/empty/data states, complex modals, navigation bars, onboarding steps

### Screen containers (`@ksairi-org/ui-containers`)

Every screen must use `Containers.Screen` as its root element. It handles safe area insets automatically (via `useSafeAreaInsets`) so you never need `SafeAreaView` directly. react-navigation adjusts the inset context per navigator, so the all-edges default is self-correcting — no double-padding inside a Stack with a header or inside a Tabs screen.

```tsx
import { Containers } from '@ksairi-org/ui-containers'

// Screen with its own ScrollView/KeyboardScrollView
<Containers.Screen shouldAutoResize={false}>
  <KeyboardScrollView>…</KeyboardScrollView>
</Containers.Screen>

// Screen without scroll — auto-resize switches to ScrollView if content overflows
<Containers.Screen>
  <Containers.SubY>…</Containers.SubY>
</Containers.Screen>
```

- `Containers.Screen` — outermost; handles safe area, auto-resize to `ScrollView` when content overflows
- `Containers.SubY` — vertical sub-section with standard horizontal padding (`$md`)
- `Containers.SubX` — horizontal sub-section with standard horizontal padding (`$md`)
- `edges` prop (default all four) — override only when you need to exclude specific edges
- `shouldAutoResize={false}` — required when the screen already contains its own `ScrollView`

**Buttons specifically** — `@ksairi-org/ui-button` takes priority over Tamagui's `Button`. Never use Tamagui's raw `Button` or react-native touchables for interactive buttons:
- Primary full-width action → `CTAButton` (has `loading` prop and `spinnerColor`; pass `backgroundColor` from your theme; spinner is Tamagui `Spinner`)
- Secondary action → `BasicButton` (full `ButtonProps` pass-through, `opacity=0.4` when disabled)
- Text-only / link-style → `GhostButton` (transparent background, `opacity=0.4` when disabled; pass `color` from your theme)
- Icon-only → `IconButton` (circular, requires `icon: ReactNode`, full `ButtonProps` pass-through)
- Custom layout or icons → `BaseButton` (accepts `leftIcon`/`rightIcon`)
- Spring-animated with auto-width → `SizingAnimatedButton` from `@ksairi-org/ui-button-animated` (`backgroundColor` required; measures its own width internally)
- Spring-animated with explicit width → `AnimatedButton` from `@ksairi-org/ui-button-animated` (`backgroundColor` and `width: number` both required; prefer `SizingAnimatedButton` unless you need explicit width control)

## i18n (Lingui)

- Use `Trans` + `t` for every hardcoded user-visible string
- Use `` t`…` `` for prop strings (placeholders, aria labels, alert titles)
- Import `Trans, useLingui` from `@lingui/react/macro`
- Always commit `src/i18n/locales/compiled/*.ts` after running `yarn i18n` — the `pre-build` script reruns compilation; if the committed file differs from what the installed lingui version emits (e.g. lingui 6 adds `/*eslint-disable*/`), every build will produce a dirty tree
- After upgrading `@lingui/cli`, run `yarn i18n:compile` and commit the result before the next build

## General

- No over-engineering; no magic numbers — extract to named constants
- One `import` statement per module path (prevents `import/no-duplicates`)

## Tamagui

- Main config: `src/theme/tamagui.config.ts`; themes: `src/theme/themes.ts`
- Tokens use kebab-case: `$surface-app`, `$text-primary` — always check `themes.ts` before using
- `allowedStyleValues: "strict"` — only token values; raw hex/rgba will error at compile time
- Spacing/sizing: `$sm`, `$md`, `$lg` from `sizesSpaces`; radius from `radius` tokens
- Never use Tamagui color props with raw strings
- Typography: use components from `src/components/` — no raw `<Text>` with style props
- Never use `StyleSheet.create()` — use Tamagui `styled()`
- Never add inline style props to non-Tamagui components — wrap with `styled()` from `@tamagui/core` first, then use token-based style props on the wrapper

## Zustand — state ownership

| Layer | Owner |
| --- | --- |
| Server state | react-query / orval hooks |
| Client/UI state | Zustand |

If data comes from the backend it belongs in react-query. Zustand stores should be thin.

### Store pattern

```ts
type MyStore = MyStoreState & MyStoreFunctions;
const INITIAL_STATE: MyStoreState = { ... };
const useMyStore = create<MyStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      setKeyValue: (key, value) => set((state) => ({ ...state, [key]: value })),
    }),
    { name: "my-storage", storage: createJSONStorage(() => createZustandMmkvStorage({ id: "my-storage" })) },
  ),
);
```

### Selectors — always select minimally

```ts
// Good
const firstName = useUserStore((state) => state.firstName);
// Bad — re-renders on any store change
const store = useUserStore();
```

## Env Vars / Doppler

- Secrets via Doppler — project `mobile`, configs `dev` / `stg` / `prd`
- Adding a new secret requires three steps:
  1. Add to `env.template.yaml`: `EXPO_PUBLIC_FOO={{ .FOO }}` (left = shell var, right = Doppler key)
  2. Set in relevant configs: `doppler secrets set FOO="value" --project mobile --config stg`
  3. Sync: `yarn sync-env-vars`
- **Doppler key naming:** never put `EXPO_PUBLIC_` on the Doppler key — that prefix belongs only on the left side of `env.template.yaml`. Example: Doppler key is `SUPABASE_API_KEY`; template maps it as `EXPO_PUBLIC_SUPABASE_API_KEY={{ .SUPABASE_API_KEY }}`.

## HTTP / API

- Use orval-generated hooks for all API calls — never `axios` directly in components
- `axios` only for non-REST endpoints or one-off authenticated file uploads
- Debugging stale queries: open the React Query panel in Expo dev client (`@dev-plugins/react-query`) before touching code

## Lists

- Always use `FlashList` from `@shopify/flash-list` — never `FlatList`
- `estimatedItemSize` is required — omitting it causes a warning and degrades performance

## User Feedback (toasts)

- Use `burnt` for all success and error toasts — never `Alert.alert` for transient feedback
- Success: `Burnt.toast({ title: '…', preset: 'done' })` — auto-dismisses after ~2s
- Error: `Burnt.toast({ title: '…', preset: 'error' })` — auto-dismisses after ~4s
- Destructive / irreversible actions → confirmation `Alert.alert` dialog, not a toast
- Form validation errors → inline under the field, not a toast

## Dates

- Format dates with `date-fns` — always pass the locale from `expo-localization` for locale-aware output
- Never use `Date.toLocaleDateString()` — output varies by device locale settings

## Unit / Component Tests

- Test runner: `jest-expo`; render helper: `@testing-library/react-native`
- Always wrap renders in a `renderWithProviders` helper that includes Tamagui, query client, and i18n providers
- Assert on what the user sees (`screen.getByText`, `screen.getByRole`) — never on internal state
- Run `/expo-rn-plugin:testing` for canonical test patterns and provider setup
