"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, X } from "lucide-react";
import RangeCalendar from "@/components/webinar/RangeCalendar";

/**
 * 컴팩트 기간 필터 — 버튼을 누르면 범위 선택 달력 팝오버가 열린다.
 * 값은 "YYYY-MM-DD" 문자열, 빈 문자열이면 필터 없음(초기화 가능).
 */
export default function DateRangeField({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const label = from ? (to && to !== from ? `${from} ~ ${to}` : from) : "기간";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs hover:bg-secondary transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span className={from ? "" : "text-muted-foreground"}>{label}</span>
        {from && (
          <span
            role="button"
            tabIndex={0}
            aria-label="기간 필터 지우기"
            onClick={(e) => { e.stopPropagation(); onChange("", ""); }}
            className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="absolute left-0 mt-2 w-72 rounded-2xl border border-border bg-card shadow-xl z-30 p-3 origin-top-left"
          >
            <RangeCalendar start={from} end={to} onChange={(s, e) => onChange(s, e)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
