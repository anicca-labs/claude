# shellcheck shell=bash
# Stop hook: if UI source files changed but haven't been visually verified this
# turn, block once and tell Claude to run the `preview` skill before finishing.
# Advisory-with-teeth: blocks at most once per distinct set of UI changes (loop-
# guarded by a hash marker), so it never spins. Non-visual work is never blocked.
set -uo pipefail

# Only meaningful inside a git working tree.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Everything changed vs HEAD, plus new untracked files.
CHANGED=$( { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | sort -u )
[ -n "$CHANGED" ] || exit 0

# Keep only UI source; drop generated code and tests/stories.
UI=$(printf '%s\n' "$CHANGED" \
  | grep -E '\.tsx$|(^|/)(src/app|src/components|src/screens|src/theme)/' \
  | grep -vE '\.test\.tsx$|\.stories\.tsx$|(^|/)(generated|orval|__tests__)/' \
  || true)
[ -n "$UI" ] || exit 0

# Loop guard: block only when this exact set of UI changes hasn't been flagged yet.
GITDIR=$(git rev-parse --git-dir 2>/dev/null) || exit 0
MARKER="$GITDIR/.rn-preview-verified"
HASH=$(printf '%s' "$UI" | git hash-object --stdin 2>/dev/null || printf '%s' "$UI" | cksum | tr -d ' ')

if [ -f "$MARKER" ] && [ "$(cat "$MARKER" 2>/dev/null)" = "$HASH" ]; then
  exit 0
fi
printf '%s' "$HASH" > "$MARKER" 2>/dev/null || true

COUNT=$(printf '%s\n' "$UI" | grep -c .)
REASON="$COUNT UI file(s) changed this turn but were not visually verified. Run the preview skill (simulator screenshot + device errors + tsc) and confirm the screenshot matches the task before finishing. If the change is genuinely non-visual (types, logic, or config only), you may stop."

python3 - "$REASON" <<'PY' 2>/dev/null || printf '{"decision":"block","reason":"%s"}\n' "$REASON"
import json, sys
print(json.dumps({"decision": "block", "reason": sys.argv[1]}))
PY
exit 0
