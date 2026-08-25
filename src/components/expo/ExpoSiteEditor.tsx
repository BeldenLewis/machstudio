"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AutosaveScope, AggregateAutosaveIndicator, useReportAutosave } from "@/components/ui/autosave-scope";
import { Field, FIELD_CLS, FINISH, R, Segmented } from "@/components/ui/primitives";
import { PreviewFrame } from "@/components/ui/PreviewFrame";
import { ColorField } from "@/components/ui/ColorField";
import { normalizeHexColor } from "@/lib/color";
import { EXPO_DEFAULT_THEME, normalizeExpoTheme } from "@/lib/expo/config";
import { ExpoProjectSync } from "@/components/expo/ExpoProjectSync";
import { SectionsEditor } from "@/components/expo/SectionEditor";
import { ExpoTemplateSave } from "@/components/expo/ExpoTemplateSave";
import { ExpoPageTree } from "@/components/expo/ExpoPageTree";
import { useExpoPreviewChannel } from "@/lib/expo/use-preview-channel";
import {
  ExpoPublishPanel,
  type ExpoReadinessView,
  type ExpoSnippetsView,
} from "@/components/expo/ExpoPublishPanel";
import { attachExpoRowKeys, stripExpoRowKeys } from "@/lib/expo/row-key";
import { usePageAutosave, type ExpoSaveOutcome } from "@/lib/expo/use-page-autosave";
import type { ExpoPermissions, ExpoRelease } from "@/lib/expo/permissions";
import type { ExpoSection, ExpoTheme } from "@/lib/expo/types";

/**
 * 홈페이지 편집 — **탐색 · 편집 · 미리보기 3열**.
 *
 * ── 3열이 하는 일 ─────────────────────────────────────────────────────
 * 왼쪽은 페이지를 고르고, 가운데는 그 페이지를 고치고, 오른쪽은 결과를 그린다.
 * 가운데의 모든 값은 자동저장되고, 오른쪽 미리보기는 **서버에 저장된 초안**을 읽으므로
 * 저장이 한 바퀴 돈 뒤에 따라온다 — 두 개의 진실이 아니라 하나의 진실에 시차가 있는 것이다.
 *
 * ── 왜 서버가 준 권한을 그대로 쓰나 ───────────────────────────────────
 * 버튼을 숨기는 것은 인가가 아니다 — 모든 라우트가 자기 자리에서 다시 판정한다.
 * 여기서 권한을 보는 목적은 **뷰어에게 눌러도 실패할 버튼을 보여주지 않는 것** 하나다.
 */

interface PageSummary {
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
  sortOrder: number;
  imwebUrl: string | null;
  hasPublished: boolean;
  liveAt: string | null;
}

interface SiteInfo {
  id: string;
  name: string;
  projectId: string;
  previewToken: string | null;
  siteUrl: string | null;
  defaultLocale: string;
  /** 사이트 색. **공개 로더가 실시간으로 읽는다** — 저장하는 순간 공개 페이지가 바뀐다. */
  theme: ExpoTheme;
}

interface PageDetail {
  id: string;
  slug: string;
  title: string;
  imwebUrl: string | null;
  draft: { sections: ExpoSection[] };
  draftRevision: number;
  hasPublished: boolean;
  liveAt: string | null;
  /** 붙여넣은 코드의 지문 — 미리보기에서 실행 허가를 요청할 때 그대로 되돌려 보낸다. */
  codeDigest: string;
  publishedCodeDigest: string;
  /** "왜 아직 안 나가는가" — 판정은 서버가 한다(`readiness.ts`). */
  readiness: ExpoReadinessView;
  snippets: ExpoSnippetsView;
}

/**
 * **오른쪽 칸이 알아야 하는 것.** 가운데 칸(폼)에서 위로 올려 흐른다 — 저장 번호도
 * 발행 상태도 페이지 상세에서 오고, 그걸 들고 있는 건 폼 쪽이기 때문이다.
 */
interface PageStatus {
  /**
   * 이 정보가 **어느 페이지 것인가.** 없으면 페이지를 바꾼 직후, 새 페이지의 상세가
   * 도착하기 전까지 미리보기가 **새 주소 + 앞 페이지의 값**으로 한 번 뜬다:
   * 발행본이 없는 페이지에 `published=1` 이 붙고, 승인한 적 없는 페이지에 앞 페이지의
   * 코드 지문이 실려 나간다(서버는 거절하지만, 화면에는 "코드가 바뀌었어요" 가 뜬다).
   */
  pageId: string;
  /**
   * **이름은 여기 없다.** 상세는 `pageId` 가 바뀔 때만 다시 읽으므로, 트리에서 이름을
   * 고쳐도 이 보고에 실린 이름은 그대로다 — 페이지를 떠났다 돌아오기 전까지 발행 패널이
   * 옛 이름을 단다. 이름의 출처는 트리가 고치는 **페이지 목록** 하나뿐이다.
   */
  revision: number;
  codeDigest: string;
  publishedCodeDigest: string;
  hasPublished: boolean;
  liveAt: string | null;
  readiness: ExpoReadinessView;
  snippets: ExpoSnippetsView;
  /**
   * 아직 저장 안 끝났거나 어긋났다. **발행은 저장된 초안을 굳히는 일**이라, 이때 누르면
   * 방금 친 글이 빠진 사본이 밖에 나간다.
   */
  saveBlocked: boolean;
}

/** 부분 갱신 — 어느 페이지 것인지는 항상 있어야 한다. */
type PageStatusPatch = Partial<PageStatus> & { pageId: string };

const isCompleteStatus = (v: PageStatusPatch): v is PageStatus =>
  v.readiness !== undefined && v.snippets !== undefined;

export interface ExpoSiteEditorProps {
  siteId: string;
  projectId: string;
  siteName: string;
  permissions: ExpoPermissions;
  release: ExpoRelease;
  /**
   * 편집기와 미리보기 프레임이 공유하는 오리진. **서버가 정한 값**이다 —
   * `window.location.origin` 을 쓰면 프레임 쪽 판정(`preview-bridge.ts` 의 parentOrigin)과
   * 어긋나 통로가 조용히 죽는다.
   */
  previewOrigin: string;
}

/** 사전등록 폼 후보 — 같은 전시의 빌더 폼. 사이트 조회에 같이 실려 온다. */
interface SourceOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface SiteResponse {
  site: SiteInfo;
  pages: PageSummary[];
  sources: SourceOption[];
}

/** 상태를 만지지 않는 순수 조회 — 상태 변경은 호출부의 `.then` 에서만 한다. */
async function fetchSite(
  siteId: string,
  signal: AbortSignal,
): Promise<SiteResponse | "error"> {
  const res = await fetch(`/api/expo/${encodeURIComponent(siteId)}`, { signal, cache: "no-store" });
  if (!res.ok) return "error";
  return (await res.json()) as SiteResponse;
}

export function ExpoSiteEditor(props: ExpoSiteEditorProps) {
  return (
    <AutosaveScope>
      {/* 사이드바의 전시를 이 사이트의 전시로 맞춘다 — 소속은 URL 자원에서 온다. */}
      <ExpoProjectSync projectId={props.projectId} />
      <EditorBody {...props} />
    </AutosaveScope>
  );
}

function EditorBody({ siteId, siteName, permissions, release, previewOrigin }: ExpoSiteEditorProps) {
  const params = useSearchParams();
  const router = useRouter();

  const [site, setSite] = useState<SiteInfo | null>(null);
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [sources, setSources] = useState<SourceOption[]>([]);
  /**
   * 페이지별 미리보기 정보. **하나만 들고 있으면 안 된다** — 페이지를 바꾼 뒤에 앞 페이지의
   * 저장이 늦게 끝나면(fetch 는 언마운트 뒤에도 살아서 resolve 한다) 그 보고가 지금 페이지의
   * 정보를 덮어써 미리보기가 다시 "준비하는 중" 으로 돌아간다.
   * 칸을 나눠 두면 늦게 온 보고는 제 칸만 갱신하고 지나간다.
   *
   * 이 성질은 **테스트로 못 덮었다** — 지금 하니스로는 페이지 전환을 몰 수 없다
   * (useSearchParams 목이 router.replace 를 되받지 않는다). 키가 다르면 서로 못 덮는다는
   * 것이 자료구조에서 바로 나오는 성질이라 그대로 둔다. 전환을 몰 수 있게 되면 검사를 붙일 것.
   */
  const [statusByPage, setStatusByPage] = useState<Record<string, PageStatus>>({});
  /** 발행·공개가 끝났다는 신호. 가운데 칸이 이 번호를 보고 발행 쪽 값만 다시 읽는다. */
  const [publishNonce, setPublishNonce] = useState(0);
  /**
   * 삭제 유예(5초) 중인 페이지. 되살아날 수 있는 것을 편집하게 두면 **되살린 뒤 무엇이
   * 남아 있어야 하는지 아무도 모른다** — 그래서 그동안 편집·발행을 잠근다.
   */
  const [pendingPages, setPendingPages] = useState<ReadonlySet<string>>(new Set());
  /**
   * 미리보기에서 방금 누른 구획. 편집 열이 그 카드로 스크롤하고 잠깐 표시한다 —
   * 모든 구획이 이미 인라인으로 펼쳐져 있으므로(D14) 선택 모델을 새로 만들지 않고
   * **어디를 보라고 가리키기만** 한다.
   */
  const [focusedSid, setFocusedSid] = useState<string | null>(null);
  /**
   * 잠깐 가리켰다가 놓는다. 타이머를 **여기**(이벤트 핸들러) 두는 이유: 자식이 효과에서
   * 지우면 효과 안에서 state 를 바꾸게 되고 그건 연쇄 렌더다(react-hooks 규칙).
   */
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusSection = useCallback((sid: string) => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    setFocusedSid(sid);
    focusTimer.current = setTimeout(() => setFocusedSid(null), 1400);
  }, []);
  useEffect(() => () => { if (focusTimer.current) clearTimeout(focusTimer.current); }, []);
  /**
   * 보고는 **부분 갱신**이다. 통째로 덮으면 서로 다른 시점의 보고가 서로를 지운다 —
   * 저장이 끝나 번호가 9가 됐는데, 그 직후 "저장 끝남" 을 알리는 보고가 자기가 아는
   * 옛 번호(7)로 되돌려 놓는다. 미리보기는 그 번호로 다시 부를지 정하므로 **저장했는데
   * 미리보기가 안 따라오는** 상태가 된다(실제로 그렇게 만들었다가 테스트가 잡았다).
   */
  const reportStatus = useCallback((next: PageStatusPatch) => {
    setStatusByPage((prev) => {
      const before = prev[next.pageId];
      if (!before && !isCompleteStatus(next)) return prev; // 첫 보고는 통째로 온다
      return { ...prev, [next.pageId]: { ...(before as PageStatus), ...next } };
    });
  }, []);
  /** 아직 적용하지 않은 색. null 이면 바꾼 것이 없다. */
  const [stagedTheme, setStagedTheme] = useState<ExpoTheme | null>(null);
  const [loadError, setLoadError] = useState(false);

  const requestedPageId = params.get("page");

  /**
   * 다시 읽기는 **번호를 올려서** 한다. 효과 본문에서 동기적으로 상태를 바꾸면 연쇄
   * 렌더가 되고(react-hooks 규칙), 무엇보다 "언제 읽는가" 가 두 곳에 흩어진다.
   */
  const [reloadNonce, setReloadNonce] = useState(0);
  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchSite(siteId, controller.signal)
      .then((result) => {
        if (result === "error") { setLoadError(true); return; }
        setLoadError(false);
        /**
         * 색은 경계에서 한 번 다듬는다. 라우트가 이미 정규화해 주지만, 여기서 `undefined`
         * 가 들어오면 색 패널이 `saved.accent` 를 읽다가 **편집기 전체가 죽는다** —
         * 한 필드 때문에 화면이 통째로 안 뜨는 종류의 사고다.
         */
        setSite({ ...result.site, theme: normalizeExpoTheme(result.site.theme) });
        setPages(result.pages);
        setSources(result.sources ?? []);
      })
      .catch((error: { name?: string }) => {
        if (error?.name === "AbortError") return;
        setLoadError(true);
      });
    return () => controller.abort();
  }, [siteId, reloadNonce]);

  /** 고른 페이지. 주소에 없거나 사라졌으면 홈, 그것도 없으면 첫 페이지. */
  const selected = useMemo(() => {
    if (!pages || pages.length === 0) return null;
    const byId = requestedPageId ? pages.find((p) => p.id === requestedPageId) : null;
    return byId ?? pages.find((p) => p.isHome) ?? pages[0];
  }, [pages, requestedPageId]);

  /**
   * 내부 링크 후보. **지금 편집 중인 페이지도 뺀 적이 없다** — 같은 페이지의 다른 구획으로
   * 보내는 링크(맨 위로·신청 폼으로)가 실제로 필요하고, 자기 참조는 렌더가 알아서 푼다.
   */
  const linkTargets = useMemo(
    () => (pages ?? []).map((page) => ({ id: page.id, title: page.title })),
    [pages],
  );

  const selectPage = useCallback((pageId: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("page", pageId);
    // `replace` 다 — 페이지를 훑을 때마다 뒤로가기 기록이 쌓이면 목록으로 못 돌아간다.
    router.replace(`?${next.toString()}`, { scroll: false });
  }, [params, router]);

  const addPage = useCallback(async () => {
    const res = await fetch(`/api/expo/${encodeURIComponent(siteId)}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "새 페이지" }),
    });
    if (!res.ok) {
      toast.error((await res.json().catch(() => ({}))).error ?? "페이지를 만들지 못했어요");
      return;
    }
    const { page } = (await res.json()) as { page: { id: string } };
    reload();
    selectPage(page.id);
  }, [siteId, reload, selectPage]);

  if (loadError) {
    return (
      <Shell siteName={siteName}>
        <p className="px-1 py-16 text-sm">
          <span className="block font-medium">홈페이지를 불러오지 못했어요.</span>
          <span className="mt-1 block text-muted-foreground">잠시 후 다시 시도해 주세요.</span>
        </p>
      </Shell>
    );
  }

  if (!site || !pages) {
    return (
      <Shell siteName={siteName}>
        <p className="flex items-center gap-2 px-1 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          불러오는 중…
        </p>
      </Shell>
    );
  }

  const status = selected ? statusByPage[selected.id] ?? null : null;
  /** 지금 보고 있는 페이지가 삭제 유예 중인가. */
  const pendingSelected = Boolean(selected && pendingPages.has(selected.id));

  return (
    <Shell siteName={site.name} siteUrl={site.siteUrl}>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(280px,380px)]">
        <div className="space-y-3">
          <ExpoPageTree
            siteId={siteId}
            pages={pages}
            selectedId={selected?.id ?? null}
            canEdit={permissions.canEdit}
            canManageSite={permissions.canManageSite}
            onSelect={selectPage}
            onAdd={addPage}
            onReload={reload}
            onPendingChange={setPendingPages}
          />
          {/* 색은 `canPublish` 다 — 저장하는 순간 이미 공개된 페이지가 바뀐다. */}
          {permissions.canPublish ? (
            <ThemePanel
              siteId={siteId}
              saved={site.theme}
              staged={stagedTheme}
              onStage={setStagedTheme}
              onApplied={(theme) => {
                setSite((prev) => (prev ? { ...prev, theme } : prev));
                setStagedTheme(null);
              }}
              anyLive={pages.some((page) => page.liveAt)}
            />
          ) : null}
          {/* 템플릿 저장은 `canEdit` 이다 — 새 템플릿을 만들 뿐 이 사이트를 건드리지 않는다. */}
          {permissions.canEdit ? (
            <ExpoTemplateSave siteId={siteId} siteName={site.name} />
          ) : null}
        </div>

        {selected ? (
          /**
           * `key` 가 페이지 id 다. 페이지를 바꾸면 편집기가 통째로 새로 마운트돼
           * 앞 페이지의 대기 상태가 새 페이지로 넘어올 수 없다.
           */
          <PageEditor
            key={selected.id}
            pageId={selected.id}
            siteId={siteId}
            canEdit={permissions.canEdit && !pendingSelected}
            sources={sources}
            linkTargets={linkTargets}
            locale={site.defaultLocale || "ko"}
            focusedSid={focusedSid}
            onFocusSection={focusSection}
            onSaved={reload}
            onPageStatus={reportStatus}
            publishNonce={publishNonce}
          />
        ) : (
          <div className={`${R.panel} ${FINISH.s1} bg-card p-5 text-sm text-muted-foreground`}>
            페이지가 없어요.
          </div>
        )}

        {/* 오른쪽 칸 — 보고(미리보기) 나서 내보낸다(발행). 두 개가 붙어 있어야 흐름이 이어진다. */}
        <div className="space-y-3">
          {/**
            * `key` 가 페이지 id 다 — 미리보기 통로의 채널을 페이지마다 새로 발급하기 위해서다.
            * 안 그러면 앞 페이지의 프레임이 뒤늦게 보낸 메시지가 새 화면에 적용된다.
            */}
          <PreviewPane
            key={selected?.id ?? "none"}
            previewToken={site.previewToken}
            pageId={selected?.id ?? null}
            release={release}
            info={status}
            theme={stagedTheme}
            previewOrigin={previewOrigin}
            onSelectSection={focusSection}
          />
          {status ? (
            <ExpoPublishPanel
              pageId={status.pageId}
              // 이름은 목록에서 — 트리가 고치는 곳이 거기다. `status.pageId` 로 맞춰 읽어야
              // 페이지를 막 바꾼 순간 **앞 페이지의 상태에 새 페이지의 이름**이 붙지 않는다.
              pageTitle={pages?.find((p) => p.id === status.pageId)?.title ?? ""}
              hasPublished={status.hasPublished}
              liveAt={status.liveAt}
              readiness={status.readiness}
              snippets={status.snippets}
              canPublish={permissions.canPublish && !pendingSelected}
              saveBlocked={status.saveBlocked}
              onChanged={() => setPublishNonce((n) => n + 1)}
            />
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  siteName, siteUrl, children,
}: { siteName: string; siteUrl?: string | null; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{siteName}</h1>
          {siteUrl ? (
            <a
              href={siteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4"
            >
              {siteUrl}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <AggregateAutosaveIndicator />
          {/* `?list=1` 이라야 사이트가 하나뿐일 때 상세로 다시 튕기지 않는다. */}
          <Link href="/homepage?list=1" className="text-sm underline underline-offset-4">
            모든 사이트
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}


interface PageEditorProps {
  pageId: string;
  siteId: string;
  canEdit: boolean;
  sources: SourceOption[];
  linkTargets: { id: string; title: string }[];
  /** 사이트의 defaultLocale — 공개 로더가 이 값으로 글을 읽는다. */
  locale: string;
  onSaved: () => void;
  onPageStatus: (info: PageStatusPatch) => void;
  /**
   * 발행·공개가 끝나면 부모가 올리는 번호. 발행 패널이 **오른쪽 칸**에 있어서 한 바퀴
   * 돌아온다 — 함수를 상태에 담는 대신 번호를 내려보낸다(사이트 다시 읽기와 같은 방식).
   */
  publishNonce: number;
  /** 미리보기에서 누른 구획 — 편집 열이 그 카드로 데려간다. */
  focusedSid: string | null;
  /** 거절 안내에서 그 구획으로 데려갈 때 쓴다. 미리보기 클릭과 같은 통로다. */
  onFocusSection: (sid: string) => void;
}

/** 페이지 하나의 편집 — 기본값과 구획. */
function PageEditor({
  pageId, siteId, canEdit, sources, linkTargets, locale, onSaved, onPageStatus, publishNonce,
  focusedSid, onFocusSection,
}: PageEditorProps) {
  const [page, setPage] = useState<PageDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/expo/pages/${encodeURIComponent(pageId)}`, {
          signal: controller.signal, cache: "no-store",
        });
        if (!res.ok) { setFailed(true); return; }
        const data = (await res.json()) as { page: PageDetail };
        setPage({
          ...data.page,
          /**
           * 행 키는 **여기서 한 번만** 붙인다. 렌더마다 붙이면 매번 새 키가 나와
           * 값이 계속 달라지고 자동저장이 타이핑하지 않아도 끝없이 돈다.
           */
          draft: { sections: attachExpoRowKeys(data.page.draft.sections) },
        });
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
        setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [pageId]);

  /**
   * 발행·공개 뒤에 **발행 쪽 값만** 다시 읽는다.
   *
   * `draft` 는 손대지 않는다 — 편집 중인 내용을 서버 사본으로 덮으면 방금 친 글이
   * 사라지고, 행 키를 다시 붙이면 타이핑하던 행이 리마운트된다. 발행은 draftRevision 을
   * 건드리지 않으므로(발행 라우트 주석) 그 번호도 그대로 둔다.
   */
  const refreshPublishState = useCallback(async () => {
    try {
      const res = await fetch(`/api/expo/pages/${encodeURIComponent(pageId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { page: PageDetail };
      setPage((prev) => (prev && prev.id === data.page.id ? {
        ...prev,
        hasPublished: data.page.hasPublished,
        liveAt: data.page.liveAt,
        publishedCodeDigest: data.page.publishedCodeDigest,
        readiness: data.page.readiness,
        snippets: data.page.snippets,
      } : prev));
    } catch {
      /* 실패해도 화면을 깨뜨리지 않는다 — 다음 저장이나 새로고침에 따라온다. */
    }
  }, [pageId]);

  /**
   * 번호가 오르면(=발행·공개가 끝나면) 다시 읽는다. **첫 마운트는 건너뛴다** —
   * 바로 위 효과가 방금 전부 읽어 왔으므로 같은 요청을 두 번 보내게 된다.
   */
  const seenNonce = useRef(publishNonce);
  useEffect(() => {
    if (seenNonce.current === publishNonce) return;
    seenNonce.current = publishNonce;
    void refreshPublishState();
  }, [publishNonce, refreshPublishState]);

  if (failed) {
    return (
      <div className={`${R.panel} ${FINISH.s1} bg-card p-5 text-sm`}>
        <p className="font-medium">페이지를 불러오지 못했어요.</p>
      </div>
    );
  }
  if (!page) {
    return (
      <div className={`${R.panel} ${FINISH.s1} flex items-center gap-2 bg-card p-5 text-sm text-muted-foreground`}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        불러오는 중…
      </div>
    );
  }

  return (
    <PageForm
      page={page}
      siteId={siteId}
      canEdit={canEdit}
      sources={sources}
      linkTargets={linkTargets}
      locale={locale}
      focusedSid={focusedSid}
      onFocusSection={onFocusSection}
      onSaved={onSaved}
      onPageStatus={onPageStatus}
    />
  );
}

function PageForm({
  page, siteId, canEdit, sources, linkTargets, locale, onSaved, onPageStatus,
  focusedSid, onFocusSection,
}: Omit<PageEditorProps, "pageId" | "publishNonce"> & { page: PageDetail }) {
  /**
   * 이름은 **왼쪽 트리가 소유한다.** 여기에도 두면 같은 값을 두 곳이 저장하게 되고,
   * 한쪽이 저장 중일 때 다른 쪽이 옛 값으로 덮는 경합이 생긴다. 트리에서 고치는 것이
   * 0클릭이라 그쪽이 맞는 자리다(스펙 §페이지 트리).
   */
  const [imwebUrl, setImwebUrl] = useState(page.imwebUrl ?? "");
  const [sections, setSections] = useState<ExpoSection[]>(page.draft.sections);

  /** 자동저장이 보는 값. **행 키가 들어 있다** — 저장 직전에 뗀다. */
  const value = useMemo(
    () => ({ imwebUrl, sections }),
    [imwebUrl, sections],
  );

  /**
   * 부모에게 알리는 콜백은 ref 로 잡는다 — 의존성에 넣으면 부모가 렌더될 때마다 `save` 가
   * 새로 만들어지고, 자동저장 훅이 그걸 보고 기준선을 다시 잡는다. 동기화는 렌더가 아니라
   * 효과에서 한다(`use-page-autosave.ts` 와 같은 패턴).
   */
  const reportRef = useRef(onPageStatus);
  useEffect(() => { reportRef.current = onPageStatus; }, [onPageStatus]);

  /**
   * 발행본 쪽 값. **초안 저장(PATCH)은 이걸 바꾸지 않으므로** 저장이 도는 동안은 맞다.
   *
   * 다만 **발행(POST .../publish)은 바꾼다.** 지금은 발행 UI 가 없어서(W1 범위 밖) 이
   * 화면에서 도달할 수 없지만, 발행 버튼이 붙는 순간 여기가 낡는다 — 발행 직후
   * 미리보기가 옛 발행본 지문으로 "실행 중" 이라고 적힌 채 자리표를 보여 준다.
   * 그때는 발행 응답에서도 지문을 받아 함께 올려야 한다(페이지 상세는 pageId 가 바뀔
   * 때만 다시 읽으므로 저절로 갱신되지 않는다).
   */
  const { publishedCodeDigest, hasPublished, draftRevision, codeDigest, liveAt, readiness, snippets } = page;

  const save = useCallback(async (
    next: typeof value, revision: number,
  ): Promise<ExpoSaveOutcome> => {
    const res = await fetch(`/api/expo/pages/${encodeURIComponent(page.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imwebUrl: next.imwebUrl,
        // 편집기 전용 키는 여기서 뗀다 — 발행 스냅샷과 공개 페이로드에 들어가면 안 된다.
        draft: { sections: stripExpoRowKeys(next.sections) },
        draftRevision: revision,
      }),
    });
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      return { kind: "conflict", revision: Number(body.draftRevision ?? revision) };
    }
    /**
     * **422 는 재시도해도 되는 실패가 아니다.** 같은 값을 다시 보내면 또 거절이다.
     * `failed` 로 뭉개면 기준선이 유지된 채 타이핑할 때마다 조용히 다시 시도되고,
     * 화면에는 이유가 한 글자도 안 뜬다 — 운영자는 저장이 안 된다는 것조차 모른다.
     */
    if (res.status === 422) {
      const body = await res.json().catch(() => ({}));
      const raw = Array.isArray(body.errors) ? body.errors : [];
      return {
        kind: "rejected",
        errors: raw.map((e: { path?: unknown; message?: unknown; sid?: unknown }) => ({
          path: typeof e.path === "string" ? e.path : "sections",
          message: typeof e.message === "string" ? e.message : "저장할 수 없는 값이에요.",
          sid: typeof e.sid === "string" ? e.sid : undefined,
        })),
      };
    }
    if (!res.ok) return { kind: "failed" };
    const body = await res.json().catch(() => ({}));
    const savedRevision = Number(body.page?.draftRevision ?? revision + 1);
    // 미리보기는 **저장된 것**을 읽는다 — 번호가 바뀌었으니 다시 불러야 한다.
    reportRef.current({
      pageId: page.id,
      revision: savedRevision,
      codeDigest: String(body.page?.codeDigest ?? ""),
      publishedCodeDigest, hasPublished, liveAt, readiness, snippets,
    });
    onSaved();
    return { kind: "saved", revision: savedRevision };
  }, [page.id, onSaved, publishedCodeDigest, hasPublished, liveAt, readiness, snippets]);

  const autosave = usePageAutosave({
    pageId: page.id,
    value,
    initialRevision: page.draftRevision,
    save,
    enabled: canEdit,
  });
  useReportAutosave(autosave.state, autosave.retry);

  /** 저장이 끝나야 발행할 수 있다 — 충돌·오류도 같다. */
  const saveBlocked = autosave.dirty || autosave.conflict !== null || autosave.state === "error";

  /**
   * 처음 한 번, 그리고 발행 상태가 바뀔 때마다 — 오른쪽 칸이 그걸로 그린다.
   * **저장 상태는 여기서 보고하지 않는다.** 여기에 넣으면 저장이 끝날 때마다 이 효과가
   * 다시 돌면서 `page.draftRevision`(마운트 시점의 옛 번호)으로 되돌려 놓는다.
   */
  useEffect(() => {
    reportRef.current({
      pageId: page.id, revision: draftRevision, codeDigest,
      publishedCodeDigest, hasPublished, liveAt, readiness, snippets,
    });
  }, [page.id, draftRevision, codeDigest, publishedCodeDigest, hasPublished, liveAt, readiness, snippets]);

  /** 저장 상태만 따로. 불리언이라 **전환마다 한 번**이지 타이핑할 때마다가 아니다. */
  useEffect(() => {
    reportRef.current({ pageId: page.id, saveBlocked });
  }, [page.id, saveBlocked]);


  return (
    <div className={`${R.panel} ${FINISH.s1} space-y-5 bg-card p-5`}>
      {autosave.conflict ? (
        <div className={`${R.surface} ${FINISH.s2Danger} bg-secondary p-3 text-sm`}>
          <p className="font-medium">다른 곳에서 먼저 저장했어요.</p>
          <p className="mt-1 text-muted-foreground">
            자동저장을 멈췄어요. 지금 화면의 내용은 그대로 있습니다 — 새로고침하면 서버 내용으로
            바뀌고, 이 화면의 글은 사라져요.
          </p>
        </div>
      ) : null}

      {/**
        * **저장이 거절됐다.** 409(다른 곳에서 먼저 저장)와 갈라 놓는다 — 그건 기다리면
        * 풀리지만 이건 값을 고쳐야 풀린다. 값이 바뀌면 이 안내가 저절로 사라지고
        * 다시 시도된다. 구획을 짚어 주면 그 카드로 데려간다.
        */}
      {autosave.rejected ? (
        <div className={`${R.surface} ${FINISH.s2Danger} bg-secondary p-3 text-sm`}>
          <p className="font-medium">저장하지 못했어요. 아래를 고치면 다시 저장돼요.</p>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            {autosave.rejected.map((issue, i) => (
              <li key={`${issue.path}-${i}`} className="flex items-start gap-1.5">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current" />
                {issue.sid ? (
                  <button
                    type="button"
                    onClick={() => onFocusSection(issue.sid!)}
                    className="text-left underline-offset-2 hover:underline"
                  >
                    {issue.message}
                  </button>
                ) : (
                  <span>{issue.message}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium">아임웹 주소</span>
        <Field
          value={imwebUrl}
          onChange={(event) => setImwebUrl(event.target.value)}
          disabled={!canEdit}
          placeholder="https://…"
          className={`mt-1.5 ${FIELD_CLS}`}
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          이 페이지에 대응하는 아임웹 페이지 주소예요. 다른 페이지에서 이 페이지로 거는 링크가
          이 주소로 풀립니다.
        </span>
      </label>

      <SectionsEditor
        sections={sections}
        onChange={setSections}
        canEdit={canEdit}
        siteId={siteId}
        sources={sources}
        pages={linkTargets}
        locale={locale}
        focusedSid={focusedSid}
      />
    </div>
  );
}

/**
 * 오른쪽 칸 — **저장된 것**을 그린다.
 *
 * 편집 중인 값이 아니라 서버에 저장된 초안을 읽는다. 그래서 자동저장이 한 바퀴 돈 뒤에
 * 따라온다 — 진실이 둘인 게 아니라 하나의 진실에 시차가 있는 것이고, 저장 번호를
 * `reloadKey` 로 넘겨 그 시차를 눈에 보이게 좁힌다.
 *
 * ── 붙여넣은 코드는 기본으로 실행하지 않는다 ──────────────────────────
 * 남이 준 스크립트를 편집기에서 자동으로 돌리지 않는다. 운영자가 한 번 확인하면 그
 * 허가는 **그때 본 그 코드에만** 붙는다 — 지문이 다르면 서버가 거절하므로, 코드를 고친
 * 순간 허가가 저절로 낡는다(`code-digest.ts`). 허가는 저장하지 않는다.
 */
function PreviewPane({
  previewToken, pageId, release, info, theme, previewOrigin, onSelectSection,
}: {
  previewToken: string | null;
  pageId: string | null;
  release: ExpoRelease;
  info: PageStatus | null;
  /** 아직 적용하지 않은 색. **프레임에 밀어 넣는다** — 저장하지 않고, 다시 띄우지도 않는다. */
  theme: ExpoTheme | null;
  previewOrigin: string;
  /** 프레임에서 구획을 눌렀다. */
  onSelectSection: (sid: string) => void;
}) {
  const [showPublished, setShowPublished] = useState(false);
  /** 실행을 허가한 지문. 세션 한 번의 판단이라 저장하지 않는다. */
  const [approvedDigest, setApprovedDigest] = useState("");

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const { channel, pushTheme } = useExpoPreviewChannel({
    pageId, origin: previewOrigin, frameRef, onSelectSection,
  });

  /**
   * 색은 **프레임에 밀어 넣는다** — 주소에 싣지 않는다.
   *
   * 전에는 URL 에 실었는데, `<input type="color">` 가 선택기를 끄는 동안 정상 HEX 를 초당
   * 수십 번 쏘고 PreviewFrame 이 URL 을 key 로 쓰는 탓에 **iframe 이 그만큼 파괴·재생성**됐다.
   * 디바운스로 눌러 두긴 했지만, 프레임 안쪽은 처음부터 `mach-expo-preview-theme` 를 받아
   * 메모리에만 반영할 줄 알았다(`preview-bridge.ts`). 그쪽을 쓰면 리로드가 0회다.
   */
  useEffect(() => {
    if (theme) pushTheme(theme);
  }, [theme, pushTheme]);

  /**
   * **자기 페이지 것만 믿는다.** 페이지를 바꾸면 `pageId` 는 곧바로 새것이 되지만
   * `info` 는 새 페이지 상세가 도착할 때까지 앞 페이지 것이다. 그대로 쓰면 앞 페이지의
   * 발행 여부와 코드 지문으로 새 페이지를 한 번 부른다.
   */
  const own = info && info.pageId === pageId ? info : null;

  const wantPublished = showPublished && Boolean(own?.hasPublished);
  const digest = (wantPublished ? own?.publishedCodeDigest : own?.codeDigest) ?? "";
  const codeApproved = digest !== "" && approvedDigest === digest;

  /**
   * 프레임을 처음 띄울 때의 색. 이후 변경은 주소가 아니라 통로로 간다.
   * ref 가 아니라 state 인 이유: 이 값은 **렌더에서 읽힌다**(주소를 만든다).
   */
  const [initialTheme] = useState(theme);

  const src = useMemo(() => {
    /**
     * `own` 이 있어야 그린다 — 없으면 이 페이지의 상세가 아직 안 왔다는 뜻이다.
     * 먼저 그려 봐야 발행 여부도 지문도 모르는 채로 한 번 부르고 곧바로 다시 부른다.
     */
    if (!previewToken || !pageId || !own) return null;
    const query = new URLSearchParams({ page: pageId });
    if (wantPublished) query.set("published", "1");
    if (codeApproved) {
      query.set("customCode", "run");
      query.set("codeDigest", digest);
    }
    /**
     * **색이 될 때만** 싣는다. 타이핑 중인 반쪽짜리 값(`#1f`)까지 실으면 글자 하나마다
     * 주소가 바뀌어 iframe 이 다시 뜬다 — 색을 고르는 동안 미리보기가 계속 깜빡인다.
     */
    /**
     * 첫 프레임에 쓸 색만 주소에 싣는다. 그 뒤의 변경은 `pushTheme` 이 리로드 없이 옮긴다 —
     * 여기에 계속 실으면 색을 고르는 동안 프레임이 매번 다시 뜬다.
     */
    if (initialTheme) {
      for (const key of ["accent", "lightBg", "darkBg"] as const) {
        const hex = normalizeHexColor(initialTheme[key]);
        if (hex) query.set(key, hex);
      }
    }
    query.set("channel", channel);
    return `/hp/${encodeURIComponent(previewToken)}?${query.toString()}`;
  }, [previewToken, pageId, own, wantPublished, codeApproved, digest, channel, initialTheme]);

  if (!src) {
    return (
      <aside className={`${R.panel} ${FINISH.s1} bg-card p-3`} aria-label="미리보기">
        <h2 className="px-1 pb-2 text-sm font-semibold">미리보기</h2>
        <p className="px-1 py-10 text-sm text-muted-foreground">미리보기를 준비하는 중이에요.</p>
      </aside>
    );
  }

  return (
    <aside className={`${R.panel} ${FINISH.s1} space-y-2 bg-card p-3`} aria-label="미리보기">
      <PreviewFrame
        title="미리보기"
        src={src}
        frameRef={frameRef}
        /* 저장될 때마다 다시 불러온다 — 안 그러면 고친 내용이 영영 안 보인다. */
        reloadKey={`${own?.revision ?? 0}:${codeApproved ? "code" : "safe"}`}
        openLabel="새 탭에서 미리보기 열기"
        note={release.publicEmbedEnabled ? undefined : "공개 전"}
        controls={
          /* 발행본이 실제로 있을 때만 고르게 한다 — 없는 것을 고르는 칸은 고장으로 읽힌다. */
          own?.hasPublished ? (
            <Segmented
              label="무엇을 보는가"
              value={showPublished ? "published" : "draft"}
              onChange={(next) => setShowPublished(next === "published")}
              options={[
                { value: "draft", label: "초안" },
                { value: "published", label: "발행본" },
              ]}
            />
          ) : null
        }
      />

      {digest === "" ? null : codeApproved ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          붙여넣은 코드를 실행 중이에요.
          <button
            type="button"
            onClick={() => setApprovedDigest("")}
            className="underline underline-offset-4 hover:text-foreground"
          >
            멈추기
          </button>
        </p>
      ) : (
        <div className={`${R.surface} ${FINISH.s2} space-y-1.5 bg-secondary p-2.5`}>
          <p className="text-[11px] leading-relaxed">
            <span className="font-medium">붙여넣은 코드는 아직 실행하지 않았어요.</span>
            <span className="mt-0.5 block text-muted-foreground">
              {approvedDigest === ""
                ? "지도·위젯처럼 밖에서 가져온 코드는 확인한 뒤에 돌립니다."
                : "코드가 바뀌었어요. 바뀐 내용을 확인하고 다시 실행해 주세요."}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setApprovedDigest(digest)}
            className={`inline-flex min-h-9 items-center gap-1.5 ${R.control} ${FINISH.control} bg-background px-3 text-xs font-medium transition-colors hover:bg-background/70`}
          >
            이 코드 실행하기
          </button>
        </div>
      )}
    </aside>
  );
}

/**
 * 사이트 색 — **자동저장하지 않는다.**
 *
 * 이 화면에서 유일하게 자동저장이 아닌 값이다. 공개 로더가 사이트 테마를 실시간으로
 * 읽으므로(`app/h/[pageId]/loader.ts`) 저장하는 순간 **이미 파트너 사이트에 붙여 둔
 * 페이지의 색까지 바뀐다.** 타이핑 중인 색이 그대로 나가면 안 된다.
 *
 * 그래서 고치는 동안은 화면 안에만 있고(미리보기에는 실어 보낸다), 적용을 눌러야 나간다.
 * 되돌릴 수 있는 변경이라 확인 모달까지 두지는 않는다 — 대신 무엇이 바뀌는지 적는다.
 */
function ThemePanel({
  siteId, saved, staged, onStage, onApplied, anyLive,
}: {
  siteId: string;
  saved: ExpoTheme;
  staged: ExpoTheme | null;
  onStage: (next: ExpoTheme | null) => void;
  onApplied: (theme: ExpoTheme) => void;
  anyLive: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const current = staged ?? saved;
  const dirty = staged !== null;

  const set = (key: keyof ExpoTheme, value: string) => onStage({ ...current, [key]: value });

  /**
   * **미리보기가 거짓말하는 자리다.** 색이 아닌 값은 미리보기 주소에서 빠지므로
   * (아래 PreviewPane) 프레임에는 저장돼 있던 옛 색이 그대로 보인다 — 화면은 멀쩡한데
   * 저장하면 값이 거절된다. 그래서 **그 칸 바로 아래**에서 미리 말한다(AGENTS.md 공통).
   */
  const badKeys = (["accent", "lightBg", "darkBg"] as const).filter(
    (key) => !normalizeHexColor(current[key]),
  );
  const invalid = badKeys.length > 0;
  const hint = (key: keyof ExpoTheme) =>
    badKeys.includes(key) ? (
      <p className="text-[11px] leading-relaxed text-[var(--destructive)]">
        #RRGGBB 형식으로 적어 주세요. 지금 값은 저장되지 않아요.
      </p>
    ) : null;

  const apply = async () => {
    if (!staged || invalid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/expo/${encodeURIComponent(siteId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: staged }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error ?? "색을 바꾸지 못했어요");
        return;
      }
      const body = (await res.json()) as { site: { theme: ExpoTheme } };
      // 서버가 정규화한 값을 받는다 — 화면이 보낸 값과 저장된 값이 다를 수 있다.
      onApplied(body.site.theme);
      toast.success("색을 적용했어요");
    } catch {
      toast.error("색을 바꾸지 못했어요. 연결을 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`${R.panel} ${FINISH.s1} space-y-2.5 bg-card p-3`} aria-labelledby="expo-theme-heading">
      <h2 id="expo-theme-heading" className="text-sm font-semibold">색</h2>

      <ColorField
        label="키컬러"
        value={current.accent}
        onChange={(next) => set("accent", next)}
      />
      {hint("accent")}
      <ColorField
        label="밝은 배경"
        value={current.lightBg}
        onChange={(next) => set("lightBg", next)}
      />
      {hint("lightBg")}
      <ColorField
        label="어두운 배경"
        note="배경을 어둡게 한 구획"
        value={current.darkBg}
        onChange={(next) => set("darkBg", next)}
      />
      {hint("darkBg")}

      {dirty ? (
        <div className={`${R.surface} ${FINISH.s2} space-y-2 bg-secondary p-2.5`}>
          <p className="text-[11px] leading-relaxed">
            <span className="font-medium">아직 적용하지 않았어요.</span>
            <span className="mt-0.5 block text-muted-foreground">
              {anyLive
                ? "적용하면 이미 공개 중인 페이지의 색도 바로 바뀝니다. 오른쪽에서 먼저 확인하세요."
                : "오른쪽 미리보기에는 지금 이 색으로 보이고 있어요."}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void apply()}
              disabled={saving || invalid}
              className={`inline-flex min-h-9 items-center gap-1.5 ${R.control} ${FINISH.control} bg-violet-500 px-3 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-60`}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              적용
            </button>
            <button
              type="button"
              onClick={() => onStage(null)}
              disabled={saving}
              className={`inline-flex min-h-9 items-center ${R.control} px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-60`}
            >
              되돌리기
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onStage({ ...EXPO_DEFAULT_THEME })}
          className="text-[11px] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        >
          기본 색으로
        </button>
      )}
    </section>
  );
}
