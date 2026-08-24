"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AutosaveScope, AggregateAutosaveIndicator, useReportAutosave } from "@/components/ui/autosave-scope";
import { Field, FIELD_CLS, FINISH, R, Segmented } from "@/components/ui/primitives";
import { PreviewFrame } from "@/components/ui/PreviewFrame";
import { ColorField } from "@/components/ui/ColorField";
import { normalizeHexColor } from "@/lib/color";
import { EXPO_DEFAULT_THEME, normalizeExpoTheme } from "@/lib/expo/config";
import { ExpoProjectSync } from "@/components/expo/ExpoProjectSync";
import { SectionsEditor } from "@/components/expo/SectionEditor";
import { attachExpoRowKeys, stripExpoRowKeys } from "@/lib/expo/row-key";
import { usePageAutosave, type ExpoSaveOutcome } from "@/lib/expo/use-page-autosave";
import { derivePageState } from "@/lib/expo/model";
import type { ExpoPermissions, ExpoRelease } from "@/lib/expo/permissions";
import type { ExpoPageState, ExpoSection, ExpoTheme } from "@/lib/expo/types";

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
}

/**
 * 미리보기가 알아야 하는 것. 편집기 가운데 칸에서 **위로 올려** 오른쪽 칸으로 흐른다 —
 * 저장 번호가 바뀔 때마다 미리보기를 다시 불러야 하는데, 그 번호를 아는 건 폼 쪽이다.
 */
interface PreviewInfo {
  /**
   * 이 정보가 **어느 페이지 것인가.** 없으면 페이지를 바꾼 직후, 새 페이지의 상세가
   * 도착하기 전까지 미리보기가 **새 주소 + 앞 페이지의 값**으로 한 번 뜬다:
   * 발행본이 없는 페이지에 `published=1` 이 붙고, 승인한 적 없는 페이지에 앞 페이지의
   * 코드 지문이 실려 나간다(서버는 거절하지만, 화면에는 "코드가 바뀌었어요" 가 뜬다).
   */
  pageId: string;
  revision: number;
  codeDigest: string;
  publishedCodeDigest: string;
  hasPublished: boolean;
}

export interface ExpoSiteEditorProps {
  siteId: string;
  projectId: string;
  siteName: string;
  permissions: ExpoPermissions;
  release: ExpoRelease;
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

function EditorBody({ siteId, siteName, permissions, release }: ExpoSiteEditorProps) {
  const params = useSearchParams();
  const router = useRouter();

  const [site, setSite] = useState<SiteInfo | null>(null);
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
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

  return (
    <Shell siteName={site.name} siteUrl={site.siteUrl}>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(280px,380px)]">
        <div className="space-y-3">
          <PageNavigator
            pages={pages}
            selectedId={selected?.id ?? null}
            canEdit={permissions.canEdit}
            onSelect={selectPage}
            onAdd={addPage}
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
            canEdit={permissions.canEdit}
            sources={sources}
            linkTargets={linkTargets}
            locale={site.defaultLocale || "ko"}
            onSaved={reload}
            onPreviewInfo={setPreview}
          />
        ) : (
          <div className={`${R.panel} ${FINISH.s1} bg-card p-5 text-sm text-muted-foreground`}>
            페이지가 없어요.
          </div>
        )}

        <PreviewPane
          previewToken={site.previewToken}
          pageId={selected?.id ?? null}
          release={release}
          info={preview}
          theme={stagedTheme}
        />
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

const STATE_LABEL: Record<ExpoPageState, string> = {
  draft: "초안",
  published: "발행됨",
  live: "공개 중",
};

/** 상태는 색만으로 구분하지 않는다 — 점 + 글자를 함께 준다. */
const STATE_DOT: Record<ExpoPageState, string> = {
  draft: "bg-muted-foreground/40",
  published: "bg-amber-500",
  live: "bg-emerald-500",
};

function PageNavigator({
  pages, selectedId, canEdit, onSelect, onAdd,
}: {
  pages: PageSummary[];
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <nav className={`${R.panel} ${FINISH.s1} bg-card p-2`} aria-label="페이지">
      <ul className="space-y-0.5">
        {pages.map((page) => {
          const state = derivePageState({ published: page.hasPublished ? {} : null, liveAt: page.liveAt });
          const active = page.id === selectedId;
          return (
            <li key={page.id}>
              <button
                type="button"
                onClick={() => onSelect(page.id)}
                aria-current={active ? "page" : undefined}
                className={`flex w-full items-center gap-2 ${R.control} px-2.5 py-2 text-left text-sm transition-colors ${
                  active ? "bg-violet-500/12 text-violet-600 dark:text-violet-300" : "hover:bg-secondary"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[state]}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{page.title}</span>
                {page.isHome ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">홈</span>
                ) : null}
                <span className="sr-only">{STATE_LABEL[state]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <button
          type="button"
          onClick={onAdd}
          className={`mt-1 flex w-full items-center gap-2 ${R.control} px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary`}
        >
          <Plus className="h-4 w-4" aria-hidden />
          페이지
        </button>
      ) : null}
    </nav>
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
  onPreviewInfo: (info: PreviewInfo) => void;
}

/** 페이지 하나의 편집 — 기본값과 구획. */
function PageEditor({
  pageId, siteId, canEdit, sources, linkTargets, locale, onSaved, onPreviewInfo,
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
      onSaved={onSaved}
      onPreviewInfo={onPreviewInfo}
    />
  );
}

function PageForm({
  page, siteId, canEdit, sources, linkTargets, locale, onSaved, onPreviewInfo,
}: Omit<PageEditorProps, "pageId"> & { page: PageDetail }) {
  const [title, setTitle] = useState(page.title);
  const [imwebUrl, setImwebUrl] = useState(page.imwebUrl ?? "");
  const [sections, setSections] = useState<ExpoSection[]>(page.draft.sections);

  /** 자동저장이 보는 값. **행 키가 들어 있다** — 저장 직전에 뗀다. */
  const value = useMemo(
    () => ({ title, imwebUrl, sections }),
    [title, imwebUrl, sections],
  );

  /**
   * 부모에게 알리는 콜백은 ref 로 잡는다 — 의존성에 넣으면 부모가 렌더될 때마다 `save` 가
   * 새로 만들어지고, 자동저장 훅이 그걸 보고 기준선을 다시 잡는다. 동기화는 렌더가 아니라
   * 효과에서 한다(`use-page-autosave.ts` 와 같은 패턴).
   */
  const reportRef = useRef(onPreviewInfo);
  useEffect(() => { reportRef.current = onPreviewInfo; }, [onPreviewInfo]);

  /**
   * 발행본 쪽 값은 PATCH 가 바꾸지 않으므로 처음 읽은 것이 계속 맞다. 페이지를 바꾸면
   * 이 컴포넌트가 통째로 새로 마운트되므로(key=pageId) 낡을 수도 없다.
   */
  const { publishedCodeDigest, hasPublished, draftRevision, codeDigest } = page;

  // 처음 한 번 — 미리보기가 무엇을 볼지 알아야 첫 프레임을 그린다.
  useEffect(() => {
    reportRef.current({ pageId: page.id, revision: draftRevision, codeDigest, publishedCodeDigest, hasPublished });
  }, [page.id, draftRevision, codeDigest, publishedCodeDigest, hasPublished]);

  const save = useCallback(async (
    next: typeof value, revision: number,
  ): Promise<ExpoSaveOutcome> => {
    const res = await fetch(`/api/expo/pages/${encodeURIComponent(page.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: next.title,
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
    if (!res.ok) return { kind: "failed" };
    const body = await res.json().catch(() => ({}));
    const savedRevision = Number(body.page?.draftRevision ?? revision + 1);
    // 미리보기는 **저장된 것**을 읽는다 — 번호가 바뀌었으니 다시 불러야 한다.
    reportRef.current({
      pageId: page.id,
      revision: savedRevision,
      codeDigest: String(body.page?.codeDigest ?? ""),
      publishedCodeDigest, hasPublished,
    });
    onSaved();
    return { kind: "saved", revision: savedRevision };
  }, [page.id, onSaved, publishedCodeDigest, hasPublished]);

  const autosave = usePageAutosave({
    pageId: page.id,
    value,
    initialRevision: page.draftRevision,
    save,
    enabled: canEdit,
  });
  useReportAutosave(autosave.state, autosave.retry);

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

      <label className="block">
        <span className="text-sm font-medium">페이지 이름</span>
        <Field
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={!canEdit}
          maxLength={120}
          className={`mt-1.5 ${FIELD_CLS}`}
        />
      </label>

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
  previewToken, pageId, release, info, theme,
}: {
  previewToken: string | null;
  pageId: string | null;
  release: ExpoRelease;
  info: PreviewInfo | null;
  /** 아직 적용하지 않은 색. 미리보기에만 실어 보낸다 — 저장하지 않는다. */
  theme: ExpoTheme | null;
}) {
  const [showPublished, setShowPublished] = useState(false);
  /** 실행을 허가한 지문. 세션 한 번의 판단이라 저장하지 않는다. */
  const [approvedDigest, setApprovedDigest] = useState("");

  /**
   * **자기 페이지 것만 믿는다.** 페이지를 바꾸면 `pageId` 는 곧바로 새것이 되지만
   * `info` 는 새 페이지 상세가 도착할 때까지 앞 페이지 것이다. 그대로 쓰면 앞 페이지의
   * 발행 여부와 코드 지문으로 새 페이지를 한 번 부른다.
   */
  const own = info && info.pageId === pageId ? info : null;

  const wantPublished = showPublished && Boolean(own?.hasPublished);
  const digest = (wantPublished ? own?.publishedCodeDigest : own?.codeDigest) ?? "";
  const codeApproved = digest !== "" && approvedDigest === digest;

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
    if (theme) {
      for (const key of ["accent", "lightBg", "darkBg"] as const) {
        const hex = normalizeHexColor(theme[key]);
        if (hex) query.set(key, hex);
      }
    }
    return `/hp/${encodeURIComponent(previewToken)}?${query.toString()}`;
  }, [previewToken, pageId, own, wantPublished, codeApproved, digest, theme]);

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

  const apply = async () => {
    if (!staged) return;
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
      <ColorField
        label="밝은 배경"
        value={current.lightBg}
        onChange={(next) => set("lightBg", next)}
      />
      <ColorField
        label="어두운 배경"
        note="배경을 어둡게 한 구획"
        value={current.darkBg}
        onChange={(next) => set("darkBg", next)}
      />

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
              disabled={saving}
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
