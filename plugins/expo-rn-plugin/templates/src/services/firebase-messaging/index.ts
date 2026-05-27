import {
  getMessaging,
  AuthorizationStatus,
  requestPermission,
  getToken,
  onMessage,
} from '@react-native-firebase/messaging'
import { getApp } from '@react-native-firebase/app'
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

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await ExpoNotifications.requestPermissionsAsync()
  if (status !== 'granted') return false
  const authStatus = await requestPermission(messaging)
  return (
    authStatus === AuthorizationStatus.AUTHORIZED ||
    authStatus === AuthorizationStatus.PROVISIONAL
  )
}

export async function getFCMToken(): Promise<string | null> {
  try {
    return await getToken(messaging)
  } catch {
    return null
  }
}

export function subscribeToForegroundMessages(
  onMessageCallback: (title: string, body: string) => void,
): () => void {
  return onMessage(messaging, async (remoteMessage) => {
    onMessageCallback(
      remoteMessage.notification?.title ?? 'App',
      remoteMessage.notification?.body ?? '',
    )
  })
}
