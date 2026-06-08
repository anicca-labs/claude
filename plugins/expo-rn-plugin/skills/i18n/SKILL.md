---
name: i18n
description: Extract new Lingui strings, translate all missing entries into every supported language, and compile. Run after adding any new user-visible strings.
argument-hint: ""
---

Extract, translate, and compile Lingui catalogs for this project.

## Steps

### 1. Extract

```bash
yarn lingui extract
```

Read the summary table it prints. Note which catalogs have missing translations and in which locales.

### 2. Find missing strings

For each non-English locale that has missing entries, parse the `.po` files under `src/i18n/locales/exported/<locale>/` and collect every entry where `msgstr` is `""` (excluding the file header block).

You can use this one-liner to get a quick view of what needs translating:

```bash
python3 -c "
import re, glob, os
base = 'src/i18n/locales/exported'
for po in sorted(glob.glob(f'{base}/**/*.po', recursive=True)):
    locale = po.split(os.sep)[-2]
    if locale == 'en':
        continue
    with open(po) as f:
        content = f.read()
    missing = re.findall(r'msgid \"(.+?)\"\nmsgstr \"\"', content)
    if missing:
        print(f'\n{po}:')
        for m in missing:
            print(f'  {repr(m)}')
"
```

### 3. Translate

Translate every missing string directly — you speak all supported languages. Apply these rules:

- **Preserve placeholders** exactly: `{name}`, `{count}`, `{0}`, `{1}`, etc.
- **Preserve special characters** exactly: `✦`, `·`, `—`, ellipsis `…`
- **Match the register** of the surrounding translated strings in that file (informal vs formal)
- **Do not translate** brand names: `Pro`, `reflect`, `Apple`, `Google`
- Arabic (`ar`): use right-to-left natural phrasing; keep Latin brand names as-is

Use a Python script to write the translations back into the `.po` files — it's safer than editing them line by line:

```python
import re, os

translations = {
    'es': {
        'Original string': 'Spanish translation',
        # ...
    },
    'pt-BR': { ... },
    'fr': { ... },
    'id': { ... },
    'ar': { ... },
    # add any other locales the project supports
}

base = 'src/i18n/locales/exported'

for locale, strings in translations.items():
    for catalog in ['screens', 'components', 'app']:
        path = os.path.join(base, locale, f'{catalog}.po')
        if not os.path.exists(path):
            continue
        with open(path) as f:
            content = f.read()
        for msgid, msgstr in strings.items():
            pattern = f'msgid "{re.escape(msgid)}"\nmsgstr ""'
            replacement = f'msgid "{msgid}"\nmsgstr "{msgstr}"'
            content = content.replace(pattern, replacement)
        with open(path, 'w') as f:
            f.write(content)
```

### 4. Verify nothing was missed

Re-run the find-missing script from step 2. If any entries are still empty, translate and fill them before continuing.

### 5. Compile

```bash
yarn lingui compile
```

### 6. Type-check

```bash
yarn tsc --noEmit
```

Fix any errors before reporting done.

## Rules

- Never leave `msgstr ""` in a non-English locale — always translate before compiling
- Never modify `src/i18n/locales/compiled/` directly — that's the output of `yarn lingui compile`
- Never edit `en` catalog entries — English is the source language extracted from source code
- If a string contains interpolation (e.g. `{email}`), double-check the translated version preserves it
- Run this skill any time `yarn lingui extract` reports missing translations

## Common pitfalls

### Plurals — use separate `<Trans>` per form, not `<Plural>`

**`<Plural>` crashes on Hermes (React Native's JS engine).** The babel plugin compiles it correctly at build time, but `Intl.PluralRules` — which Lingui's ICU plural runtime needs — is unreliable on Hermes. The crash surfaces as `TypeError: Cannot read property 'prototype' of undefined` the first time the plural renders.

Use a ternary with separate `<Trans>` per plural form instead:

```tsx
// ❌ Crashes on Hermes — Intl.PluralRules not reliable
import { Trans, Plural } from '@lingui/react/macro'
<Trans>Today · <Plural value={count} one="# entry" other="# entries" /></Trans>

// ❌ Also wrong — plain interpolation in a ternary isn't extracted as translatable plural
<Trans>Today · {count} {count === 1 ? 'entry' : 'entries'}</Trans>

// ✅ Correct — each form is a fully translatable Trans message
import { Trans } from '@lingui/react/macro'
{count === 1
  ? <Trans>Today · 1 entry</Trans>
  : <Trans>Today · {count} entries</Trans>}
```

Each `<Trans>` call is extracted separately by Lingui. Translators get both forms and can produce correct translations for every locale. For languages with more than two plural forms (Arabic, Russian, etc.), add explicit cases:

```tsx
{count === 0
  ? <Trans>No entries</Trans>
  : count === 1
  ? <Trans>1 entry</Trans>
  : <Trans>{count} entries</Trans>}
```

**If the app needs correct Arabic/Russian pluralization:** install the `@formatjs/intl-pluralrules` polyfill and `<Plural>` will work correctly. Add it to the app entry point (`app/_layout.tsx` or `index.js`) before anything else:

```bash
yarn add @formatjs/intl-pluralrules
```

```ts
// app/_layout.tsx — top of file, before any other imports
import '@formatjs/intl-pluralrules/polyfill'
import '@formatjs/intl-pluralrules/locale-data/en'
import '@formatjs/intl-pluralrules/locale-data/ar'
// add one import per locale the app supports
```

Without the polyfill the ternary approach is correct and safe. With the polyfill, `<Plural>` works and handles all plural forms automatically — preferable when supporting languages with 3+ plural forms.

**Also: do not add `@lingui/macro` as a dependency.** It does not exist in Lingui v6 (max published version is 5.9.5). Adding it pulls in duplicate v5 copies of `@lingui/core` and `@lingui/react` alongside v6, causing runtime conflicts. All macros come from `@lingui/react/macro` and `@lingui/core/macro`.

### `t` must be the Lingui macro — not a function parameter

Lingui's extractor does static analysis — it only recognises `t` tagged template literals when `t` comes from `useLingui()` (or is imported directly from `@lingui/core/macro`) inside the same scope. Passing `t` as a parameter to a helper function outside the component means the strings are **never extracted**:

```tsx
// ❌ Strings not extracted — t is just a parameter name here
const translateError = (msg: string, t: TFunction) => {
  return t`Something went wrong`
}

// ✅ Define the function inside the component where t is in scope
const { t } = useLingui()
const translateError = (msg: string) => {
  return t`Something went wrong`
}
```

### Third-party error messages (Supabase, SDKs)

API error messages (e.g. `error.message` from Supabase) are always in English regardless of device locale. Never display them raw — map known error strings to translated `t` messages inside the component:

```tsx
const { t } = useLingui()

const translateAuthError = (message: string): string => {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return t`Invalid email or password`
  if (lower.includes('email not confirmed')) return t`Please confirm your email before signing in`
  if (lower.includes('too many requests')) return t`Too many attempts. Please try again later`
  return message // fallback for unmapped errors
}
```
