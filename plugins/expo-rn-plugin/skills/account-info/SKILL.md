---
name: account-info
description: Add a persistent account information section (name, email, avatar) for the logged-in user. Use when a Settings screen or Profile tab needs to show who is signed in. Reads from Supabase auth user metadata — no extra table required.
---

Add an account information display for the currently logged-in user.

## Steps

1. **Locate the right screen** — call `get_routes` and `get_components` to find the Settings screen or Profile tab. If neither exists, ask the user where they want the section before writing any code.

2. **Read the target file** — read the full screen component so you understand its existing imports, hooks, and layout before touching it.

3. **Fetch the current user** — add a `useState<User | null>` and a `useEffect` that calls `supabase.auth.getUser()` once on mount. Import `User` from `@supabase/supabase-js`. Do **not** store the result in a Zustand store — it is auth-layer data, not app state.

   ```ts
   import type { User } from '@supabase/supabase-js'
   import { supabase } from '@/src/services/supabase'

   const [currentUser, setCurrentUser] = useState<User | null>(null)

   useEffect(() => {
     supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user))
   }, [])
   ```

4. **Render the account card** — place it at the top of the scrollable content, above subscription or preference sections. Use the existing `SettingsCard` wrapper (or equivalent glass/card component found in step 1) so the visual style matches.

   ```tsx
   {currentUser ? (
     <SettingsCard hasGlass={hasGlass}>
       <LabelMd color="$text-disabled" textTransform="uppercase" letterSpacing={LABEL_LETTER_SPACING} mb="$3">
         <Trans>Account</Trans>
       </LabelMd>

       {(currentUser.user_metadata?.full_name || currentUser.user_metadata?.name) ? (
         <XStack items="center" justify="space-between" mb="$2">
           <BodySm color="$text-secondary"><Trans>Name</Trans></BodySm>
           <LabelMd color="$text-emphasis">
             {currentUser.user_metadata.full_name ?? currentUser.user_metadata.name}
           </LabelMd>
         </XStack>
       ) : null}

       <XStack items="center" justify="space-between">
         <BodySm color="$text-secondary"><Trans>Email</Trans></BodySm>
         <LabelMd color="$text-secondary">{currentUser.email}</LabelMd>
       </XStack>
     </SettingsCard>
   ) : null}
   ```

5. **i18n** — wrap every new user-visible string (`Account`, `Name`, `Email`) with `<Trans>` or `` t`…` ``. Run `/expo-rn-plugin:i18n` after to extract and translate all locales.

6. **Type-check** — run `tsc --noEmit` and fix all errors before reporting done.

## Where to place the card

| Scenario | Placement |
| --- | --- |
| Settings screen exists | Top of scroll content, above Subscription card |
| Dedicated Profile tab | Center of screen as the hero block |
| No settings / profile screen | Ask the user which tab to add it to |

## Data source

`user_metadata` is populated by the OAuth provider at sign-in:

| Field | Google | Apple | Email/Password |
| --- | --- | --- | --- |
| `full_name` | ✓ | ✓ (first sign-in only) | — |
| `name` | ✓ | — | — |
| `avatar_url` | ✓ | — | — |
| `email` | via `user.email` | via `user.email` | via `user.email` |

Always guard name fields with a conditional — email/password users won't have them.

## Rules

- Never read `session.user` for display — always call `supabase.auth.getUser()` which returns the authoritative server-side user object
- Never show raw PII in Sentry tags or analytics events — use `user.id` (opaque) only
- Do not create a new Zustand store for this — the Supabase auth client already owns this state
- The card must not render at all (`null`) while `currentUser` is still `null` — no empty placeholder UI
- Run `/expo-rn-plugin:i18n` after adding strings so all locales stay in sync
