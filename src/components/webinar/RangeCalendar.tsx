"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { kstDateString } from "@/lib/datetime";

/**
 * 범위 선택 달력 — 시작일 클릭 → 종료일 클릭으로 기간을 지정한다 (구글 애널리틱스 스타일).
 * 값은 "YYYY-MM-DD" 순수 날짜 문자열. 시작만 있고 종료가 같으면 하루.
 * 3번째 클릭은 새 범위를 시작하고, 역순으로 클릭하면 자동 정렬한다.
 */
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
function pad(n: number) { return String(n).padStart(2, "0"); }

export default function RangeCalendar({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [view, setView] = useState(() => {
    const anchor = start || kstDateString();
    const [y, m] = anchor.split("-").map(Number);
    return { year: y, month: m - 1 };
  });

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.year, view.month, 1));
    const startWeekday = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
    const arr: (string | null)[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(`${view.year}-${pad(view.month + 1)}-${pad(d)}`);
    return arr;
  }, [view]);

  const today = kstDateString();

  const clickDay = (ymd: string) => {
    if (!selecting || !start) {
      onChange(ymd, ymd);
      setSelecting(true);
    } else {
      if (ymd >= start) onChange(start, ymd);
      else onChange(ymd, start);
      setSelecting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{view.year}년 {view.month + 1}월</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setView((v) => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 })}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary transition-colors" aria-label="이전 달">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setView((v) => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 })}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary transition-colors" aria-label="다음 달">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`text-[11px] py-1 font-medium ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted-foreground"}`}>{w}</div>
        ))}
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={`e${i}`} />;
          const eff = end || start;
          const isStart = ymd === start;
          const isEnd = ymd === eff;
          const inRange = start && eff && ymd > start && ymd < eff;
          const isToday = ymd === today;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => clickDay(ymd)}
              className={`relative aspect-square flex items-center justify-center text-xs rounded-lg transition-colors ${
                isStart || isEnd
                  ? "bg-violet-500 text-white font-semibold"
                  : inRange
                    ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                    : "hover:bg-secondary"
              }`}
            >
              {Number(ymd.slice(8, 10))}
              {isToday && !isStart && !isEnd && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-violet-500" />
              )}
            </button>
          );
        })}
      </div>
      {selecting && (
        <p className="mt-2 text-[11px] text-muted-foreground">종료일을 클릭하세요 (같은 날이면 하루)</p>
      )}
    </div>
  );
}
