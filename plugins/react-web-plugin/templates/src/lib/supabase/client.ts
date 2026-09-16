import { createBrowserClient } from '@supabase/ssr';
// Uncomment once database.types.ts is generated (yarn generate:db-types):
// import type { Database } from '@/lib/database.types';

// Browser client — client components only. One instance per call site is fine;
// createBrowserClient dedupes internally.
const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'api' } },
  );

export { createClient };
