---
name: push-notifications
description: FCM push notifications — setup, token registration, permission flow, daily reminders, and MCP tooling. Use when adding push notifications, wiring token storage, implementing reminders, or debugging delivery.
---

Apply the following push notification standards to all code in this project.

## Stack

- `@react-native-firebase/messaging` — FCM token retrieval + foreground/background message handling
- `expo-notifications` — local notification scheduling, permissions API, notification handler
- `device_tokens` Supabase table — stores FCM tokens per user

## Setup checklist

- `yarn expo install expo-notifications expo-device @react-native-firebase/messaging`
- Add `"expo-notifications"` to the plugins array in `app.config.ts`
- Add `"@firebase-messaging": ["src/services/firebase-messaging/index.ts"]` to `tsconfig.json` paths
- Firebase project must have FCM enabled (Cloud Messaging tab in Firebase console)
- Run `inspect_push_tokens` MCP tool to check if `device_tokens` table exists — apply the generated migration if not

## Canonical service (`src/services/firebase-messaging/index.ts`)

```ts
import { getMessaging, getToken, onMessage } from '@react-native-firebase/messaging'
import { getApp } from '@react-native-firebase/app'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Device from 'expo-device'
import * as ExpoNotifications from 'expo-notifications'

ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

const messaging = getMessaging(getApp())

export type NotificationPermissionStatus = 'undetermined' | 'granted' | 'denied'

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!Device.isDevice) return 'denied'
  const { status } = await ExpoNotifications.getPermissionsAsync()
  if (status === 'granted') return 'granted'
  if (status === 'undetermined') return 'undetermined'
  return 'denied'
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false
  const { status } = await ExpoNotifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function getFCMToken(): Promise<string | null> {
  if (!Device.isDevice) return null
  try {
    return await getToken(messaging)
  } catch (e) {
    console.warn('[FCM token] Failed to get token:', e)
    return null
  }
}

export function subscribeToForegroundMessages(
  onMessageCallback: (title: string, body: string) => void,
): () => void {
  return onMessage(messaging, async remoteMessage => {
    onMessageCallback(
      remoteMessage.notification?.title ?? 'App',
      remoteMessage.notification?.body ?? '',
    )
  })
}

const REMINDER_NOTIF_ID_KEY = '@app/reminder_notif_id'

export async function scheduleLocalNotification(title: string, body: string, delaySeconds = 3) {
  await ExpoNotifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: ExpoNotifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds },
  })
}

export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  const existingId = await AsyncStorage.getItem(REMINDER_NOTIF_ID_KEY)
  if (existingId) {
    await ExpoNotifications.cancelScheduledNotificationAsync(existingId)
  }
  const id = await ExpoNotifications.scheduleNotificationAsync({
    content: { title: 'App', body: "Time to check in." },
    trigger: {
      type: ExpoNotifications.SchedulableTriggerInputTypes.CALENDAR,
      hour,
      minute,
      repeats: true,
    },
  })
  await AsyncStorage.setItem(REMINDER_NOTIF_ID_KEY, id)
}

export async function cancelDailyReminder(): Promise<void> {
  const id = await AsyncStorage.getItem(REMINDER_NOTIF_ID_KEY)
  if (id) {
    await ExpoNotifications.cancelScheduledNotificationAsync(id)
    await AsyncStorage.removeItem(REMINDER_NOTIF_ID_KEY)
  }
}
```

## Token registration (`src/services/user-devices/index.ts`)

Save the FCM token to `device_tokens` after permission is granted and on every sign-in:

```ts
import { supabase } from '@services/supabase'
import { getFCMToken } from '@firebase-messaging'

export async function upsertDeviceToken(userId: string): Promise<void> {
  const fcmToken = await getFCMToken()
  if (!fcmToken) return
  await supabase.from('device_tokens').upsert(
    { user_id: userId, fcm_token: fcmToken, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
}
```

Call `upsertDeviceToken(user.id)` in two places:
1. `useAuthSession` — on `SIGNED_IN` auth state event
2. Settings screen — immediately after the user grants permission

## Permission flow (Settings screen pattern)

```ts
async function refreshPermissionStatus() {
  if (!Device.isDevice) return
  const status = await getNotificationPermissionStatus()
  setNotifPermission(status)
  if (status === 'granted') {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) upsertDeviceToken(user.id)
  }
}

useEffect(() => {
  refreshPermissionStatus()
  // Re-check when user returns from the iOS Settings app
  const sub = AppState.addEventListener('change', state => {
    if (state === 'active' && openedSettings.current) {
      openedSettings.current = false
      refreshPermissionStatus()
    }
  })
  return () => sub.remove()
}, [])

async function handlePermissionPress() {
  if (!Device.isDevice) return
  if (notifPermission === 'undetermined') {
    const granted = await requestNotificationPermission()
    setNotifPermission(granted ? 'granted' : 'denied')
    if (granted) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) upsertDeviceToken(user.id)
    }
    return
  }
  // Already denied — deep-link to OS settings
  openedSettings.current = true
  await Linking.openSettings()
}
```

## `device_tokens` table schema

Run `inspect_push_tokens` — if the table is missing it will emit a ready-to-run migration. The expected shape:

| column | type | notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK → `auth.users` | ON DELETE CASCADE |
| `fcm_token` | text | NOT NULL |
| `platform` | text | `ios` / `android` / `web` |
| `reminder_hour` | int | nullable — set when reminder enabled |
| `reminder_minute` | int | nullable |
| `timezone` | text | nullable — IANA timezone string |
| `created_at` | timestamptz | `now()` |
| `updated_at` | timestamptz | `now()`, kept current by moddatetime trigger |

RLS: owner policy on `user_id = auth.uid()`.

## MCP tools

- `inspect_push_tokens` — shows total token count by platform + recent tokens; emits migration if table missing
- `send_test_push` — fires a real FCM message to a token using the Firebase service account (requires `firebase.serviceAccountPath` in `mcp.config.json`)

## Rules

- Always guard with `Device.isDevice` — FCM and permission APIs crash or silently fail on simulators
- Never use `shouldShowAlert` in `setNotificationHandler` — it is deprecated; use `shouldShowBanner` + `shouldShowList`
- Upsert with `onConflict: 'user_id'` — one token row per user, refreshed on each sign-in
- `scheduleDailyReminder` must cancel the previous notification ID before scheduling a new one — otherwise duplicate reminders accumulate
- Token column in DB is `fcm_token`, not `token` — `inspect_push_tokens` handles both via introspection, but migrations should use `fcm_token` for clarity
