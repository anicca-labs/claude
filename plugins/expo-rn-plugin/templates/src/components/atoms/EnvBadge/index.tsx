import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const env = process.env.EXPO_PUBLIC_ENV;

export function EnvBadge() {
  const insets = useSafeAreaInsets();

  if (!env || env === "prd" || env === "production") return null;

  const label = env === "stg" || env === "staging" ? "STAGING" : env.toUpperCase();

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="none">
      <View style={styles.badge}>
        <Text style={styles.text}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 12,
    zIndex: 9999,
  },
  badge: {
    backgroundColor: "#F59E0B",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
