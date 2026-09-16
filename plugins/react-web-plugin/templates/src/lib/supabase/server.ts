import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
// Uncomment once database.types.ts is generated (yarn generate:db-types):
// import type { Database } from '@/lib/database.types';

// Server client — server components, route handlers, and server actions.
// Created per request (cookies() is request-scoped) — never module-level.
const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'api' },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll was called from a Server Component, which cannot write
            // cookies. Safe to ignore: middleware.ts refreshes sessions.
          }
        },
      },
    },
  );
};

export { createClient };
