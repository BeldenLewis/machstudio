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
 * 폭을 축소해서 보여준다 — 380px 칸에 1280px 페이지를 그대로 넣으면 전부 모바일 레이아웃으로
 * 접혀서 정작 확인하려는 데스크톱 배치가 안 보인다.
 */
export default function NoticePreviewPane({
  competition,
  config,
}: {
  competition: NoticeCompetition;
  config: unknown;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [box, setBox] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  // 칸 폭이 바뀌면 축소 배율을 다시 잡는다(사이드바 접기·창 크기).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBox(el.clientWidth));
    observer.observe(el);
    setBox(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  /**
   * 축소된 내용의 실제 높이를 잰다.
   *
   * transform: scale 은 **레이아웃 박스를 줄이지 않는다** — 그대로 두면 스크롤 영역 아래로
   * 원본 높이만큼 빈 공간이 남는다(1280px 페이지를 30%로 줄이면 70%가 허공).
   * 그래서 잰 높이 × 배율을 껍데기 높이로 준다.
   */
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setContentHeight(el.scrollHeight));
    observer.observe(el);
    setContentHeight(el.scrollHeight);
    return () => observer.disconnect();
  }, []);

  const frameWidth = device === "desktop" ? 1280 : 390;
  const scale = box > 0 ? Math.min(1, box / frameWidth) : 0.3;

  useEffect(() => {
    const mount = hostRef.current;
    if (!mount) return;
    const handle = mountNotice({
      mount,
      competition,
      config,
      embedded: false,
      isPreview: true,
      // 미리보기에서 신청을 눌러도 아무 일도 없어야 한다 — 여기서 참가작이 생기면 안 된다.
      onApply: () => {},
      // 목차는 position:fixed 로 body 에 붙는다 → 어드민 화면 위로 떠서 편집을 가린다.
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

      <div ref={boxRef} className={`overflow-hidden bg-black ${R.panel} ${FINISH.s1}`}>
        <div className="max-h-[72vh] overflow-y-auto">
          {/*
            축소는 transform 으로 한다 — width/zoom 으로 줄이면 미디어 쿼리가 다시 걸려
            정작 확인하려던 데스크톱 배치가 모바일로 접힌다.

            대신 transform 은 **레이아웃 박스를 줄이지 않으므로** 껍데기에 축소된 크기를
            직접 준다. 폭까지 줘야 하는 이유: overflow-x:hidden + overflow-y:auto 조합은
            CSS 규칙상 x 축이 auto 로 승격돼 가로 스크롤이 생긴다(실측 1311 > 652).
          */}
          <div style={{ width: frameWidth * scale, height: contentHeight * scale, overflow: "hidden" }}>
            <div style={{ width: frameWidth, transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <div ref={hostRef} />
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        편집 중인 내용이 저장 전에도 바로 보여요 · {frameWidth}px 폭을 {Math.round(scale * 100)}%로 축소
      </p>
    </div>
  );
}
