# Review focus for this repository

Extra attention points for automated PR review, on top of the standard
correctness review. Edit per project — this file is read by the Claude
code-review workflow on every PR. Keep it short: a handful of high-value
points, not a style guide.

- **Tenant isolation.** This is a multi-tenant B2B app. Flag any query,
  endpoint, or policy where one business could read or mutate another
  business's talent profiles, requests, or matches — missing ownership
  filters, trusted client-supplied IDs, over-broad selects.
- **Access control on new endpoints.** Every new endpoint or RPC must check
  the caller's role (talent-offering vs talent-requesting side) before acting.
- **Migrations.** Schema changes must be backward-compatible with the
  currently deployed app version.
