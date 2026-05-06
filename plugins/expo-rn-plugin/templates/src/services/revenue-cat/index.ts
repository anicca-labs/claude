import Purchases, { LOG_LEVEL } from 'react-native-purchases'

const configureRevenueCat = () => {
  const apiKey = process.env.EXPO_PUBLIC_RC_API_KEY
  if (!apiKey) {
    console.warn('[RevenueCat] EXPO_PUBLIC_RC_API_KEY is not set — IAP will not work')
    return
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG)
  }

  Purchases.configure({ apiKey })
}

export { configureRevenueCat }
