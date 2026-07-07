---
name: orval
description: Regenerate OpenAPI hooks and explain the orval codegen workflow
---

## Workflow

1. Ensure the backend OpenAPI spec is up to date:
   ```bash
   yarn generate:open-api-spec
   ```

2. Regenerate all typed hooks:
   ```bash
   yarn generate:open-api-hooks
   ```
   This runs both steps above in sequence.

3. Run `tsc --noEmit` — the generated types must compile cleanly before you use the new hooks.

## Where generated files live

- Config: `node_modules/@anicca-labs/react-query-sdk/orval.config.ts`
- Output: wherever `orval.config.ts` points (typically `src/api/generated/`)

## Rules

- **Never edit generated files** — any change will be overwritten on the next `yarn generate:open-api-hooks`
- If a generated hook is missing or wrong, the fix is in the backend spec, not in the generated output
- If you need a derived hook (e.g. pagination, optimistic update), wrap the generated hook in a custom hook under `src/hooks/`
- After any backend schema change, always regenerate before writing feature code

## Common patterns

```ts
// Use generated hooks directly
import { useGetWallets, useCreateTransaction } from "src/api/generated";

// Wrap for project-specific logic
export function useWallets() {
  return useGetWallets({ query: { staleTime: 60_000 } });
}
```
