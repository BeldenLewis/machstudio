/**
 * 브리프 공개 화면 — /b/{slug}. 로그인 없이 누구나 연다.
 *
 * 카톡으로 받은 사람이 "한눈에 보기" 로 들어오는 곳이다. 그래서:
 *   · 채택된 링크만, 아직 유효한 것만(마감 지난 지원사업·30일 지난 뉴스는 내린다)
 *   · 링크는 단축 주소 + `?c=w` 로 걸어 "공개 화면에서 눌렀다" 를 따로 센다
 *   · 휴대폰 폭이 기본 — 카톡 인앱 브라우저에서 열린다
 *
 * 대시보드·클릭 수는 여기 절대 안 나온다(내부용).
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimitAsync } from "@/lib/ratelimit";
import { getPublicAppOrigin } from "@/lib/app-url";
import { BRIEF_CATEGORIES, daysUntil, formatMonthDay, isStillVisible } from "@/lib/brief/model";
import { briefItemInclude, sortBriefItems } from "@/lib/brief/queries";

export const dynamic = "force-dynamic";

async function loadBrief(slug: string) {
  return prisma.brief.findFirst({
    where: { slug, deletedAt: null, isPublic: true },
    select: { id: true, name: true, intro: true, updatedAt: true },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const brief = await loadBrief(slug);
  if (!brief) return { robots: { index: false } };
  const description = brief.intro || "해외진출 지원사업 · 웨비나 · 산업 뉴스를 한눈에";
  return { title: brief.name, description, openGraph: { title: brief.name, description } };
}

function shortHref(code: string | undefined, url: string): string {
  if (!code) return url;
  const base = (process.env.SHORT_URL_BASE || process.env.NEXT_PUBLIC_SHORT_URL_BASE || getPublicAppOrigin() || "").replace(/\/+$/, "");
  return `${base}/r/${code}?c=w`;
}

function DueBadge({ category, dueDate, dateLabel }: { category: string; dueDate: Date | null; dateLabel: string }) {
  if (category === "news") return null;
  if (dateLabel.trim()) {
    return <span className="shrink-0 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-neutral-600">{dateLabel}</span>;
  }
  if (!dueDate) return null;
  const d = daysUntil(dueDate);
  const md = formatMonthDay(dueDate);
  if (category === "event") {
    return <span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-700">{md}</span>;
  }
  const urgent = d <= 3;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${urgent ? "bg-[#E2532C]/12 text-[#C2410C]" : "bg-emerald-500/10 text-emerald-700"}`}>
      {d === 0 ? "오늘 마감" : `D-${d}`} · ~{md}
    </span>
  );
}

export default async function PublicBriefPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const h = await headers();
  const ip = getClientIp(new Request("https://x", { headers: h }));
  const { allowed } = await rateLimitAsync(`brief-public:${ip}`, { limit: 120, windowMs: 60_000 });
  if (!allowed) {
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-50 p-6 text-center">
        <p className="text-sm text-neutral-600">잠시 후 다시 열어 주세요.</p>
      </div>
    );
  }

  const brief = await loadBrief(slug);
  if (!brief) notFound();

  const now = new Date();
  const rows = await prisma.briefItem.findMany({
    where: { briefId: brief.id, adopted: true, dismissedAt: null },
    include: briefItemInclude,
  });
  const items = sortBriefItems(rows.filter((i) => isStillVisible(i, now)));
  const groups = BRIEF_CATEGORIES.map((c) => ({ ...c, items: items.filter((i) => i.category === c.key) })).filter((g) => g.items.length > 0);
  const lastUpdated = rows.reduce((max, i) => (i.updatedAt > max ? i.updatedAt : max), brief.updatedAt);

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="bg-neutral-900 text-white">
        <div className="mx-auto max-w-2xl px-4 pb-6 pt-8 sm:pt-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF8500]">Korea Expo · Brief</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{brief.name}</h1>
          {brief.intro && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/75">{brief.intro}</p>}
          <p className="mt-4 text-[11px] text-white/45">업데이트 {formatMonthDay(lastUpdated)}</p>
          {groups.length > 1 && (
            <nav className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {groups.map((g) => (
                <a key={g.key} href={`#${g.key}`} className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/20">
                  {g.emoji} {g.label} <span className="text-white/50">{g.items.length}</span>
                </a>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {groups.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-medium">지금 올라온 소식이 없어요</p>
            <p className="mt-1 text-xs text-neutral-500">새 소식이 모이면 여기에 정리됩니다.</p>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.key} id={g.key} className="mb-8 scroll-mt-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
              <span aria-hidden>{g.emoji}</span>
              {g.label}
            </h2>
            <ul className="space-y-2.5">
              {g.items.map((item) => (
                <li key={item.id}>
                  <a
                    href={shortHref(item.shortLink?.code, item.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md active:scale-[0.99] motion-reduce:transition-none"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-xs font-medium text-neutral-500">{item.org || "\u00A0"}</p>
                      <DueBadge category={item.category} dueDate={item.dueDate} dateLabel={item.dateLabel} />
                    </div>
                    <p className="mt-1.5 text-[15px] font-semibold leading-snug">{item.title}</p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      <footer className="pb-10 text-center text-[11px] text-neutral-400">machstudio</footer>
    </div>
  );
}
