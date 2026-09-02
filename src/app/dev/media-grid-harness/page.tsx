"use client";

/**
 * 미디어 카드 그리드 크기 검증용 하니스 — **개발 환경 전용**.
 *
 * /media 는 로그인 뒤에 있어 브라우저 자동화로 뷰포트를 넓혀 가며 확인할 수 없다.
 * 카드 크기 로직(grid-cols-[repeat(auto-fill,minmax(150px,1fr))])만 떼어 내
 * 같은 클래스로 실제 페이지와 동일하게 렌더한다.
 *
 * 프로덕션에서는 404.
 */

import { notFound } from "next/navigation";

if (process.env.NODE_ENV === "production") notFound();

const PLACEHOLDER_COUNT = 24;

export default function MediaGridHarness() {
  return (
    <div className="p-6 space-y-4">
      <p data-testid="viewport-width" className="text-xs text-muted-foreground">
        폭을 바꿔가며 카드가 150px 근처로 유지되는지, 창을 넓히면 카드가 아니라
        열(컬럼) 개수가 느는지 확인한다.
      </p>
      <div
        data-testid="media-grid"
        className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3"
      >
        {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
          <div
            key={i}
            data-testid="media-card"
            className="overflow-hidden rounded-xl bg-card shadow-sm"
          >
            <div className="flex aspect-square items-center justify-center bg-secondary text-xs text-muted-foreground">
              {i + 1}
            </div>
            <div className="p-2.5">
              <p className="truncate text-xs font-medium">placeholder-{i + 1}.jpg</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
