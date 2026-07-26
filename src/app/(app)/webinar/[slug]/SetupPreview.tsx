"use client";

/**
 * 만들기 › 인접 실시간 미리보기.
 *
 * 왜 만드는가: 로그인해서 실제 화면을 보고 나서야 알게 된 것 — 만들기 폼은 max-w-2xl(약 490px)인데
 * 콘텐츠 영역이 1050px 이라 **화면의 절반이 빈 흰 공간**이었다. 그리고 AGENTS §2(고치는 영역)는
 * "자동저장 + **인접 실시간 미리보기**" 를 명시적으로 요구하는데, 미리보기가 "새 탭에서 열기"
 * 링크 하나였다. 빈 절반에 그 미리보기를 넣으면 두 문제가 같이 해결된다.
 *
 * 새 인프라가 없다: 공개 페이지를 소유자 미리보기 파라미터로 그대로 띄운다(목업이 아니라 실물이라
 * "미리보기와 실제가 다르다" 가 생기지 않는다). 부작용은 뷰어 쪽 isPreviewUrl 가드가 막는다.
 *
 * 폴러가 늘지 않는다 — 확인했다: live/page.tsx 의 폴링 이펙트 두 개(사전 /status 30초,
 * 라이브 통합 /live-state 12초)가 모두 첫 줄에서 `if (isPreviewUrl()) return;` 한다.
 * 그래서 이 iframe 은 /live-state 요청을 **0건** 만든다("새 폴러 금지" 제약과 충돌하지 않는다).
 */

import { useEffect, useRef, useState } from "react";
import { Monitor, RefreshCw, Smartphone, ExternalLink, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useAggregateAutosave } from "@/components/ui/autosave-scope";
import { btnCls, FINISH, R, Segmented } from "@/components/ui/primitives";
import type { WatchState } from "./LivePageTab";

export type SetupSection = "source" | "landing" | "registration" | "watch" | "survey";

/** 뷰어 미리보기 파라미터 — 어드민 상태 → 공개 페이지의 순간. */
const WATCH_PREVIEW: Record<WatchState, string> = {
  waiting: "registration",
  entry: "entry",
  live: "live",
  ended: "ended",
};

/**
 * 섹션마다 "지금 고치는 것이 실제로 보이는 면" 이 다르다.
 *
 * · 원본 정보 — 이름·진행 순서·브랜드가 한 화면에 가장 많이 드러나는 건 랜딩이다.
 * · 등록      — 등록 폼은 별도 라우트가 없다. live 의 signup 뷰가 그 폼이다.
 * · 설문      — 설문마다 URL 이 달라(surveyId) 껍데기가 어느 설문인지 모른다. 그래서 없음.
 *               (설문 탭이 자기 안에서 미리보기를 이미 그린다.)
 */
export function previewUrlFor(section: SetupSection, slug: string, watchState: WatchState): string | null {
  const s = encodeURIComponent(slug);
  switch (section) {
    case "source":
    case "landing":
      return `/webinar/${s}/landing`;
    case "registration":
      return `/webinar/${s}/live?preview=registration&embed=1`;
    case "watch":
      return `/webinar/${s}/live?preview=${WATCH_PREVIEW[watchState]}&embed=1`;
    case "survey":
      return null;
  }
}

type Device = "mobile" | "desktop";
/** 실제 뷰어 폭. 패널은 이보다 좁으므로 축소해서 넣는다 — 좁은 iframe 에 그리면 항상 모바일 레이아웃만 보인다. */
const DEVICE_W: Record<Device, number> = { mobile: 390, desktop: 1280 };

export default function SetupPreview({
  section,
  slug,
  watchState,
  open,
  onOpenChange,
}: {
  section: SetupSection;
  slug: string;
  watchState: WatchState;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const url = previewUrlFor(section, slug, watchState);
  const [device, setDevice] = useState<Device>("desktop");
  /** iframe 리마운트 키 — contentWindow 를 만지지 않고 확실하게 다시 불러오는 방법. */
  const [nonce, setNonce] = useState(0);
  const { state: saveState } = useAggregateAutosave();
  const prevSave = useRef(saveState);

  /**
   * 저장이 끝난 순간에만 새로고침한다. "저장 중" 에 하면 아직 서버에 없는 값을 다시 읽고,
   * 매 타이핑마다 하면 iframe 이 깜빡이며 입력을 방해한다.
   */
  useEffect(() => {
    if (prevSave.current === "saving" && saveState === "saved") setNonce((n) => n + 1);
    prevSave.current = saveState;
  }, [saveState]);

  /** 폭을 재서 축소 배율을 정한다 — 390/1280 을 패널 폭에 맞춘다. */
  const shellRef = useRef<HTMLDivElement>(null);
  const [shellW, setShellW] = useState(0);
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setShellW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        title="미리보기 열기"
        className={btnCls("quiet", "absolute right-4 top-4 z-10 hidden lg:inline-flex")}
      >
        <PanelRightOpen className="h-4 w-4" />
        미리보기
      </button>
    );
  }

  const w = DEVICE_W[device];
  const scale = shellW > 0 ? Math.min(1, shellW / w) : 1;

  return (
    <aside className={`hidden min-h-0 min-w-0 flex-col gap-3 border-l border-border bg-secondary p-4 lg:flex`}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Segmented
          label="미리보기 폭"
          value={device}
          onChange={setDevice}
          options={[
            { value: "desktop", label: (<><Monitor className="h-3.5 w-3.5" /> 데스크톱</>), hint: "1280px 기준" },
            { value: "mobile", label: (<><Smartphone className="h-3.5 w-3.5" /> 모바일</>), hint: "390px 기준" },
          ]}
        />
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setNonce((n) => n + 1)} title="새로고침"
            aria-label="미리보기 새로고침" className={btnCls("ghost", "h-9 w-9 !px-0")}>
            <RefreshCw className="h-4 w-4" />
          </button>
          {url && (
            /* 새 탭에서는 embed 를 떼서 소유자 전환 바를 살린다 — 넓은 화면에선 그게 유용하다. */
            <a href={url.replace(/&embed=1/, "")} target="_blank" rel="noopener noreferrer" title="새 탭에서 열기"
              aria-label="미리보기를 새 탭에서 열기" className={btnCls("ghost", "h-9 w-9 !px-0")}>
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button type="button" onClick={() => onOpenChange(false)} title="미리보기 접기"
            aria-label="미리보기 접기" className={btnCls("ghost", "h-9 w-9 !px-0")}>
            <PanelRightClose className="h-4 w-4" />
          </button>
        </span>
      </div>

      {/* 실제 폭을 축소해 넣는다 — 패널 폭에 그대로 그리면 데스크톱 레이아웃을 볼 수 없다.
          그래서 배율을 함께 적어 둔다(무엇을 보고 있는지 숨기지 않는다). */}
      <div ref={shellRef} className="min-h-0 flex-1 overflow-hidden">
        {url ? (
          <div
            className={`overflow-hidden bg-white ${R.panel} ${FINISH.s1}`}
            style={{
              width: w,
              height: shellW > 0 ? `${100 / scale}%` : "100%",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <iframe
              key={`${url}-${nonce}`}
              src={url}
              title="공개 화면 미리보기"
              className="h-full w-full border-0"
              // 자체 오리진이지만 미리보기는 읽기 전용이면 충분하다 — 폼 제출·팝업은 필요 없다.
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        ) : (
          <p className={`bg-card p-3 text-xs leading-relaxed text-muted-foreground ${R.surface} ${FINISH.s2}`}>
            설문은 각 설문마다 주소가 달라서 여기서 한 화면으로 보여줄 수 없어요.
            설문 편집 화면 안의 미리보기를 사용하세요.
          </p>
        )}
      </div>

      <p className="shrink-0 text-[11px] leading-relaxed text-muted-foreground">
        저장된 내용 기준 · {DEVICE_W[device]}px 를 {Math.round(scale * 100)}% 로 축소 · 자동저장이 끝나면 새로고침돼요
      </p>
    </aside>
  );
}
