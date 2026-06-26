---
name: meta-ads
description: Meta (Facebook) SDK for App Promotion / install-ad attribution — react-native-fbsdk-next + ATT, iOS SKAdNetwork, and the store privacy declarations. Use when wiring up Meta install ads, app-event attribution, or debugging an ATT / privacy-manifest rejection.
---

Set up the Meta SDK so Meta/Instagram **App Promotion** campaigns can attribute installs and in-app events. This is *outbound* attribution (you advertise the app) — it does **not** show ads inside the app.

## ⚠️ Read this first — the ITMS-91064 trap

**Do NOT hand-write `ios.privacyManifests` for the Facebook SDK.** The FBSDK pod ships its own valid `PrivacyInfo.xcprivacy` that declares its tracking, IDFA collection, and tracking domains. If you add an app-level `NSPrivacyTracking: true` without a matching non-empty `NSPrivacyTrackingDomains`, Apple rejects the build:

> ITMS-91064: Invalid tracking information … NSPrivacyTracking must be true if NSPrivacyTrackingDomains isn't empty.

Let the pod's manifest handle it. The App Store Connect **App Privacy** nutrition label (declared separately, see below) is what actually communicates tracking to users — not a hand-rolled manifest.

## Dependencies

```bash
yarn add react-native-fbsdk-next expo-tracking-transparency
```

## app.config.ts

Gate the whole plugin on the FB App ID env var so un-keyed envs (e.g. local) build tracking-free. Add Meta's SKAdNetwork IDs to `infoPlist`. **No `privacyManifests` block.**

```ts
ios: {
  infoPlist: {
    // Meta SKAdNetwork IDs — privacy-safe install attribution even when ATT is denied.
    SKAdNetworkItems: [
      { SKAdNetworkIdentifier: 'v9wttpbfk9.skadnetwork' },
      { SKAdNetworkIdentifier: 'n38lu8286q.skadnetwork' },
    ],
  },
},
plugins: [
  // ...
  ...(process.env.EXPO_PUBLIC_FB_APP_ID
    ? ([
        [
          'react-native-fbsdk-next',
          {
            appID: process.env.EXPO_PUBLIC_FB_APP_ID,
            clientToken: process.env.EXPO_PUBLIC_FB_CLIENT_TOKEN,
            displayName: process.env.DISPLAY_NAME ?? 'App',
            scheme: `fb${process.env.EXPO_PUBLIC_FB_APP_ID}`,
            advertiserIDCollectionEnabled: true,
            autoLogAppEventsEnabled: true,
            isAutoInitEnabled: true,
            // Injects NSUserTrackingUsageDescription — the #1 ATT rejection cause if missing.
            iosUserTrackingPermission:
              'This lets us measure ad performance and show you more relevant ads. Your data stays private.',
          },
        ],
      ] as [string, Record<string, unknown>][])
    : []),
],
```

## Service: `src/services/meta/index.ts`

ATT consent **must** be requested before advertiser tracking (iOS 14.5+), and from a mount effect (app must be active for the prompt to show).

```ts
import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { AppEventsLogger, Settings } from 'react-native-fbsdk-next';

const FB_APP_ID = process.env.EXPO_PUBLIC_FB_APP_ID;
let initialized = false;

export const initializeMeta = async () => {
  if (initialized || !FB_APP_ID) return;
  try {
    if (Platform.OS === 'ios') {
      const { status } = await requestTrackingPermissionsAsync();
      Settings.initializeSDK();
      if (status === 'granted') await Settings.setAdvertiserTrackingEnabled(true);
    } else {
      Settings.initializeSDK(); // Android: no ATT; GAID collected automatically
    }
    initialized = true;
  } catch (error) {
    console.warn('[Meta] init failed', error); // never block app start
  }
};

export const logMetaEvent = (name: string, params?: Record<string, string | number>) => {
  if (!FB_APP_ID) return;
  if (params) AppEventsLogger.logEvent(name, params);
  else AppEventsLogger.logEvent(name);
};
```

Call `initializeMeta()` once from the root layout mount effect.

## Doppler vars

Set in **both** stg and prd (stg too, so staging builds actually link the FBSDK pods):

```
EXPO_PUBLIC_FB_APP_ID        # Events Manager → Data Sources → App → Settings
EXPO_PUBLIC_FB_CLIENT_TOKEN  # Settings → Advanced → Security → Client Token (NOT the App Secret)
```

## Store privacy declarations (do these or you get rejected)

**App Store Connect → App Privacy:** declare **Device ID** → *Used to Track = Yes*, purpose *Third-Party Advertising*, Linked = Yes. Every other data type → Tracking = **No**. Device ID is the only tracking row.

**Google Play → App content:**
- **Data safety** → *Device or other IDs* → **Collected + Shared** (shared with Meta), purposes *Advertising/marketing* + *Analytics*.
- **Advertising ID** declaration → **Yes, uses advertising ID** (the FBSDK adds the `AD_ID` permission), purposes *Advertising/marketing* + *Analytics*. Omitting this = guaranteed Play rejection.

## Meta dashboard setup

1. Create a **Business app** at developers.facebook.com, link the Business portfolio.
2. **Add platforms** (Settings → Basic): iOS + Android with the **prod** bundle ID (must match exactly, or events silently don't attribute).
3. Toggle the app **Live** (needs Privacy Policy URL).
4. Events Manager → **App data source** for iOS + Android.
5. **SKAdNetwork**: choose the automatic/recommended conversion-value setup. The "Use Facebook SDK to manage SKAdNetwork" toggle stays **locked until Meta receives the first event** — chicken-and-egg, expected.

## Verify

- iOS: launch the build → **ATT prompt appears** → Allow. (The prompt only exists in a build with this SDK, so its appearance confirms the right binary is installed.)
- Both: open + background the app (forces FBSDK to flush) → `Activate App` lands in the **Events Manager dataset** within ~10–20 min (Activity view; Test Events is faster).
- The "Update your Facebook SDK" dashboard warning is driven by the SDK version Meta has *seen in events* — it lags 24–48h and self-clears. `react-native-fbsdk-next` 13.x pins native FBSDK 18, far above the iOS-14.5 threshold.

## Notes

- Native change → full build required (fingerprint runtimeVersion); not OTA-able.
- This is distinct from `analytics` (Firebase, in-app product analytics) and `iap`/`stripe` (payments). Meta = ad attribution only.
- Phase 2: forward purchase events to Meta (CAPI, e.g. via a RevenueCat→backend webhook) to optimize for paying users instead of installs.
