---
name: notifications
description: Set up or debug push notifications using expo-notifications + Firebase Cloud Messaging
---

## How the stack fits together

```
Firebase Cloud Messaging (FCM)
  ↓ delivers to device
expo-notifications (local handling, permissions, badge)
  ↓ token registered via
push_notification tool (database MCP) → stores token in DB
  ↓ server sends via
Supabase Edge Function → FCM HTTP v1 API
```

## Required Doppler vars

- `FIREBASE_SERVER_KEY` — FCM server key (Edge Function only, never in app)
- Firebase config vars already managed by the firebase MCP

## Setup steps

1. **Request permissions**

```ts
const { status } = await Notifications.requestPermissionsAsync();
if (status !== "granted") return;
```

2. **Register token** — call the `push_notification` MCP tool with the device token and user ID to store it in the database

3. **Listen for foreground notifications**

```ts
Notifications.addNotificationReceivedListener((notification) => { ... });
```

4. **Handle taps** (background/quit)

```ts
Notifications.addNotificationResponseReceivedListener((response) => {
  // navigate using expo-router
  router.push(response.notification.request.content.data.route);
});
```

5. **Firebase messaging** — use `@react-native-firebase/messaging` for data-only (background) messages:

```ts
messaging().setBackgroundMessageHandler(async (remoteMessage) => { ... });
```

## Permission settings UX

Place notification permission status in a **Settings screen**, not in content screens. When permission is denied, let the user tap to open the system settings page:

```ts
import { AppState, Linking } from 'react-native'
import { useEffect, useRef, useState } from 'react'

const openedSettings = useRef(false)

async function checkPermission() {
  const granted = await requestNotificationPermission()
  setNotifPermission(granted)
  if (granted) getFCMToken().then(setFcmToken)
}

useEffect(() => {
  checkPermission()
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active' && openedSettings.current) {
      openedSettings.current = false
      checkPermission()   // re-check after user returns from Settings
    }
  })
  return () => sub.remove()
}, [])

async function handlePermissionPress() {
  if (notifPermission) return   // can't revoke from in-app
  openedSettings.current = true
  await Linking.openSettings()  // opens app-specific settings on both platforms
}
```

- `Linking.openSettings()` opens the **app-specific** settings page (not the general phone settings root) on iOS and Android
- `ExpoNotifications.openSettingsAsync` does **not** exist — do not use it
- On simulators `Device.isDevice = false` → `requestNotificationPermission` returns early → iOS never registers the app for notifications → no notification toggle appears in app settings. Test permission flows on a physical device

## Rules

- Always request permissions before registering a token
- Store tokens via the `push_notification` database MCP tool — never directly in Zustand
- Data-only messages use Firebase messaging; visible notifications use expo-notifications
- Re-register token on every app launch — tokens rotate; stale tokens cause silent failures
- Test on physical device only — simulators do not receive push notifications
- Notification permission UI belongs in Settings, not in content/journal screens
