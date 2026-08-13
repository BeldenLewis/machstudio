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

# App base URL. Local dev should stay localhost; production is set in Vercel.
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional, defaults to the current request origin.
SHORT_URL_BASE=https://go.example.com

# Optional — GA4 Data API (요약 대시보드 퍼널: 홈페이지/사전등록 페이지 방문자).
# 서비스 계정 JSON 키를 한 줄 문자열로. 미설정 시 퍼널 섹션은 조용히 숨겨진다.
GA4_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

Point the short domain at the same deployment. Short links are served from `/r/{code}`.

GA4 퍼널을 쓰려면, 위 서비스 계정 이메일(`...@...iam.gserviceaccount.com`)을 각 GA4 속성의
Admin → Property Access Management에서 뷰어(Viewer)로 추가하고, 프로젝트별 GA4 속성 ID는
사전등록(`/collect`) 페이지의 "분석 연동" 버튼에서 설정한다.

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
