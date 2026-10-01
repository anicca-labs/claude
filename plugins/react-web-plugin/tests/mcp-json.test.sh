#!/usr/bin/env bash
# Every package an MCP server runs must be pinned to an exact version, and no
# secret may be passed on the command line (anyone on the machine can read argv).
# Run: bash plugins/react-web-plugin/tests/mcp-json.test.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

node - "$HERE/../.mcp.json" <<'EOF'
const servers = require(process.argv[2]).mcpServers;
const problems = [];

for (const [name, s] of Object.entries(servers)) {
  if (!s.args) continue;
  // The command after "--" (launcher form) or the whole arg list, flattened
  // so `bash -c "exec npx -y pkg@x ..."` scripts are checked too.
  const cmd = s.args.slice(s.args.indexOf("--") + 1).join(" ");
  for (const m of cmd.matchAll(/\b(?:npx\s+-y|uvx)\s+(\S+)/g)) {
    const pkg = m[1];
    const version = pkg.replace(/^@[^/]+\//, "").split("@")[1];
    if (!version || !/^\d+\.\d+\.\d+/.test(version)) problems.push(`${name}: '${pkg}' is not pinned to an exact version`);
  }
  if (/\$\{?(?:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))\b(?!\})/.test(cmd) && !/'\$''\{/.test(cmd)) {
    problems.push(`${name}: a secret is expanded into the command line`);
  }
}

if (problems.length) {
  console.log(problems.map((p) => "  FAIL " + p).join("\n"));
  process.exit(1);
}
console.log(`  ok   ${Object.keys(servers).length} servers: packages pinned, no secrets on the command line`);
EOF
