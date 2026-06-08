---
title: "Google Sign-In and Apple Sign-In broken on Android store builds (Play internal track)"
problem_type: integration-issues
symptoms:
  - "Google Sign-In returns DEVELOPER_ERROR (code 10) on real Android device with store build"
  - "Apple Sign-In shows grey screen / Chrome Custom Tab does not return to app on store build"
  - "Both auth methods work correctly on dev client and simulator"
  - "i18n compiled files perpetually dirty in git after builds"
  - "Fastlane not found in CI during iOS build pipeline"
technologies:
  - "React Native / Expo"
  - "Supabase Auth"
  - "@react-native-google-signin/google-signin"
  - "@invertase/react-native-apple-authentication"
  - "EAS Build / Google Play internal track (AAB)"
  - "Fastlane / GitHub Actions"
  - "Lingui i18n"
affected_environments:
  - "Android store build (AAB via Google Play internal track)"
  - "CI/CD pipeline (GitHub Actions)"
date_solved: 2026-06-04
tags:
  - google-sign-in
  - apple-sign-in
  - android
  - store-build
  - play-app-signing
  - sha1-fingerprint
  - chrome-custom-tab
  - assetlinks
  - eas
  - fastlane
  - ci
  - lingui
  - i18n
  - expo
  - supabase-auth
---

## Root Causes

1. **Google Sign-In DEVELOPER_ERROR on Play builds** — Play Store re-signs AABs with its own App Signing Key, invalidating the upload keystore SHA-1 registered in Firebase. The wrong SHA-1 causes OAuth client mismatch at runtime.

2. **EAS picks wrong bundle ID without Doppler** — `eas credentials` reads APP_IDENTIFIER from the environment. Without Doppler, the local `.env` references the wrong bundle ID (e.g., prod instead of stg), corrupting credential associations.

3. **Hardcoded `--profile prd` in build scripts** — Single-environment EAS profiles break multi-env workflows; stg builds accidentally use prod signing/config.

4. **Dev client builds broken after adding Play SHA-1** — Firebase only recognizes OAuth clients for registered SHA-1 fingerprints. Adding only the Play App Signing SHA-1 breaks dev/upload-keystore builds and vice versa. Both must be registered.

5. **Apple Sign-In fails in release builds** — `@invertase/react-native-apple-authentication` uses Chrome Custom Tabs with App Links for the OAuth callback. Release builds enforce Digital Asset Link (assetlinks.json) verification, which fails if the file is absent or has the wrong SHA-256.

6. **Unnecessary store rebuilds for JS-only env changes** — `EXPO_PUBLIC_` variables live in the JS bundle; treating them like native config wastes EAS build time.

7. **Lingui compiled files perpetually dirty in VS Code** — ESLint auto-fix strips the `/*eslint-disable*/` header that Lingui generates, causing the file to be re-dirtied on every save.

8. **EAS local/archive builds missing compiled i18n** — EAS archives the repo via git. If compiled Lingui files are not committed (or pre-commit hook skips compilation), the build fails with missing message catalogs.

9. **Fastlane gem bin not on PATH in EAS subprocesses** — EAS custom build steps spawn subprocesses that do not inherit the gem bin directory added by `gem install`. Homebrew-installed binaries are on the standard PATH.

10. **`AppleError` undefined crash on Android** — `@invertase/react-native-apple-authentication` conditionally exports `AppleError` only on iOS; accessing it unconditionally on Android throws a runtime TypeError.

---

## Solution Steps

### 1. Register Play App Signing SHA-1 in Firebase

Google Play re-signs all AABs — the SHA-1 on the device is **not** the EAS upload keystore SHA-1.

- Open **Google Play Console → Your App → Setup → App Integrity → App Signing**
- Copy the **App Signing Key certificate SHA-1** (not the upload certificate SHA-1)
- In **Firebase Console → Project Settings → Your Android App**, add this SHA-1 alongside the upload/dev keystore SHA-1
- Download the updated `google-services.json` and commit it

Both SHA-1s must be present so store builds AND dev client builds work simultaneously. Firebase creates a separate Android OAuth client (type 1) for each fingerprint.

### 2. Always run EAS credentials through Doppler

```bash
doppler run --project mobile --config stg -- eas credentials
doppler run --project mobile --config prd -- eas credentials
```

This ensures `APP_IDENTIFIER` resolves to the correct bundle ID (`com.reflect.stg` / `com.reflect.prod`) before EAS reads it. Without Doppler, the local `.env` APP_IDENTIFIER may point to the wrong app.

### 3. Add separate EAS build profiles per environment

```json
// eas.json
{
  "build": {
    "stg": { "autoIncrement": true },
    "prd": { "autoIncrement": true }
  }
}
```

Build scripts must use a dynamic profile:

```bash
# package.json scripts
"build-store-android": "... eas build --platform android --profile ${ENV:-stg} --local ..."
"build-store-ios": "... eas build --platform ios --profile ${ENV:-stg} --local ..."
```

Never hardcode `--profile prd` — stg builds must use stg credentials.

### 4. Serve `assetlinks.json` for Apple Sign-In on Android

Host at `https://<callback-domain>/.well-known/assetlinks.json`. The SHA-256 comes from **Google Play Console → Setup → App Integrity → App Signing certificate**:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.reflect.stg",
      "sha256_cert_fingerprints": ["<PLAY_APP_SIGNING_SHA256_STG>"]
    }
  },
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.reflect.prod",
      "sha256_cert_fingerprints": ["<PLAY_APP_SIGNING_SHA256_PRD>"]
    }
  }
]
```

Keep a reference copy in `docs/android/assetlinks.json`. Ignore the working copy in `.gitignore` (`/assetlinks.json`).

### 5. Deploy JS-only env changes via OTA — skip store builds

`EXPO_PUBLIC_` variables are baked into the JS bundle, so Doppler changes deploy via OTA:

```bash
yarn push-ota        # stg
yarn push-ota:prd    # prd
```

Only native changes (`google-services.json`, `AndroidManifest.xml`, native modules, `app.config.ts` native fields) require a full EAS build.

### 6. Exclude Lingui compiled files from ESLint

```js
// eslint.config.js
{
  ignores: ["dist/*", ".expo", "node_modules", "src/i18n/locales/compiled/**"]
}
```

This prevents ESLint auto-fix from stripping the `/*eslint-disable*/` header that Lingui writes into compiled catalogs.

### 7. Unconditionally compile i18n in the pre-commit hook

```bash
#!/usr/bin/env sh
# .husky/pre-commit

# Always extract and compile — lineNumbers: false makes extraction deterministic
yarn lingui extract
yarn lingui compile
git add src/i18n/locales/exported/
git add src/i18n/locales/compiled/
```

EAS local builds archive via git, so compiled files must always be committed.

### 8. Install Fastlane via Homebrew for CI

```yaml
# GitHub Actions step
- name: Install Fastlane
  run: brew install fastlane
```

Do not use `gem install fastlane` in EAS/CI contexts — gem bin directories are not on the PATH visible to EAS subprocess commands.

### 9. Guard `AppleError` access with a platform check

```ts
// SignInScreen.tsx — in the Apple Sign-In catch block
const isCancelledIOS =
  Platform.OS === 'ios' && (
    errCode === AppleError.CANCELED ||
    errCode === AppleError.UNKNOWN ||
    message.includes('com.apple.AuthenticationServices.AuthorizationError error 1001')
  )
```

`AppleError` is `undefined` on Android — accessing `.CANCELED` without the platform guard throws `TypeError` and corrupts the error handler.

---

## Prevention Checklist (for future new environment setup)

**SHA-1 / Google Sign-In**
- [ ] After enabling Play App Signing, copy both "Upload certificate" and "App Signing certificate" SHA-1 from Play Console → Setup → App Integrity
- [ ] Add both SHA-1s to Firebase before downloading `google-services.json`
- [ ] Verify `google-services.json` has at least two type-1 `oauth_client` entries for each package name

**EAS Credentials & Bundle ID**
- [ ] Always run `doppler run -- eas credentials` — never bare `eas credentials`
- [ ] Run `eas credentials` separately per profile (`stg`, `prd`)
- [ ] Confirm bundle ID shown by EAS matches the expected app identifier

**Build Profile Hygiene**
- [ ] No hardcoded `--profile prd` in `package.json` scripts
- [ ] All build scripts use `--profile ${ENV:-stg}`

**`assetlinks.json` / Android App Links**
- [ ] Serve `assetlinks.json` at `https://<callback-domain>/.well-known/assetlinks.json`
- [ ] Use Play App Signing **SHA-256** (not SHA-1)
- [ ] Verify with: `adb shell pm get-app-links --user 0 <bundle_id>` → should show `verified`

**OTA vs Full Rebuild**
- [ ] `EXPO_PUBLIC_*` changes → OTA only
- [ ] `google-services.json`, native modules, `app.config.ts` native fields → full rebuild required

**ESLint & Lingui**
- [ ] `src/i18n/locales/compiled/**` in ESLint ignores
- [ ] Pre-commit hook stages both `exported/` and `compiled/`
- [ ] `lineNumbers: false` in `lingui.config.ts`

---

## Warning Signs (how to detect these issues early)

- **Error code 10 from Google Sign-In** — always means SHA-1 mismatch. Check Play Console App Signing before debugging anything else.
- **`google-services.json` has only one type-1 entry per package** — file was downloaded before Play App Signing SHA-1 was registered.
- **CI build uses `--profile prd` unconditionally** — stg builds will use prod signing/config.
- **`assetlinks.json` returns 404 or wrong SHA-256** — Apple Sign-In Chrome Custom Tab will not redirect back to the app in release builds.
- **`git diff src/i18n/locales/compiled/` non-empty after lint run** — ESLint has modified generated files; missing ignore pattern.
- **`fastlane: command not found` in EAS logs but works locally** — gem bin not on CI subprocess PATH.
- **`TypeError: undefined is not an object` referencing `AppleError` on Android** — missing `Platform.OS === 'ios'` guard.
- **`eas credentials` shows wrong bundle ID** — running without Doppler context; local `.env` APP_IDENTIFIER is for wrong environment.

---

## Testing Recommendations

**Before any new environment goes live**
1. Install release APK signed with Play App Signing key and run full Google Sign-In end-to-end — error 10 cannot be caught by unit tests
2. Run `adb shell pm get-app-links --user 0 <bundle_id>` on physical device to confirm assetlinks verification passes
3. Trigger Apple Sign-In from release APK on Android and confirm Chrome Custom Tab redirects back to app

**CI gates to add**
- `yarn lingui extract && yarn lingui compile && git diff --exit-code` — fails CI if catalogs drift
- `tsc --noEmit` — catches platform-unguarded imports before device testing
- `yarn doctor` before each store build — catches duplicate native modules

**Before each release build**
- [ ] Confirm `google-services.json` has both upload and Play App Signing SHA-1s
- [ ] Confirm `assetlinks.json` SHA-256 matches Play Console "App Signing certificate"
- [ ] Smoke-test auth flows (Google, Apple) on release build before submitting
