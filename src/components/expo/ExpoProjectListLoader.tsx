"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Globe, Loader2, Plus } from "lucide-react";
import { useWorkspace } from "@/contexts/workspace";
import type { ExpoPermissions } from "@/lib/expo/permissions";

/**
 * 이 전시의 홈페이지 목록.
 *
 * ── 왜 이렇게까지 조심하나 ────────────────────────────────────────────
 * 현재 프로젝트는 **클라이언트 저장소에서 하이드레이션**된다. 그래서 마운트 직후에는
 * 아직 `null` 이고, 조금 뒤에 채워진다. 그 사이에 조회를 걸면:
 *  · 전시를 안 고른 상태의 목록(=워크스페이스 전체)이 잠깐 보이고
 *  · 사용자가 전시를 바꾸면 **먼저 보낸 요청이 나중에 도착해** 옛 목록으로 덮인다
 * 두 번째가 특히 나쁘다 — 화면은 새 전시인데 목록은 옛 전시다. 그래서 요청마다
 * 세대(generation)를 붙이고, 세대가 바뀐 뒤 도착한 응답은 **전부 버린다.**
 *
 * ── 상태를 최소로 둔다 ────────────────────────────────────────────────
 * "기다림"·"불러오는 중" 은 상태가 아니라 **렌더 시점의 계산**이다. 효과 안에서 동기적으로
 * 상태를 바꾸면 연쇄 렌더가 되고, 무엇보다 같은 것을 두 곳에서 표현하게 되어 어긋난다.
 */

interface SiteRow {
  id: string;
  name: string;
  projectId: string;
  siteUrl: string | null;
  updatedAt: string;
  pageCount: number;
  permissions: ExpoPermissions;
}

interface ListResponse {
  sites: SiteRow[];
  /** 이 전시에 새로 만들 수 있는가 — 목록이 비어 있으면 사이트에서 유도할 수 없다. */
  permissions: ExpoPermissions;
  release: { publicEmbedEnabled: boolean };
}

type Outcome =
  | { kind: "error" }
  | { kind: "ready"; sites: SiteRow[]; permissions: ExpoPermissions };

async function fetchList(projectId: string, signal: AbortSignal): Promise<Outcome> {
  const res = await fetch(`/api/expo?projectId=${encodeURIComponent(projectId)}`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) return { kind: "error" };
  const data = (await res.json()) as ListResponse;
  return { kind: "ready", sites: data.sites, permissions: data.permissions };
}

export function ExpoProjectListLoader() {
  const router = useRouter();
  const params = useSearchParams();
  const { workspace, currentProject, isLoading } = useWorkspace();

  /** 어느 세대의 결과인지 함께 들고 있어야 렌더가 "이건 지금 것인가" 를 판단할 수 있다. */
  const [loaded, setLoaded] = useState<{ gen: string; outcome: Outcome } | null>(null);

  /** 세대는 이 두 값으로만 정해진다 — 하나라도 바뀌면 앞선 응답은 전부 무효다. */
  const generation = useMemo(
    () => (workspace && currentProject ? `${workspace.id}:${currentProject.id}` : ""),
    [workspace, currentProject],
  );
  const latest = useRef("");

  /** 사이트가 하나뿐일 때 자동 이동을 건너뛰는 탈출구. */
  const stayOnList = params.get("list") === "1";

  useEffect(() => {
    // 문맥이 아직 안 왔다 — 조용히 기다린다. 여기서 조회하면 옛 목록이 잠깐 보인다.
    if (isLoading || !generation) return;

    const gen = generation;
    latest.current = gen;
    const controller = new AbortController();
    const projectId = gen.split(":")[1];

    fetchList(projectId, controller.signal)
      .then((outcome) => {
        // 세대가 바뀐 뒤 도착한 응답은 버린다 — 화면과 목록이 어긋나는 것을 막는 유일한 방법.
        if (latest.current !== gen) return;
        /**
         * 사이트가 딱 하나면 바로 그 상세로 보낸다 — 목록이 한 줄인 화면을 한 번 더
         * 보여줄 이유가 없다. 다만 `replace` 다: `push` 면 뒤로가기가 목록↔상세를
         * 무한히 왕복한다. 상세에는 `?list=1` 로 돌아오는 링크를 둔다.
         */
        if (outcome.kind === "ready" && outcome.sites.length === 1 && !stayOnList) {
          router.replace(`/homepage/${outcome.sites[0].id}`);
          return;
        }
        setLoaded({ gen, outcome });
      })
      .catch((error: { name?: string }) => {
        // AbortError 는 우리가 취소한 것이다 — 오류 화면을 띄우지 않는다.
        if (error?.name === "AbortError") return;
        if (latest.current !== gen) return;
        setLoaded({ gen, outcome: { kind: "error" } });
      });

    return () => controller.abort();
  }, [generation, isLoading, router, stayOnList]);

  const outcome = generation && loaded?.gen === generation ? loaded.outcome : null;

  if (!outcome) {
    return (
      <div className="flex items-center gap-2 px-1 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>불러오는 중…</span>
      </div>
    );
  }

  if (outcome.kind === "error") {
    return (
      <div className="px-1 py-16 text-sm">
        <p className="font-medium">목록을 불러오지 못했어요.</p>
        <p className="mt-1 text-muted-foreground">잠시 후 다시 시도해 주세요.</p>
      </div>
    );
  }

  if (outcome.sites.length === 0) {
    return <EmptyState canCreate={outcome.permissions.canEdit} />;
  }

  return (
    <div className="mt-6 space-y-2">
      {outcome.sites.map((site) => (
        <Link
          key={site.id}
          href={`/homepage/${site.id}`}
          // 카드는 외곽선 대신 그림자로 마감한다(AGENTS.md 공통).
          className="block rounded-xl bg-card p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{site.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">페이지 {site.pageCount}</span>
          </div>
          {site.siteUrl ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{site.siteUrl}</p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

/**
 * 빈 상태.
 *
 * 뷰어에게는 만들기 버튼을 보여주지 않는다 — 눌렀는데 403 이 나는 화면은 고장으로
 * 읽힌다. 다만 **숨기는 것이 유일한 방어가 아니다**: 라우트가 다시 판정한다.
 */
function EmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="px-1 py-16">
      <Globe className="h-7 w-7 text-muted-foreground" aria-hidden />
      <h2 className="mt-4 text-base font-semibold">아직 만든 홈페이지가 없어요</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        전시 홈페이지의 페이지를 만들고, 완성된 것부터 하나씩 실제 사이트로 옮길 수 있어요.
      </p>
      {canCreate ? (
        <Link
          href="/homepage/new"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:shadow-md active:translate-y-px"
        >
          <Plus className="h-4 w-4" aria-hidden />
          홈페이지 만들기
        </Link>
      ) : null}
    </div>
  );
}
