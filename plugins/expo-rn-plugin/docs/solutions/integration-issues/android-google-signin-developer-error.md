---
title: "Android Google Sign-In DEVELOPER_ERROR — OAuth client not found for signing key"
problem_type: integration-issues
symptoms:
  - "A non-recoverable sign in failure occurred (below password input)"
  - "DEVELOPER_ERROR (code 10) from Google Sign-In SDK"
  - "Google Sign-In works on iOS but fails on Android"
  - "Google Sign-In works on Play Store builds but fails on dev/preview builds"
  - "Google Sign-In stopped working after removing a keystore or creating a new Firebase project"
technologies:
  - "Firebase"
  - "@react-native-google-signin/google-signin"
  - "EAS Build"
  - "Supabase Auth"
tags:
  - google-signin
  - firebase
  - android
  - oauth
  - eas
  - developer-error
status: solved
severity: high
date_solved: "2026-06-10"
---

## Problem

Android Google Sign-In fails with "a non-recoverable sign in failure occurred" or `DEVELOPER_ERROR` (code 10). This error comes from the Google Sign-In native SDK before any token is obtained — it means Google Play Services can't find a valid Android OAuth client matching the app's package name + signing certificate SHA-1.

## Why it happens

For Android Google Sign-In to work, every signing key that touches the app needs its SHA-1 registered in the Firebase Android app. Firebase then creates an Android OAuth client (type=1) in Google Cloud Console for each SHA-1. Without a matching client, the SDK throws `DEVELOPER_ERROR`.

There are three distinct signing keys in a typical EAS setup:

| Key | Who manages it | Used by |
| --- | --- | --- |
| **Google app signing key** | Google (Play Store) | All Play Store distributed builds |
| **EAS upload key** | You (via EAS credentials) | Signing the AAB before uploading to Play |
| **EAS dev keystore** | EAS | Dev client and preview APKs (sideloaded) |

Each needs its own SHA-1 in Firebase to get an Android OAuth client. The most commonly missed one is the **EAS dev keystore** — Play Store builds work but dev builds fail.

## Prerequisite: Google Sign-In must be enabled in Firebase Auth

This is the most common miss for **new Firebase projects**. Until you explicitly enable Google as a sign-in provider under Authentication → Sign-in providers, SHA-1 registrations succeed silently but **no OAuth clients are created**. The `google-services.json` will have an empty `oauth_client: []`.

**Fix:** Firebase Console → your project → Authentication → Sign-in providers → Google → Enable → Save.

Once enabled, Firebase creates the web client (type=3) and will generate Android OAuth clients for every registered SHA-1.

## Diagnosing which SHA-1 is missing

Download the official SDK config directly from Firebase (don't rely on a manually-edited `google-services.json`):

```bash
# Via Firebase MCP
firebase_get_sdk_config(platform: "android")

# Or via REST API
ACCESS_TOKEN=$(cat ~/.config/configstore/firebase-tools.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['tokens']['access_token'])")
curl -s "https://firebase.googleapis.com/v1beta1/projects/{PROJECT_ID}/androidApps/{APP_ID}/config" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -c "
import json,sys,base64
d=json.load(sys.stdin)
print(base64.b64decode(d['configFileContents']).decode())
"
```

Check that each `oauth_client` entry (type=1) has a `certificate_hash` matching an active signing key.

## Finding EAS keystore SHA-1s

```bash
# Query EAS GraphQL API for all Android credentials
SESSION=$(cat ~/.expo/state.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['auth']['sessionSecret'])")
PROJECT_ID="your-eas-project-id"  # from app.config.ts

curl -s "https://api.expo.dev/graphql" \
  -H "expo-session: $SESSION" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"{ app { byId(appId: \\\"$PROJECT_ID\\\") { androidAppCredentials { applicationIdentifier androidAppBuildCredentialsList { isDefault androidKeystore { keyAlias sha1CertificateFingerprint } } } } } }\"}" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
for c in d['data']['app']['byId']['androidAppCredentials']:
    print('App:', c['applicationIdentifier'])
    for bc in c['androidAppBuildCredentialsList']:
        ks = bc.get('androidKeystore', {})
        print(f'  default={bc[\"isDefault\"]} SHA1={ks.get(\"sha1CertificateFingerprint\")}')
"
```

Note: EAS uses **one keystore per app identifier** for all non-Play-Store builds (development, preview, internal APK). The Play Store upload key is separate.

## Finding the Google app signing key SHA-1

Go to **Google Play Console → your app → Setup → App integrity → App signing key certificate** and copy the SHA-1. This is the key Google uses to re-sign APKs delivered to users via Play Store.

## Registering a missing SHA-1

Via Firebase MCP (works for the currently active Firebase project):

```bash
firebase_create_android_sha(
  app_id: "1:PROJECT_NUMBER:android:APP_HASH",
  sha_hash: "AB:CD:EF:..."  # colon-separated uppercase format
)
```

After adding, re-download `google-services.json` from Firebase — **never manually edit OAuth client IDs**. If a SHA-1 is already listed in Firebase but has no OAuth client, delete and re-add it via the MCP (the Firebase Console UI doesn't always trigger OAuth client creation reliably).

**Critical:** existing Android OAuth clients can silently disappear when you add a new SHA-1 via `firebase_create_android_sha`. Always call `firebase_get_sdk_config` after every SHA-1 operation and verify that **all previously existing** Android OAuth clients are still present. If any are missing, delete and re-add the corresponding SHA-1 to recreate them. Failing to do this causes `DEVELOPER_ERROR` for any build type whose client was dropped.

## Stale OAuth client IDs

When you **remove a SHA-1 from Firebase**, the corresponding Android OAuth client is deleted from Google Cloud Console. If your `google-services.json` was manually edited and still references that deleted client ID, it will look valid but cause `DEVELOPER_ERROR` at runtime.

**Symptom:** `firebase_list_apps` shows the SHA-1 in `sha1Hashes` but `firebase_get_sdk_config` doesn't show a corresponding type=1 OAuth client.

**Fix:** Re-register the SHA-1 via `firebase_create_android_sha` (not just the Firebase Console) to force a fresh OAuth client to be created. Then re-download `google-services.json`.

## Supabase: web client ID must match

For the `signInWithIdToken` flow with Supabase, the `external_google_client_id` configured in Supabase Auth must match the `webClientId` used in `GoogleSignin.configure()`. Use the Supabase Management API to verify:

```bash
SUPABASE_TOKEN="your-supabase-access-token"
curl -s "https://api.supabase.com/v1/projects/{PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('google_enabled:', d.get('external_google_enabled'))
print('client_id:', d.get('external_google_client_id'))
"

# Update if wrong:
curl -s -X PATCH "https://api.supabase.com/v1/projects/{PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"external_google_client_id": "YOUR_WEB_CLIENT_ID"}'
```

The `external_google_skip_nonce_check` should be `true` for native mobile Sign-In flows.

## Safe SHA-1 management protocol

Every time you add or remove a SHA-1 via `firebase_create_android_sha`, Firebase may silently drop other OAuth clients. This has caused repeated `DEVELOPER_ERROR` regressions. Follow this protocol without exception:

1. **Before** any SHA-1 operation: run `firebase_get_sdk_config` and record every `client_id` currently present
2. **Add** the new SHA-1
3. **After**: run `firebase_get_sdk_config` again and compare — if any previously-existing `client_id` is now missing, delete and re-add the corresponding SHA-1 to recreate it
4. **Re-download** `google-services.json` and `GoogleService-Info.plist` from Firebase — never edit client IDs by hand
5. **Update `ANDROID_CLIENT_ID`** in `GoogleService-Info-{env}.plist` to match the play store signing key OAuth client (type=1 for `09:56:68...` or `2b:6b:80...`)
6. **Commit and push** — CI will trigger a new store build automatically

Never skip step 3. The silent client drop has happened every single time a SHA-1 was re-registered in this project.

## Full audit checklist — run after any Firebase credential change

Use this to verify nothing is broken across all environments and platforms:

**Android OAuth clients (google-services-{env}.json)**
- [ ] Every SHA-1 registered in Firebase has a matching type=1 `client_id` in the JSON
- [ ] `ANDROID_CLIENT_ID` in `GoogleService-Info-{env}.plist` matches the play store signing key OAuth client
- [ ] No stale `client_id`s in the JSON (cross-check with `firebase_get_sdk_config`)

**iOS Google Sign-In (GoogleService-Info-{env}.plist)**
- [ ] `CLIENT_ID` is the iOS type=2 OAuth client for this Firebase project
- [ ] `REVERSED_CLIENT_ID` is the reverse of `CLIENT_ID`
- [ ] `GCM_SENDER_ID` matches the Firebase project number

**Supabase auth (per environment)**
- [ ] `external_google_client_id` = web client (type=3) for **this environment's** Firebase project, not the other one
- [ ] `external_apple_client_id` = `com.reflect.{env}.sign-in,com.reflect.{env}` (not mixed between envs)

**Push notifications**
- [ ] `FIREBASE_CLIENT_EMAIL` on Supabase Edge Functions matches the Firebase project for that Supabase instance
- [ ] `FIREBASE_PROJECT_ID` on Supabase Edge Functions matches the Firebase project for that Supabase instance
- [ ] `firebase_project_id` column exists on `api.device_tokens` table in each Supabase project

**Dev clients**
- [ ] After any `google-services.json` change, rebuild dev clients — they embed the JSON at build time and will have `DEVELOPER_ERROR` until rebuilt

## Multi-environment checklist

When setting up separate Firebase projects for stg and prd:

- [ ] Google Sign-In enabled in Firebase Auth for **each** project
- [ ] Google app signing key SHA-1 registered in **each** project (different per app — check Play Console per app)
- [ ] EAS upload key SHA-1 registered (can be the same key for both environments if using the same EAS credentials, but verify)
- [ ] EAS dev keystore SHA-1 registered in **each** project
- [ ] `google-services.json` re-downloaded from Firebase (not manually edited) after any SHA-1 change
- [ ] `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in Doppler set to **each project's** web client (type=3), not shared
- [ ] `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in Doppler set to **each project's** iOS client (type=2)
- [ ] Supabase `external_google_client_id` updated to match the web client for **each** Supabase project
