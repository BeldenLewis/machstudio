"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;
const STORAGE_KEY = "mach_theme"; // "dark" | "light"

// 다크/라이트 전환 토글. 앱은 <html>.dark 클래스 기반이며, 선택은 localStorage 에 영속.
// 깜빡임(FOUC) 방지는 루트 레이아웃의 프리-페인트 스크립트가 담당(클래스를 렌더 전에 적용).
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* private mode — 세션 한정 전환 */
    }
  };

  const isDark = mounted && dark;

  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.92 }}
      transition={spring}
      onClick={toggle}
      className="relative p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground"
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드" : "다크 모드"}
    >
      <motion.span
        key={isDark ? "sun" : "moon"}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="block"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </motion.span>
    </motion.button>
  );
}
