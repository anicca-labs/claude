#!/usr/bin/env bash
# Doppler-aware MCP server runner for expo-rn-plugin.
# Uses userConfig values exposed as CLAUDE_PLUGIN_OPTION_* env vars,
# with fallback to mcp.config.json in the project root.
# If no Doppler project is configured, executes the command directly (safe for
# servers that need no secrets, e.g. context7).
set -euo pipefail

# Ensure common node/package manager bin dirs are in PATH.
# MCP processes inherit a restricted env that often omits homebrew and node.
for _dir in \
  /opt/homebrew/bin /opt/homebrew/sbin \
  /usr/local/bin /usr/local/sbin \
  /home/linuxbrew/.linuxbrew/bin \
  "${VOLTA_HOME:-$HOME/.volta}/bin"; do
  [ -d "$_dir" ] && export PATH="$_dir:$PATH"
done
unset _dir

# nvm: prefer NVM_BIN set by login shell; fall back to detecting latest installed version
if [ -n "${NVM_BIN:-}" ]; then
  export PATH="$NVM_BIN:$PATH"
elif [ -d "$HOME/.nvm/versions/node" ]; then
  # shellcheck disable=SC2012
  _nvm_node=$(ls -v "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)
  [ -n "$_nvm_node" ] && export PATH="$HOME/.nvm/versions/node/$_nvm_node/bin:$PATH"
fi

# fnm: FNM_MULTISHELL_PATH points to the active node version's bin dir
if [ -n "${FNM_MULTISHELL_PATH:-}" ] && [ -d "$FNM_MULTISHELL_PATH" ]; then
  export PATH="$FNM_MULTISHELL_PATH:$PATH"
fi

PROJECT="${CLAUDE_PLUGIN_OPTION_DOPPLER_PROJECT:-}"
CONFIG="${CLAUDE_PLUGIN_OPTION_DOPPLER_CONFIG:-}"
# An explicit config override must win over the value read from mcp.config.json
# below. This lets a dedicated "*-prd" MCP server target the prod Doppler config
# while still inheriting the app's project from mcp.config.json.
CONFIG_OVERRIDE="${CLAUDE_PLUGIN_OPTION_DOPPLER_CONFIG:-}"

# Walk up from $PWD to find the nearest mcp.config.json — Claude may start MCP
# processes with a CWD that differs from the project root.
_find_config() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    [ -f "$dir/mcp.config.json" ] && echo "$dir/mcp.config.json" && return
    dir="$(dirname "$dir")"
  done
}

if [ -z "$PROJECT" ]; then
  _cfg=$(_find_config)
  if [ -n "$_cfg" ]; then
    PROJECT=$(python3 -c "import json; d=json.load(open('$_cfg')); print(d.get('doppler',{}).get('project',''))" 2>/dev/null || echo "")
    CONFIG=$(python3 -c "import json; d=json.load(open('$_cfg')); print(d.get('doppler',{}).get('config','dev'))" 2>/dev/null || echo "")
    # Also switch to that directory so relative paths in the server work correctly
    cd "$(dirname "$_cfg")"
  fi
fi

CONFIG="${CONFIG:-dev}"

# Re-apply a per-server config override (e.g. a "*-prd" server) so it wins over
# whatever mcp.config.json specified, while keeping that file's Doppler project.
[ -n "$CONFIG_OVERRIDE" ] && CONFIG="$CONFIG_OVERRIDE"

# Last-resort fallback: ask the Doppler CLI for the project/config scoped to $PWD.
# This kicks in when mcp.config.json has no doppler block but the user has already
# run `doppler setup`.
if [ -z "$PROJECT" ] && command -v doppler &>/dev/null; then
  PROJECT=$(doppler configure get project --scope "$PWD" --plain 2>/dev/null || echo "")
  CONFIG=$(doppler configure get config --scope "$PWD" --plain 2>/dev/null || echo "${CONFIG:-dev}")
fi

if [ -z "$PROJECT" ]; then
  exec "$@"
fi

# Inject DOPPLER_TOKEN directly from CLI auth so the Doppler MCP server works
# without needing the token stored redundantly as a Doppler secret.
if [ -z "${DOPPLER_TOKEN:-}" ] && command -v doppler &>/dev/null; then
  _cli_token=$(doppler configure get token --scope "$PWD" --plain 2>/dev/null || true)
  [ -n "$_cli_token" ] && export DOPPLER_TOKEN="$_cli_token"
  unset _cli_token
fi

# shellcheck disable=SC2016
exec doppler run -p "$PROJECT" -c "$CONFIG" -- \
  bash -c '
    export SUPABASE_URL="${SUPABASE_URL:-${SERVER_URL:-}}" SENTRY_ACCESS_TOKEN="${SENTRY_AUTH_TOKEN:-}"
    args=()
    for arg in "$@"; do
      args+=("${arg/\$\{SENTRY_ORG\}/${SENTRY_ORG:-}}")
    done
    exec "${args[@]}"
  ' -- "$@"
