---
title: "Android AAB signed with wrong key — EAS keystore mismatch with Google Play upload key"
problem_type: integration-issues
symptoms:
  - "Google Api Error: Invalid request - The Android App Bundle was signed with the wrong key"
  - "Found: SHA1: XX:XX:... expected: SHA1: YY:YY:... — Retrying..."
  - "Fastlane supply failed after successful EAS build"
  - "New SHA-1 appears every time the build runs (EAS keeps generating new keystores)"
  - "Google Sign-In broken on Android store builds after changing keystore"
  - "The app is missing the required metadata to submit the app to Google Play Store"
technologies:
  - "EAS Build"
  - "Google Play Store"
  - "Fastlane supply"
  - "Firebase Android"
tags:
  - eas
  - android
  - google-play
  - keystore
  - app-signing
  - sha1
  - firebase
  - google-sign-in
status: solved
severity: high
date_solved: "2026-06-08"
---

## Problem

Google Play rejects the AAB upload because the signing key doesn't match the registered upload key certificate. This often manifests after EAS credentials are regenerated or reset.

## Key concepts

Google Play App Signing uses **two separate keys**:

| Key | SHA-1 | Managed by | Purpose |
| --- | --- | --- | --- |
| **App signing key** | `2b...` | Google | Signs the final APK delivered to users |
| **Upload key** | `5d...` | You (via EAS) | Signs the AAB before uploading to Play Store |

Google Play rejects uploads when the AAB's signing key ≠ registered upload key. The app signing key never changes and is irrelevant to this error.

## Why EAS generates a new keystore

EAS **auto-generates a new keystore** when:

1. No keystore is set as the **default** for a build profile
2. An existing keystore is deleted without assigning a replacement as default first

This is the most common cause of repeated SHA-1 mismatches — deleting the wrong keystore without setting a new default causes a fresh auto-generation on every build.

## Fix

### 1. Check what keystores exist in EAS

```bash
eas credentials --platform android
# Select the prd profile → view credentials
```

You may find multiple keystores. Identify which one matches what Google Play expects (`5d...`).

### 2. Set the correct keystore as default

In `eas credentials --platform android`:

- Select the prd profile
- Select the correct keystore (`5d...`)
- **Explicitly set it as the default** for the profile

Delete any auto-generated keystores that were created by mistake.

### 3. If the original keystore is lost

If the keystore with the expected SHA-1 no longer exists anywhere:

**Option A — Reset the upload key in Google Play Console:**

1. Download the current EAS keystore certificate:

```bash
eas credentials --platform android
# Download keystore → note the password and alias
keytool -export -rfc \
  -keystore your-keystore.jks \
  -alias your-alias \
  -file upload-cert.pem
# Enter the keystore password shown by EAS
```

1. Go to Play Console → Your app → Setup → **App integrity → Upload key certificate → Request key upgrade**
1. Upload `upload-cert.pem`

**Option B — Register the new key in Google Play** (same steps as above, just updates Play Console to accept the new EAS key).

## Firebase SHA-1 registration

After resolving the upload key:

- **App signing key** (`2b...`) **must** be in Firebase → required for Google Sign-In in production (this is what actually signs the app users install)
- **Upload key** (`5d...`) is optional in Firebase → only needed if you test Google Sign-In with directly-installed APKs (not via Play Store)

```bash
# Re-download google-services.json after adding SHA-1s in Firebase Console
# The file will include new OAuth clients for each registered SHA-1
```

Always commit the updated `google-services-prd.json` after changing Firebase SHA-1 registrations — the new OAuth clients must be embedded in the build.

## Google Play track must exist before CI can submit with `completed`

If CI submits with `releaseStatus: "completed"` to a track that has **never had a release**, Google Play rejects with:

> The app is missing the required metadata to submit the app to Google Play Store.

This is misleading — the real issue is the track doesn't exist or isn't set up yet, not missing metadata.

**Option A — Create the track manually first (confirmed working):**

1. Go to Play Console → Testing → the target track
2. Create the track manually and upload any valid AAB
3. Fill in the minimum store listing (description + one screenshot)
4. Submit for review — Google reviews the first release on each track

Once the track has at least one approved release, all subsequent CI builds submit with `releaseStatus: "completed"` without any manual steps or review.

**Option B — Bootstrap via `draft` (may work, unconfirmed):**

`releaseStatus: "draft"` may succeed on a brand-new track since it doesn't try to publish — it just uploads the AAB. If it works, the track gets created automatically and you can then promote/review from the Play Console manually. Once the first release is approved, switch back to `"completed"`.

**During the initial review period**, CI submissions with `releaseStatus: "completed"` will fail because Google blocks new completed releases while one is pending review. Temporarily set `releaseStatus: "draft"` in `eas.json` until the first release is approved, then revert to `"completed"`.

```json
"android": {
  "track": "alpha",
  "releaseStatus": "draft"
}
```

**Track review requirements:**

| Track | Review required | Store listing needed | Manual setup before CI |
| --- | --- | --- | --- |
| Internal testing | No | No | **No — works from day one** |
| Closed testing (Alpha/Beta) | Yes (first release only) | Yes | Yes |
| Open testing | Yes | Yes | Yes |
| Production | Yes | Yes (full) | Yes |

**Recommended starting point for new projects:** use `track: "internal"` with `releaseStatus: "completed"` — CI works immediately with zero Play Console setup. Promote to alpha/production manually once the store listing is ready.

## Prevention

- Never delete an EAS keystore without first assigning a replacement as default
- After any credential change, verify with `eas credentials` that the correct keystore shows as active
- Store the keystore password in a secure location (1Password, etc.) — you'll need it if you ever have to export the certificate
- Create all target tracks manually in Play Console before running CI for the first time
