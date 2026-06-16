---
name: iap
description: Mobile in-app purchases and subscriptions via RevenueCat. Use when implementing App Store / Google Play subscriptions, consumable products, or entitlements. Distinct from Stripe — RevenueCat handles store billing; Stripe handles server-side payments.
---

## RevenueCat vs Stripe

| Use case | Tool |
| --- | --- |
| App Store / Play Store subscriptions and IAP | **RevenueCat** |
| Server-initiated charges, web payments, custom billing | **Stripe** |

Never try to handle App Store or Google Play billing through Stripe — Apple and Google require their own billing SDKs.

## Project structure

A single RevenueCat project contains one app per platform × environment (typically 6 apps: iOS × {qa, stg, prd} + Android × {qa, stg, prd}). All apps in a project share entitlements, offerings, and webhook config.

## Installation

```bash
yarn expo install react-native-purchases react-native-purchases-ui
```

Doppler keys per environment:

| Key | Purpose |
| --- | --- |
| `EXPO_PUBLIC_RC_API_KEY` | iOS production key (`appl_…`) |
| `EXPO_PUBLIC_RC_ANDROID_API_KEY` | Android production key (`goog_…`) |
| `EXPO_PUBLIC_RC_TEST_API_KEY` | Test Store key (`test_…`) — **required in stg AND prd Doppler configs** |
| `RC_MCP_API_KEY` | Secret key for RC API/MCP calls (`sk_…`) |

## RC service — canonical pattern

Create at `src/services/revenue-cat/index.ts`:

```ts
import { Platform, LogBox } from 'react-native'
import Purchases, { LOG_LEVEL } from 'react-native-purchases'

LogBox.ignoreLogs(['[RevenueCat]'])

const isSandbox = __DEV__ || process.env.EXPO_PUBLIC_ENV === 'stg'

const configureRevenueCat = () => {
  const testKey = process.env.EXPO_PUBLIC_RC_TEST_API_KEY

  // Use Test Store key in dev builds — simulates full purchase sheet on
  // simulator/emulator without StoreKit config or ios/ folder (managed Expo safe)
  if (testKey && __DEV__) {
    if (isSandbox) Purchases.setLogLevel(LOG_LEVEL.DEBUG)
    Purchases.configure({ apiKey: testKey })
    return
  }

  const apiKey =
    Platform.OS === 'android' && process.env.EXPO_PUBLIC_RC_ANDROID_API_KEY
      ? process.env.EXPO_PUBLIC_RC_ANDROID_API_KEY
      : process.env.EXPO_PUBLIC_RC_API_KEY

  if (!apiKey) {
    console.warn('[RevenueCat] RC API key is not set — IAP will not work')
    return
  }

  if (isSandbox) Purchases.setLogLevel(LOG_LEVEL.DEBUG)
  Purchases.configure({ apiKey })
}

const identifyRevenueCatUser = async (userId: string) => {
  await Purchases.logIn(userId)
}

const resetRevenueCatUser = async () => {
  try {
    const info = await Purchases.getCustomerInfo()
    if (!info.originalAppUserId.startsWith('$RCAnonymousID:')) {
      await Purchases.logOut()
    }
  } catch {
    // RC not configured or already anonymous — nothing to reset
  }
}

const manageSubscriptions = async () => {
  await Purchases.showManageSubscriptions()
}

export { configureRevenueCat, identifyRevenueCatUser, resetRevenueCatUser, manageSubscriptions }
```

Call `configureRevenueCat()` in the root layout before rendering any purchase UI.

## Customer identification

Wire into the auth session hook — identify on sign-in, reset only on explicit sign-out:

```ts
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user) identifyRevenueCatUser(session.user.id)
  else if (event === 'SIGNED_OUT') resetRevenueCatUser()
})
```

- **Guard `logOut` with an anonymous check** — RC throws and logs "Called logOut but the current user is anonymous" when `logOut` is called on a never-identified user (e.g. fresh install). Check `originalAppUserId.startsWith('$RCAnonymousID:')` before calling `logOut`; the pattern above handles this
- Only call `logOut` on `SIGNED_OUT` event, not on every null session
- Customers appear in the RC dashboard searchable by their Supabase user ID once `logIn` is called
- **Do not guard with `Device.isDevice`** — that is an outdated pattern; RC v5+ handles simulator gracefully

## useRevenueCat hook

```ts
import { useEffect, useState } from 'react'
import Purchases, { type CustomerInfo } from 'react-native-purchases'
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui'

const PRO_ENTITLEMENT = 'pro'

export const useRevenueCat = () => {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Purchases.getCustomerInfo()
      .then((info) => { setCustomerInfo(info); setIsLoading(false) })
      .catch(() => setIsLoading(false))
    Purchases.addCustomerInfoUpdateListener(setCustomerInfo)
    return () => { Purchases.removeCustomerInfoUpdateListener(setCustomerInfo) }
  }, [])

  const isPro = customerInfo?.entitlements.active[PRO_ENTITLEMENT] !== undefined

  const presentPaywall = async (): Promise<boolean> => {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: PRO_ENTITLEMENT,
    })
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED
  }

  const restorePurchases = async () => {
    const info = await Purchases.restorePurchases()
    setCustomerInfo(info)
  }

  return { isPro, isLoading, customerInfo, presentPaywall, restorePurchases }
}
```

## Free tier gate pattern

Gate a feature behind a free usage limit with a soft warning before the hard wall:

```ts
const FREE_LIMIT = 7  // adjust per feature

const remaining = Math.max(0, FREE_LIMIT - items.length)
const atLimit = !isPro && items.length >= FREE_LIMIT
const showHint = !isPro && items.length >= FREE_LIMIT - 2 && items.length < FREE_LIMIT

async function handleAction() {
  if (atLimit) {
    const purchased = await presentPaywall()
    if (!purchased) return   // draft/input preserved — user doesn't lose work
  }
  // proceed with action
}
```

UI pattern:

- Entries 1 → (limit-3): no mention of limits
- Entries (limit-2) → (limit-1): muted hint — "N free entries left — upgrade to keep writing"
- At limit: button label gets `✦` suffix, accent-coloured prompt below button
- `presentPaywall()` fires on action attempt; on dismiss the input is preserved

## Test Store — simulator/emulator testing (managed Expo)

The RC Test Store simulates the full purchase sheet on simulator and Android emulator with **no StoreKit config file and no `ios/` folder** — the correct approach for managed Expo apps.

**Setup:**

1. RC dashboard → Project Settings → Apps → **Add app → Test Store**
2. RC dashboard → Project Settings → API Keys → copy the `test_…` key
3. Add to Doppler stg: `EXPO_PUBLIC_RC_TEST_API_KEY=test_…`
4. Add to `env.template.yaml`: `EXPO_PUBLIC_RC_TEST_API_KEY={{ .EXPO_PUBLIC_RC_TEST_API_KEY }}`
5. **Add products separately** to the Test Store app — Test Store products are not shared with iOS/Android apps and cannot be imported from App Store Connect/Play Console. Use the RC API:

```bash
# Create monthly product
curl -X POST "https://api.revenuecat.com/v2/projects/{project_id}/products" \
  -H "Authorization: Bearer {sk_key}" \
  -H "Content-Type: application/json" \
  -d '{"store_identifier":"com.example.pro_monthly","type":"subscription","app_id":"{test_store_app_id}","display_name":"Pro Monthly","title":"Pro Monthly","subscription":{"duration":"P1M"}}'

# Attach to entitlement
curl -X POST "https://api.revenuecat.com/v2/projects/{project_id}/entitlements/{entitlement_id}/actions/attach_products" \
  -H "Authorization: Bearer {sk_key}" \
  -H "Content-Type: application/json" \
  -d '{"product_ids":["{product_id}"]}'

# Attach to package in offering
curl -X POST "https://api.revenuecat.com/v2/projects/{project_id}/packages/{package_id}/actions/attach_products" \
  -H "Authorization: Bearer {sk_key}" \
  -H "Content-Type: application/json" \
  -d '{"products":[{"product_id":"{product_id}","eligibility_criteria":"all"}]}'
```

The `test_` key is platform-agnostic — same key works on iOS simulator and Android emulator.

**Critical: Test Store products MUST have prices set in the RC dashboard.** The v2 API can create the product record and wire entitlements/packages, but the simulated price must be set via the dashboard UI — the API doesn't expose a price endpoint for Test Store products:

- Product Catalog → Products → select the test store product → Pricing → Add currency → USD → set price → Save
- Without a price, `/rcbilling/v1/subscribers/.../products` returns `{"product_details":[]}` and the RC SDK throws "None of the products could be fetched from App Store Connect" even though the test key is used, `__DEV__=true`, and all API calls return 200. The error message is misleading — it's not an App Store Connect issue, it's missing prices.
- Devices that already cached a successful offerings response (304 Not Modified) will continue working even after prices are removed, masking the issue for existing installs but breaking all fresh installs.

**Critical: `EXPO_PUBLIC_RC_TEST_API_KEY` must be in BOTH stg and prd Doppler configs.** Dev client builds (`developmentClient: true` in eas.json) set `__DEV__=true` regardless of which Doppler config they use. Without the test key in the prd Doppler config, the `if (testKey && __DEV__)` branch is skipped and the build falls through to the `appl_` production key, which then fails because the products don't exist in App Store Connect sandbox.

**Offerings must be published** (not draft) before the SDK will serve them. Changing from draft → published in the RC dashboard is required after any configuration change.

**Granting entitlements for testing:**

- Sign in on device/simulator (RC must be initialized and `logIn` called)
- RC dashboard → Customers → search by Supabase user ID → Grant entitlement → `pro`
- Test store customers may take a few minutes to appear in the dashboard
- Remove grant to revert to free tier

## Testing on a real device with Apple Sandbox

The Apple Sandbox account (created in App Store Connect → Users and Access → Sandbox Testers) is only used for the **App Store payment sheet** — it has nothing to do with your app's own authentication (Supabase/social sign-in).

You can stay signed into the app with your real account and still use a sandbox account for purchases:

1. Sign into the app normally (real Apple ID, Google, or email)
2. **Settings → App Store → tap your Apple ID → Sign Out** (sign out of the *App Store only*, not the whole device)
3. Trigger a purchase inside the app — iOS will pop up asking for an Apple ID
4. Enter the sandbox tester credentials at that prompt

The sandbox account intercepts only the payment sheet. Your app session is unaffected.

**Sandbox behavior differences from production:**

- Subscriptions renew every few minutes (1 month = ~5 min, 1 year = ~1 hr)
- No real charges — all transactions are free
- RC dashboard shows sandbox transactions separately under the customer

## Subscription status in Settings

Always show subscription status in the Settings tab with upgrade and management options:

```tsx
const { isPro, isLoading, customerInfo, presentPaywall } = useRevenueCat()

// Derive plan label from active entitlement's product ID
const activeEntitlement = customerInfo?.entitlements.active['pro']
const productId = activeEntitlement?.productIdentifier ?? ''
const planLabel = productId.includes('annual') ? 'Pro Annual'
  : productId.includes('monthly') ? 'Pro Monthly' : 'Pro'

// Dev-only: show RC user ID for easy RC dashboard lookup (long-press to copy)
const rcUserId = customerInfo?.originalAppUserId
```

- **Free**: show "Upgrade to Pro ✦" button → `presentPaywall()`; on success call `alert({ title: 'Welcome to Pro ✦', message: '...', preset: 'heart', duration: 6 })`
- **Pro**: show plan name + "Manage subscription" button → `manageSubscriptions()`
- **Hide "Manage subscription" on `__DEV__`** — test store purchases don't appear in App Store subscription management, so the button is misleading in dev builds
- Always show a `Spinner` while `isLoading` — RC takes a moment to fetch customer info
- **Show `rcUserId` in dev builds only** (`__DEV__ && rcUserId`) — makes it easy to find the customer in the RC dashboard without knowing the Supabase UUID; use `selectable` prop so it can be long-pressed to copy

## Purchase success celebration

After a successful purchase, show a prominent `Burnt.alert` with `preset: "heart"` — this renders a large centered heart animation on iOS. Falls back to `ToastAndroid` on Android via `useToast`:

```ts
const { alert } = useToast()

const purchased = await presentPaywall()
if (purchased) {
  alert({
    title: 'Welcome to Pro ✦',
    message: 'Unlimited entries unlocked. Keep writing.',
    preset: 'heart',
    duration: 6,
  })
}
```

Add `alert` to `useToast` alongside `toast`:

```ts
function alert({ title, message, preset = 'heart', duration = 6 }: AlertOptions) {
  if (Platform.OS === 'android') {
    ToastAndroid.showWithGravity(
      message ? `${title} — ${message}` : title,
      ToastAndroid.LONG,
      ToastAndroid.CENTER,
    )
  } else {
    Burnt.alert({ title, message, preset, duration })
  }
}
```

`preset` options: `'heart'` (celebration), `'done'` (checkmark), `'error'` (X), `'spinner'` (loading).

## Setting up products (production)

1. Create products/subscriptions in App Store Connect and Google Play Console.
2. **App Store product IDs are globally unique across your entire developer account** — not scoped per app or bundle ID. If you have multiple environments (stg, prd), each needs distinct product IDs. Convention:
   - stg: `com.myapp.pro_monthly`, `com.myapp.pro_annual`
   - prd: `com.myapp.prod.pro_monthly`, `com.myapp.prod.pro_annual`
   Attempting to reuse the same ID in a second app will be rejected by App Store Connect. Google Play does not have this constraint — IDs are scoped per app.
3. In App Store Connect, the product status must be **Ready to Submit** before it appears in RevenueCat's import flow. **Your first subscription must be submitted alongside a new app binary** — attach it to the version in the "In-App Purchases and Subscriptions" section before submitting to App Review. Once that first submission is approved, additional subscriptions can be submitted independently from the Subscriptions section without a new binary.
4. In Google Play, the BILLING permission must be in an uploaded `.aab` before products can be configured. Add to `app.config.ts` if not auto-included:

   ```ts
   android: { permissions: ['com.android.vending.BILLING'] }
   ```

5. Import products into RevenueCat via **Product catalog → Products → Import**.

## Fixing a wrong store identifier in RC

The RC v2 API has no PATCH endpoint for products — store identifiers cannot be updated in place. To correct one:

1. Delete the product: `DELETE /v2/projects/{project_id}/products/{product_id}`
2. Recreate it with the correct `store_identifier`: `POST /v2/projects/{project_id}/products`
   - Omit the `subscription` duration field for non-Test Store apps (only Test Store supports it via API)
3. Re-attach to any packages: `POST /v2/projects/{project_id}/packages/{package_id}/actions/attach_products`
4. Re-attach to the entitlement: `POST /v2/projects/{project_id}/entitlements/{entitlement_id}/actions/attach_products`

## Defining offerings and entitlements

Use an LLM to break down a PRD into products, subscriptions, offerings, and entitlements for both stores before manually creating them. Prompt pattern:

> "Here is my PRD [attach PDF]. My bundle IDs are [QA/stg/prd IDs]. I use RevenueCat. Break down products, subscriptions, offerings, and entitlements for Apple, Google, and RevenueCat — show as tables."

## Android-specific

- Google requires the Google Payments merchant setup to be completed before subscriptions or IAP can be configured in the Play Console.
- Verify via Play Console: select an app → Subscriptions or In-app products — if it prompts for merchant setup, it hasn't been completed.
