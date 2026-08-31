"use client";

import { useEffect, useState } from "react";

/**
 * CSS `print:` 클래스로 화면/인쇄용 두 마크업을 동시에 DOM에 심어두고 display 로만
 * 스위칭하는 방식은 요약 대시보드 PDF 내보내기에서 반복적으로 깨졌다 — 인쇄 미리보기가
 * 화면용 마크업(고정 140px recharts 도넛 등)을 그대로 보여준 사례가 있었다. `display:none`
 * 전환이 아니라 실제로 어떤 마크업을 렌더링할지 JS 로 분기해 인쇄 시엔 화면용 마크업이
 * DOM에 존재조차 하지 않게 한다 — CSS 캐스케이드/미디어쿼리 우선순위에 기대지 않는다.
 */
export function usePrintMode(): boolean {
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("print");
    const update = () => setIsPrinting(mql.matches);
    update();
    mql.addEventListener("change", update);
    window.addEventListener("beforeprint", update);
    window.addEventListener("afterprint", update);
    return () => {
      mql.removeEventListener("change", update);
      window.removeEventListener("beforeprint", update);
      window.removeEventListener("afterprint", update);
    };
  }, []);

  return isPrinting;
}
