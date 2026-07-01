---
name: data-fetching
description: React Query + Supabase data fetching patterns for Expo projects. Covers mutation strategies, cache updates, and Supabase-specific read-after-write gotchas. Use when writing useMutation hooks, implementing optimistic updates, or debugging stale UI after mutations.
---

Apply the following data-fetching patterns to all React Query + Supabase code in this project.

## Stack

- `@tanstack/react-query` — server state, caching, mutations
- `supabase-js` — Postgres via HTTP API

## Mutation strategies

There are two distinct mutation patterns depending on whether you know the final record shape before the API responds.

### Creates — use `onSuccess` only

For inserts, the server assigns the real `id` (UUID). Never use `onMutate` with a temp id — when the real id arrives it causes a key change in React lists, which unmounts and remounts the component and plays any entry animation twice.

```ts
const useCreateJournalEntry = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await supabase
        .from('journal_entries')
        .insert({ content })
        .select()
        .single()
      if (error) throw error
      return data as JournalEntry
    },
    onSuccess: (newEntry) => {
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) => [newEntry, ...(old ?? [])])
    },
    // ❌ do NOT add onSettled: invalidateQueries — see race condition below
  })
}
```

### Updates and deletes — use `onMutate` for optimistic updates

> **Needs to work offline too?** This `onMutate` + `onError` revert + `onSettled` invalidate form is *online-only*. Offline it's unsafe — the `onError` revert and a reconnect refetch undo the change — and the [offline-sync](../offline-sync/SKILL.md) skill's durable-outbox pattern replaces it.

For mutations where you already know the full new state (deletes, field updates, toggles), optimistic updates via `onMutate` are safe because no id changes:

```ts
onMutate: async (id) => {
  await queryClient.cancelQueries({ queryKey: QUERY_KEY })
  const previous = queryClient.getQueryData<JournalEntry[]>(QUERY_KEY)
  queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) =>
    (old ?? []).filter((e) => e.id !== id)
  )
  return { previous }
},
onError: (_err, _vars, ctx) => {
  if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous)
},
onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
```

## Supabase read-after-write race

**Do not call `invalidateQueries` in `onSettled` for create mutations.**

Supabase uses an HTTP API — the `insert` and the subsequent `select` are separate HTTP calls to a connection pool. A `refetch` triggered immediately after an insert can complete before the insert is visible to reads, returning stale data that overwrites the `onSuccess` cache update. The symptom is: new item flashes into view then disappears, only reappearing after a manual refetch (e.g. tab switch).

```text
onSuccess → setQueryData([newEntry, ...])  ✓ UI updates
onSettled → invalidateQueries → refetch    ✗ Supabase returns old data → cache reverts
```

For creates: `onSuccess` + `setQueryData` is sufficient. The `useFocusEffect` `refetch()` call on screen focus provides eventual consistency when the user returns to the screen.

For deletes and updates: `invalidateQueries` in `onSettled` is safe because the mutation completes before `onSettled` fires, and the data was already removed/changed server-side by then.

## Transient network retry (iOS `-1005`)

iOS intermittently drops a reused keep-alive socket, surfacing as `NSURLErrorNetworkConnectionLost` (`-1005`) — `fetch` rejects with `"The network connection was lost."`. It hits hardest on the **first request after a fresh install**, which is exactly what App Review does — they get a hard failure at the login screen that you cannot reproduce (your connections are already warm). This **rejected a Reflect build under Guideline 2.1**.

Supabase's auth and DB calls use the client's `fetch`, which has no retry by default — a single blip becomes an error shown to the user. Wrap `fetch` once at client init so retries cover auth **and** data calls transparently:

```ts
const TRANSIENT_NETWORK_ERRORS = [
  'network connection was lost',
  'network request failed',
  'the request timed out',
  'connection appears to be offline',
]

const fetchWithRetry: typeof fetch = async (input, init) => {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(input, init)
    } catch (err) {
      lastError = err
      const message = (err instanceof Error ? err.message : String(err)).toLowerCase()
      if (!TRANSIENT_NETWORK_ERRORS.some((m) => message.includes(m))) throw err
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }
  throw lastError
}

const supabase = createClient(serverUrl, apiKey, {
  auth: { /* … */ },
  db: { schema: 'api' },
  global: { fetch: fetchWithRetry },
})
```

Only the listed transient messages retry (3 attempts, 300/600ms backoff) — genuine errors (invalid credentials, etc.) still surface immediately. Extract `fetchWithRetry` into its own module so it's unit-testable without the native client: assert a request that throws `"The network connection was lost"` once is retried and succeeds, and that a non-transient error is not retried. It's a JS-only change (native fingerprint unchanged), so it ships as an OTA update.

## Cache key convention

Use a `const` tuple so TypeScript catches mismatches across hooks:

```ts
const QUERY_KEY = ['journal-entries'] as const
```

## Screen-level refetch pattern

Screens call `refetch()` on focus to stay fresh after background changes:

```ts
useFocusEffect(
  useCallback(() => {
    refetch()
    return () => setCloseKey(k => k + 1) // reset swipeables on blur
  }, [refetch])
)
```

This is the safety net for eventual consistency — it does not replace optimistic updates for immediate feedback.
