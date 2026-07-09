"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, X } from "lucide-react";
import RangeCalendar from "@/components/webinar/RangeCalendar";

/**
 * 컴팩트 기간 필터 — 버튼을 누르면 범위 선택 달력 팝오버가 열린다.
 * 팝오버는 포털(fixed)로 렌더해 부모의 overflow-hidden(필터 아코디언 등)에 잘리지 않는다.
 * 값은 "YYYY-MM-DD" 문자열, 빈 문자열이면 필터 없음. 지우기는 독립 버튼(키보드 접근 가능).
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
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 8, left: r.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false); // fixed 팝오버가 트리거에서 떨어지지 않게 스크롤 시 닫기
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const label = from ? (to && to !== from ? `${from} ~ ${to}` : from) : "기간";

  return (
    <div className="inline-flex items-center gap-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs hover:bg-secondary transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span className={from ? "" : "text-muted-foreground"}>{label}</span>
      </button>
      {from && (
        <button
          type="button"
          aria-label="기간 필터 지우기"
          onClick={() => onChange("", "")}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {mounted && createPortal(
        <AnimatePresence>
          {open && coords && (
            <motion.div
              ref={popRef}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 60 }}
              className="w-72 rounded-2xl border border-border bg-card shadow-xl p-3 origin-top-left"
            >
              <RangeCalendar start={from} end={to} onChange={(s, e) => onChange(s, e)} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
