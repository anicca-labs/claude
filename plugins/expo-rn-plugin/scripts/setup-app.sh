#!/usr/bin/env bash
# One-time setup for a new Expo app using this plugin.
# Run from the app root: bash <plugin-root>/scripts/setup-app.sh
set -euo pipefail

# GNU sed (Linux) uses `sed -i`; BSD sed (macOS) requires `sed -i ''`
sed_inplace() { if [[ "$(uname)" == "Darwin" ]]; then sed -i '' "$@"; else sed -i "$@"; fi }

APP_ROOT="${1:-$PWD}"
PKG="$APP_ROOT/package.json"
ENV_TEMPLATE="$APP_ROOT/env.template.yaml"
PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$PKG" ]; then
  echo "Error: no package.json found in $APP_ROOT"
  exit 1
fi

echo "=== expo-rn-plugin app setup ==="

# ── 0. Required system dependencies ─────────────────────────────────────────
ensure_brew_pkg() {
  local pkg="$1" tap="${2:-}"
  if command -v "$pkg" &>/dev/null; then
    echo "  ✓ $pkg already installed"
    return
  fi
  if ! command -v brew &>/dev/null; then
    echo "  ERROR: Homebrew not found. Install it first: https://brew.sh"
    exit 1
  fi
  echo "  Installing $pkg..."
  [ -n "$tap" ] && brew tap "$tap"
  brew install "$pkg"
}

ensure_brew_pkg jq
ensure_brew_pkg doppler dopplerhq/cli

# Optional CLI checks (non-blocking)
for _cli in supabase; do
  command -v "$_cli" &>/dev/null || echo "  ⚠ $_cli not found — install if using Supabase migrations"
done
unset _cli

if command -v eas &>/dev/null; then
  _eas_ver=$(eas --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  _eas_major=$(echo "$_eas_ver" | cut -d. -f1)
  if [ -z "$_eas_major" ] || [ "$_eas_major" -lt 16 ]; then
    echo "  ⚠ eas-cli ${_eas_ver:-unknown} is too old (need >= 16) — run: npm install -g eas-cli@latest"
    echo "    If 'which eas' points to a yarn global symlink, remove it first: rm \$(which eas)"
  else
    echo "  ✓ eas-cli $_eas_ver"
  fi
  unset _eas_ver _eas_major
else
  echo "  ⚠ eas-cli not found — run: npm install -g eas-cli@latest"
fi

# ── 1. Copy templates (skip files that already exist) ────────────────────────
echo "→ Copying templates..."

copy_if_missing() {
  local src="$1" dst="$2"
  if [ -e "$dst" ]; then
    echo "   Skipped (exists): $dst"
  else
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "   Copied: $dst"
  fi
}

copy_if_missing "$PLUGIN_ROOT/templates/CLAUDE.md"                        "$APP_ROOT/CLAUDE.md"
copy_if_missing "$PLUGIN_ROOT/templates/mcp.config.json"                  "$APP_ROOT/mcp.config.json"
copy_if_missing "$PLUGIN_ROOT/templates/.claude/settings.json"            "$APP_ROOT/.claude/settings.json"

# Copy commands (each individually so existing ones are preserved)
for cmd in "$PLUGIN_ROOT/templates/.claude/commands/"*; do
  [ -f "$cmd" ] && copy_if_missing "$cmd" "$APP_ROOT/.claude/commands/$(basename "$cmd")"
done

copy_if_missing "$PLUGIN_ROOT/templates/eas.json"                             "$APP_ROOT/eas.json"
copy_if_missing "$PLUGIN_ROOT/templates/tamagui.config.ts"                   "$APP_ROOT/tamagui.config.ts"
copy_if_missing "$PLUGIN_ROOT/templates/lingui.config.ts"                    "$APP_ROOT/lingui.config.ts"
copy_if_missing "$PLUGIN_ROOT/templates/.ruby-version"                        "$APP_ROOT/.ruby-version"
copy_if_missing "$PLUGIN_ROOT/templates/jest.config.js"                       "$APP_ROOT/jest.config.js"
copy_if_missing "$PLUGIN_ROOT/templates/commitlint.config.js"                 "$APP_ROOT/commitlint.config.js"
copy_if_missing "$PLUGIN_ROOT/templates/src/__mocks__/fileMock.js"            "$APP_ROOT/src/__mocks__/fileMock.js"
copy_if_missing "$PLUGIN_ROOT/templates/.husky/common.sh"                     "$APP_ROOT/.husky/common.sh"
copy_if_missing "$PLUGIN_ROOT/templates/.husky/pre-commit"                    "$APP_ROOT/.husky/pre-commit"
copy_if_missing "$PLUGIN_ROOT/templates/.husky/pre-push"                      "$APP_ROOT/.husky/pre-push"
copy_if_missing "$PLUGIN_ROOT/templates/.husky/commit-msg"                    "$APP_ROOT/.husky/commit-msg"
copy_if_missing "$PLUGIN_ROOT/templates/.editorconfig"                        "$APP_ROOT/.editorconfig"
copy_if_missing "$PLUGIN_ROOT/templates/.gitattributes"                       "$APP_ROOT/.gitattributes"
copy_if_missing "$PLUGIN_ROOT/templates/expo-env.d.ts"                        "$APP_ROOT/expo-env.d.ts"
copy_if_missing "$PLUGIN_ROOT/templates/eslint.config.js"                     "$APP_ROOT/eslint.config.js"
copy_if_missing "$PLUGIN_ROOT/templates/metro.config.js"                      "$APP_ROOT/metro.config.js"
copy_if_missing "$PLUGIN_ROOT/templates/firebase.json"                        "$APP_ROOT/firebase.json"
copy_if_missing "$PLUGIN_ROOT/templates/.prettierrc"                          "$APP_ROOT/.prettierrc"
copy_if_missing "$PLUGIN_ROOT/templates/.prettierignore"                      "$APP_ROOT/.prettierignore"
copy_if_missing "$PLUGIN_ROOT/templates/app.config.ts"                        "$APP_ROOT/app.config.ts"
for wf in "$PLUGIN_ROOT/templates/.github/workflows/"*.yml; do
  [ -f "$wf" ] && copy_if_missing "$wf" "$APP_ROOT/.github/workflows/$(basename "$wf")"
done
for mf in "$PLUGIN_ROOT/templates/.maestro/"*.yaml; do
  [ -f "$mf" ] && copy_if_missing "$mf" "$APP_ROOT/.maestro/$(basename "$mf")"
done

_ICONS_SRC="$PLUGIN_ROOT/templates/src/components/atoms/icons"
_ICONS_DST="$APP_ROOT/src/components/atoms/icons"
copy_if_missing "$_ICONS_SRC/BaseIcon.tsx"          "$_ICONS_DST/BaseIcon.tsx"
copy_if_missing "$_ICONS_SRC/svg-imports.ts"        "$_ICONS_DST/svg-imports.ts"
copy_if_missing "$_ICONS_SRC/index.ts"              "$_ICONS_DST/index.ts"
copy_if_missing "$_ICONS_SRC/custom.d.ts"           "$_ICONS_DST/custom.d.ts"
for svg in "$_ICONS_SRC/svg/"*.svg; do
  [ -f "$svg" ] && copy_if_missing "$svg" "$_ICONS_DST/svg/$(basename "$svg")"
done
unset _ICONS_SRC _ICONS_DST

# Rive splash layout + hooks (copy to app/ or src/app/ depending on project structure)
_ROUTES_DIR="$APP_ROOT/app"
[ -d "$APP_ROOT/src/app" ] && _ROUTES_DIR="$APP_ROOT/src/app"
copy_if_missing "$PLUGIN_ROOT/templates/app/_layout.tsx"  "$_ROUTES_DIR/_layout.tsx"
unset _ROUTES_DIR
copy_if_missing "$PLUGIN_ROOT/templates/src/hooks/useCustomFonts.ts"  "$APP_ROOT/src/hooks/useCustomFonts.ts"
copy_if_missing "$PLUGIN_ROOT/templates/src/hooks/index.ts"           "$APP_ROOT/src/hooks/index.ts"

# ── 1b. Patch CLAUDE.md with project name ────────────────────────────────────
echo "→ Patching CLAUDE.md..."
APP_NAME=$(node -e "console.log(require('$PKG').name || 'My App')")
if grep -q "^# Project Name$" "$APP_ROOT/CLAUDE.md"; then
  sed_inplace "s/^# Project Name$/# ${APP_NAME}/" "$APP_ROOT/CLAUDE.md"
  echo "   Set project name: ${APP_NAME}"
else
  echo "   Already patched"
fi

# ── 1b2. Migrate app.json → app.config.ts ────────────────────────────────────
echo "→ Checking app.json → app.config.ts migration..."
if [ -f "$APP_ROOT/app.json" ] && [ -f "$APP_ROOT/app.config.ts" ]; then
  echo "   Both exist — removing app.json (app.config.ts takes precedence)"
  rm "$APP_ROOT/app.json"
elif [ -f "$APP_ROOT/app.json" ] && [ ! -f "$APP_ROOT/app.config.ts" ]; then
  echo "   app.json found without app.config.ts — template was copied, removing app.json"
  rm "$APP_ROOT/app.json"
fi

# Patch app.config.ts with actual app slug and bundle ID from package.json
APP_SLUG=$(node -e "const p=require('$PKG'); console.log(p.name||'my-app')")
if grep -q '"my-app"' "$APP_ROOT/app.config.ts" 2>/dev/null; then
  sed_inplace "s/slug: \"my-app\"/slug: \"${APP_SLUG}\"/" "$APP_ROOT/app.config.ts"
  sed_inplace "s/\"my-app\"/\"${APP_SLUG}\"/g" "$APP_ROOT/app.config.ts"
  echo "   Patched app.config.ts slug: ${APP_SLUG}"
fi

# ── 1c. Detect directory structure and patch mcp.config.json ─────────────────
echo "→ Detecting project structure for mcp.config.json..."
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('$APP_ROOT/mcp.config.json', 'utf8'));
  const exists = (p) => fs.existsSync('$APP_ROOT/' + p);

  // routesDir
  if (exists('app')) cfg.routesDir = 'app';
  else if (exists('src/app')) cfg.routesDir = 'src/app';

  // components — prefer atomised layout, fall back to flat
  const compBases = ['src/components', 'components'];
  for (const base of compBases) {
    if (exists(base)) {
      for (const tier of ['atoms','molecules','organisms','screens']) {
        cfg.components[tier] = exists(base + '/' + tier)
          ? base + '/' + tier
          : base;
      }
      break;
    }
  }

  // orval generated SDK
  if (exists('src/api/generated')) cfg.orval.sdkLib = 'src/api/generated';
  else if (exists('src/generated')) cfg.orval.sdkLib = 'src/generated';

  fs.writeFileSync('$APP_ROOT/mcp.config.json', JSON.stringify(cfg, null, 2) + '\n');
  console.log('   routesDir  :', cfg.routesDir);
  console.log('   components :', JSON.stringify(cfg.components));
  console.log('   orval.sdkLib:', cfg.orval.sdkLib);
"

# ── 1d. Patch babel.config.js with babel-plugin-inline-import for SVG ────────
echo "→ Patching babel.config.js for SVG inline-import..."
BABEL_CFG="$APP_ROOT/babel.config.js"
if [ -f "$BABEL_CFG" ]; then
  if ! grep -q "babel-plugin-inline-import" "$BABEL_CFG"; then
    node -e "
      const fs = require('fs');
      let src = fs.readFileSync('$BABEL_CFG', 'utf8');
      const svgPlugin = \`[
        'babel-plugin-inline-import',
        {
          extensions: ['.svg'],
        },
      ],\`;
      // Insert as the first plugin entry
      src = src.replace(
        /plugins:\s*\[/,
        'plugins: [\n      ' + svgPlugin
      );
      fs.writeFileSync('$BABEL_CFG', src);
    "
    echo "   Patched: babel.config.js now includes babel-plugin-inline-import"
  else
    echo "   Already present: babel-plugin-inline-import in babel.config.js"
  fi
else
  echo "   No babel.config.js found — creating minimal one..."
  cat > "$BABEL_CFG" <<'JS'
module.exports = function (api) {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.BABEL_ENV === "production";

  api.cache.using(() => isProduction);

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "babel-plugin-inline-import",
        {
          extensions: [".svg"],
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
JS
  echo "   Created: babel.config.js"
fi

# ── 2. Link figma-tamagui-sync CLI ───────────────────────────────────────────
SYNC_TOOL="$PLUGIN_ROOT/tools/figma-tamagui-sync"

echo "→ Installing figma-tamagui-sync CLI..."
chmod +x "$SYNC_TOOL/bin/figma-tamagui-sync.js"
LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"
ln -sf "$SYNC_TOOL/bin/figma-tamagui-sync.js" "$LOCAL_BIN/figma-tamagui-sync"
# Add ~/.local/bin to PATH in shell rc files if not already present
for RC in "$HOME/.zshrc" "$HOME/.bashrc"; do
  if [ -f "$RC" ] && ! grep -q '\.local/bin' "$RC"; then
    # shellcheck disable=SC2016
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$RC"
  fi
done
echo "   Installed: $(which figma-tamagui-sync 2>/dev/null || echo "$LOCAL_BIN/figma-tamagui-sync (restart shell to pick up)")"

cd "$APP_ROOT"

# ── 3. package.json scripts ──────────────────────────────────────────────────
echo "→ Patching package.json scripts..."

APP_SLUG=$(node -e "const p=require('./package.json'); console.log(p.name||'app')")

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const slug = '$APP_SLUG';
  let changed = false;

  const add = (name, val) => {
    if (!pkg.scripts[name]) {
      pkg.scripts[name] = val;
      console.log('   Added: ' + name);
      changed = true;
    } else {
      console.log('   Already present: ' + name);
    }
  };

  add('sync-env-vars',
    'doppler secrets substitute env.template.yaml --output .env --project mobile --config \${ENV:-stg}');
  // doppler run injects FIGMA_API_KEY (Doppler key name); the tool expects FIGMA_TOKEN, so remap inline
  // Skip gracefully when vars are unset (Figma integration is optional)
  add('sync-design-tokens',
    'doppler run --project mobile --config \${ENV:-stg} -- bash -c \'if [ -z \"\${FIGMA_API_KEY:-}\" ] || [ -z \"\${FIGMA_FILE_ID:-}\" ]; then echo \"Skipping design token sync (no Figma project configured)\"; else FIGMA_TOKEN=\$FIGMA_API_KEY figma-tamagui-sync --fileId=\$FIGMA_FILE_ID --out=./src/theme; fi\'');
  add('pre-start', 'yarn sync-env-vars && yarn sync-design-tokens && yarn generate:open-api-hooks');
  add('start:expo',
    '[ \${ENV:-stg} == \\'prd\\' ] && yarn expo start --scheme ' + slug +
    ' || yarn expo start --scheme ' + slug + '-\${ENV:-stg}');
  add('start:prd', 'ENV=prd yarn start');
  add('build', 'yarn sync-env-vars && yarn generate:open-api-hooks');
  add('pre-build', 'yarn i18n && yarn build');
  add('dev-client-ios',
    'yarn pre-build && doppler run --project mobile --config \${ENV:-stg} -- eas build --platform ios --profile development --local --output ./sim-dev-client-\${ENV:-stg}-\$(date +%Y%m%d-%H%M%S).tar.gz');
  add('dev-client-ios:prd', 'ENV=prd yarn dev-client-ios');
  add('dev-client-android',
    'yarn pre-build && doppler run --project mobile --config \${ENV:-stg} -- eas build --platform android --profile development --local --output ./sim-dev-client-\${ENV:-stg}-\$(date +%Y%m%d-%H%M%S).apk');
  add('dev-client-android:prd', 'ENV=prd yarn dev-client-android');
  add('dev-client-ios-device',
    'yarn pre-build && doppler run --project mobile --config \${ENV:-stg} -- eas build --platform ios --profile preview --local --output ./device-dev-client-\${ENV:-stg}-\$(date +%Y%m%d-%H%M%S).ipa');
  add('dev-client-ios-device:prd', 'ENV=prd yarn dev-client-ios-device');
  add('build-store-ios',
    'yarn pre-build && doppler run --project mobile --config \${ENV:-stg} -- eas build --platform ios --profile prd --local --non-interactive --output ./store-build-\${ENV:-stg}.ipa');
  add('build-store-ios:prd', 'ENV=prd yarn build-store-ios');
  add('build-store-android',
    'yarn pre-build && doppler run --project mobile --config \${ENV:-stg} -- eas build --platform android --profile prd --local --non-interactive --output ./store-build-\${ENV:-stg}.aab');
  add('build-store-android:prd', 'ENV=prd yarn build-store-android');
  add('build-store-all', 'yarn build-store-android && yarn build-store-ios');
  add('build-store-all:prd', 'ENV=prd yarn build-store-all');
  add('deploy-store-ios',
    'yarn build-store-ios && doppler run --project mobile --config \${ENV:-stg} -- eas submit --platform ios --profile \${ENV:-stg} --path ./store-build-\${ENV:-stg}.ipa');
  add('deploy-store-ios:prd', 'ENV=prd yarn deploy-store-ios');
  add('deploy-store-android',
    'yarn build-store-android && doppler run --project mobile --config \${ENV:-stg} -- eas submit --platform android --profile \${ENV:-stg} --path ./store-build-\${ENV:-stg}.aab');
  add('deploy-store-android:prd', 'ENV=prd yarn deploy-store-android');
  add('deploy-store-all', 'yarn deploy-store-android && yarn deploy-store-ios');
  add('deploy-store-all:prd', 'ENV=prd yarn deploy-store-all');
  add('generate:open-api-spec',
    "bash -c 'mkdir -p node_modules/@ksairi-org/react-query-sdk/specs && EXPO_PUBLIC_SUPABASE_API_KEY=$(grep ^SUPABASE_SERVICE_ROLE_KEY= .env | cut -d= -f2-) node --env-file=.env node_modules/@ksairi-org/react-query-sdk/scripts/generate-open-api-spec.js'");
  add('generate:open-api-hooks',
    'yarn generate:open-api-spec && node --env-file=.env node_modules/.bin/orval --config node_modules/@ksairi-org/react-query-sdk/orval.config.ts');
  add('test', 'jest --watchAll=false');
  add('test:watch', 'jest');
  add('format', 'prettier --write .');
  add('format:check', 'prettier --check .');
  add('check:tsc', 'tsc --noEmit');
  add('i18n:extract', 'lingui extract');
  add('i18n:compile', 'lingui compile');
  add('i18n', 'yarn i18n:extract && yarn i18n:compile');
  add('postinstall', 'yarn i18n:compile');
  add('doctor', 'expo-doctor');

  // Upgrade lint to include --fix if not already
  if (pkg.scripts['lint'] && !pkg.scripts['lint'].includes('--fix')) {
    pkg.scripts['lint'] = pkg.scripts['lint'].replace('expo lint', 'expo lint --fix');
    console.log('   Patched: lint now includes --fix');
    changed = true;
  }

  // Migrate prestart lifecycle hook → explicit pre-start (already added above)
  if (pkg.scripts['prestart']) {
    delete pkg.scripts['prestart'];
    console.log('   Removed: prestart lifecycle hook (superseded by pre-start)');
    changed = true;
  }

  // Upgrade start to run i18n + pre-start if it's the bare expo start
  if (pkg.scripts['start'] === 'expo start') {
    pkg.scripts['start'] = 'yarn i18n && yarn pre-start && yarn start:expo';
    console.log('   Patched: start now runs i18n + pre-start + start:expo');
    changed = true;
  }

  // Ensure sync-env-vars uses --project mobile --config with $0
  if (pkg.scripts['sync-env-vars'] && !pkg.scripts['sync-env-vars'].includes('--project')) {
    pkg.scripts['sync-env-vars'] =
      'doppler secrets substitute env.template.yaml --output .env --project mobile --config \$0';
    console.log('   Patched: sync-env-vars now uses --project mobile --config \$0');
    changed = true;
  }

  // Migrate ENV var pattern → positional arg pattern (matches virtual-wallet convention)
  const newScripts = {
    'sync-env-vars': 'doppler secrets substitute env.template.yaml --output .env --project mobile --config \$0',
    'sync-design-tokens': 'doppler run --project mobile --config \$0 -- bash -c \'if [ -z \"\${FIGMA_API_KEY:-}\" ] || [ -z \"\${FIGMA_FILE_ID:-}\" ]; then echo \"Skipping design token sync (no Figma project configured)\"; else FIGMA_TOKEN=\$FIGMA_API_KEY figma-tamagui-sync --fileId=\$FIGMA_FILE_ID --out=./src/theme; fi\'',
    'pre-start': 'yarn sync-env-vars \$1 && yarn sync-design-tokens \$1 && yarn generate:open-api-hooks',
    'build': 'yarn sync-env-vars \$1 && yarn generate:open-api-hooks',
    'pre-build': 'yarn i18n && yarn build \$1',
    'dev-client-ios': 'yarn pre-build \$1 && doppler run --project mobile --config \$0 -- eas build --platform ios --profile development --local',
    'dev-client-android': 'yarn pre-build \$1 && doppler run --project mobile --config \$0 -- eas build --platform android --profile development --local',
    'dev-client-ios-device': 'yarn pre-build \$1 && doppler run --project mobile --config \$0 -- eas build --platform ios --profile preview --local',
    'build-store-ios': 'yarn pre-build \$1 && doppler run --project mobile --config \$0 -- eas build --platform ios --profile prd --local --non-interactive --output ./store-build.ipa',
    'build-store-android': 'yarn pre-build \$1 && doppler run --project mobile --config \$0 -- eas build --platform android --profile prd --local --non-interactive --output ./store-build.aab',
    'build-store-all': 'yarn build-store-android \$1 && yarn build-store-ios \$1',
    'deploy-store-ios': 'yarn build-store-ios \$1 && doppler run --project mobile --config \$0 -- eas submit --platform ios --profile \$0 --path ./store-build.ipa',
    'deploy-store-android': 'yarn build-store-android \$1 && doppler run --project mobile --config \$0 -- eas submit --platform android --profile \$0 --path ./store-build.aab',
    'deploy-store-all': 'yarn deploy-store-android \$1 && yarn deploy-store-ios \$1',
  };
  const legacyArgPattern = /\$\{?[012](?::-[^}]*)?\}?|\"\$[12]\"/;
  for (const [name, replacement] of Object.entries(newScripts)) {
    if (pkg.scripts[name] && legacyArgPattern.test(pkg.scripts[name])) {
      pkg.scripts[name] = replacement;
      console.log('   Patched: ' + name + ' migrated positional args → ENV var');
      changed = true;
    }
  }
  // Migrate start if it still uses positional args
  if (pkg.scripts['start'] && legacyArgPattern.test(pkg.scripts['start'])) {
    pkg.scripts['start'] = 'yarn i18n && yarn pre-start && yarn start:expo';
    console.log('   Patched: start migrated positional args → ENV var');
    changed = true;
  }
  // Migrate start:expo — slug is embedded so just rewrite arg references in-place
  if (pkg.scripts['start:expo'] && legacyArgPattern.test(pkg.scripts['start:expo'])) {
    pkg.scripts['start:expo'] = pkg.scripts['start:expo']
      .replace(/\$\{1:-([^}]+)\}/g, '\${ENV:-$1}')
      .replace(/\$1(?![:-}])/g, '\$0');
    console.log('   Patched: start:expo migrated positional args → ENV var');
    changed = true;
  }

  // Migrate generate:open-api-spec:
  // 1. doppler run injects raw Doppler key names (no EXPO_PUBLIC_ prefix) — script can't find them
  // 2. the script uses EXPO_PUBLIC_SUPABASE_API_KEY for auth, but /rest/v1/ requires the service role
  //    key; we override it from SUPABASE_SERVICE_ROLE_KEY before node starts (--env-file won't clobber
  //    env vars already set in the shell)
  const openApiSpec = pkg.scripts['generate:open-api-spec'];
  if (openApiSpec && !openApiSpec.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    pkg.scripts['generate:open-api-spec'] =
      "bash -c 'mkdir -p node_modules/@ksairi-org/react-query-sdk/specs && EXPO_PUBLIC_SUPABASE_API_KEY=$(grep ^SUPABASE_SERVICE_ROLE_KEY= .env | cut -d= -f2-) node --env-file=.env node_modules/@ksairi-org/react-query-sdk/scripts/generate-open-api-spec.js'";
    console.log('   Patched: generate:open-api-spec now uses service role key for spec download');
    changed = true;
  }

  // Migrate generate:open-api-hooks: orval reads EXPO_PUBLIC_SERVER_URL from its config at startup
  // in a fresh node process — must load .env so it can find the var
  const openApiHooks = pkg.scripts['generate:open-api-hooks'];
  if (openApiHooks && !openApiHooks.includes('--env-file=.env')) {
    pkg.scripts['generate:open-api-hooks'] =
      'yarn generate:open-api-spec && node --env-file=.env node_modules/.bin/orval --config node_modules/@ksairi-org/react-query-sdk/orval.config.ts';
    console.log('   Patched: generate:open-api-hooks now passes --env-file=.env to orval');
    changed = true;
  }

  // Migrate eas build/submit commands to run via doppler run so that Doppler secrets
  // are in the shell environment when EAS invokes expo prebuild (EAS local builds
  // copy the project to a temp dir without .env, so app.config.ts needs vars from
  // the shell; doppler run injects them with the correct key names)
  const easScripts = ['dev-client-ios','dev-client-android','dev-client-ios-device',
                      'build-store-ios','build-store-android',
                      'deploy-store-ios','deploy-store-android'];
  for (const key of easScripts) {
    const s = pkg.scripts[key];
    if (s && s.includes('eas ') && !s.includes('doppler run')) {
      pkg.scripts[key] = s.replace(/eas (build|submit)/, 'doppler run --project mobile --config $0 -- eas $1');
      console.log('   Patched: ' + key + ' now runs eas via doppler run');
      changed = true;
    }
  }

  // Migrate store/submission builds to a stable (non-timestamped) output filename so the
  // artifact that gets submitted is always the one just built — no relying on \`ls -t … | head -1\`,
  // which could pick a stale build. Dev-client builds keep their -<timestamp> (you often keep
  // several around); only the store builds are overwritten each run.
  const storeMigrations = [
    // build-store: drop the -<timestamp> that precedes the extension
    ['-\$(date +%Y%m%d-%H%M%S).ipa', '.ipa'],
    ['-\$(date +%Y%m%d-%H%M%S).aab', '.aab'],
    // deploy-store: point straight at the fixed filename instead of globbing the newest match
    ['\$(ls -t store-build-\${ENV:-stg}-*.ipa | head -1)', './store-build-\${ENV:-stg}.ipa'],
    ['\$(ls -t store-build-\${ENV:-stg}-*.aab | head -1)', './store-build-\${ENV:-stg}.aab'],
    ['\$(ls -t store-build-*.ipa | head -1)', './store-build.ipa'],
    ['\$(ls -t store-build-*.aab | head -1)', './store-build.aab'],
  ];
  for (const key of ['build-store-ios','build-store-android','deploy-store-ios','deploy-store-android']) {
    const s = pkg.scripts[key];
    if (!s) continue;
    let updated = s;
    for (const [from, to] of storeMigrations) {
      if (updated.includes(from)) updated = updated.split(from).join(to);
    }
    if (updated !== s) {
      pkg.scripts[key] = updated;
      console.log('   Patched: ' + key + ' store build no longer timestamped');
      changed = true;
    }
  }

  // Set packageManager field if missing
  if (!pkg.packageManager) {
    const yarnVer = require('child_process').execSync('yarn --version').toString().trim();
    pkg.packageManager = 'yarn@' + yarnVer;
    console.log('   Added: packageManager=' + pkg.packageManager);
    changed = true;
  } else {
    console.log('   Already present: packageManager');
  }

  if (changed) fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ── 3b. eas.json migrations ──────────────────────────────────────────────────
if [ -f "$APP_ROOT/eas.json" ]; then
  node -e "
    const fs = require('fs');
    const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
    let changed = false;
    if (!eas.cli) { eas.cli = {}; }
    if (!eas.cli.appVersionSource) {
      eas.cli.appVersionSource = 'local';
      console.log('   Patched eas.json: added cli.appVersionSource=local');
      changed = true;
    }
    // Remove empty ascAppId / appleTeamId — EAS fails validation on empty strings
    const ios = eas.submit?.production?.ios;
    if (ios) {
      ['ascAppId', 'appleTeamId', 'appleId'].forEach(k => {
        if (ios[k] === '') { delete ios[k]; console.log('   Patched eas.json: removed empty ' + k); changed = true; }
      });
    }
    if (changed) fs.writeFileSync('eas.json', JSON.stringify(eas, null, 2) + '\n');
  "
fi

# ── 3c. app.config.ts — warn about invalid plugins ───────────────────────────
APP_CONFIG="$APP_ROOT/app.config.ts"
if [ -f "$APP_CONFIG" ]; then
  for _bad_plugin in "react-native-keyboard-controller" "react-native-purchases"; do
    if grep -q "\"$_bad_plugin\"" "$APP_CONFIG"; then
      echo "  ⚠ app.config.ts: '$_bad_plugin' has no config plugin — remove it from the plugins array or the EAS build will fail to read your app config"
    fi
  done
  unset _bad_plugin
fi

# ── 4. env.template.yaml ─────────────────────────────────────────────────────
if [ -f "$ENV_TEMPLATE" ]; then
  if ! grep -q "FIGMA_FILE_ID" "$ENV_TEMPLATE"; then
    echo "→ Adding FIGMA_FILE_ID to env.template.yaml..."
    echo "FIGMA_FILE_ID={{ .FIGMA_FILE_ID }}" >> "$ENV_TEMPLATE"
  else
    echo "→ FIGMA_FILE_ID already in env.template.yaml"
  fi
  if ! grep -q "EXPO_PUBLIC_SERVER_URL" "$ENV_TEMPLATE"; then
    echo "→ Adding EXPO_PUBLIC_SERVER_URL to env.template.yaml..."
    echo "EXPO_PUBLIC_SERVER_URL={{ .SERVER_URL }}" >> "$ENV_TEMPLATE"
  else
    echo "→ EXPO_PUBLIC_SERVER_URL already in env.template.yaml"
  fi
else
  echo "→ Scaffolding env.template.yaml..."
  cat > "$ENV_TEMPLATE" <<'YAML'
FIGMA_API_KEY={{ .FIGMA_API_KEY }}
FIGMA_FILE_ID={{ .FIGMA_FILE_ID }}
# Supabase — stg-first pattern: create stg project first (default), add prod when ready
# Authentication → URL Configuration redirect URLs:
#   stg config:  {app-slug}-stg://
#   prod config: {app-slug}://
SUPABASE_URL={{ .SUPABASE_URL }}
SUPABASE_SERVICE_ROLE_KEY={{ .SUPABASE_SERVICE_ROLE_KEY }}
# Supabase personal access token (account-level, from supabase.com/dashboard/account/tokens)
# Used by the Supabase MCP server to manage projects. Different from the service role key.
SUPABASE_ACCESS_TOKEN={{ .SUPABASE_ACCESS_TOKEN }}
# EXPO_PUBLIC_ prefix makes these available to client-side JS (anon key only — never expose service role)
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY={{ .SUPABASE_PUBLISHABLE_KEY }}
EXPO_PUBLIC_SUPABASE_API_KEY={{ .SUPABASE_API_KEY }}
EXPO_PUBLIC_SERVER_URL={{ .SERVER_URL }}
EXPO_PUBLIC_OPEN_API_SERVER_URL={{ .OPEN_API_SERVER_URL }}

# App identity — used by app.config.ts for scheme, bundle ID, and display name
DISPLAY_NAME={{ .DISPLAY_NAME }}
APP_SCHEMA={{ .APP_SCHEMA }}
APP_IDENTIFIER={{ .APP_IDENTIFIER }}

# Firebase — path to credential files per environment (stg/prod)
GOOGLE_SERVICES_INFOPLIST_PATH={{ .GOOGLE_SERVICES_INFOPLIST_PATH }}
GOOGLE_SERVICES_JSON_PATH={{ .GOOGLE_SERVICES_JSON_PATH }}

# Optional: Sentry — uncomment and set in Doppler (one project, stg + prd environments)
# EXPO_PUBLIC_ENV={{ .EXPO_PUBLIC_ENV }}
# EXPO_PUBLIC_SENTRY_DSN={{ .SENTRY_DSN }}
# SENTRY_AUTH_TOKEN={{ .SENTRY_AUTH_TOKEN }}
# SENTRY_ORG={{ .SENTRY_ORG }}
# SENTRY_PROJECT={{ .SENTRY_PROJECT }}

# Optional: Stripe — uncomment and add secrets in Doppler
# EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY={{ .STRIPE_PUBLISHABLE_KEY }}

# Optional: RevenueCat — single key for both iOS and Android (no platform split)
# IMPORTANT: digital goods/subscriptions consumed in-app MUST use IAP (RevenueCat), NOT Stripe
# RC_MCP_API_KEY is the v2 API write key for the RevenueCat MCP (not the SDK key)
# EXPO_PUBLIC_RC_API_KEY={{ .REVENUECAT_API_KEY }}
# RC_MCP_API_KEY={{ .RC_MCP_API_KEY }}

# Optional: Social auth (Apple + Google sign-in via Supabase)
# EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID={{ .GOOGLE_WEB_CLIENT_ID }}
# EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID={{ .GOOGLE_IOS_CLIENT_ID }}
# EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID={{ .GOOGLE_ANDROID_CLIENT_ID }}
# EXPO_PUBLIC_ANDROID_APPLE_SIGN_IN_CLIENT_ID={{ .ANDROID_APPLE_SIGN_IN_CLIENT_ID }}
# EXPO_PUBLIC_ANDROID_APPLE_CALLBACK={{ .ANDROID_APPLE_SIGN_IN_CALLBACK }}

# Optional: Firebase notifications — uncomment and add secrets in Doppler
# FIREBASE_SERVER_KEY={{ .FIREBASE_SERVER_KEY }}
YAML
  echo "   Created: env.template.yaml"
fi

# ── 5. .gitignore ─────────────────────────────────────────────────────────────
GITIGNORE="$APP_ROOT/.gitignore"
_ensure_gitignore() {
  local pattern="$1"
  if [ -f "$GITIGNORE" ]; then
    if ! grep -qxF "$pattern" "$GITIGNORE"; then
      echo "$pattern" >> "$GITIGNORE"
      echo "→ Added $pattern to .gitignore"
    fi
  else
    echo "$pattern" > "$GITIGNORE"
    echo "→ Created .gitignore with $pattern"
  fi
}
_ensure_gitignore ".env"
_ensure_gitignore "*.ipa"
_ensure_gitignore "*.aab"
_ensure_gitignore "*.apk"
_ensure_gitignore "*.tar.gz"
unset -f _ensure_gitignore

# ── 5b. Expo SDK upgrade ─────────────────────────────────────────────────────
echo "→ Checking Expo SDK version..."
if command -v expo &>/dev/null; then
  yarn expo install expo@latest --fix --silent 2>/dev/null || \
    yarn dlx expo-cli install expo@latest --fix --silent 2>/dev/null || true
  echo "   Expo SDK upgraded to latest"
else
  echo "   ⚠ expo CLI not found globally — run 'yarn expo install expo@latest --fix' manually"
fi

# ── 6. LSP ───────────────────────────────────────────────────────────────────
LSP_FILE="$APP_ROOT/.lsp.json"
if [ ! -f "$LSP_FILE" ]; then
  echo "→ Creating .lsp.json..."
  cat > "$LSP_FILE" <<'JSON'
{
  "languages": [
    {
      "language": "typescript",
      "command": ["./node_modules/.bin/typescript-language-server", "--stdio"]
    }
  ]
}
JSON
  echo "   Created: .lsp.json"
fi

if ! node -e "process.exit(require('./package.json').devDependencies?.['typescript-language-server'] ? 0 : 1)" 2>/dev/null; then
  echo "→ Installing typescript-language-server and typescript..."
  yarn add -D typescript-language-server typescript --silent
  echo "   Done"
else
  echo "→ typescript-language-server already installed"
fi

# ── 6b. Install standard devDependencies ─────────────────────────────────────
echo "→ Installing standard devDependencies..."

_needs_install() {
  ! node -e "process.exit(require('./package.json').devDependencies?.['$1'] || require('./package.json').dependencies?.['$1'] ? 0 : 1)" 2>/dev/null
}

_missing_dev_pkgs=""
for _pkg in jest-expo "@types/jest" "@testing-library/react-native" \
            react-test-renderer "@types/react-test-renderer" \
            orval "@commitlint/cli" "@commitlint/config-conventional" \
            husky tsx \
            react-native-svg-transformer babel-plugin-inline-import \
            prettier eslint-config-prettier \
            "@phenomnomnominal/tsquery" inflected \
            expo-doctor; do
  _needs_install "$_pkg" && _missing_dev_pkgs="$_missing_dev_pkgs $_pkg"
done
if [ -n "$_missing_dev_pkgs" ]; then
  # shellcheck disable=SC2086
  yarn add --dev $( echo "$_missing_dev_pkgs" | xargs ) --silent
  echo "   Installed devDeps:$_missing_dev_pkgs"
else
  echo "   All devDependencies already installed"
fi
unset _pkg _missing_dev_pkgs

for _pkg in \
            "@ksairi-org/expo-image" \
            "@ksairi-org/react-auth-client" "@ksairi-org/react-auth-core" \
            "@ksairi-org/react-auth-hooks" "@ksairi-org/react-auth-setup" "@ksairi-org/react-auth-storage" \
            "@ksairi-org/react-form" \
            "@ksairi-org/react-query-sdk" \
            "@ksairi-org/react-native-splash-view" \
            react-hook-form "@hookform/resolvers" \
            react-native-svg rive-react-native \
            "@react-native-firebase/app" "@react-native-firebase/analytics" "@react-native-firebase/messaging" \
            expo-notifications expo-dev-client; do
  if _needs_install "$_pkg"; then
    yarn add "$_pkg" --silent
    echo "   Installed: $_pkg"
  else
    echo "   Already installed: $_pkg"
  fi
done
unset _pkg

# ── 6c. Husky init ────────────────────────────────────────────────────────────
echo "→ Initialising husky..."
if [ ! -d "$APP_ROOT/.husky/_" ]; then
  yarn husky init
  # husky init creates a default pre-commit — replace with our hook set
  cp "$PLUGIN_ROOT/templates/.husky/pre-commit" "$APP_ROOT/.husky/pre-commit"
  chmod +x "$APP_ROOT/.husky/pre-commit"
  echo "   Initialised"
else
  echo "   Already initialised"
fi

# ── 7. Doppler project link ───────────────────────────────────────────────────
# Convention: workspace = app name, project = platform (mobile / web)
echo ""
_doppler_already_set=$(doppler configure get enclave.project --scope "$APP_ROOT" --plain 2>/dev/null || true)
if [ "$_doppler_already_set" = "mobile" ]; then
  echo "→ Doppler already configured (project=mobile)"
else
  echo "→ Creating Doppler project 'mobile'..."
  echo "   Convention: workspace = app name ($(doppler me --json 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');try{console.log(JSON.parse(d).workplace.name)}catch{console.log('?')}")), project = platform"
  echo "   Required secrets: FIGMA_API_KEY, FIGMA_FILE_ID, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN, SERVER_URL, OPEN_API_SERVER_URL"

  # Create the project (no-op if it already exists)
  doppler projects create mobile 2>/dev/null || true

  # Scope this directory to mobile/stg (stg = local dev + staging combined)
  doppler configure set enclave.project mobile --scope "$APP_ROOT"
  doppler configure set enclave.config stg --scope "$APP_ROOT"
  echo "   Linked: $APP_ROOT → mobile/stg"
fi
unset _doppler_already_set

# ── 7b. Write Doppler project/config back to mcp.config.json ─────────────────
_dp=$(doppler configure get enclave.project --scope "$APP_ROOT" --plain 2>/dev/null || true)
_dc=$(doppler configure get enclave.config  --scope "$APP_ROOT" --plain 2>/dev/null || true)
if [ -n "$_dp" ]; then
  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$APP_ROOT/mcp.config.json', 'utf8'));
    cfg.doppler = { project: '${_dp}', config: '${_dc:-stg}' };
    fs.writeFileSync('$APP_ROOT/mcp.config.json', JSON.stringify(cfg, null, 2) + '\n');
  "
  echo "→ Wrote doppler.project=${_dp}, doppler.config=${_dc:-stg} to mcp.config.json"
fi
unset _dp _dc

# ── 7c. Seed Doppler secrets (stg + prod) ────────────────────────────────────
echo "→ Seeding Doppler secrets for stg and prod..."

# Derive display name and bundle base from app slug
APP_DISPLAY_NAME=$(node -e "
  const slug = '$APP_SLUG';
  console.log(slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
")
# Bundle ID base: strip hyphens/underscores (reflect → reflect, my-app → myapp)
APP_BUNDLE_BASE=$(echo "$APP_SLUG" | tr -d '-_')

_doppler_set_env() {
  local _config="$1" _key="$2" _val="$3"
  doppler secrets set "${_key}=${_val}" --project mobile --config "$_config" --silent 2>/dev/null || \
    echo "   ⚠ Could not set ${_key} in ${_config} — set manually in Doppler"
}

# stg
_doppler_set_env stg DISPLAY_NAME              "${APP_DISPLAY_NAME} Stg"
_doppler_set_env stg APP_IDENTIFIER            "com.${APP_BUNDLE_BASE}.stg"
_doppler_set_env stg APP_SCHEMA                "${APP_SLUG}-stg"
_doppler_set_env stg GOOGLE_SERVICES_INFOPLIST_PATH "./GoogleService-Info-stg.plist"
_doppler_set_env stg GOOGLE_SERVICES_JSON_PATH "./google-services-stg.json"
echo "   ✓ stg: DISPLAY_NAME=${APP_DISPLAY_NAME} Stg, APP_IDENTIFIER=com.${APP_BUNDLE_BASE}.stg"

# prd (Doppler's default production config name; our scripts expose it as 'prod' with a mapping in sync-env-vars)
_doppler_set_env prd DISPLAY_NAME              "${APP_DISPLAY_NAME}"
_doppler_set_env prd APP_IDENTIFIER            "com.${APP_BUNDLE_BASE}"
_doppler_set_env prd APP_SCHEMA                "${APP_SLUG}"
_doppler_set_env prd GOOGLE_SERVICES_INFOPLIST_PATH "./GoogleService-Info-prod.plist"
_doppler_set_env prd GOOGLE_SERVICES_JSON_PATH "./google-services-prod.json"
echo "   ✓ prd: DISPLAY_NAME=${APP_DISPLAY_NAME}, APP_IDENTIFIER=com.${APP_BUNDLE_BASE}"

unset APP_DISPLAY_NAME APP_BUNDLE_BASE

# ── 7d. Firebase credential placeholder files ─────────────────────────────────
echo "→ Creating Firebase credential placeholder files..."

_firebase_plist() {
  local _path="$1"
  if [ ! -f "$_path" ]; then
    cat > "$_path" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Replace with the real GoogleService-Info.plist from Firebase console:
       Project Settings → Your Apps → iOS app → Download GoogleService-Info.plist -->
</dict>
</plist>
PLIST
    echo "   Created placeholder: $_path"
  else
    echo "   Already exists: $_path"
  fi
}

_firebase_json() {
  local _path="$1"
  if [ ! -f "$_path" ]; then
    cat > "$_path" <<'JSON'
{
  "_placeholder": "Replace with the real google-services.json from Firebase console: Project Settings → Your Apps → Android app → Download google-services.json"
}
JSON
    echo "   Created placeholder: $_path"
  else
    echo "   Already exists: $_path"
  fi
}

_firebase_plist "$APP_ROOT/GoogleService-Info-stg.plist"
_firebase_plist "$APP_ROOT/GoogleService-Info-prod.plist"
_firebase_json  "$APP_ROOT/google-services-stg.json"
_firebase_json  "$APP_ROOT/google-services-prod.json"

# ── 8. Optional service wizard ────────────────────────────────────────────────
# Ask which optional services the user wants to configure now. For each yes:
# prompt for credentials and store them in Doppler. All MCP servers are always
# provided by the plugin itself — unconfigured ones show red so the user knows
# what's pending. Re-run this script any time to fill in more services.

_ask() {
  local label="$1" hint="${2:-}"
  local yn
  [ -n "$hint" ] && printf "   %s (%s)? [y/N] " "$label" "$hint" || printf "   %s? [y/N] " "$label"
  read -r yn
  [[ "$yn" =~ ^[Yy]$ ]]
}

_doppler_set() {
  doppler secrets set "$1=$2" --silent 2>/dev/null || true
}

if [ -t 0 ]; then
  echo ""
  echo "→ Optional services — add credentials now or skip (red MCP = not yet configured)"

  # ── Supabase management MCP ─────────────────────────────────────────────────
  _supa_token=$(doppler secrets get SUPABASE_ACCESS_TOKEN --plain 2>/dev/null || true)
  if [ -z "$_supa_token" ] && _ask "Supabase management MCP" "create projects, run migrations via Claude"; then
    read -rp "   Personal access token (supabase.com/dashboard/account/tokens): " _supa_token
    [ -n "$_supa_token" ] && _doppler_set SUPABASE_ACCESS_TOKEN "$_supa_token" && echo "   ✓ saved"
  fi
  unset _supa_token

  # ── Supabase Edge Functions ───────────────────────────────────────────────────
  if [ ! -d "$APP_ROOT/supabase" ] && _ask "Supabase Edge Functions" "local functions dev, migrations as code, type generation"; then
    if command -v supabase &>/dev/null; then
      echo "   Running: supabase init"
      supabase init --workdir "$APP_ROOT"
      echo "   ✓ supabase/ directory created — run 'supabase link' to connect to your project"
    else
      echo "   ⚠ supabase CLI not found — install with: brew install supabase/tap/supabase"
      echo "     Then run: supabase init && supabase link"
    fi
  fi

  # ── Figma ────────────────────────────────────────────────────────────────────
  _figma_key=$(doppler secrets get FIGMA_API_KEY --plain 2>/dev/null || true)
  if [ -z "$_figma_key" ] && _ask "Figma MCP" "sync design tokens, inspect components"; then
    read -rp "   Figma API key (figma.com/settings > Personal access tokens): " _figma_key
    read -rp "   Figma file ID (from your Figma file URL): " _figma_file
    [ -n "$_figma_key" ]  && _doppler_set FIGMA_API_KEY "$_figma_key"
    [ -n "$_figma_file" ] && _doppler_set FIGMA_FILE_ID "$_figma_file"
    [ -n "$_figma_key" ]  && echo "   ✓ saved"
  fi
  unset _figma_key _figma_file

  # ── Sentry ───────────────────────────────────────────────────────────────────
  _sentry_org=$(doppler secrets get SENTRY_ORG --plain 2>/dev/null || true)
  _sentry_proj=$(doppler secrets get SENTRY_PROJECT --plain 2>/dev/null || true)
  if [ -f "$APP_ROOT/sentry.properties" ]; then
    _sentry_proj=$(grep "^defaults.project=" "$APP_ROOT/sentry.properties" | cut -d= -f2 || true)
  fi
  if [ -z "$_sentry_org" ] && _ask "Sentry MCP" "query errors and performance data via Claude"; then
    read -rp "   Sentry org slug: " _sentry_org
    read -rp "   Sentry project slug: " _sentry_proj
    read -rp "   Sentry auth token (sentry.io/settings/account/api/auth-tokens): " _sentry_token
    read -rp "   Sentry DSN (from project settings): " _sentry_dsn
    [ -n "$_sentry_org" ]   && _doppler_set SENTRY_ORG "$_sentry_org"
    [ -n "$_sentry_proj" ]  && _doppler_set SENTRY_PROJECT "$_sentry_proj"
    [ -n "$_sentry_token" ] && _doppler_set SENTRY_AUTH_TOKEN "$_sentry_token"
    [ -n "$_sentry_dsn" ]   && _doppler_set SENTRY_DSN "$_sentry_dsn"
    [ -n "$_sentry_org" ]   && echo "   ✓ saved"
  fi
  unset _sentry_org _sentry_proj _sentry_token _sentry_dsn

  # ── Stripe ───────────────────────────────────────────────────────────────────
  _stripe_key=$(doppler secrets get STRIPE_SECRET_KEY --plain 2>/dev/null || true)
  if [ -z "$_stripe_key" ] && _ask "Stripe MCP" "manage products, prices, customers via Claude"; then
    read -rp "   Stripe secret key (dashboard.stripe.com/apikeys): " _stripe_key
    read -rp "   Stripe publishable key: " _stripe_pub
    [ -n "$_stripe_key" ] && _doppler_set STRIPE_SECRET_KEY "$_stripe_key"
    [ -n "$_stripe_pub" ] && _doppler_set STRIPE_PUBLISHABLE_KEY "$_stripe_pub"
    [ -n "$_stripe_key" ] && echo "   ✓ saved"
  fi
  unset _stripe_key _stripe_pub

  # ── Firebase ─────────────────────────────────────────────────────────────────
  if _ask "Firebase MCP" "manage Firestore, Auth, Storage via Claude"; then
    echo "   ✓ Firebase MCP uses CLI auth — run 'firebase login' if not already authenticated"
  fi
fi

# ── 9. Patch CLAUDE.md with values from Doppler ──────────────────────────────
# Gather all values first, then do one replacement so placeholder variants
# can't cause mismatches (e.g. if Figma is absent the original placeholder
# still contains ", Figma file ID" — chained seds would silently no-op).

FIGMA_FILE_ID_VAL=$(doppler secrets get FIGMA_FILE_ID --plain 2>/dev/null || true)

SUPABASE_REF=""
SUPABASE_URL_VAL=$(doppler secrets get SUPABASE_URL --plain 2>/dev/null || true)
if [ -n "$SUPABASE_URL_VAL" ]; then
  SUPABASE_REF=$(echo "$SUPABASE_URL_VAL" | sed 's|https://||;s|\.supabase\.co.*||')
fi

SENTRY_PROJECT_VAL=$(doppler secrets get SENTRY_PROJECT --plain 2>/dev/null || true)
if [ -z "$SENTRY_PROJECT_VAL" ] && [ -f "$APP_ROOT/sentry.properties" ]; then
  SENTRY_PROJECT_VAL=$(grep "^defaults.project=" "$APP_ROOT/sentry.properties" | cut -d= -f2 || true)
fi

# Build replacement: bullet lines for found values + one remaining placeholder
REMAINING_FIELDS="API base URL"
[ -z "$FIGMA_FILE_ID_VAL" ] && REMAINING_FIELDS="${REMAINING_FIELDS}, Figma file ID"
[ -z "$SUPABASE_REF" ]       && REMAINING_FIELDS="${REMAINING_FIELDS}, Supabase project ref"
[ -z "$SENTRY_PROJECT_VAL" ] && REMAINING_FIELDS="${REMAINING_FIELDS}, Sentry project"

FIGMA_FILE_ID_VAL="$FIGMA_FILE_ID_VAL" \
SUPABASE_REF="$SUPABASE_REF" \
SENTRY_PROJECT_VAL="$SENTRY_PROJECT_VAL" \
REMAINING_FIELDS="$REMAINING_FIELDS" \
node -e "
  const fs = require('fs');
  const { FIGMA_FILE_ID_VAL, SUPABASE_REF, SENTRY_PROJECT_VAL, REMAINING_FIELDS } = process.env;
  const lines = [];
  if (FIGMA_FILE_ID_VAL)   lines.push('- Figma file ID: ' + FIGMA_FILE_ID_VAL);
  if (SUPABASE_REF)        lines.push('- Supabase project ref: ' + SUPABASE_REF);
  if (SENTRY_PROJECT_VAL)  lines.push('- Sentry project: ' + SENTRY_PROJECT_VAL);
  lines.push('<!-- Fill in: ' + REMAINING_FIELDS + ' -->');
  const content = fs.readFileSync('$APP_ROOT/CLAUDE.md', 'utf8');
  const updated = content.replace(
    /<!-- Fill in:[^>]+ -->/,
    lines.join('\n')
  );
  fs.writeFileSync('$APP_ROOT/CLAUDE.md', updated);
"

[ -n "$FIGMA_FILE_ID_VAL" ] && echo "→ Patched CLAUDE.md with Figma file ID"
[ -n "$SUPABASE_REF" ]       && echo "→ Patched CLAUDE.md with Supabase project ref"
[ -n "$SENTRY_PROJECT_VAL" ] && echo "→ Patched CLAUDE.md with Sentry project"

# ── Git branches ──────────────────────────────────────────────────────────────
if git -C "$APP_ROOT" rev-parse --git-dir &>/dev/null; then
  _current_branch=$(git -C "$APP_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if git -C "$APP_ROOT" show-ref --verify --quiet refs/heads/stg; then
    echo "→ Branch 'stg' already exists"
  else
    git -C "$APP_ROOT" checkout -b stg
    echo "→ Created and checked out branch 'stg'"
    # Push stg so CI branch triggers work from day one
    if git -C "$APP_ROOT" remote get-url origin &>/dev/null; then
      git -C "$APP_ROOT" push -u origin stg
      echo "→ Pushed 'stg' to origin"
    fi
    # Return to previous branch (usually main)
    [ -n "$_current_branch" ] && git -C "$APP_ROOT" checkout "$_current_branch"
  fi
  unset _current_branch
else
  echo "  ⚠ Not a git repository — skipping branch setup. Run 'git init' first."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "✓ Done. Next steps:"
if [ "$REMAINING_FIELDS" = "API base URL" ]; then
  echo "  1. Edit CLAUDE.md — fill in: API base URL (only remaining field)"
else
  echo "  1. Edit CLAUDE.md — fill in: ${REMAINING_FIELDS}"
fi
echo "  2. Review mcp.config.json — paths were auto-detected, adjust if needed"
echo "  3. Add your Rive splash: place assets/animations/splash.riv in the project root"
echo "     (app/_layout.tsx already imports it — the app won't bundle without it)"
echo "  4. Supabase setup (stg-first pattern):"
echo "     a. Create stg project first (default env) — set all env vars, auth providers, schema"
echo "     b. Supabase → Authentication → URL Configuration:"
echo "        stg:  ${SLUG}-stg://"
echo "        prod: ${SLUG}://"
echo "     c. Social auth (Google/Apple): configure OAuth providers in Supabase Auth → Providers"
echo "        Google needs: Web Client ID, iOS Client ID, Android Client ID (from Google Cloud)"
echo "        Apple needs: Service ID + private key (from Apple Developer portal)"
echo "     d. When ready for prod: create prod Supabase project with same schema/auth config"
echo "        Use 'yarn start prd' / 'yarn dev-client-android prd' to target prod env"
echo "  5. Start Claude: claude"
echo ""
echo "   Env vars sync automatically on every 'yarn start' via pre-start."
echo "   Run 'yarn start prd' or 'yarn dev-client-ios prd' to target production."
