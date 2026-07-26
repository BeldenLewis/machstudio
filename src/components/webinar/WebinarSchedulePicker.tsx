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

/**
 * 사전등록 마감 — **라이브 시작 시각에 상대적인 값**이라(시작 시점 / 하루 전 / 직접) 시작 시각을
 * 함께 받아야 한다. IA 3단계에서 이 컨트롤이 '등록 폼 › 접수 창' 으로 옮겨가면서, 만들기 폼과
 * 등록 폼이 같은 UI 를 쓰도록 따로 떼어냈다.
 */
export function SignupDeadlineField({
  liveStartAt, value, onChange, label = "사전등록 마감",
}: {
  /** "YYYY-MM-DDTHH:mm" — atStart/dayBefore 계산의 기준 */
  liveStartAt: string;
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  const [startDate, startTime] = splitLocal(liveStartAt);

  const [mode, setMode] = useState<DeadlineMode>(() => {
    if (!value) return "atStart";
    if (value === liveStartAt) return "atStart";
    if (startDate && value === joinLocal(addDaysYmd(startDate, -1), startTime)) return "dayBefore";
    return "custom";
  });
  const [custom, setCustom] = useState(() => splitLocal(value));

  const firstEmit = useRef(true);
  useEffect(() => {
    let next: string;
    if (mode === "atStart") next = liveStartAt;
    else if (mode === "dayBefore") next = startDate ? joinLocal(addDaysYmd(startDate, -1), startTime) : value;
    else next = joinLocal(custom[0], custom[1]);
    if (firstEmit.current) {
      firstEmit.current = false;
      if (next === value) return;
    }
    if (next && next !== value) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, custom, liveStartAt]);

  return (
    <div>
      <label className="mb-1.5 block text-xs text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {([
          { m: "atStart", label: "라이브 시작 시점" },
          { m: "dayBefore", label: "하루 전 같은 시각" },
          { m: "custom", label: "직접 지정" },
        ] as { m: DeadlineMode; label: string }[]).map(({ m, label: l }) => (
          <motion.button
            key={m}
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={spring}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${
              mode === m ? "bg-violet-500/10 text-violet-500" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            {l}
          </motion.button>
        ))}
      </div>
      {mode === "custom" && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <input type="date" value={custom[0]} aria-label="마감 날짜"
            onChange={(e) => setCustom([e.target.value, custom[1] || "23:59"])}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none" />
          <input type="time" step={300} value={custom[1]} aria-label="마감 시각"
            onChange={(e) => setCustom([custom[0], e.target.value])}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none" />
        </div>
      )}
    </div>
  );
}

export default function WebinarSchedulePicker({
  value,
  onChange,
  /** 마감을 이 픽커에서 함께 고를지. 만들기 폼은 true(한 자리에서 전부),
   *  기본 정보 탭은 false — 마감은 '등록 폼 › 접수 창' 소관이다(IA 3단계). */
  showDeadline = true,
}: {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
  showDeadline?: boolean;
}) {
  const [initStartDate, initStartTime] = splitLocal(value.liveStartAt);
  const [initEndDate, initEndTime] = splitLocal(value.liveEndAt);

  const [startDate, setStartDate] = useState(initStartDate);
  const [endDate, setEndDate] = useState(initEndDate || initStartDate);
  const [startTime, setStartTime] = useState(initStartTime || "14:00");
  const [endTime, setEndTime] = useState(initEndTime || "16:00");

  // 상태 → 부모 값 전파
  const firstEmit = useRef(true);
  useEffect(() => {
    if (!startDate || !startTime || !endTime) return;
    const liveStartAt = joinLocal(startDate, startTime);
    const endD = endDate || startDate;
    const liveEndAt = joinLocal(endD, endTime);
    // 마감은 SignupDeadlineField 소유 — 여기서는 기존 값을 그대로 넘긴다.
    const signupDeadline = value.signupDeadline;
    // 첫 렌더의 동일값 재전파는 건너뛴다
    if (firstEmit.current) {
      firstEmit.current = false;
      if (liveStartAt === value.liveStartAt && liveEndAt === value.liveEndAt && signupDeadline === value.signupDeadline) return;
    }
    onChange({ liveStartAt, liveEndAt, signupDeadline });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, startTime, endTime]);

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

      {showDeadline && (
        <SignupDeadlineField
          liveStartAt={joinLocal(startDate, startTime)}
          value={value.signupDeadline}
          onChange={(next) =>
            onChange({
              liveStartAt: joinLocal(startDate, startTime),
              liveEndAt: joinLocal(endDate || startDate, endTime),
              signupDeadline: next,
            })
          }
        />
      )}
    </div>
  );
}
