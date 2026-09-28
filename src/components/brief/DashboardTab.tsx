"use client";

/**
 * 브리프 대시보드 — 내부용. 공개 화면에는 이 숫자가 절대 안 나간다.
 *
 * 읽는 영역이라 위계를 둔다:
 *   헤드라인(총 클릭 · 카톡 vs 공개 화면) → 어떤 **종류**가 잘 눌렸나 → 링크 순위 → 호별·일별
 * "다음 호에 뭘 더 찾을까" 가 이 화면의 질문이라, 종류별은 합계와 **링크당 평균**을 나란히 둔다.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { FINISH, R } from "@/components/ui/primitives";
import { BRIEF_CATEGORIES } from "@/lib/brief/model";
import { api, type BriefRow } from "./types";

interface Stats {
  totals: { clicks: number; direct: number; web: number };
  items: { id: string; category: string; org: string; title: string; adopted: boolean; clicks: number; uniques: number; direct: number; web: number }[];
  byCategory: { key: string; clicks: number; items: number; perItem: number }[];
  byOrg: { key: string; clicks: number; items: number; perItem: number }[];
  byIssue: { id: string; title: string; publishedAt: string; clicks: number }[];
  days: { day: string; clicks: number }[];
}

const catMeta = (key: string) => BRIEF_CATEGORIES.find((c) => c.key === key);

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`${R.panel} ${FINISH.s1} bg-card p-4 ${className}`}>{children}</div>;
}

export function DashboardTab({ brief }: { brief: BriefRow }) {
  const [loaded, setLoaded] = useState<{ id: string; stats: Stats } | null>(null);
  const [error, setError] = useState("");
  const stats = loaded?.id === brief.id ? loaded.stats : null;

  useEffect(() => {
    let cancelled = false;
    api<Stats>(`/api/briefs/${brief.id}/stats`)
      .then((s) => { if (!cancelled) setLoaded({ id: brief.id, stats: s }); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [brief.id]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!stats) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> 집계 중</div>;

  const { totals } = stats;
  const maxCat = Math.max(1, ...stats.byCategory.map((c) => c.clicks));
  const maxDay = Math.max(1, ...stats.days.map((d) => d.clicks));
  const top = stats.items.filter((i) => i.clicks > 0).slice(0, 15);

  if (totals.clicks === 0) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm font-medium">아직 클릭이 없어요</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          카톡 글의 단축 주소나 공개 화면에서 누군가 링크를 누르면 여기에 쌓여요. 카카오 미리보기 봇이 여는 건 세지 않아요.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* 헤드라인 */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <p className="text-xs text-muted-foreground">총 클릭</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{totals.clicks.toLocaleString()}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">카톡에서 바로</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{totals.direct.toLocaleString()}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">공개 화면에서</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{totals.web.toLocaleString()}</p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 종류별 */}
        <Card>
          <h3 className="text-sm font-semibold">어떤 종류가 잘 눌렸나</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">링크당 평균이 높은 종류를 다음 호에 더 찾아 보세요.</p>
          <ul className="mt-4 space-y-3">
            {stats.byCategory.map((c) => {
              const m = catMeta(c.key);
              return (
                <li key={c.key}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{m?.emoji} {m?.label ?? c.key}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <b className="text-foreground">{c.clicks}</b> · 링크당 {c.perItem}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${(c.clicks / maxCat) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {stats.byOrg.length > 0 && (
            <>
              <h4 className="mt-5 text-xs font-semibold text-muted-foreground">기관·언론사</h4>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {stats.byOrg.filter((o) => o.clicks > 0).map((o) => (
                  <li key={o.key} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                    {o.key} <span className="tabular-nums text-muted-foreground">{o.clicks}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* 일별 */}
        <Card>
          <h3 className="text-sm font-semibold">최근 30일</h3>
          {stats.days.length === 0 ? (
            <p className="mt-4 text-xs text-muted-foreground">최근 30일 클릭이 없어요.</p>
          ) : (
            <div className="mt-4 flex h-32 items-end gap-1" role="img" aria-label="일별 클릭 막대">
              {stats.days.map((d) => (
                <div key={d.day} className="group relative flex-1" title={`${d.day} · ${d.clicks}회`}>
                  <div className="w-full rounded-t bg-violet-500/80 transition-colors group-hover:bg-violet-600" style={{ height: `${Math.max(4, (d.clicks / maxDay) * 128)}px` }} />
                </div>
              ))}
            </div>
          )}
          {stats.byIssue.length > 0 && (
            <>
              <h4 className="mt-5 text-xs font-semibold text-muted-foreground">호별</h4>
              <ul className="mt-2 divide-y divide-border text-sm">
                {stats.byIssue.map((iss) => (
                  <li key={iss.id} className="flex justify-between gap-2 py-1.5">
                    <span className="truncate">{iss.title}</span>
                    <span className="tabular-nums text-muted-foreground">{iss.clicks}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {/* 링크 순위 */}
      <Card>
        <h3 className="text-sm font-semibold">많이 눌린 링크</h3>
        <ol className="mt-3 divide-y divide-border">
          {top.map((i, n) => (
            <li key={i.id} className="flex items-center gap-3 py-2.5">
              <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">{n + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.title}</p>
                <p className="truncate text-xs text-muted-foreground">{catMeta(i.category)?.emoji} {i.org || "—"}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{i.clicks}</p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  <span className="hidden sm:inline">카톡 {i.direct} · 웹 {i.web} · </span>순 {i.uniques}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] text-muted-foreground">순방문은 같은 사람이 같은 날 여러 번 누른 것을 한 번으로 센 값이에요.</p>
      </Card>
    </div>
  );
}
