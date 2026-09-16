import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'My App',
  description: 'Multi-tenant B2B dashboard',
};

// Next.js requires a default export for layout files (allowed exception to the
// named-exports rule — see /react-web-plugin:coding-standards).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
