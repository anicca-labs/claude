---
title: "crypto.getRandomValues is undefined under Hermes — use expo-crypto, never assume WebCrypto"
date: 2026-06-25
status: solved
severity: high
category: runtime-errors
tags:
  - hermes
  - webcrypto
  - getRandomValues
  - crypto
  - expo-crypto
  - encryption
  - aes
  - react-native
  - ota
components:
  - "expo-crypto"
  - "Hermes (React Native JS engine)"
  - "aes-js"
symptoms:
  - "Error: crypto.getRandomValues unavailable — cannot generate a secure IV"
  - "globalThis.crypto?.getRandomValues is undefined in production builds"
  - "Any feature that encrypts/hashes/generates random bytes throws and its promise rejects"
  - "User-facing action silently fails (e.g. saving a record never reaches the DB)"
  - "Works in a JS unit test (jsdom/node has WebCrypto) but fails on-device"
environment:
  js_engine: Hermes
  framework: Expo / React Native
  note: "Hermes does NOT implement the WebCrypto API. globalThis.crypto is undefined unless a native module or polyfill installs it."
---

## Root Cause

Hermes (React Native's JS engine) does **not** implement the WebCrypto API. `globalThis.crypto` — and therefore `globalThis.crypto.getRandomValues` — is `undefined` on-device unless a native module or polyfill installs it. There is **no pure-JS source of cryptographically secure randomness**; secure entropy is fundamentally a native-platform capability.

Code that assumes `crypto.getRandomValues` "is always present under Hermes" is wrong. It may pass JS unit tests (Node/jsdom provide WebCrypto) and then fail on every real device. A common shape:

```ts
const randomIV = (): Uint8Array => {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) {
    // assumed unreachable — but this throws on EVERY device
    throw new Error('crypto.getRandomValues unavailable — cannot generate a secure IV');
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return bytes;
};
```

When this throws inside an encrypt step that runs before a network write (e.g. `insert({ content: encryptContent(text) })`), the mutation rejects and the user's action silently fails — they "can't save."

## Investigation Steps

1. **Read the error and culprit frame** — `crypto.getRandomValues unavailable` thrown from `randomIV` / `encryptContent`, surfaced via `onunhandledrejection`. Tag `hermes: true`, `js_engine: hermes`.
2. **Confirmed no polyfill installed** — `grep package.json` for `react-native-get-random-values` / `expo-crypto` / `expo-standard-web-crypto`: none. `grep src index.js` for any polyfill import: none.
3. **Confirmed base Expo SDK does not install it** — Expo SDK 56's `expo` package does not register a global `crypto.getRandomValues`.
4. **Confirmed nothing native provides entropy** — no crypto native module was linked in the shipped binary, so there was no secure RNG to reach even at runtime.

## Working Solution

Use `expo-crypto`'s native CSPRNG directly. Do not depend on the `globalThis.crypto` global existing.

### Step 1 — Install (SDK-aligned)

```bash
yarn expo install expo-crypto
```

### Step 2 — Call expo-crypto directly

```ts
import * as Crypto from 'expo-crypto';

const IV_BYTES = 16;

const randomIV = (): Uint8Array => {
  // Hermes/React Native does NOT ship WebCrypto, so globalThis.crypto.getRandomValues
  // is undefined unless polyfilled. expo-crypto bridges to the platform CSPRNG natively.
  const bytes = new Uint8Array(IV_BYTES);
  Crypto.getRandomValues(bytes);
  return bytes;
};
```

`Crypto.getRandomValues(typedArray)` mirrors the WebCrypto signature (fills and returns the array). Alternatively `Crypto.getRandomBytes(count)` returns a fresh `Uint8Array`.

> **Alternative:** `react-native-get-random-values` is a side-effect polyfill — `import 'react-native-get-random-values'` at the very top of `index.js` installs `global.crypto.getRandomValues`, after which the original global-based code works unchanged. Prefer `expo-crypto` in Expo projects (SDK-aligned, explicit dependency, no reliance on a global).

### Step 3 — Verify

```bash
yarn tsc --noEmit
```

Then exercise the feature on a real device/simulator (a JS-only test will not catch this — Node has WebCrypto).

## ⚠️ This fix CANNOT ship over OTA

Adding `expo-crypto` is a **native change** — it shifts the runtime fingerprint (`runtimeVersion.policy: 'fingerprint'`). Consequences:

- `push-ota` will **not** deliver it to already-installed builds; an OTA only reaches binaries whose native fingerprint matches.
- Users on the broken build stay broken until they install a **new full build** from the store.
- The only thing that *can* reach the already-shipped build over OTA is a JS-only change — and since secure randomness needs native code, there is no secure JS-only hotfix. (A weak `Date.now()+Math.random()` IV is **not** acceptable for AES-CTR: a predictable/reused IV reuses the keystream and leaks plaintext XORs.)

**Plan accordingly:** cut new full builds for every environment (stg + prd) and expect a store-update lag for existing users.

## Prevention

- **Never assume WebCrypto exists under Hermes.** `globalThis.crypto`, `crypto.subtle`, `crypto.getRandomValues`, `crypto.randomUUID` are all absent unless polyfilled.
- For random bytes / UUIDs / hashing, use `expo-crypto` (or `react-native-get-random-values` for the global polyfill) and import it explicitly.
- Treat anything touching the secure RNG as a **native** dependency: it needs a full build, not an OTA. Plan the rollout before changing crypto code.
- Don't validate crypto code with JS-only unit tests alone — Node/jsdom provide WebCrypto and will mask the on-device failure. Run on a device/simulator.

## Note on `EXPO_PUBLIC_*` encryption keys

If client-side encryption uses a key from an `EXPO_PUBLIC_…` env var, the key is **inlined into the JS bundle and extractable from the app**. Such encryption only protects against a DB-only reader (leaked backup / dashboard access), not against anyone holding the app binary. Don't treat it as real confidentiality, and don't put a key you need to stay secret behind an `EXPO_PUBLIC_` prefix.

## Do / Don't

| Situation | Do | Don't |
|---|---|---|
| Need random bytes / IV | `Crypto.getRandomValues(new Uint8Array(n))` from `expo-crypto` | `globalThis.crypto.getRandomValues(...)` assuming it exists |
| Need a UUID | `Crypto.randomUUID()` (expo-crypto) | `crypto.randomUUID()` (undefined under Hermes) |
| Fallback when RNG missing | Fail loudly AND ship a native RNG | Fall back to `Date.now()+Math.random()` for crypto |
| Ship a crypto fix | New full build for all envs | `push-ota` (native fingerprint changed — won't apply) |
| Verify | Run on device/simulator | Rely on JS unit tests (Node has WebCrypto) |

## Detection

**At install time:**
```bash
# secure RNG should be provided by a native module
yarn why expo-crypto || echo "no native CSPRNG installed"
```

**Static check — flag bare WebCrypto assumptions in app code:**
```bash
grep -rn "globalThis.crypto\|window.crypto\|[^.]\bcrypto\.getRandomValues\|crypto\.subtle\|crypto\.randomUUID" src/ \
  && echo "Verify these are polyfilled or use expo-crypto"
```

**At runtime:** error references `getRandomValues` / IV generation, with `hermes: true`. A user-facing write (save/insert) that never lands is the visible symptom.

## Related Documentation

- `skills/ota/SKILL.md` — fingerprint-based `runtimeVersion`; native changes need a new build, not an OTA.
- `skills/coding-standards/SKILL.md` — package install via `yarn expo install` for SDK-aligned native modules.
