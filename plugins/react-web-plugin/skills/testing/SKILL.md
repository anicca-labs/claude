---
name: testing
description: Write or fix tests using Vitest (unit/component) and Playwright (e2e). Use when adding new pages, hooks, or form logic, or when a test is failing.
argument-hint: "<file_or_feature_to_test>"
---

Write tests for `$ARGUMENTS` following project conventions.

## Stack

- **Vitest** — unit and component tests, jsdom environment, colocated with source
- `@testing-library/react` + `@testing-library/jest-dom` — render and query helpers
- **Playwright** — end-to-end tests against a real browser, in `e2e/`

## What goes where

| Test | Tool | Location |
| --- | --- | --- |
| Pure functions, zod schemas, utils | Vitest | `foo.test.ts` next to `foo.ts` |
| Client components, hooks, forms | Vitest + Testing Library | `Foo.test.tsx` next to `Foo.tsx` |
| Critical user flows (login, create-entity, billing upgrade), tenant isolation | Playwright | `e2e/<flow>.spec.ts` |

Server components render async on the server — don't fight jsdom to test them; test their logic as extracted functions, and their rendering via Playwright.

## Provider wrapper (Vitest)

Every component render needs the QueryClient. Create once in `src/test-utils/renderWithProviders.tsx`:

```tsx
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const renderWithProviders = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};
```

## Patterns

### Component test

```tsx
it('shows error when email is empty', async () => {
  const user = userEvent.setup();
  renderWithProviders(<InviteForm onSuccess={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: /send invite/i }));
  expect(await screen.findByText(/email/i)).toBeInTheDocument();
});
```

### Hook test

```tsx
import { renderHook, waitFor } from '@testing-library/react';

it('returns projects', async () => {
  const { result } = renderHook(() => useProjects([]), { wrapper: Providers });
  await waitFor(() => expect(result.current.data).toBeDefined());
});
```

### Mocking the Supabase client

Mock the module boundary, not the network:

```ts
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => Promise.resolve({ data: [{ id: '1' }], error: null }) }),
  }),
}));
```

### Playwright e2e

```ts
import { test, expect } from '@playwright/test';

test('member cannot see another business', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel('Password').fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText('Other Business Ltd')).toHaveCount(0);
});
```

Playwright's `webServer` config starts `yarn dev` automatically; e2e users are seeded test accounts in the stg Supabase project — never production data.

## Rules

- Always use `renderWithProviders` — never bare `render`
- Assert on visible output (`getByText`, `getByRole`, `getByLabelText`) — never on component state
- Never test implementation details — test user-observable behaviour
- `retry: false` on QueryClient prevents async retries in tests
- For navigation: mock `next/navigation` (`vi.mock('next/navigation')`) — `useRouter`, `useSearchParams`, `redirect`
- Vitest for logic and components; don't write an e2e test for what a component test covers — e2e is for flows that cross pages or need real auth/RLS
- Run `tsc --noEmit` after writing tests — type errors in tests count
