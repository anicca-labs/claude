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
- Named exports only — no `export default`. One file = one component/hook; the file name and export name match 1:1
- No `React.FC` — type props inline or with a separate `type Props = {…}`
- Prefer union types over multiple boolean flags: `type Status = "idle" | "loading" | "error"` instead of `isLoading + hasError`
- Type/interface names: no `T` or `I` prefix; self-documenting plain English; no abbreviations (except universally known ones like `API`, `URL`)
- Helper function naming: `get*` / `set*` / `create*` for synchronous; `fetch*` / `post*` / `patch*` / `delete*` for API calls; `is*` / `are*` for type guards and predicates

## React / Components

- Follow React best practices (hooks, memoization, clean component structure)
- Never use `eslint-disable-next-line react-hooks/exhaustive-deps` — fix the dependency issue
- Keep files under **500 lines** — split into sub-components, hooks, or utils proactively
- Conditional rendering: use ternary (`condition ? <X /> : null`), not `&&` — the `&&` form renders `0` when condition is a falsy number
- No margin on custom components — margins create invisible coupling between sibling layout. Use `gap` on the parent `YStack`/`XStack`, or `padding` on a container instead

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
- Primary full-width action with Tamagui theme tokens → `BaseTouchable` from `@ksairi-org/ui-touchables` with `bg="$token"` — **not** `CTAButton`. `CTAButton` uses `unstyled={true}` on Tamagui's `Button` and the `background` prop does not reliably resolve theme tokens; `BaseTouchable` with `bg` does. Use `opacity={disabled ? 0.4 : 1}` for the disabled visual state and an inline `{loading ? <Spinner /> : children}` guard.
- Primary full-width action with explicit hex/rgba colors → `CTAButton` (pass `backgroundColor` as a literal color string, not a `$token`; has `loading` prop and `spinnerColor`)
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
- Color tokens use semantic kebab-case names — always check `themes.ts` before using. Standard scale: `$surface-app`, `$surface-card`, `$surface-subtle`, `$surface-hover`, `$surface-pressed`, `$border-subtle`, `$border-default`, `$text-disabled`, `$text-placeholder`, `$text-tertiary`, `$text-secondary`, `$text-emphasis`
- `allowedStyleValues: "strict"` — only token values; raw hex/rgba will error at compile time
- Spacing/sizing: `$sm`, `$md`, `$lg` from `sizesSpaces`; radius from `radius` tokens
- Use `gap` on `XStack`/`YStack` for whitespace between elements — not `Separator`. `Separator` renders a visible divider line and should only be used when that line is intentional UI. Using `Separator` purely for spacing conflates layout with visual chrome.
- Never use Tamagui color props with raw strings
- Typography: use components from `src/components/` — no raw `<Text>` with style props
- Never use `StyleSheet.create()` — use Tamagui `styled()`. If a third-party component's API forces a plain style object (e.g. a `style` prop that only accepts `StyleSheet` output), add a `// NOTE: StyleSheet required — <reason>` comment and surface it to the user so they can decide whether to accept it.
- Never add inline style props to non-Tamagui components — wrap with `styled()` from `@tamagui/core` first, then use token-based style props on the wrapper
- Never use absolute positioning for layout — it breaks safe area handling and adaptive sizing. Only use `position: absolute` for overlays (badges, toasts, FABs) that genuinely need to float above the document flow

### Tamagui theme config rules (avoid these two mistakes)

**Never put theme values in `createTokens`** — `color: themes.light` in `createTokens` locks every `$color*` reference to the light value regardless of active theme, breaking dark mode. Color tokens belong only in the `themes` object; `createTokens` should only contain spacing, sizing, radius, and font tokens.

**Never use `as` type assertions on theme objects** — `} as typeof defaultConfig.themes.light` erases your custom token names from TypeScript's view, so `$surface-card` etc. won't typecheck. Remove the assertion and let TypeScript infer the full type — `createTamagui` propagates it automatically to `GetThemeValueForKey`.

## Zustand — state ownership

| Layer | Owner |
| --- | --- |
| Server state | react-query / orval hooks |
| Client/UI state | Zustand |

If data comes from the backend it belongs in react-query. Zustand stores should be thin.

### Client-driven-by-remote pattern (edit flows)

When the user edits remote data (profile, settings, checkout form), the handoff pattern is:

**Fetch → Hydrate local state → Edit → Save**

Use react-query to fetch, then seed a local Zustand slice or `useState` with the result. The user edits the local copy; on save, call the mutation and invalidate the query. Never mutate the react-query cache directly for optimistic edits unless you have a specific reason — local state is simpler and easier to reason about.

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

## Settings Tab

Every app with a tab navigator must include a **Settings tab**. It is the standard home for account-level and device-level controls that don't belong in content screens.

**Required items** (always present):

- **Subscription** — shows current plan (Free / Pro Monthly / Pro Annual) with spinner while RC loads; "Upgrade to Pro ✦" button when free → `presentPaywall()`; "Manage subscription" when pro → `Purchases.showManageSubscriptions()`. See `/expo-rn-plugin:iap` for the full pattern.
- **Push notification permission** — shows `Granted` / `Denied` status; when denied, tapping opens `Linking.openSettings()` (app-specific settings page on both platforms); uses an `AppState` listener + `openedSettings` ref to re-check the permission when the user returns. See `/notifications` for the full pattern.
- **Sign out** — always confirm with `Alert.alert` before calling `supabase.auth.signOut()`; use `style: 'destructive'` on the confirm button; placed at the bottom of the screen so it doesn't get tapped by accident

**Growing list** — as new general-purpose controls are identified (e.g. language preference, theme toggle, account deletion), add them here before adding to any content screen.

Do not put permission or account controls in content screens (journal, feed, reflections, etc.) — they belong in Settings.

## Environment Badge

Every app must render an `EnvBadge` in the root layout. It reads `EXPO_PUBLIC_ENV` and shows an amber "STAGING" pill overlay in the top-right corner when the env is not `prd`. It renders nothing in production, so there is no cost to keeping it in the tree.

Mount it as a sibling of `<SplashView />` in `app/_layout.tsx`:

```tsx
import { EnvBadge } from "@atoms";

// Inside RootLayout return — EnvBadge must come before SplashView so it renders on top once the splash fades:
<EnvBadge />
<SplashView ... />
```

The component lives at `src/components/atoms/EnvBadge/index.tsx` and is exported from `@atoms`.

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

## OTA Updates

- OTA updates **only work if no native code changed** since the last full EAS build. The most common cause: a dependency update that includes native modules. When in doubt, do a full build.
- Control update urgency via the `['expo-updates'].type` field in `app.config.ts`:
  - `'mandatory'` — shows an alert on launch requiring the user to update before continuing
  - `'optional'` — silently applies the update on the next cold start (app fully closed and reopened)
- OTA updates do not work on debug builds — test against a release (internal) build on a simulator or device.

## Assets

- Compress all PNG/JPG/MP4 assets with [ImageOptim](https://imageoptim.com/mac) before committing — typically saves 40–80% with no perceptible quality loss
- To find all images in the project: `find . -name "*.png" | grep -v node_modules | xargs -I {} cp {} tmp-images`

## Supabase custom schema setup

When using a custom schema (e.g. `api` instead of `public`), two steps are required before the app can query it:

**1. Expose the schema in PostgREST** — Supabase only exposes `public` and `graphql_public` by default. Add your schema via the Management API or the dashboard:

```bash
# Via Management API (scriptable — use in setup automation)
curl -X PATCH "https://api.supabase.com/v1/projects/{project_ref}/postgrest" \
  -H "Authorization: Bearer {supabase_access_token}" \
  -H "Content-Type: application/json" \
  -d '{"db_schema":"public,graphql_public,api"}'

# Or: Supabase dashboard → Settings → API → Exposed schemas → add "api"
```

Without this, every query returns `PGRST106: Invalid schema`.

**2. Grant privileges to roles** — Supabase no longer auto-grants privileges to `anon`/`authenticated`/`service_role` on new tables (effective 2026-05-30 for new projects, 2026-10-30 for existing). Every migration must include explicit grants:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON api.your_table TO authenticated;
GRANT ALL ON api.your_table TO service_role;
-- anon typically gets no access to app tables (requires auth)
```

Without this, authenticated users get `42501: permission denied for table`.

The Supabase client must also declare the schema:
```ts
createClient(url, key, { db: { schema: 'api' } })
```

## Unit / Component Tests

- Test runner: `jest-expo`; render helper: `@testing-library/react-native`
- Always wrap renders in a `renderWithProviders` helper that includes Tamagui, query client, and i18n providers
- Assert on what the user sees (`screen.getByText`, `screen.getByRole`) — never on internal state
- Run `/expo-rn-plugin:testing` for canonical test patterns and provider setup
