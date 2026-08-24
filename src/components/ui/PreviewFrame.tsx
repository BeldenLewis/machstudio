"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Monitor, RotateCw, Smartphone } from "lucide-react";
import { FINISH, R } from "@/components/ui/primitives";

/**
 * 옆칸 미리보기 껍데기 — 기기 크기 iframe + 축소.
 *
 * **iframe 이어야 한다.** div 에 그리고 transform 으로 줄이면 CSS 의 vw 와 미디어 쿼리가
 * 프레임이 아니라 브라우저 창 폭을 본다. 모바일 미리보기가 390px 인데도 데스크톱 규칙이
 * 걸려 제목이 92px 로 잡히고 바닥 요소가 본문을 뚫고 올라오는 화면이 나왔다 —
 * 실물은 멀쩡한데 미리보기만 깨져 보이는, 가장 나쁜 종류의 거짓말이었다.
 *
 * **프레임 높이는 기기 화면 크기 그대로다.** 내용 높이로 늘리면 100svh 를 쓰는 히어로와
 * 되먹임이 걸린다: 높이 ↑ → svh ↑ → 히어로 ↑ → 내용 ↑ … 실측으로 5408px 까지 자랐다.
 * 스크롤은 프레임 안에서 한다 — 그게 방문자가 보는 것과 같다.
 *
 * 두 가지로 쓴다:
 *   src      — 이미 있는 미리보기 URL 을 띄운다(투표·결과·발표처럼 서버가 그리는 화면).
 *   onMount  — 편집 중이라 저장 전 값을 그려야 할 때(공고). iframe 문서를 넘겨준다.
 */
export function PreviewFrame({
  title,
  src,
  onMount,
  note,
  reloadKey,
  openLabel = "새 탭에서 열기",
  controls,
}: {
  title: string;
  src?: string;
  /** iframe 문서에 직접 그린다. 정리 함수를 돌려주면 언마운트 때 부른다. */
  onMount?: (doc: Document) => (() => void) | void;
  note?: string;
  /** 값이 바뀌면 다시 불러온다 — 설정을 고친 뒤 미리보기를 맞추는 용도. */
  reloadKey?: string | number;
  openLabel?: string;
  /** 제목 줄에 끼워 넣을 선택기 — 한 패널에서 여러 화면을 번갈아 볼 때(예선/본선, 결과/발표). */
  controls?: React.ReactNode;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [box, setBox] = useState(0);
  const [nonce, setNonce] = useState(0);

  // 칸 폭이 바뀌면 배율을 다시 잡는다(사이드바 접기·창 크기).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBox(el.clientWidth));
    observer.observe(el);
    setBox(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const [frameWidth, frameHeight] = device === "desktop" ? [1280, 800] : [390, 844];
  /**
   * 배율에 상한을 두지 않는다. 상한이 1 이면 칸(≈460px)이 모바일 프레임(390px)보다 넓을 때
   * 축소가 안 걸려 프레임이 왼쪽에 붙고 남는 폭이 오른쪽에만 검게 남는다 —
   * "화면 오른쪽이 잘렸다"로 보인다. 확대를 허용하면 칸을 채우면서도 실제 폰 폭을 본다.
   */
  const scale = box > 0 ? box / frameWidth : 0.3;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!onMount) return;
    const frame = frameRef.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;

    // about:blank 를 우리 것으로 갈아 끼운다. viewport 메타가 있어야 프레임 폭이 CSS 픽셀이 된다.
    doc.open();
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        "</head><body></body></html>",
    );
    doc.close();
    doc.body.style.margin = "0";

    const cleanup = onMount(doc);
    return () => { if (cleanup) cleanup(); };
  }, [onMount]);

  // src 로 띄울 때만 캐시를 우회한다 — 미리보기는 방금 고친 값을 봐야 한다.
  const resolvedSrc = src ? `${src}${src.includes("?") ? "&" : "?"}_r=${reloadKey ?? ""}.${nonce}` : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="shrink-0 text-sm font-semibold">{title}</h2>
          {controls}
        </div>
        <div className="flex items-center gap-1">
          {src && (
            <>
              <button
                onClick={reload}
                title="다시 불러오기"
                aria-label="다시 불러오기"
                className={`bg-secondary p-1.5 text-muted-foreground transition-colors hover:text-foreground ${R.control}`}
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                title={openLabel}
                aria-label={openLabel}
                className={`bg-secondary p-1.5 text-muted-foreground transition-colors hover:text-foreground ${R.control}`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          )}
          {([["desktop", Monitor, "데스크톱"], ["mobile", Smartphone, "모바일"]] as const).map(
            ([value, Icon, label]) => (
              <button
                key={value}
                onClick={() => setDevice(value)}
                title={label}
                aria-label={label}
                className={`p-1.5 transition-colors ${R.control} ${
                  device === value ? "bg-violet-500 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ),
          )}
        </div>
      </div>

      {/* transform 은 레이아웃 박스를 줄이지 않는다 — 껍데기에 축소된 크기를 직접 준다. */}
      <div ref={boxRef} className={`overflow-hidden bg-black ${R.panel} ${FINISH.s1}`}>
        <div style={{ width: box || undefined, height: frameHeight * scale, overflow: "hidden" }}>
          <iframe
            ref={frameRef}
            key={resolvedSrc}
            src={resolvedSrc}
            title={title}
            style={{
              width: frameWidth,
              height: frameHeight,
              border: 0,
              display: "block",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {note ? `${note} · ` : ""}
        {frameWidth}×{frameHeight} 화면을 {Math.round(scale * 100)}%로 · 스크롤은 미리보기 안에서
      </p>
    </div>
  );
}
