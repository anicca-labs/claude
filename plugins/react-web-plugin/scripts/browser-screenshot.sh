#!/usr/bin/env bash
# Captures a screenshot of the running Next.js dev server via Playwright.
# Outputs the absolute path of the saved PNG to stdout.
# Diagnostics (dev-server status, Playwright hints) go to stderr so the preview
# skill can surface them.
#
# Usage: browser-screenshot.sh [route] [base_url]
#   route     — path to capture, default "/" (e.g. "/dashboard/settings")
#   base_url  — dev server origin, default $PREVIEW_BASE_URL or http://localhost:3000

set -euo pipefail

ROUTE="${1:-/}"
BASE_URL="${2:-${PREVIEW_BASE_URL:-http://localhost:3000}}"
BASE_URL="${BASE_URL%/}"
case "$ROUTE" in
  /*) ;;
  *) ROUTE="/$ROUTE" ;;
esac
URL="${BASE_URL}${ROUTE}"
OUTFILE="${TMPDIR:-/tmp}/web-preview-$(date +%s).png"

# --- Dev server check -------------------------------------------------------
# Any HTTP response (including 404/500) means the server is up; only a refused
# connection / timeout means it isn't.
if ! curl -s -o /dev/null --max-time 5 "$BASE_URL" 2>/dev/null; then
  echo "ERROR: No dev server responding at $BASE_URL. Start it with 'yarn dev' (or pass the correct base URL as the second argument / PREVIEW_BASE_URL)." >&2
  exit 1
fi

# --- Screenshot --------------------------------------------------------------
# Prefer the project-local Playwright (installed as a devDependency alongside
# @playwright/test); fall back to a one-off yarn dlx invocation.
PLAYWRIGHT="./node_modules/.bin/playwright"
if [ -x "$PLAYWRIGHT" ]; then
  RUN=("$PLAYWRIGHT")
elif command -v yarn &>/dev/null; then
  RUN=(yarn dlx playwright)
else
  echo "ERROR: Playwright not found. Install it with 'yarn add -D @playwright/test' then 'yarn playwright install chromium'." >&2
  exit 1
fi

if ! "${RUN[@]}" screenshot \
  --browser chromium \
  --viewport-size "1280,800" \
  --wait-for-timeout 2000 \
  --full-page \
  "$URL" "$OUTFILE" >&2; then
  echo "ERROR: Playwright screenshot failed. If the browser binary is missing, run 'yarn playwright install chromium' (or 'yarn dlx playwright install chromium') and retry." >&2
  exit 1
fi

echo "--- HTTP status for $URL ---" >&2
curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 "$URL" >&2 || true
echo "Note: runtime/server errors appear in the terminal running 'yarn dev'; client console errors are visible on the page overlay in dev mode." >&2

echo "$OUTFILE"
