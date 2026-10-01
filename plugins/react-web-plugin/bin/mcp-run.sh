#!/usr/bin/env bash
# MCP server runner for react-web-plugin.
#
#   mcp-run.sh [--keys "KEY1 KEY2"] [--set KEY=VALUE]... -- <command> [args...]
#
# Starts <command> with a scrubbed environment: a fixed baseline (PATH, HOME,
# locale, proxy/CA settings, ...) plus ONLY the keys this server declares with
# --keys. Each declared key is taken, in increasing precedence, from:
#   1. the environment Claude Code started us with
#   2. the project's secret source — Doppler (plugin userConfig, an
#      mcp.config.json "doppler" block, or `doppler setup`), else the
#      mcp.config.json "envFile"
#   3. --set KEY=VALUE pins, which nothing can override (safety switches)
#
# The env file is parsed as KEY=VALUE data and never executed. An env file that
# is committed to the repo is refused: real secrets don't belong in git, and a
# cloned repo must not be able to feed values to your servers.
#
# Called without options (`mcp-run.sh <command> ...`) the server gets no secrets.
#
# Production Doppler configs (prd, prod, production, prd_*) are refused unless
# MCP_RUN_ALLOW_PRODUCTION=1 is set in the environment Claude Code runs in.
set -euo pipefail

KEYS=""
PINS=()
if [ "${1:-}" = "--keys" ] || [ "${1:-}" = "--set" ] || [ "${1:-}" = "--" ]; then
  while [ $# -gt 0 ]; do
    case "$1" in
      --keys) KEYS="${2:-}"; shift 2 ;;
      --set)  PINS+=("${2:-}"); shift 2 ;;
      --)     shift; break ;;
      *)      echo "mcp-run.sh: unknown option '$1'" >&2; exit 2 ;;
    esac
  done
fi
[ $# -gt 0 ] || { echo "mcp-run.sh: no command given" >&2; exit 2; }

_declared() { case " $KEYS " in *" $1 "*) return 0 ;; esac; return 1; }

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

DOPPLER_BIN="${MCP_RUN_DOPPLER_BIN:-doppler}"

# --- the environment the server will get -----------------------------------
# NAME=VALUE entries; later entries win (env(1) applies them in order).
SERVER_ENV=()
_put() { SERVER_ENV+=("$1=$2"); }

# Baseline: what any server process needs to run, never secrets.
for _v in PATH HOME USER LOGNAME SHELL TMPDIR TERM TZ LANG LC_ALL LC_CTYPE \
  DISPLAY WAYLAND_DISPLAY XDG_RUNTIME_DIR XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME \
  HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy \
  SSL_CERT_FILE SSL_CERT_DIR NODE_EXTRA_CA_CERTS NODE_PATH \
  NVM_BIN NVM_DIR VOLTA_HOME FNM_MULTISHELL_PATH UV_CACHE_DIR UV_TOOL_DIR \
  CLAUDE_PLUGIN_ROOT; do
  if [ -n "${!_v+x}" ]; then _put "$_v" "${!_v}"; fi
done

# 1. declared keys already in our environment
for _k in $KEYS; do
  if [ -n "${!_k+x}" ]; then _put "$_k" "${!_k}"; fi
done

# --- locate the project's secret source ------------------------------------
PROJECT="${CLAUDE_PLUGIN_OPTION_DOPPLER_PROJECT:-}"
CONFIG="${CLAUDE_PLUGIN_OPTION_DOPPLER_CONFIG:-}"
# An explicit config override must win over the value read from mcp.config.json.
CONFIG_OVERRIDE="${CLAUDE_PLUGIN_OPTION_DOPPLER_CONFIG:-}"

# Walk up from $PWD to find the nearest mcp.config.json — Claude may start MCP
# processes with a CWD that differs from the project root.
_find_config() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/mcp.config.json" ]; then echo "$dir/mcp.config.json"; return; fi
    dir="$(dirname "$dir")"
  done
}

# Read a key from mcp.config.json: top-level ("envFile") or under "doppler".
# Prefer node and fall back to python3; either way the file is parsed as JSON.
_json_get() {
  local _f="$1" _section="$2" _key="$3" _default="${4:-}"
  if command -v node >/dev/null 2>&1; then
    node -e 'try{let c=require(process.argv[1]);if(process.argv[2])c=c[process.argv[2]]||{};const v=c[process.argv[3]];process.stdout.write(v?String(v):(process.argv[4]||""))}catch(e){process.stdout.write(process.argv[4]||"")}' \
      "$_f" "$_section" "$_key" "$_default" 2>/dev/null && return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import json,sys
d=json.load(open(sys.argv[1]))
if sys.argv[2]: d=d.get(sys.argv[2]) or {}
print(d.get(sys.argv[3]) or sys.argv[4], end='')" "$_f" "$_section" "$_key" "$_default" 2>/dev/null && return
  fi
  printf '%s' "$_default"
}

CFG="$(_find_config)"

if [ -z "$PROJECT" ] && [ -n "$CFG" ]; then
  PROJECT=$(_json_get "$CFG" doppler project "")
  if [ -n "$PROJECT" ]; then
    CONFIG=$(_json_get "$CFG" doppler config "dev")
    cd "$(dirname "$CFG")"
  fi
fi
CONFIG="${CONFIG:-dev}"
[ -n "$CONFIG_OVERRIDE" ] && CONFIG="$CONFIG_OVERRIDE"

if [ -z "$PROJECT" ] && command -v "$DOPPLER_BIN" >/dev/null 2>&1; then
  PROJECT=$("$DOPPLER_BIN" configure get project --scope "$PWD" --plain 2>/dev/null || echo "")
  if [ -n "$PROJECT" ]; then
    CONFIG=$("$DOPPLER_BIN" configure get config --scope "$PWD" --plain 2>/dev/null || echo "$CONFIG")
  fi
fi

# --- 2. declared keys from the secret source --------------------------------
_strip_quotes() {
  local v="$1"
  if [ ${#v} -ge 2 ]; then
    case "$v" in
      \"*\") v="${v:1:${#v}-2}" ;;
      \'*\') v="${v:1:${#v}-2}" ;;
    esac
  fi
  printf '%s' "$v"
}

# KEY=VALUE lines → declared keys only. Never sourced, never expanded.
_load_env_file() {
  local file="$1" line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in ''|'#'*) continue ;; esac
    line="${line#export }"
    case "$line" in *=*) ;; *) continue ;; esac
    key="${line%%=*}"
    val="${line#*=}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    _declared "$key" || continue
    _put "$key" "$(_strip_quotes "$val")"
  done < "$file"
}

# Production guard: never hand production secrets to an MCP server unless the
# user opted in from their own environment. A repo's mcp.config.json can't set
# this, and an env file can't either (env files only feed declared server keys).
_is_production_config() {
  local c
  c="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$c" in
    prd|prod|production|prd_*|prod_*|production_*) return 0 ;;
  esac
  return 1
}

if [ -n "$PROJECT" ]; then
  if [ -n "$KEYS" ] && _is_production_config "$CONFIG" && [ "${MCP_RUN_ALLOW_PRODUCTION:-}" != "1" ]; then
    echo "mcp-run.sh: refusing Doppler config '$CONFIG' for project '$PROJECT': it looks like production. Use a dev or staging config, or set MCP_RUN_ALLOW_PRODUCTION=1 in your own environment to opt in deliberately." >&2
    exit 1
  fi
  if [ -n "$KEYS" ]; then
    # Fetch the config as JSON and keep only the declared keys. NUL-separated so
    # values with newlines survive.
    _json="$("$DOPPLER_BIN" secrets download --no-file --format json -p "$PROJECT" -c "$CONFIG")" || {
      echo "mcp-run.sh: could not read Doppler config $PROJECT/$CONFIG" >&2; exit 1; }
    while IFS= read -r -d '' _k && IFS= read -r -d '' _val; do
      _put "$_k" "$_val"
    done < <(printf '%s' "$_json" | node -e '
      let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
        const s=JSON.parse(d),keys=process.argv[1].split(/\s+/).filter(Boolean);
        for(const k of keys) if(Object.prototype.hasOwnProperty.call(s,k)) process.stdout.write(k+"\0"+String(s[k])+"\0");
      })' "$KEYS")
  fi
else
  ENV_FILE="${CLAUDE_PLUGIN_OPTION_ENV_FILE:-}"
  if [ -z "$ENV_FILE" ] && [ -n "$CFG" ]; then
    ENV_FILE=$(_json_get "$CFG" "" envFile "")
    case "$ENV_FILE" in
      "" | /*) ;;
      *) ENV_FILE="$(dirname "$CFG")/$ENV_FILE" ;;
    esac
  fi
  if [ -n "$ENV_FILE" ] && [ -r "$ENV_FILE" ]; then
    _ef_dir="$(cd "$(dirname "$ENV_FILE")" && pwd)"
    if git -C "$_ef_dir" ls-files --error-unmatch "$(basename "$ENV_FILE")" >/dev/null 2>&1; then
      echo "mcp-run.sh: refusing env file $ENV_FILE: it is tracked by git. Keep secrets in a gitignored file or outside the repo." >&2
      exit 1
    fi
    [ -n "$KEYS" ] && _load_env_file "$ENV_FILE"
  fi
fi

# DOPPLER_TOKEN only for a server that declares it (the Doppler MCP server):
# fall back to the CLI's stored token for this directory.
if _declared DOPPLER_TOKEN && ! printf '%s\n' "${SERVER_ENV[@]}" | grep -q '^DOPPLER_TOKEN='; then
  if command -v "$DOPPLER_BIN" >/dev/null 2>&1; then
    _tok=$("$DOPPLER_BIN" configure get token --scope "$PWD" --plain 2>/dev/null || true)
    [ -n "$_tok" ] && _put DOPPLER_TOKEN "$_tok"
  fi
fi

# Aliases some servers expect, derived only from keys the server declared.
_lookup() {
  local i entry
  for ((i=${#SERVER_ENV[@]}-1; i>=0; i--)); do
    entry="${SERVER_ENV[$i]}"
    case "$entry" in "$1="*) printf '%s' "${entry#*=}"; return 0 ;; esac
  done
  return 1
}
if _declared SUPABASE_URL && ! _lookup SUPABASE_URL >/dev/null && _declared SERVER_URL; then
  _u=$(_lookup SERVER_URL || true); [ -n "$_u" ] && _put SUPABASE_URL "$_u"
fi
if _declared SENTRY_ACCESS_TOKEN && ! _lookup SENTRY_ACCESS_TOKEN >/dev/null; then
  _t=$(_lookup SENTRY_AUTH_TOKEN || true); [ -n "$_t" ] && _put SENTRY_ACCESS_TOKEN "$_t"
fi

# --- 3. pins win over everything -------------------------------------------
for _p in ${PINS[@]+"${PINS[@]}"}; do
  case "$_p" in *=*) SERVER_ENV+=("$_p") ;; esac
done

exec env -i ${SERVER_ENV[@]+"${SERVER_ENV[@]}"} "$@"
