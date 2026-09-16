import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Fail the build on type errors and lint errors — no escape hatches.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

// When adopting Sentry, run `yarn dlx @sentry/wizard@latest -i nextjs` — it wraps
// this config with withSentryConfig for source map uploads. See /react-web-plugin:sentry.
export default nextConfig;
