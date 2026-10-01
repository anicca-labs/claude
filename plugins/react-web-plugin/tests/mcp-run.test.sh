#!/usr/bin/env bash
# Tests for bin/mcp-run.sh — run: bash plugins/react-web-plugin/tests/mcp-run.test.sh
#
# Each case builds a throwaway project dir, runs the launcher with `env` as the
# "server" command, and asserts on the environment the server would receive.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RUN="$HERE/../bin/mcp-run.sh"
PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

ok()   { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf '  FAIL %s\n' "$1"; [ -n "${2:-}" ] && printf '       %s\n' "$2"; }

has_line()  { printf '%s\n' "$1" | grep -qxF -- "$2"; }
has_key()   { printf '%s\n' "$1" | grep -q "^$2="; }

# new_project <name> → prints a fresh project dir (cwd for the launcher)
new_project() {
  local d="$TMP_ROOT/$1"
  mkdir -p "$d"
  printf '%s' "$d"
}

# run_in <dir> [launcher args...] → stdout+stderr of the launcher, exit code in $RC.
# Starts from a near-empty environment so only what the test sets is inherited.
run_in() {
  local dir="$1"; shift
  OUT="$(cd "$dir" && env -i PATH="$PATH" HOME="$HOME" ${EXTRA_ENV:-} bash "$RUN" "$@" 2>&1)"
  RC=$?
}

echo "mcp-run.sh"

# --- 1. only declared keys reach the server --------------------------------
P=$(new_project allowlist)
cat > "$P/secrets.env" <<'EOF'
STRIPE_SECRET_KEY=sk_test_123
RENDER_API_KEY=rnd_abc
AWS_SECRET_ACCESS_KEY=aws_secret
EOF
printf '{ "envFile": "secrets.env" }' > "$P/mcp.config.json"
run_in "$P" --keys "STRIPE_SECRET_KEY" -- env
if [ "$RC" -eq 0 ] && has_line "$OUT" "STRIPE_SECRET_KEY=sk_test_123" \
   && ! has_key "$OUT" RENDER_API_KEY && ! has_key "$OUT" AWS_SECRET_ACCESS_KEY; then
  ok "server receives only the keys it declares"
else
  fail "server receives only the keys it declares" "$OUT"
fi

# --- 2. inherited secrets are scrubbed, baseline survives ------------------
P=$(new_project scrub)
EXTRA_ENV="GITHUB_PERSONAL_ACCESS_TOKEN=ghp_leak DOPPLER_TOKEN=dp_leak LANG=en_US.UTF-8" \
  run_in "$P" --keys "STRIPE_SECRET_KEY" -- env
if ! has_key "$OUT" GITHUB_PERSONAL_ACCESS_TOKEN && ! has_key "$OUT" DOPPLER_TOKEN \
   && has_key "$OUT" PATH && has_key "$OUT" HOME && has_line "$OUT" "LANG=en_US.UTF-8"; then
  ok "undeclared inherited variables are dropped; PATH/HOME/LANG kept"
else
  fail "undeclared inherited variables are dropped; PATH/HOME/LANG kept" "$OUT"
fi

# --- 3. a declared key can still come from the inherited environment -------
P=$(new_project inherit)
EXTRA_ENV="RENDER_API_KEY=rnd_from_shell" run_in "$P" --keys "RENDER_API_KEY" -- env
if has_line "$OUT" "RENDER_API_KEY=rnd_from_shell"; then
  ok "declared key passes through from the inherited environment"
else
  fail "declared key passes through from the inherited environment" "$OUT"
fi

# --- 4. env file is data, never executed -----------------------------------
P=$(new_project nocode)
cat > "$P/secrets.env" <<EOF
STRIPE_SECRET_KEY=\$(touch $P/pwned-subshell)
\`touch $P/pwned-backtick\`
touch $P/pwned-bare
RENDER_API_KEY=ok; touch $P/pwned-semicolon
EOF
printf '{ "envFile": "secrets.env" }' > "$P/mcp.config.json"
run_in "$P" --keys "STRIPE_SECRET_KEY RENDER_API_KEY" -- env
if [ ! -e "$P/pwned-subshell" ] && [ ! -e "$P/pwned-backtick" ] && [ ! -e "$P/pwned-bare" ] \
   && [ ! -e "$P/pwned-semicolon" ] \
   && has_line "$OUT" "STRIPE_SECRET_KEY=\$(touch $P/pwned-subshell)" \
   && has_line "$OUT" "RENDER_API_KEY=ok; touch $P/pwned-semicolon"; then
  ok "env file lines are read literally, nothing is executed"
else
  fail "env file lines are read literally, nothing is executed" "$(ls "$P"; echo; echo "$OUT")"
fi

# --- 5. env file syntax: comments, export, quotes, CRLF ---------------------
P=$(new_project syntax)
printf '# comment\n\nexport STRIPE_SECRET_KEY="sk_quoted"\nRENDER_API_KEY='"'"'rnd single'"'"'\r\nAWS_REGION=us-west-2\n' > "$P/secrets.env"
printf '{ "envFile": "secrets.env" }' > "$P/mcp.config.json"
run_in "$P" --keys "STRIPE_SECRET_KEY RENDER_API_KEY AWS_REGION" -- env
if has_line "$OUT" "STRIPE_SECRET_KEY=sk_quoted" && has_line "$OUT" "RENDER_API_KEY=rnd single" \
   && has_line "$OUT" "AWS_REGION=us-west-2"; then
  ok "handles comments, export prefix, quotes and CRLF"
else
  fail "handles comments, export prefix, quotes and CRLF" "$OUT"
fi

# --- 6. --set pins win over the env file and the inherited env -------------
P=$(new_project pins)
printf 'READ_OPERATIONS_ONLY=false\n' > "$P/secrets.env"
printf '{ "envFile": "secrets.env" }' > "$P/mcp.config.json"
EXTRA_ENV="READ_OPERATIONS_ONLY=false" \
  run_in "$P" --keys "READ_OPERATIONS_ONLY" --set READ_OPERATIONS_ONLY=true -- env
if has_line "$OUT" "READ_OPERATIONS_ONLY=true" && ! has_line "$OUT" "READ_OPERATIONS_ONLY=false"; then
  ok "--set values cannot be overridden by the env file or shell"
else
  fail "--set values cannot be overridden by the env file or shell" "$OUT"
fi

# --- 7. env file committed to the repo is refused --------------------------
P=$(new_project tracked)
git -C "$P" init -q
printf 'STRIPE_SECRET_KEY=sk_attacker\n' > "$P/secrets.env"
printf '{ "envFile": "secrets.env" }' > "$P/mcp.config.json"
git -C "$P" add secrets.env mcp.config.json
run_in "$P" --keys "STRIPE_SECRET_KEY" -- echo SERVER_STARTED
if [ "$RC" -ne 0 ] && ! printf '%s' "$OUT" | grep -q SERVER_STARTED \
   && printf '%s' "$OUT" | grep -qi "tracked by git"; then
  ok "refuses an env file that is committed to the repo"
else
  fail "refuses an env file that is committed to the repo" "rc=$RC $OUT"
fi

# --- 8. gitignored env file inside the repo is fine ------------------------
P=$(new_project ignored)
git -C "$P" init -q
printf 'secrets.env\n' > "$P/.gitignore"
printf 'STRIPE_SECRET_KEY=sk_local\n' > "$P/secrets.env"
printf '{ "envFile": "secrets.env" }' > "$P/mcp.config.json"
run_in "$P" --keys "STRIPE_SECRET_KEY" -- env
if [ "$RC" -eq 0 ] && has_line "$OUT" "STRIPE_SECRET_KEY=sk_local"; then
  ok "accepts a gitignored env file inside the repo"
else
  fail "accepts a gitignored env file inside the repo" "rc=$RC $OUT"
fi

# --- 9. legacy call (no options) runs with no secrets ----------------------
P=$(new_project legacy)
printf 'STRIPE_SECRET_KEY=sk_test_123\n' > "$P/secrets.env"
printf '{ "envFile": "secrets.env" }' > "$P/mcp.config.json"
run_in "$P" env
if [ "$RC" -eq 0 ] && ! has_key "$OUT" STRIPE_SECRET_KEY && has_key "$OUT" PATH; then
  ok "call without --keys gets no secrets"
else
  fail "call without --keys gets no secrets" "$OUT"
fi

# --- 10. Doppler: only declared keys are taken from the config -------------
P=$(new_project doppler)
FAKE="$TMP_ROOT/fake-doppler"
cat > "$FAKE" <<'EOF'
#!/usr/bin/env bash
# Minimal stand-in for the Doppler CLI used by the launcher.
case "$*" in
  *"secrets download"*) printf '{"STRIPE_SECRET_KEY":"sk_dop","AWS_SECRET_ACCESS_KEY":"aws_dop","DOPPLER_PROJECT":"app"}' ;;
  *"configure get token"*) printf 'dp.pt.fake' ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$FAKE"
printf '{ "doppler": { "project": "app", "config": "dev" } }' > "$P/mcp.config.json"
EXTRA_ENV="MCP_RUN_DOPPLER_BIN=$FAKE" run_in "$P" --keys "STRIPE_SECRET_KEY" -- env
if [ "$RC" -eq 0 ] && has_line "$OUT" "STRIPE_SECRET_KEY=sk_dop" \
   && ! has_key "$OUT" AWS_SECRET_ACCESS_KEY && ! has_key "$OUT" DOPPLER_TOKEN; then
  ok "Doppler secrets are filtered to the declared keys"
else
  fail "Doppler secrets are filtered to the declared keys" "rc=$RC $OUT"
fi

# --- 11. production Doppler configs are refused ----------------------------
for CFGNAME in prd prod production prd_hotfix PRD; do
  P=$(new_project "prod-$CFGNAME")
  printf '{ "doppler": { "project": "app", "config": "%s" } }' "$CFGNAME" > "$P/mcp.config.json"
  EXTRA_ENV="MCP_RUN_DOPPLER_BIN=$FAKE" run_in "$P" --keys "STRIPE_SECRET_KEY" -- echo SERVER_STARTED
  if [ "$RC" -ne 0 ] && ! printf '%s' "$OUT" | grep -q SERVER_STARTED \
     && printf '%s' "$OUT" | grep -qi "production"; then
    ok "refuses Doppler config '$CFGNAME'"
  else
    fail "refuses Doppler config '$CFGNAME'" "rc=$RC $OUT"
  fi
done

# --- 12. the plugin option can't select production either ------------------
P=$(new_project prod-option)
printf '{ "doppler": { "project": "app", "config": "dev" } }' > "$P/mcp.config.json"
EXTRA_ENV="MCP_RUN_DOPPLER_BIN=$FAKE CLAUDE_PLUGIN_OPTION_DOPPLER_CONFIG=prd" \
  run_in "$P" --keys "STRIPE_SECRET_KEY" -- echo SERVER_STARTED
if [ "$RC" -ne 0 ] && ! printf '%s' "$OUT" | grep -q SERVER_STARTED; then
  ok "refuses prd from the plugin's doppler_config option"
else
  fail "refuses prd from the plugin's doppler_config option" "rc=$RC $OUT"
fi

# --- 13. explicit opt-in from the user's environment allows it --------------
P=$(new_project prod-optin)
printf '{ "doppler": { "project": "app", "config": "prd" } }' > "$P/mcp.config.json"
EXTRA_ENV="MCP_RUN_DOPPLER_BIN=$FAKE MCP_RUN_ALLOW_PRODUCTION=1" \
  run_in "$P" --keys "STRIPE_SECRET_KEY" -- env
if [ "$RC" -eq 0 ] && has_line "$OUT" "STRIPE_SECRET_KEY=sk_dop" && ! has_key "$OUT" MCP_RUN_ALLOW_PRODUCTION; then
  ok "MCP_RUN_ALLOW_PRODUCTION=1 opts in (and isn't passed to the server)"
else
  fail "MCP_RUN_ALLOW_PRODUCTION=1 opts in (and isn't passed to the server)" "rc=$RC $OUT"
fi

# --- 14. servers that need no secrets still start in a prd-configured repo --
P=$(new_project prod-nokeys)
printf '{ "doppler": { "project": "app", "config": "prd" } }' > "$P/mcp.config.json"
EXTRA_ENV="MCP_RUN_DOPPLER_BIN=$FAKE" run_in "$P" -- echo SERVER_STARTED
if [ "$RC" -eq 0 ] && printf '%s' "$OUT" | grep -q SERVER_STARTED; then
  ok "a server with no keys is unaffected by the production guard"
else
  fail "a server with no keys is unaffected by the production guard" "rc=$RC $OUT"
fi

# --- 15. Doppler configured but CLI missing: fall back to the environment ---
P=$(new_project doppler-missing)
printf '{ "doppler": { "project": "app", "config": "stg" } }' > "$P/mcp.config.json"
EXTRA_ENV="MCP_RUN_DOPPLER_BIN=/nonexistent/doppler STRIPE_SECRET_KEY=sk_from_env RENDER_API_KEY=rnd_x" \
  run_in "$P" --keys "STRIPE_SECRET_KEY" -- env
if [ "$RC" -eq 0 ] && has_line "$OUT" "STRIPE_SECRET_KEY=sk_from_env" && ! has_key "$OUT" RENDER_API_KEY; then
  ok "without the Doppler CLI, declared keys come from the environment"
else
  fail "without the Doppler CLI, declared keys come from the environment" "rc=$RC $OUT"
fi

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
