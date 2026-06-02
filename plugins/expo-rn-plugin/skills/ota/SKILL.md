---
name: ota
description: Self-hosted OTA updates via Supabase — setup, Edge Function manifest server, CI upload script, and Doppler config. Use when implementing over-the-air JS updates without EAS Update or Expo's build servers.
---

## Architecture

OTA updates are self-hosted on Supabase — no EAS Update subscription needed.

- **Supabase Storage** (`expo-updates` bucket) — hosts JS bundles and assets
- **Edge Function** (`expo-update-manifest`) — implements Expo Updates Protocol v1, returns multipart manifests
- **`api.expo_updates` table** — tracks which update is active per channel/platform/runtime version
- **`scripts/push-ota-update.mjs`** — CI script: runs `expo export`, uploads to Storage, registers in DB
- **GitHub Actions workflow** — triggers on push to `stg`/`main`, auto-pushes the OTA update

The store build is still required when native code changes. OTA handles JS-only changes.

## Setup checklist

1. `yarn expo install expo-updates`
2. Add `runtimeVersion`, `updates`, and `"expo-updates"` plugin to `app.config.ts`
3. Apply the Supabase migration (table + storage bucket)
4. Deploy the Edge Function to stg and prd
5. Set Doppler vars (`EXPO_UPDATE_URL`, `EXPO_UPDATE_CHANNEL`) in stg and prd
6. Add `scripts/push-ota-update.mjs` and `.github/workflows/expo-ota-update.yml`
7. Apply the iOS native patch (see **iOS native patch** section below)
8. Add path filters to the store build workflow so it only runs on native-touching files
9. Do one native rebuild so `expo-updates` is embedded in the binary

The two CI workflows are mutually exclusive by path:

- **Store build** (`expo-store-deploy.yml`) → `package.json`, `yarn.lock`, `app.config.ts`, `eas.json`
- **OTA push** (`expo-ota-update.yml`) → `src/**`, `assets/**`, `index.js`, `lingui.config.ts`

## app.config.ts

Do NOT set `kotlinVersion` in `expo-build-properties` android config. `expo-build-properties`
writes it as `android.kotlinVersion` (prefixed), which `expo-updates`' buildscript reads as
`rootProject["kotlinVersion"]` (no prefix) — they don't align, causing a KSP version mismatch
and `NoSuchMethodError` at compile time. `ExpoRootProjectPlugin` already defaults to `2.0.21`.

```ts
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  version: config.version,           // reads from package.json — single source of truth
  runtimeVersion: {
    policy: 'appVersion',            // runtime version = package.json version
  },
  updates: {
    url: process.env.EXPO_UPDATE_URL,
    checkAutomatically: 'ON_LOAD',
    requestHeaders: {
      'expo-channel-name': process.env.EXPO_UPDATE_CHANNEL ?? 'prd',
    },
  },
  plugins: [
    // ... other plugins
    // No kotlinVersion in expo-build-properties android config — see note above
    'expo-updates',
  ],
});
```

`EXPO_UPDATE_URL` and `EXPO_UPDATE_CHANNEL` are set per environment in Doppler.

## Supabase migration

```sql
-- Storage bucket (public — devices download directly without auth)
insert into storage.buckets (id, name, public)
values ('expo-updates', 'expo-updates', true)
on conflict (id) do nothing;

create policy "Public read access"
  on storage.objects for select
  using (bucket_id = 'expo-updates');

create table api.expo_updates (
  id uuid primary key,
  channel text not null,
  platform text not null check (platform in ('ios', 'android')),
  runtime_version text not null,
  created_at timestamptz not null default now(),
  launch_asset jsonb not null,
  assets jsonb not null default '[]',
  extra jsonb not null default '{}',
  active boolean not null default true
);

alter table api.expo_updates enable row level security;
grant select, insert, update on api.expo_updates to service_role;

create index expo_updates_lookup_idx
  on api.expo_updates (channel, platform, runtime_version, created_at desc)
  where active = true;
```

Apply via the Supabase Management API or dashboard. Repeat for both stg and prd projects.

## Edge Function (`supabase/functions/expo-update-manifest/index.ts`)

**Critical details for iOS:**

- `createdAt` must use `+00:00` format, not `Z` — iOS `NSDateFormatter` with `ZZZZZ` pattern doesn't parse `Z`
- Multipart body must end with `\r\n` after the closing boundary
- Cache headers must prevent CDN caching (`no-store`) so every request hits the function

```ts
// @openapi-internal — device-facing OTA manifest server, not a client API endpoint
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type Asset = { hash: string; key: string; fileExtension?: string; contentType: string; url: string }
type ExpoUpdate = {
  id: string; channel: string; platform: string; runtime_version: string
  created_at: string; launch_asset: Asset; assets: Asset[]
  extra: Record<string, unknown>; active: boolean
}

function buildMultipart(boundary: string, parts: Array<{ name: string; contentType: string; body: string }>): string {
  const chunks = parts.flatMap((p) => [
    `--${boundary}`, `Content-Type: ${p.contentType}`,
    `Content-Disposition: form-data; name="${p.name}"`, '', p.body,
  ])
  chunks.push(`--${boundary}--`)
  // iOS expo-updates requires CRLF after the closing boundary
  return chunks.join('\r\n') + '\r\n'
}

function noUpdateResponse(): Response {
  const boundary = 'expo-update-boundary'
  return new Response(
    buildMultipart(boundary, [{ name: 'directive', contentType: 'application/json', body: JSON.stringify({ type: 'noUpdateAvailable' }) }]),
    { headers: { 'expo-protocol-version': '1', 'expo-sfv-version': '0', 'cache-control': 'no-store, no-cache, must-revalidate', 'content-type': `multipart/mixed; boundary="${boundary}"` } },
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const platform = req.headers.get('expo-platform')
  const runtimeVersion = req.headers.get('expo-runtime-version')
  const channel = req.headers.get('expo-channel-name') ?? 'prd'
  const currentUpdateId = req.headers.get('expo-current-update-id')

  if (!platform || !runtimeVersion) return new Response('Missing expo-platform or expo-runtime-version header', { status: 400 })
  if (platform !== 'ios' && platform !== 'android') return new Response('Invalid expo-platform', { status: 400 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'api' } })
  const { data: update } = await supabase
    .from('expo_updates').select('*')
    .eq('channel', channel).eq('platform', platform).eq('runtime_version', runtimeVersion).eq('active', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle() as { data: ExpoUpdate | null }

  if (!update || update.id === currentUpdateId) return noUpdateResponse()

  const manifest = {
    id: update.id,
    // +00:00 format required — iOS NSDateFormatter ZZZZZ pattern doesn't parse literal 'Z'
    createdAt: new Date(update.created_at).toISOString().replace('Z', '+00:00'),
    runtimeVersion,
    assets: update.assets,
    launchAsset: update.launch_asset,
    metadata: {},
    extra: update.extra,
  }
  const boundary = 'expo-update-boundary'
  return new Response(
    buildMultipart(boundary, [{ name: 'manifest', contentType: 'application/json', body: JSON.stringify(manifest) }]),
    { headers: {
      'expo-protocol-version': '1', 'expo-sfv-version': '0',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'pragma': 'no-cache', 'expires': '0',
      'vary': 'expo-current-update-id, expo-channel-name, expo-platform',
      'content-type': `multipart/mixed; boundary="${boundary}"`,
    }},
  )
})
```

Deploy with `--no-verify-jwt` — devices call it without auth:

```bash
supabase functions deploy expo-update-manifest --no-verify-jwt --project-ref <ref>
```

**Always deploy to both stg AND prd** whenever the edge function changes. Use the project's npm scripts:

```bash
yarn functions:deploy:stg
yarn functions:deploy:prd
```

Never deploy to just one — production users will get a different manifest behaviour than staging users and bugs will be hard to reproduce.

## Upload script (`scripts/push-ota-update.mjs`)

**Two critical requirements discovered through iOS debugging:**

1. **Bundle key must be unique per OTA** — use `platformMeta.bundle` (the filename, which includes its hash) as the key. If you use a static key like `'bundle'`, expo-updates caches the first bundle forever by that key and never re-downloads subsequent bundles, even when the OTA changes. The app reports the new OTA ID but silently executes the old code.

2. **`extra.expoClient` must contain the app config** — expo-linking reads the URI scheme from `Constants.expoConfig`, which comes from `extra.expoClient` in the OTA manifest. Without it, the app crashes on launch with `expo-linking needs access to the expo-constants manifest`.

```js
#!/usr/bin/env node
import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import crypto from 'crypto'

const require = createRequire(import.meta.url)
const { getConfig } = require('@expo/config')

const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const CHANNEL = requireEnv('EXPO_UPDATE_CHANNEL')
const RUNTIME_VERSION = requireEnv('EXPO_RUNTIME_VERSION')
const DIST_DIR = process.env.DIST_DIR ?? './dist'
const BUCKET = 'expo-updates'

function requireEnv(name) {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env var: ${name}`)
  return val
}

function sha256b64(filePath) {
  const content = fs.readFileSync(filePath)
  // expo-updates iOS compares as base64url — no 'sha256:' prefix
  return crypto.createHash('sha256').update(content).digest('base64url')
}

function extToContentType(ext) {
  const map = { js: 'application/javascript', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', json: 'application/json', mp3: 'audio/mpeg', mp4: 'video/mp4', riv: 'application/octet-stream' }
  return map[ext?.toLowerCase()] ?? 'application/octet-stream'
}

async function uploadFile(localPath, storagePath, contentType) {
  const body = fs.readFileSync(localPath)
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY, 'Content-Type': contentType, 'x-upsert': 'true' },
    body,
  })
  if (!res.ok) throw new Error(`Storage upload failed [${storagePath}]: ${res.status} ${await res.text()}`)
  console.log(`  uploaded ${storagePath}`)
}

async function insertUpdate(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/expo_updates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Content-Profile': 'api', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`DB insert failed: ${res.status} ${await res.text()}`)
}

async function pushPlatform(platform, metadata, updateId, expoConfig) {
  const platformMeta = metadata.fileMetadata?.[platform]
  if (!platformMeta?.bundle) { console.log(`  no ${platform} bundle in export, skipping`); return }

  console.log(`\nPublishing ${platform} update ${updateId}...`)
  const prefix = `${CHANNEL}/${updateId}`
  const storageBase = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`

  const bundleLocalPath = path.join(DIST_DIR, platformMeta.bundle)
  await uploadFile(bundleLocalPath, `${prefix}/${platformMeta.bundle}`, 'application/javascript')

  const assets = []
  for (const asset of platformMeta.assets ?? []) {
    const localPath = path.join(DIST_DIR, asset.path)
    if (!fs.existsSync(localPath)) { console.warn(`  warn: asset not found: ${localPath}`); continue }
    const contentType = extToContentType(asset.ext)
    await uploadFile(localPath, `${prefix}/${asset.path}`, contentType)
    // fileExtension is required by expo-updates — omitting it causes JSONException on iOS
    assets.push({ hash: sha256b64(localPath), key: asset.path, fileExtension: `.${asset.ext}`, contentType, url: `${storageBase}/${prefix}/${asset.path}` })
  }

  await insertUpdate({
    id: updateId, channel: CHANNEL, platform, runtime_version: RUNTIME_VERSION,
    launch_asset: {
      hash: sha256b64(bundleLocalPath),
      // CRITICAL: use the bundle filename as key — it includes the content hash, making it
      // unique per OTA. A static key like 'bundle' causes expo-updates to reuse the first
      // bundle ever downloaded, silently running old code for every subsequent update.
      key: platformMeta.bundle,
      fileExtension: path.extname(platformMeta.bundle) || '.bundle',
      contentType: 'application/javascript',
      url: `${storageBase}/${prefix}/${platformMeta.bundle}`,
    },
    assets,
    // expoClient required — expo-linking reads the URI scheme from Constants.expoConfig,
    // which comes from extra.expoClient. Without it the app crashes on OTA launch.
    extra: { expoClient: expoConfig },
    active: true,
  })
  console.log(`  ✓ registered in DB`)
}

async function main() {
  const metadataPath = path.join(DIST_DIR, 'metadata.json')
  if (!fs.existsSync(metadataPath)) throw new Error(`${metadataPath} not found — run 'yarn expo export --output-dir dist' first`)
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
  const { exp: expoConfig } = getConfig(process.cwd(), { skipSDKVersionRequirement: true })
  await pushPlatform('ios', metadata, crypto.randomUUID(), expoConfig)
  await pushPlatform('android', metadata, crypto.randomUUID(), expoConfig)
  console.log('\nDone.')
}

main().catch((err) => { console.error(err.message); process.exit(1) })
```

Always run the export through Doppler so env vars are correct:

```bash
doppler run --project mobile --config stg -- yarn expo export --clear --platform ios --platform android --output-dir dist
```

The `--clear` flag prevents Metro from serving a cached bundle with stale module IDs.

## iOS native patch (required)

expo-updates iOS has two bugs when used with Supabase Storage that require patching `FileDownloader.swift` via `yarn patch`. Apply once and commit — Yarn re-applies on every `yarn install` including EAS local builds.

**To create/update the patch:**

```bash
yarn patch expo-updates
# edit /tmp/.../user/ios/EXUpdates/AppLoader/FileDownloader.swift
yarn patch-commit -s /tmp/...
yarn install   # updates yarn.lock hash
```

**Patch 1 — missing assets directory** (`downloadAsset` function, before `data.write`):

Supabase storage assets are written to `.expo-internal/assets/` but expo-updates doesn't create that directory. Without the fix every asset write fails with `NSCocoaErrorDomain Code=4 "The folder doesn't exist"`.

```swift
do {
  // ADD THESE TWO LINES before data.write:
  let destDir = (destinationPath as NSString).deletingLastPathComponent
  try FileManager.default.createDirectory(atPath: destDir, withIntermediateDirectories: true, attributes: nil)
  try data.write(to: URL(fileURLWithPath: destinationPath), options: .atomic)
```

**Patch 2 — 304 retry for cached ETags** (`downloadData(withRequest:)` function):

NSURLSession caches ETags from Supabase CDN. On subsequent requests it sends `If-None-Match`, the CDN returns 304 with nil data, and expo-updates fails with `ERR_UPDATES_FETCH: failed to load all assets`. The fix retries 304 responses with conditional headers stripped.

```swift
// Also add to createManifestRequest and createGenericRequest:
//   cachePolicy: .reloadIgnoringLocalCacheData

if httpResponse.statusCode == 304 {
  var freshRequest = request
  freshRequest.setValue(nil, forHTTPHeaderField: "If-None-Match")
  freshRequest.setValue(nil, forHTTPHeaderField: "If-Modified-Since")
  freshRequest.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
  let retryTask = self.session.dataTask(with: freshRequest) { retryData, retryResponse, retryError in
    guard let retryResponse = retryResponse else {
      let cause = UpdatesError.fileDownloaderUnknownError(cause: retryError ?? NSError(domain: "EXUpdates", code: 0))
      errorBlock(cause)
      return
    }
    successBlock(retryData, retryResponse)
  }
  retryTask.resume()
  return
}
```

**Do NOT set `urlCache = nil`** on the URLSession configuration — this causes NSURLSession to deliver nil data for all 200 responses.

## CI workflow (`.github/workflows/expo-ota-update.yml`)

```yaml
name: Push OTA Update

on:
  push:
    branches: [stg, main]
    paths:
      - 'src/**'
      - 'assets/**'
      - 'index.js'
      - 'lingui.config.ts'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target channel'
        required: true
        type: choice
        options: [stg, prd]

jobs:
  push-ota:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '23'
      - run: corepack enable
      - run: corepack prepare yarn@4.9.2 --activate
      - run: yarn install --immutable
      - run: curl -Ls https://cli.doppler.com/install.sh | sudo sh
      - id: env
        run: |
          if [ "${{ github.event_name }}" = "push" ]; then
            ENV="${{ github.ref_name == 'main' && 'prd' || 'stg' }}"
          else
            ENV="${{ inputs.environment }}"
          fi
          echo "channel=$ENV" >> "$GITHUB_OUTPUT"
      - name: Export JS bundle
        run: doppler run --project mobile --config ${{ steps.env.outputs.channel }} -- yarn expo export --platform ios --platform android --output-dir dist
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
      - name: Push OTA update
        run: |
          RUNTIME_VERSION=$(node -p "require('./package.json').version")
          doppler run --project mobile --config ${{ steps.env.outputs.channel }} -- \
            bash -c "EXPO_UPDATE_CHANNEL=${{ steps.env.outputs.channel }} EXPO_RUNTIME_VERSION=$RUNTIME_VERSION node scripts/push-ota-update.mjs"
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
```

## package.json scripts

```json
{
  "build-ipa": "yarn pre-build && echo 'y' | doppler run --project mobile --config ${ENV:-stg} -- eas build --platform ios --profile preview --local --output ./device-app-build-${ENV:-stg}.ipa",
  "build-ipa:prd": "ENV=prd yarn build-ipa",
  "push-ota": "doppler run --project mobile --config ${ENV:-stg} -- bash -c 'yarn expo export --clear --platform ios --platform android --output-dir dist && EXPO_UPDATE_CHANNEL=${ENV:-stg} EXPO_RUNTIME_VERSION=$(node -p \"require(\\\"./package.json\\\").version\") node scripts/push-ota-update.mjs'",
  "push-ota:prd": "ENV=prd yarn push-ota"
}
```

Note `echo 'y' |` before the `eas build` command — EAS local builds prompt for confirmation.

## Doppler vars (set per environment)

| Var | stg | prd |
|-----|-----|-----|
| `EXPO_UPDATE_URL` | `https://<stg-ref>.supabase.co/functions/v1/expo-update-manifest` | `https://<prd-ref>.supabase.co/functions/v1/expo-update-manifest` |
| `EXPO_UPDATE_CHANNEL` | `stg` | `prd` |

## How runtimeVersion works

`policy: 'appVersion'` means runtime version = `version` in `package.json`. Devices only receive OTA updates that match the runtime version they were built with. When you add a native module, bump `package.json` version and do a store rebuild — old binaries keep receiving updates for their version, new binaries get updates for the new version.

## Verifying the manifest server

```bash
curl -s \
  -H "expo-platform: ios" \
  -H "expo-runtime-version: <package.json version>" \
  -H "expo-channel-name: stg" \
  "https://<stg-ref>.supabase.co/functions/v1/expo-update-manifest"
```

Returns `noUpdateAvailable` directive before first push, full manifest after.

## Pushing an update

```bash
yarn push-ota        # stg
yarn push-ota:prd    # prd
```

Or just push to `stg`/`main` — the CI workflow fires automatically.

## Testing OTA updates

**Dev clients cannot test OTA** — they bypass `expo-updates` and connect to the local dev server instead.

**iOS simulator builds cannot test OTA** — use a device build.

You need a real binary with no dev server running:

| Platform | Build command | Install |
|----------|--------------|---------|
| iOS | `yarn build-ipa` | Install `.ipa` via Xcode / Apple Configurator |
| Android | `yarn build-apk` | `adb install app-build.apk` or drag onto emulator |

Then open the app standalone (just tap the icon, no `yarn start`). On launch it checks for updates (`checkAutomatically: 'ON_LOAD'`). Push a JS change with `yarn push-ota`, kill and reopen — the update appears.

Confirm in Supabase: `api.expo_updates` should have a new active row with correct `channel`, `platform`, and `runtime_version`.

## Known bugs / gotchas

**Android OTA works out of the box. iOS requires all of the following to work:**

| Issue | Symptom | Fix |
|-------|---------|-----|
| Missing `assets/` directory | `ERR_UPDATES_FETCH: failed to load all assets` | iOS patch: `createDirectory(withIntermediateDirectories: true)` |
| NSURLSession ETag caching | `ERR_UPDATES_FETCH` after first successful OTA | iOS patch: 304 retry with stripped conditional headers |
| Static bundle key `'bundle'` | OTA ID updates but old code runs, no visible changes | Use `platformMeta.bundle` as key (unique per content hash) |
| Missing `extra.expoClient` | App crashes on OTA launch: `expo-linking needs access to manifest` | Include `expoClient: expoConfig` from `@expo/config` in `extra` |
| `createdAt` with `Z` suffix | iOS silently rejects manifest, OTA never applies | Use `.replace('Z', '+00:00')` — iOS `NSDateFormatter ZZZZZ` doesn't parse `Z` |
| Multipart missing trailing CRLF | iOS manifest parse fails | `chunks.join('\r\n') + '\r\n'` after closing boundary |
| `urlCache = nil` on URLSession | All 200 responses deliver nil data | Do NOT set this — use `reloadIgnoringLocalCacheData` per-request instead |
| Metro cache in OTA export | Bundle has stale code despite source changes | Always use `--clear` flag: `expo export --clear` |
| EAS local build wipes patches | NSLog/fixes disappear, OTA reverts to broken | Use `yarn patch` to persist patches — committed to `.yarn/patches/` |
