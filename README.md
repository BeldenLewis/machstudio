This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Create `.env.local` with the required Supabase/Postgres values and the app URL used for generated links:

```bash
# Public Supabase client values. These are browser-visible by design.
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>

# Server-only values.
DATABASE_URL=postgresql://...
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Runtime app URL for local development and existing server loader routes. Local
# development can and should stay localhost.
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Durable public address for links and snippets copied to partner sites. Setting
# this explicitly is the operator's assertion that the host is stable (including
# a production Vercel address), never a temporary preview deployment.
# Copied outbound code is deliberately disabled until this is set or APP_URL is an
# already-safe non-local fallback.
NEXT_PUBLIC_CANONICAL_APP_URL=https://machstudio.vercel.app

# Optional, defaults to the current request origin.
SHORT_URL_BASE=https://go.example.com
```

Point the short domain at the same deployment. Short links are served from `/r/{code}`.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
