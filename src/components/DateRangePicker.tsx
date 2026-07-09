"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronDown } from "lucide-react";
import { kstDateString } from "@/lib/datetime";
import RangeCalendar from "@/components/webinar/RangeCalendar";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

export const ALL_TIME_LABEL = "전체 기간";

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

function presets(allowAllTime: boolean): DateRange[] {
  const now = new Date();
  const startOfTodayKST = () => {
    const ks = kstDateString(now);
    return new Date(ks + "T00:00:00+09:00");
  };
  const today = startOfTodayKST();
  const endOfToday = new Date(today.getTime() + 86400_000 - 1);
  const list: DateRange[] = [
    { from: today, to: endOfToday, label: "오늘" },
    { from: new Date(today.getTime() - 86400_000), to: new Date(today.getTime() - 1), label: "어제" },
    { from: new Date(today.getTime() - 7 * 86400_000), to: endOfToday, label: "최근 7일" },
    { from: new Date(today.getTime() - 30 * 86400_000), to: endOfToday, label: "최근 30일" },
    { from: new Date(today.getTime() - 90 * 86400_000), to: endOfToday, label: "최근 90일" },
    { from: new Date(today.getTime() - 365 * 86400_000), to: endOfToday, label: "최근 365일" },
  ];
  if (allowAllTime) {
    // 전체 기간: epoch(1970) ~ 오늘 끝 → 서버에서 사실상 전체 범위로 조회
    list.push({ from: new Date(0), to: endOfToday, label: ALL_TIME_LABEL });
  }
  return list;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** "전체 기간" 프리셋 노출 여부 (기본 false) */
  allowAllTime?: boolean;
}

export default function DateRangePicker({ value, onChange, allowAllTime = false }: Props) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(kstDateString(value.from));
  const [customTo, setCustomTo] = useState(kstDateString(value.to));
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const applyCustom = () => {
    const from = new Date(customFrom + "T00:00:00+09:00");
    const to = new Date(customTo + "T23:59:59+09:00");
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return;
    onChange({ from, to, label: `${customFrom} ~ ${customTo}` });
    setOpen(false);
  };

  return (
    <div ref={dropRef} className="relative">
      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.96 }}
        transition={spring}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background text-xs hover:bg-secondary transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{value.label}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </motion.button>
      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={spring}
          className="absolute right-0 mt-2 w-80 rounded-2xl border border-border bg-card shadow-xl z-20 p-3 space-y-2 origin-top-right"
        >
          <div className="space-y-1">
            {presets(allowAllTime).map((p) => (
              <motion.button
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                transition={spring}
                key={p.label}
                onClick={() => { onChange(p); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  value.label === p.label ? "bg-violet-500/10 text-violet-500" : "hover:bg-secondary"
                }`}
              >
                {p.label}
              </motion.button>
            ))}
          </div>
          <div className="border-t border-border pt-2 space-y-2">
            <p className="text-[11px] text-muted-foreground">기간 선택 (시작일 → 종료일 클릭)</p>
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`flex-1 px-2 py-1.5 rounded-lg border text-center ${customFrom ? "border-violet-400 text-foreground" : "border-border text-muted-foreground"}`}>
                {customFrom || "시작일"}
              </span>
              <span className="text-muted-foreground">~</span>
              <span className={`flex-1 px-2 py-1.5 rounded-lg border text-center ${customTo ? "border-violet-400 text-foreground" : "border-border text-muted-foreground"}`}>
                {customTo || "종료일"}
              </span>
            </div>
            <RangeCalendar start={customFrom} end={customTo} onChange={(s, e) => { setCustomFrom(s); setCustomTo(e); }} />
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
              onClick={applyCustom}
              className="w-full py-1.5 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors"
            >
              적용
            </motion.button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
