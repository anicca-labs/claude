import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: process.env.DISPLAY_NAME ?? "My App",
  slug: "my-app",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  splash: {
    image: "./assets/images/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  scheme: process.env.APP_SCHEMA ?? "my-app",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.APP_IDENTIFIER ?? "com.example.myapp",
    googleServicesFile: process.env.GOOGLE_SERVICES_INFOPLIST_PATH,
    infoPlist: {
      UIBackgroundModes: ["fetch", "remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      "aps-environment": "production",
      "com.apple.developer.sign-in-with-apple": "enabled",
      ...(process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID
        ? { "com.apple.developer.in-app-payments": [process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID] }
        : {}),
    },
  },
  android: {
    package: process.env.APP_IDENTIFIER ?? "com.example.myapp",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    predictiveBackGestureEnabled: false,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON_PATH,
    permissions: ["android.permission.POST_NOTIFICATIONS"],
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "@sentry/react-native/expo",
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    [
      "expo-notifications",
      {
        enableBackgroundRemoteNotifications: true,
      },
    ],
    [
      "expo-build-properties",
      {
        android: { minSdkVersion: 24, kotlinVersion: "2.0.21" },
        ios: {
          useFrameworks: "static",
          forceStaticLinking: ["RNFBApp", "RNFBAnalytics", "RNFBMessaging"],
        },
      },
    ],
    "expo-secure-store",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
