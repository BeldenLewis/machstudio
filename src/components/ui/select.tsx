"use client";

import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  dividerBefore?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  size?: "default" | "sm";
  prefix?: React.ReactNode;
}

export function Select({ value, onChange, options, placeholder = "선택", className = "", size = "default", prefix }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  const triggerBase =
    size === "sm"
      ? "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border bg-background text-xs font-medium hover:bg-secondary transition-colors cursor-pointer select-none"
      : "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-background text-sm hover:border-violet-400/60 transition-all cursor-pointer select-none";

  const labelCls = selected ? "text-foreground" : "text-muted-foreground";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerBase}
      >
        {prefix && <span className="text-muted-foreground shrink-0">{prefix}</span>}
        <span className={`flex-1 truncate text-left ${labelCls}`}>
          {selected?.label ?? placeholder}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }} className="shrink-0">
          <ChevronDown className={size === "sm" ? "w-3.5 h-3.5 text-muted-foreground" : "w-4 h-4 text-muted-foreground"} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute top-full left-0 mt-1.5 z-50 w-max min-w-full bg-background border border-border rounded-2xl shadow-lg overflow-hidden"
          >
            <div className="p-1">
              {placeholder && (
                <button
                  type="button"
                  onClick={() => { onChange(""); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${
                    value === "" ? "text-foreground font-medium bg-violet-500/10" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <span className="whitespace-nowrap">{placeholder}</span>
                  {value === "" && <Check className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                </button>
              )}
              {options.map((opt) => (
                <div key={opt.value}>
                  {opt.dividerBefore && <div className="my-1 mx-1 h-px bg-border" />}
                  <button
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${
                      value === opt.value
                        ? "text-foreground font-medium bg-violet-500/10"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    <span className="whitespace-nowrap">{opt.label}</span>
                    {value === opt.value && <Check className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
