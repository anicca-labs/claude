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
