"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { FINISH, R } from "@/components/ui/primitives";
import { mountNotice } from "@/lib/notice/mount";
import type { NoticeCompetition } from "@/lib/notice/types";

/**
 * 공고 옆칸 미리보기.
 *
 * 임베드와 **같은 mountNotice** 를 쓴다 — 어드민에서 React 로 다시 그리면 "미리보기에서는
 * 괜찮았는데"가 반드시 생긴다(공고·신청 폼 모두 같은 원칙).
 *
 * 저장을 기다리지 않는다: 편집 중인 config 를 그대로 넘겨 즉시 다시 마운트한다. 웨비나 랜딩
 * 미리보기는 저장 뒤 새로고침이라 색 하나 보려고 저장을 눌러야 했는데, 그게 편집 리듬을 끊는다.
 *
 * **iframe 안에 그린다.** 예전에는 div 에 그리고 transform 으로 줄였는데, 그러면 공고 CSS 의
 * vw 와 미디어 쿼리가 프레임이 아니라 **브라우저 창 폭**을 본다. 그래서 모바일 미리보기가
 * 390px 인데도 데스크톱 규칙이 걸려, 제목이 clamp(44px, 7vw, 92px) 의 92px 로 잡히고
 * 바닥에 절대 배치된 팩트 줄이 제목을 뚫고 올라오는 화면이 나왔다 — 실물은 멀쩡한데
 * 미리보기만 깨져 보이는, 가장 나쁜 종류의 거짓말이었다.
 */
export default function NoticePreviewPane({
  competition,
  config,
}: {
  competition: NoticeCompetition;
  config: unknown;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [box, setBox] = useState(0);

  // 칸 폭이 바뀌면 배율을 다시 잡는다(사이드바 접기·창 크기).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBox(el.clientWidth));
    observer.observe(el);
    setBox(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  /**
   * 프레임은 **기기 화면 크기 그대로**다 — 내용 높이로 늘리면 안 된다.
   *
   * 히어로는 min-height: 100svh 라, iframe 높이를 내용 높이로 주면 되먹임이 걸린다:
   * 높이 ↑ → svh ↑ → 히어로 ↑ → 내용 높이 ↑ … 실측으로 히어로가 5408px 까지 자랐다.
   * 화면 높이를 고정하고 스크롤은 프레임 안에서 하게 두면, 그게 방문자가 보는 것과 같다.
   */
  const [frameWidth, frameHeight] = device === "desktop" ? [1280, 800] : [390, 844];
  /**
   * 배율에 상한을 두지 않는다.
   *
   * 예전에는 `Math.min(1, …)` 였다. 그러면 칸(≈460px)이 모바일 프레임(390px)보다 넓을 때
   * 축소가 안 걸려 프레임이 왼쪽에 붙고 남는 70px 이 오른쪽에만 검게 남았다 — "화면 오른쪽이
   * 잘렸다"로 보인다. 확대를 허용하면 칸을 꽉 채우면서도 **실제 폰 폭(390px)의 레이아웃**을
   * 그대로 본다. 검은 여백을 없애려고 프레임을 460px 로 넓히면 폰이 아닌 폭을 보게 된다.
   */
  const scale = box > 0 ? box / frameWidth : 0.3;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;

    // about:blank 문서를 우리 것으로 갈아 끼운다. viewport 메타가 있어야 프레임 폭이
    // 그대로 CSS 픽셀이 된다.
    doc.open();
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        "</head><body></body></html>",
    );
    doc.close();
    doc.body.style.margin = "0";

    const handle = mountNotice({
      mount: doc.body,
      competition,
      config,
      embedded: false,
      isPreview: true,
      // 미리보기에서 신청을 눌러도 아무 일도 없어야 한다 — 여기서 참가작이 생기면 안 된다.
      onApply: () => {},
      // 목차는 position:fixed 다. iframe 안에서는 프레임 밖으로 못 나가지만, 좁은 미리보기
      // 폭에서 본문을 가리므로 그대로 끈다.
      attachToc: false,
    });

    return () => handle.destroy();
  }, [competition, config]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">미리보기</h2>
        <div className="flex gap-1">
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
            title="공고 미리보기"
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
        편집 중인 내용이 저장 전에도 바로 보여요 · {frameWidth}×{frameHeight} 화면을{" "}
        {Math.round(scale * 100)}%로 · 스크롤은 미리보기 안에서
      </p>
    </div>
  );
}
