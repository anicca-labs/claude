---
title: "Firebase project isolation — stg and prd must be separate projects"
problem_type: integration-issues
symptoms:
  - "Staging analytics events appear in production Firebase Analytics"
  - "Cannot filter staging vs production data in Firebase Analytics console"
  - "Push notifications sent to staging devices affect production FCM quotas"
  - "Google Sign-In broken on iOS staging after migrating Firebase project"
  - "Edge Functions send push notifications to wrong Firebase project"
  - "FCM tokens registered in staging cannot be sent to via production service account"
technologies:
  - "React Native / Expo"
  - "@react-native-firebase/app"
  - "@react-native-firebase/analytics"
  - "@react-native-firebase/messaging"
  - "Supabase Edge Functions"
  - "EAS Build"
tags:
  - firebase
  - staging
  - production
  - analytics
  - push-notifications
  - fcm
  - google-sign-in
  - edge-functions
  - doppler
status: solved
severity: high
date_solved: "2026-06-08"
---

## Problem

Using a single Firebase project for both staging and production pollutes analytics data and shares FCM quotas. Even with separate app registrations within the same project, all analytics flow into the same property and cannot be cleanly isolated.

## Solution

Create a **separate Firebase project** for staging (e.g., `reflect-stg`) and configure each environment to use its own project.

## Step-by-step

### 1. Create the staging Firebase project

```bash
# Via Firebase MCP or Firebase Console
firebase projects:create reflect-stg --display-name "reflect-stg"
```

Register iOS and Android apps in the new project:
- iOS: bundle ID `com.yourapp.stg`
- Android: package name `com.yourapp.stg`

### 2. Download new config files

Download `GoogleService-Info-stg.plist` and `google-services-stg.json` from the new project. The new plist will **not** include `CLIENT_ID`/`REVERSED_CLIENT_ID` — add these manually from the old stg registration (they're still valid OAuth clients):

```xml
<!-- Add to GoogleService-Info-stg.plist -->
<key>CLIENT_ID</key>
<string>YOUR_OLD_STG_CLIENT_ID.apps.googleusercontent.com</string>
<key>REVERSED_CLIENT_ID</key>
<string>com.googleusercontent.apps.YOUR_OLD_STG_CLIENT_ID</string>
<key>ANDROID_CLIENT_ID</key>
<string>YOUR_OLD_ANDROID_CLIENT_ID.apps.googleusercontent.com</string>
```

Without `REVERSED_CLIENT_ID`, the Expo Firebase plugin won't register the URL scheme and **Google Sign-In on iOS will silently fail**.

### 3. Clean up the prod JSON

`google-services-prd.json` should only contain the prod client. Remove any stg client entries — they're now in a separate project.

### 4. Add EXPO_PUBLIC_FIREBASE_PROJECT_ID to Doppler

```
stg: EXPO_PUBLIC_FIREBASE_PROJECT_ID = reflect-stg
prd: EXPO_PUBLIC_FIREBASE_PROJECT_ID = reflect-8e62d
```

### 5. Add firebase_project_id to device_tokens

Migration:
```sql
ALTER TABLE api.device_tokens
  ADD COLUMN IF NOT EXISTS firebase_project_id TEXT NOT NULL DEFAULT 'your-prd-project-id';
```

Store it on upsert in the app:
```ts
const FIREBASE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'your-prd-project-id'

await supabase.from('device_tokens').upsert(
  { user_id, fcm_token, firebase_project_id: FIREBASE_PROJECT_ID, ... },
  { onConflict: 'fcm_token' },
)
```

### 6. Create a staging Firebase service account

In Firebase Console → Project Settings → Service accounts → Generate new private key for `reflect-stg`. Add to Doppler stg:
- `FIREBASE_PROJECT_ID` = `reflect-stg`
- `FIREBASE_CLIENT_EMAIL` = `firebase-adminsdk-xxx@reflect-stg.iam.gserviceaccount.com`
- `FIREBASE_PRIVATE_KEY` = the private key

### 7. Update Supabase secrets for per-project push

Since stg and prd share a Supabase instance, add `_STG` suffixed secrets:

```bash
supabase secrets set \
  FIREBASE_PROJECT_ID_STG=reflect-stg \
  FIREBASE_CLIENT_EMAIL_STG=firebase-adminsdk-xxx@reflect-stg.iam.gserviceaccount.com \
  FIREBASE_PRIVATE_KEY_STG="-----BEGIN PRIVATE KEY-----..."
```

Create a shared Edge Function helper (`supabase/functions/_shared/firebase.ts`) that selects credentials by project:

```ts
function getCredentials(projectId: string) {
  const isStg = projectId === Deno.env.get('FIREBASE_PROJECT_ID_STG')
  return {
    clientEmail: isStg
      ? Deno.env.get('FIREBASE_CLIENT_EMAIL_STG')!
      : Deno.env.get('FIREBASE_CLIENT_EMAIL')!,
    privateKey: isStg
      ? Deno.env.get('FIREBASE_PRIVATE_KEY_STG')!.replace(/\\n/g, '\n')
      : Deno.env.get('FIREBASE_PRIVATE_KEY')!.replace(/\\n/g, '\n'),
  }
}
```

Edge Functions query `firebase_project_id` from `device_tokens` and group sends by project.

### 8. Manual steps in Firebase Console (cannot be automated)

- **APNs key**: Project Settings → Cloud Messaging → iOS app → upload APNs key
- **Google Analytics**: Project Settings → Integrations → Google Analytics → Link (creates one GA4 property with iOS + Android data streams)

## Key distinctions

| SHA-1 type | What it's for | Where to register |
|---|---|---|
| App signing key (`2b...`) | Final APK Google delivers to users | Firebase (required for Google Sign-In in prod) |
| Upload key (`5d...`) | Signing AAB before uploading to Play Store | Firebase (optional, for direct APK installs only) |

The app signing key is managed by Google Play and never changes. Only the app signing key needs to be in Firebase for production Google Sign-In to work.

## Database migrations must be applied to every Supabase project independently

When you have separate Supabase projects for stg and prd, **there is no automatic sync between them**. Any migration that adds columns used by Edge Functions (e.g. `firebase_project_id` on `device_tokens`) must be manually applied to each project.

If a column used by an Edge Function is missing in prd, push notifications silently fail — the function errors before it can route the FCM message.

**Symptom:** push notifications work on stg but not prd, despite identical Edge Function code.

**Fix:** run the missing migration against the prd project via the Supabase Management API:

```bash
SUPABASE_TOKEN="your-supabase-access-token"

curl -s -X POST "https://api.supabase.com/v1/projects/{PRD_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE api.device_tokens ADD COLUMN IF NOT EXISTS firebase_project_id TEXT NOT NULL DEFAULT '\''your-prd-firebase-project-id'\''"}'
```

**Prevention:** after applying any migration locally or to stg, immediately apply it to prd as well. Consider adding a checklist item to your deploy process: *"Did you run the migration on all Supabase projects?"*

## FCM tokens are tied to the Firebase project — migrate them when switching projects

FCM device tokens are bound to the `GCM_SENDER_ID` (project number) baked into `google-services.json` at build time. When you change `google-services.json` to a different Firebase project, **new builds register tokens with the new sender ID, but existing tokens in the database still carry the old sender ID**.

Sending an FCM message via the new project's credentials to a token registered with the old project produces:

```
SENDER_ID_MISMATCH (403 PERMISSION_DENIED)
```

This is silent from the user's perspective — the push simply never arrives.

**Symptoms:**
- Push notifications work for some devices but not others after a Firebase project migration
- Devices that installed the app BEFORE the migration fail; devices that installed AFTER succeed
- `admin-push` reports partial failures with `SenderId mismatch`

**Fix:**

1. Delete stale tokens (registered with the old project) from the database:

```bash
SUPABASE_TOKEN="your-supabase-access-token"
# Delete tokens registered before the migration date
curl -s -X POST "https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "DELETE FROM api.device_tokens WHERE updated_at < '\''MIGRATION_DATE'\''"}'
```

2. Users re-open the app → the new build registers a fresh token with the new Firebase project → push works again.

## Supabase Edge Function Firebase credentials must match the google-services.json project

The `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` secrets in your Supabase project must be for the **same Firebase project** as the `GCM_SENDER_ID` in `google-services.json`. If they point to different projects, every FCM send fails with `SENDER_ID_MISMATCH`.

This is easy to miss when:
- You migrate stg from a shared Firebase project to a dedicated one but forget to update the Supabase Edge Function secrets
- You have per-environment routing (`FIREBASE_PROJECT_ID_STG`) and the env var is unset or wrong, causing all tokens to fall through to the wrong default credentials

**Fix:** update the Supabase secrets via the Management API to match the Firebase project in use:

```bash
SUPABASE_TOKEN="your-supabase-access-token"
curl -s -X POST "https://api.supabase.com/v1/projects/{PROJECT_REF}/secrets" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"name": "FIREBASE_CLIENT_EMAIL", "value": "firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com"},
    {"name": "FIREBASE_PRIVATE_KEY", "value": "-----BEGIN PRIVATE KEY-----\n..."},
    {"name": "FIREBASE_PROJECT_ID", "value": "your-firebase-project-id"}
  ]'
```

**Quick verification** — call `send-test-push` directly with a known FCM token. If it returns `ok` the credentials are correct; if it returns `SenderId mismatch` the credentials don't match the token's registration project.
