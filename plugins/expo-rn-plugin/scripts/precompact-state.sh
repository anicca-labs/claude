#!/usr/bin/env bash
# PreCompact hook — surfaces volatile project state into context just before a
# compaction so it survives the summary. Today that's unapplied Supabase
# migrations; the always-on monitor catches them during a session, but a
# compaction can drop that signal. One-shot, fast, no network polling.

migrations_dir="supabase/migrations"
[ -d "$migrations_dir" ] || exit 0
command -v supabase >/dev/null 2>&1 || exit 0

pending=$(supabase migration list 2>/dev/null \
  | awk 'tolower($0) ~ /not applied/ || /pending/ {print}' \
  | head -20) || exit 0

if [ -n "$pending" ]; then
  echo "[precompact] Preserve across compaction — unapplied Supabase migrations (run 'supabase db push' or 'supabase migration up'):"
  echo "$pending"
fi
