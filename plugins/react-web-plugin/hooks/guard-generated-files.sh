#!/usr/bin/env bash
# Warns when Claude attempts to edit generated files directly.
set -euo pipefail

TOOL_INPUT=$(cat)
if [[ -z "$TOOL_INPUT" ]]; then
  exit 0
fi

FILE_PATH=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path','') or d.get('path',''))" 2>/dev/null || echo "")

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

if echo "$FILE_PATH" | grep -qE '(generated|orval)/'; then
  # shellcheck disable=SC2016
  echo '{"type":"warning","message":"This is a generated file. Edit the source spec and re-run the codegen command (see package.json scripts) instead of editing manually."}'
  exit 2
fi

if echo "$FILE_PATH" | grep -qE 'database\.types\.ts$'; then
  # shellcheck disable=SC2016
  echo '{"type":"warning","message":"database.types.ts is generated from the live schema. Apply a migration and run `yarn dlx supabase gen types typescript` (or the project'"'"'s `yarn generate:db-types` script) instead of editing manually."}'
  exit 2
fi

if echo "$FILE_PATH" | grep -qE '(^|/)\.next/'; then
  # shellcheck disable=SC2016
  echo '{"type":"warning","message":".next/ is Next.js build output — never edit it. Change the source and rebuild."}'
  exit 2
fi
