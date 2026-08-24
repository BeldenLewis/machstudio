"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Globe, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AutosaveScope, AggregateAutosaveIndicator, useReportAutosave } from "@/components/ui/autosave-scope";
import { Field, FIELD_CLS, FINISH, R } from "@/components/ui/primitives";
import { ExpoProjectSync } from "@/components/expo/ExpoProjectSync";
import { SectionsEditor } from "@/components/expo/SectionEditor";
import { attachExpoRowKeys, stripExpoRowKeys } from "@/lib/expo/row-key";
import { usePageAutosave, type ExpoSaveOutcome } from "@/lib/expo/use-page-autosave";
import { derivePageState } from "@/lib/expo/model";
import type { ExpoPermissions, ExpoRelease } from "@/lib/expo/permissions";
import type { ExpoPageState, ExpoSection } from "@/lib/expo/types";

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
        setSite(result.site);
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
        <PageNavigator
          pages={pages}
          selectedId={selected?.id ?? null}
          canEdit={permissions.canEdit}
          onSelect={selectPage}
          onAdd={addPage}
        />

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
}

/** 페이지 하나의 편집 — 기본값과 구획. */
function PageEditor({
  pageId, siteId, canEdit, sources, linkTargets, locale, onSaved,
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
    />
  );
}

function PageForm({
  page, siteId, canEdit, sources, linkTargets, locale, onSaved,
}: Omit<PageEditorProps, "pageId"> & { page: PageDetail }) {
  const [title, setTitle] = useState(page.title);
  const [imwebUrl, setImwebUrl] = useState(page.imwebUrl ?? "");
  const [sections, setSections] = useState<ExpoSection[]>(page.draft.sections);

  /** 자동저장이 보는 값. **행 키가 들어 있다** — 저장 직전에 뗀다. */
  const value = useMemo(
    () => ({ title, imwebUrl, sections }),
    [title, imwebUrl, sections],
  );

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
    onSaved();
    return { kind: "saved", revision: Number(body.page?.draftRevision ?? revision + 1) };
  }, [page.id, onSaved]);

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

function PreviewPane({
  previewToken, pageId, release,
}: { previewToken: string | null; pageId: string | null; release: ExpoRelease }) {
  const src = useMemo(() => {
    if (!previewToken || !pageId) return null;
    return `/hp/${encodeURIComponent(previewToken)}?page=${encodeURIComponent(pageId)}`;
  }, [previewToken, pageId]);

  return (
    <aside className={`${R.panel} ${FINISH.s1} bg-card p-3`} aria-label="미리보기">
      <div className="flex items-baseline justify-between gap-2 px-1 pb-2">
        <h2 className="text-sm font-semibold">미리보기</h2>
        {!release.publicEmbedEnabled ? (
          <span className="text-[11px] text-muted-foreground">공개 전</span>
        ) : null}
      </div>
      {src ? (
        <iframe
          src={src}
          title="홈페이지 미리보기"
          className={`h-[520px] w-full ${R.surface} bg-background`}
        />
      ) : (
        <p className="flex items-center gap-2 px-1 py-10 text-sm text-muted-foreground">
          <Globe className="h-4 w-4" aria-hidden />
          미리보기를 준비하는 중이에요.
        </p>
      )}
    </aside>
  );
}
