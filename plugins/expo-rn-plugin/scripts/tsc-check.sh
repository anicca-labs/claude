#!/usr/bin/env bash
# PostToolUse hook — runs tsc --noEmit after file edits in TypeScript projects.
# Exits silently on success; prints errors and exits 1 on failure.

# Skip non-code edits (markdown, json, assets, etc.) so a full type-check only
# runs when the touched file can actually affect compilation. The matcher only
# scopes by tool name, so the extension filter lives here.
INPUT=$(cat 2>/dev/null || true)
FILE_PATH=$(printf '%s' "$INPUT" \
  | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | head -1 \
  | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//')

if [ -n "$FILE_PATH" ]; then
  case "$FILE_PATH" in
    *.ts | *.tsx | *.cts | *.mts | *.js | *.jsx | *.cjs | *.mjs) ;;
    *) exit 0 ;;
  esac
fi

# Only run if this is a TypeScript project
if [ ! -f "tsconfig.json" ]; then
  exit 0
fi

# Prefer local tsc (installed by setup-app.sh); fall back to global
TSC="./node_modules/.bin/tsc"
[ -x "$TSC" ] || TSC="tsc"
command -v "$TSC" &>/dev/null || exit 0

# Run tsc, suppress success output, surface errors only
OUTPUT=$("$TSC" --noEmit --pretty false 2>&1) || {
  echo "$OUTPUT"
  exit 1
}
