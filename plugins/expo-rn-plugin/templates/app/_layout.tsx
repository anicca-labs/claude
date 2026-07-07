import { Slot } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useReactQueryDevTools } from "@dev-plugins/react-query";
import { StatusBar, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { TamaguiProvider, styled } from "tamagui";
import tamaguiConfig from "../tamagui.config";
import { SplashView } from "@anicca-labs/react-native-splash-view";
import { themes } from "@theme";
import { useCustomFonts } from "@hooks";
import { LinguiClientProvider } from "@i18n";
import * as Sentry from "@sentry/react-native";
// Add your Rive splash animation to assets/animations/splash.riv
import splash from "../assets/animations/splash.riv";

// Optional: add Stripe — run /expo-rn-plugin:stripe for setup instructions
// import { StripeProvider } from "@stripe/stripe-react-native";
// const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_ENV ?? "stg",
  tracesSampleRate: __DEV__ ? 0 : 0.2,
  enabled: !__DEV__,
});

const StyledGestureHandlerRootView = styled(GestureHandlerRootView, {
  flex: 1,
});

const getSplashStyle = (isDark: boolean) => ({
  backgroundColor: isDark ? themes.dark.splashBackground : themes.light.splashBackground,
});

const queryClient = new QueryClient();

queryClient.setDefaultOptions({
  queries: {
    retry: 1,
  },
});

const ReactQueryDevToolsProvider = () => {
  useReactQueryDevTools(queryClient);
  return null;
};

const RootLayout = () => {
  const fontsLoaded = useCustomFonts();
  const colorScheme = useColorScheme();
  const isAppReady = fontsLoaded;
  const isOSThemeDark = colorScheme === "dark";

  if (!isAppReady) {
    return null;
  }

  return (
    <LinguiClientProvider>
      <QueryClientProvider client={queryClient}>
        <ReactQueryDevToolsProvider />
        <StyledGestureHandlerRootView>
          <TamaguiProvider
            config={tamaguiConfig}
            defaultTheme={isOSThemeDark ? "dark" : "light"}
          >
            <BottomSheetModalProvider>
              <KeyboardProvider>
                <StatusBar barStyle={"default"} />
                <Slot />
              </KeyboardProvider>
            </BottomSheetModalProvider>
          </TamaguiProvider>
        </StyledGestureHandlerRootView>
      </QueryClientProvider>
      <SplashView source={splash} style={getSplashStyle(isOSThemeDark)} />
    </LinguiClientProvider>
  );
};

export default Sentry.wrap(RootLayout);
