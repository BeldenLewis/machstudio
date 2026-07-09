"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { kstDateString } from "@/lib/datetime";

/**
 * 웨비나 일정 픽커 — 달력 하나에서 라이브 시작일~종료일을 범위로 선택하고,
 * 시간은 time 입력, 사전등록 마감은 프리셋(시작 시점/하루 전/직접)으로 지정한다.
 * 값은 KST 벽시각 "YYYY-MM-DDTHH:mm" 문자열로 주고받아 부모의 kstDateTimeLocalToIso 흐름과 호환.
 */
export interface ScheduleValue {
  liveStartAt: string;   // "YYYY-MM-DDTHH:mm"
  liveEndAt: string;
  signupDeadline: string;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

function pad(n: number) { return String(n).padStart(2, "0"); }
function splitLocal(s: string): [string, string] {
  if (!s || s.length < 16) return ["", ""];
  return [s.slice(0, 10), s.slice(11, 16)];
}
function joinLocal(date: string, time: string): string {
  return date && time ? `${date}T${time}` : "";
}
// "YYYY-MM-DD" 순수 날짜 연산 (UTC 기준 — DST/로컬 타임존 드리프트 방지)
function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function fmtDay(ymd: string): string {
  if (!ymd) return "";
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}월 ${d}일(${WEEKDAYS[weekdayOf(ymd)]})`;
}

type DeadlineMode = "atStart" | "dayBefore" | "custom";

export default function WebinarSchedulePicker({
  value,
  onChange,
}: {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
}) {
  const [initStartDate, initStartTime] = splitLocal(value.liveStartAt);
  const [initEndDate, initEndTime] = splitLocal(value.liveEndAt);

  const [startDate, setStartDate] = useState(initStartDate);
  const [endDate, setEndDate] = useState(initEndDate || initStartDate);
  const [startTime, setStartTime] = useState(initStartTime || "14:00");
  const [endTime, setEndTime] = useState(initEndTime || "16:00");
  const [selecting, setSelecting] = useState(false);

  const [deadlineMode, setDeadlineMode] = useState<DeadlineMode>(() => {
    const dl = value.signupDeadline;
    if (!dl) return "atStart";
    if (dl === value.liveStartAt) return "atStart";
    const [sd, st] = splitLocal(value.liveStartAt);
    if (sd && dl === joinLocal(addDaysYmd(sd, -1), st)) return "dayBefore";
    return "custom";
  });
  const [customDeadline, setCustomDeadline] = useState(() => splitLocal(value.signupDeadline));

  // 보이는 달 (시작일 기준, 없으면 KST 오늘)
  const [view, setView] = useState(() => {
    const anchor = initStartDate || kstDateString();
    const [y, m] = anchor.split("-").map(Number);
    return { year: y, month: m - 1 };
  });

  // 상태 → 부모 값 전파
  const firstEmit = useRef(true);
  useEffect(() => {
    if (!startDate || !startTime || !endTime) return;
    const liveStartAt = joinLocal(startDate, startTime);
    const endD = endDate || startDate;
    const liveEndAt = joinLocal(endD, endTime);
    let signupDeadline: string;
    if (deadlineMode === "atStart") signupDeadline = liveStartAt;
    else if (deadlineMode === "dayBefore") signupDeadline = joinLocal(addDaysYmd(startDate, -1), startTime);
    else signupDeadline = joinLocal(customDeadline[0], customDeadline[1]);
    // 첫 렌더의 동일값 재전파는 건너뛴다
    if (firstEmit.current) {
      firstEmit.current = false;
      if (liveStartAt === value.liveStartAt && liveEndAt === value.liveEndAt && signupDeadline === value.signupDeadline) return;
    }
    onChange({ liveStartAt, liveEndAt, signupDeadline });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, startTime, endTime, deadlineMode, customDeadline]);

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
    if (!selecting) {
      // 새 범위 시작 — 일단 당일로
      setStartDate(ymd);
      setEndDate(ymd);
      setSelecting(true);
    } else {
      // 두 번째 클릭 — 범위 확정 (앞뒤 자동 정렬)
      const anchorDate = startDate;
      if (ymd >= anchorDate) { setStartDate(anchorDate); setEndDate(ymd); }
      else { setStartDate(ymd); setEndDate(anchorDate); }
      setSelecting(false);
    }
  };

  const monthLabel = `${view.year}년 ${view.month + 1}월`;
  const rangeSummary = startDate
    ? (startDate === (endDate || startDate)
        ? fmtDay(startDate)
        : `${fmtDay(startDate)} ~ ${fmtDay(endDate)}`)
    : "날짜를 선택하세요";

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4 space-y-4">
      {/* 달력 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">{monthLabel}</span>
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
            const end = endDate || startDate;
            const isStart = ymd === startDate;
            const isEnd = ymd === end;
            const inRange = startDate && end && ymd > startDate && ymd < end;
            const isToday = ymd === today;
            const dayNum = Number(ymd.slice(8, 10));
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
                {dayNum}
                {isToday && !isStart && !isEnd && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-violet-500" />
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" />
          {selecting ? "종료일을 클릭하세요 (같은 날이면 하루 일정)" : rangeSummary}
        </p>
      </div>

      {/* 시간 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">라이브 시작 시각</label>
          <input type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">라이브 종료 시각</label>
          <input type="time" step={300} value={endTime} onChange={(e) => setEndTime(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
        </div>
      </div>

      {/* 사전등록 마감 */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">사전등록 마감</label>
        <div className="flex flex-wrap gap-1.5">
          {([
            { m: "atStart", label: "라이브 시작 시점" },
            { m: "dayBefore", label: "하루 전 같은 시각" },
            { m: "custom", label: "직접 지정" },
          ] as { m: DeadlineMode; label: string }[]).map(({ m, label }) => (
            <motion.button
              key={m}
              type="button"
              whileTap={{ scale: 0.96 }}
              transition={spring}
              onClick={() => setDeadlineMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                deadlineMode === m ? "border-violet-500 bg-violet-500/10 text-violet-500" : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {label}
            </motion.button>
          ))}
        </div>
        {deadlineMode === "custom" && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <input type="date" value={customDeadline[0]} onChange={(e) => setCustomDeadline([e.target.value, customDeadline[1] || "23:59"])}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
            <input type="time" step={300} value={customDeadline[1]} onChange={(e) => setCustomDeadline([customDeadline[0], e.target.value])}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors" />
          </div>
        )}
      </div>
    </div>
  );
}
