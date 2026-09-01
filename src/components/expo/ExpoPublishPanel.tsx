"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Chip, FINISH, R } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { objectParticle } from "@/lib/korean";
import type { ReadinessIssue } from "@/lib/expo/readiness";
import { ExpoRevisionPanel } from "@/components/expo/ExpoRevisionPanel";
import { pageWarnings } from "@/lib/expo/connection-status";
import type {
  ExpoEditorRequest,
  ExpoReadinessView,
  ExpoSnippetView,
  ExpoSnippetsView,
} from "@/lib/expo/editor-dto";

export type {
  ExpoReadinessView,
  ExpoSnippetView,
  ExpoSectionSnippetView,
  ExpoSnippetsView,
} from "@/lib/expo/editor-dto";

/**
 * **밖으로 내보내는 자리.**
 *
 * ── 왜 오른쪽 칸인가 ──────────────────────────────────────────────────
 * 가운데는 고치는 영역이고 구획이 40개까지 늘어난다 — 그 밑에 두면 내보내려고 매번
 * 전부 스크롤해야 한다. 오른쪽은 "이렇게 나갑니다"(미리보기) 이므로, 그 바로 아래에
 * "내보내기" 를 두면 보고 나서 결정하는 흐름이 이어진다(AGENTS.md §3 의 손에 잡히는 컨트롤).
 *
 * ── 두 개의 문 ────────────────────────────────────────────────────────
 * **발행**은 밖에 나갈 사본을 만드는 것이고, **공개 스위치**는 실제로 내보내는 것이다.
 * 둘을 나눠야 "코드를 미리 붙여 두고 전환일에 스위치만" 이 성립한다(`model.ts`).
 * 그래서 확인 단계도 다르다:
 *  · 발행 — 보통은 사본 만들기라 확인 없이. **이미 공개 중이면** 그 순간 방문자 화면이
 *    바뀌므로 확인을 받는다.
 *  · 공개 켜기 — 파트너 사이트로 나가는 순간이라 항상 확인. **끄기는 확인 없이 즉시** —
 *    되돌리기를 막으면 안 된다(공개 라우트도 같은 규칙이다).
 */

export interface ExpoPublishPanelProps {
  pageId: string;
  pageTitle: string;
  hasPublished: boolean;
  liveAt: string | null;
  imwebUrl?: string | null;
  lastSeenAt?: string | null;
  lastSeenOrigin?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  /** 테스트에서 10분 경계를 고정한다. */
  now?: Date;
  readiness: ExpoReadinessView;
  snippets: ExpoSnippetsView;
  canPublish: boolean;
  /**
   * 자동저장이 아직 안 끝났거나 어긋났다. **발행은 저장된 초안을 굳히는 일**이라,
   * 저장 중에 누르면 방금 친 글이 빠진 사본이 밖에 나간다.
   */
  saveBlocked?: boolean;
  /**
   * 릴리스 승인 전인가. 켜는 것만 잠근다 — **이미 켜져 있으면 끄기는 언제나 눌린다.**
   */
  launchLocked?: boolean;
  /** 발행·공개가 끝나면 부른다 — 화면이 서버 상태를 다시 읽는다. */
  onChanged: () => void;
  /** 테스트/하니스는 같은 요청 라우터를 모든 내보내기 작업에 주입한다. */
  request?: ExpoEditorRequest;
}

export function ExpoPublishPanel({
  pageId, pageTitle, hasPublished, liveAt, imwebUrl = null, lastSeenAt = null,
  lastSeenOrigin = null, publishedAt = null, updatedAt = null, now,
  readiness, snippets, canPublish, saveBlocked, onChanged, launchLocked = false, request,
}: ExpoPublishPanelProps) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"publish" | "live" | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const live = Boolean(liveAt);
  const fallbackRequest = useCallback((path: string, init?: RequestInit) => window.fetch(path, init), []);
  const requester = request ?? fallbackRequest;

  /**
   * **바뀐 게 없으면 누를 것도 없다.**
   *
   * 서버가 "발행 뒤에 고친 내용이 있다" 를 판정해 내려보낸다(`readiness.notes` 의
   * `draft-ahead-of-published`). 이미 발행했고 그 알림이 없으면 초안과 발행본이 같다는 뜻이라
   * 다시 발행해도 아무 일이 일어나지 않는다 — 그런데 버튼이 눌리면 운영자는 **뭔가 했다고
   * 믿는다.** 공개 중이면 확인 모달까지 뜨고 아무것도 안 바뀐다.
   */
  const metadataWarnings = pageWarnings({
    imwebUrl, lastSeenAt, lastSeenOrigin, publishedAt, updatedAt, now: now ?? new Date(),
  });
  const notes = [
    ...readiness.notes,
    ...metadataWarnings.filter((warning) =>
      !readiness.notes.some((note) => note.code === warning.code)),
  ];
  const stale = notes.some((n) => n.code === "draft-ahead-of-published");
  const connectionNotes = metadataWarnings.filter((note) => note.code.startsWith("connection-"));
  const pageNotes = notes.filter((note) => !note.code.startsWith("connection-"));
  const nothingToPublish = hasPublished && !stale;
  const publishBlocked =
    !readiness.canPublish || nothingToPublish || Boolean(saveBlocked) || busy !== null;

  const call = useCallback(async (
    kind: "publish" | "live",
    path: string,
    body: unknown,
  ) => {
    setBusy(kind);
    try {
      const res = await requester(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const failed = (await res.json().catch(() => ({}))) as { error?: string; issues?: ReadinessIssue[] };
        // 사유가 오면 그걸 그대로 보여 준다 — 서버가 화면보다 최신이다.
        toast.error(failed.issues?.[0]?.message ?? failed.error ?? "처리하지 못했어요");
        return false;
      }
      onChanged();
      return true;
    } catch {
      toast.error("처리하지 못했어요. 연결을 확인해 주세요.");
      return false;
    } finally {
      setBusy(null);
    }
  }, [onChanged, requester]);

  const publish = useCallback(async () => {
    if (live) {
      const ok = await confirm({
        title: "지금 공개 중인 페이지예요",
        // 조사는 계산한다 — 하드코딩하면 "홈를" 처럼 틀린 말이 나온다.
        description:
          `발행하면 방문자가 보는 화면이 바로 바뀝니다. ${objectParticle(pageTitle)} 지금 발행할까요?`,
        confirmLabel: "발행하기",
        tone: "danger",
      });
      if (!ok) return;
    }
    const done = await call("publish", `/api/expo/pages/${encodeURIComponent(pageId)}/publish`, {});
    if (done) toast.success(live ? "발행했어요. 방문자 화면도 바뀌었어요." : "발행했어요.");
  }, [live, confirm, pageTitle, call, pageId]);

  const toggleLive = useCallback(async (next: boolean) => {
    if (next) {
      const ok = await confirm({
        title: "아임웹에 실제로 내보낼까요?",
        description:
          "켜는 순간 붙여 둔 코드 자리에 이 페이지가 나타납니다. 언제든 다시 끌 수 있어요.",
        confirmLabel: "공개하기",
      });
      if (!ok) return;
    }
    // 끄는 것은 확인 없이 즉시 — 되돌리기를 막으면 안 된다.
    const done = await call("live", `/api/expo/pages/${encodeURIComponent(pageId)}/live`, { live: next });
    if (done) toast.success(next ? "공개했어요." : "공개를 껐어요.");
  }, [confirm, call, pageId]);

  return (
    <section className={`${R.panel} ${FINISH.s1} space-y-3 bg-card p-3`} aria-labelledby="expo-publish-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="expo-publish-heading" className="text-sm font-semibold">내보내기</h2>
        <StateChip hasPublished={hasPublished} live={live} />
      </div>
      {/* 연결 진단은 발행 가능 여부와 별개다. 상단에서 보이되 어떤 버튼도 잠그지 않는다. */}
      <Reasons issues={connectionNotes} tone="note" />

      {/* ── 발행 ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {canPublish ? (
          <button
            type="button"
            onClick={() => void publish()}
            disabled={publishBlocked}
            className={`inline-flex min-h-9 w-full items-center justify-center gap-1.5 ${R.control} ${FINISH.control} bg-violet-500 px-3 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50`}
          >
            {busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {hasPublished ? "다시 발행" : "발행하기"}
          </button>
        ) : null}

        <Reasons issues={readiness.publishIssues} />
        <Reasons issues={pageNotes} tone="note" />
        {/* 왜 못 누르는지 말한다 — 회색 버튼만 두면 고장으로 읽힌다. */}
        {saveBlocked ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            저장이 끝나면 발행할 수 있어요.
          </p>
        ) : nothingToPublish ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            발행본과 같아요. 고친 내용이 생기면 다시 발행할 수 있어요.
          </p>
        ) : null}
      </div>

      {/* ── 공개 스위치 ──────────────────────────────────────────── */}
      {canPublish ? (
        <div className={`${R.surface} ${FINISH.s2} space-y-1.5 bg-secondary p-2.5`}>
          <label className="flex items-center gap-2 text-[11px]">
            <Switch
              checked={live}
              onChange={(next) => void toggleLive(next)}
              // `!live &&` 안에 있으므로 **켜져 있으면 끄기는 항상 눌린다.**
            disabled={busy !== null || (!live && (!readiness.canGoLive || launchLocked))}
              label={`${pageTitle} 아임웹에 내보내기`}
            />
            <span>
              아임웹에 내보내기
              <span className="mt-0.5 block text-muted-foreground">
                {live
                  ? "지금 붙여 둔 자리에 이 페이지가 나오고 있어요."
                  : "켜면 붙여 둔 코드 자리에 나타나요."}
              </span>
            </span>
          </label>
          {/* 켤 수 없을 때만 사유를 말한다 — 이미 켜져 있으면 끄는 건 언제나 된다. */}
          {!live && launchLocked ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              아직 아임웹 공개가 열리지 않았어요. 준비가 끝나면 켤 수 있어요.
            </p>
          ) : null}
          {!live ? <Reasons issues={readiness.liveIssues} /> : null}
        </div>
      ) : null}

      {/* ── 붙일 코드 ────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <h3 className="text-[11px] font-medium text-muted-foreground">붙일 코드</h3>
        {!snippets.ok ? (
          <p className={`${R.surface} ${FINISH.s2Danger} bg-secondary p-2.5 text-[11px] leading-relaxed`}>
            {snippets.message}
          </p>
        ) : (
          <>
            <SnippetRow label="페이지 통짜" snippet={snippets.page} />
            {snippets.sections.map((section) => (
              <SnippetRow
                key={section.sid}
                label={section.label}
                snippet={section.snippet}
                issues={section.issues}
              />
            ))}
            {snippets.sections.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                구획 하나만 따로 붙이려면 그 구획의 &ldquo;이 구획만 따로 내보내기&rdquo; 를 켜세요.
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* 발행은 매일 누르는 조작이고 이력은 확인할 때만 읽는다. 접어 두면 기존 조작의
          네트워크 경로를 늘리지 않으면서 감사 기록은 바로 옆에서 열 수 있다. */}
      <div>
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          className="text-[11px] font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {historyOpen ? "발행 이력 닫기" : "발행 이력 보기"}
        </button>
        {historyOpen ? (
          <div className="mt-2">
            <ExpoRevisionPanel
              pageId={pageId}
              canPublish={canPublish}
              request={request}
              // PageEditor 는 이 신호로 발행본 쪽 값만 다시 읽는다. draft 는 그대로 남는다.
              onRolledBack={() => onChanged()}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** 상태는 색만으로 말하지 않는다 — 점이 아니라 글자를 함께 준다. */
function StateChip({ hasPublished, live }: { hasPublished: boolean; live: boolean }) {
  if (live) return <Chip tone="ok">공개 중</Chip>;
  if (hasPublished) return <Chip tone="warn">발행됨</Chip>;
  return <Chip>초안</Chip>;
}

type DisplayIssue = { code: string; message: string; sid?: string };

function Reasons({ issues, tone = "block" }: { issues: readonly DisplayIssue[]; tone?: "block" | "note" }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {issues.map((issue, index) => (
        <li
          key={`${issue.code}:${issue.sid ?? index}`}
          className={`text-[11px] leading-relaxed ${
            tone === "note" ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * 코드 한 줄 + 복사.
 *
 * 코드를 펼쳐 보여 주지 않는 이유: 이 칸은 좁고, 운영자가 하는 일은 **읽기가 아니라
 * 복사**다. 무엇을 붙이는지는 주소 한 줄로 충분하고, 필요하면 펼쳐 볼 수 있게 둔다.
 */
function SnippetRow({
  label, snippet, issues = [],
}: { label: string; snippet: ExpoSnippetView; issues?: ReadinessIssue[] }) {
  const [copied, setCopied] = useState(false);
  const blocked = issues.length > 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      // 성공은 토스트가 아니라 버튼에서 말한다 — 복사는 연달아 하는 동작이라 토스트가 쌓인다.
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("복사하지 못했어요. 코드를 직접 선택해 주세요.");
    }
  };

  return (
    <div className={`${R.surface} ${FINISH.s2} bg-secondary p-2`}>
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={blocked}
          aria-label={`${label} 코드 복사`}
          className={`inline-flex min-h-8 shrink-0 items-center gap-1 ${R.control} px-2 text-[11px] font-medium transition-colors ${
            blocked
              ? "cursor-not-allowed text-muted-foreground/50"
              : "bg-background text-foreground hover:bg-background/70"
          }`}
        >
          {copied
            ? <Check className="h-3.5 w-3.5" aria-hidden />
            : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      {blocked ? (
        <Reasons issues={issues} />
      ) : (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">코드 보기</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre text-[10px] leading-relaxed text-muted-foreground">
            {snippet.code}
          </pre>
        </details>
      )}
    </div>
  );
}
