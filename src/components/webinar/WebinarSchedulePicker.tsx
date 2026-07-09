"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import RangeCalendar from "./RangeCalendar";

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

  const [deadlineMode, setDeadlineMode] = useState<DeadlineMode>(() => {
    const dl = value.signupDeadline;
    if (!dl) return "atStart";
    if (dl === value.liveStartAt) return "atStart";
    const [sd, st] = splitLocal(value.liveStartAt);
    if (sd && dl === joinLocal(addDaysYmd(sd, -1), st)) return "dayBefore";
    return "custom";
  });
  const [customDeadline, setCustomDeadline] = useState(() => splitLocal(value.signupDeadline));

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

  const rangeSummary = startDate
    ? (startDate === (endDate || startDate)
        ? fmtDay(startDate)
        : `${fmtDay(startDate)} ~ ${fmtDay(endDate)}`)
    : "날짜를 선택하세요";

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4 space-y-4">
      {/* 달력 — 범위 선택 (시작일 클릭 → 종료일 클릭) */}
      <div>
        <RangeCalendar start={startDate} end={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" />
          {rangeSummary}
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
