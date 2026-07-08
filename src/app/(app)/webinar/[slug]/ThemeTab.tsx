"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Theme {
  accentColor: string;
  bgColor: string;
  surfaceColor: string;
  textColor: string;
  font: string;
  borderRadius?: string;
}

interface Webinar {
  id: string;
  theme: Record<string, string>;
}

const FONTS = ["Pretendard", "Noto Sans KR", "Inter", "Roboto", "Spoqa Han Sans Neo"];
const RADIUS_OPTIONS = [
  { value: "0px", label: "각진" },
  { value: "8px", label: "약간" },
  { value: "16px", label: "기본" },
  { value: "24px", label: "둥근" },
];

export default function ThemeTab({ webinar, onUpdate }: { webinar: Webinar; onUpdate: () => void }) {
  const [theme, setTheme] = useState<Theme>({
    accentColor: "#6d28d9",
    bgColor: "#0f0f0f",
    surfaceColor: "#1a1a1a",
    textColor: "#ffffff",
    font: "Pretendard",
    borderRadius: "16px",
    ...(webinar.theme as Partial<Theme>),
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      if (!res.ok) { toast.error("저장 실패"); return; }
      toast.success("테마가 저장됐어요");
      onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  const colorFields: { key: keyof Theme; label: string }[] = [
    { key: "accentColor", label: "키 컬러" },
    { key: "bgColor", label: "배경 컬러" },
    { key: "surfaceColor", label: "서피스 컬러" },
    { key: "textColor", label: "텍스트 컬러" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl space-y-6">
      {/* 색상 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">색상</h3>
        <div className="grid grid-cols-2 gap-3">
          {colorFields.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background">
              <div className="relative">
                <div
                  className="w-9 h-9 rounded-lg border border-border/50 cursor-pointer"
                  style={{ backgroundColor: theme[key] as string }}
                />
                <input
                  type="color"
                  value={theme[key] as string}
                  onChange={(e) => setTheme((t) => ({ ...t, [key]: e.target.value }))}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
              <div>
                <p className="text-xs font-medium">{label}</p>
                <p className="text-xs text-muted-foreground font-mono">{theme[key] as string}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 폰트 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">폰트</h3>
        <div className="flex flex-wrap gap-2">
          {FONTS.map((font) => (
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              transition={spring}
              key={font}
              onClick={() => setTheme((t) => ({ ...t, font }))}
              className={`px-3 py-2 rounded-xl border text-sm transition-colors ${
                theme.font === font
                  ? "border-violet-500 bg-violet-500/10 text-violet-500"
                  : "border-border hover:bg-secondary text-muted-foreground"
              }`}
              style={{ fontFamily: font }}
            >
              {font}
            </motion.button>
          ))}
        </div>
      </section>

      {/* 고급 설정 토글 */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <motion.span
            animate={{ rotate: showAdvanced ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="inline-block"
          >
            ▶
          </motion.span>
          고급 설정 {showAdvanced ? "접기" : "펼치기"}
        </button>

        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 space-y-5"
          >
            {/* 테두리 둥글기 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">테두리 둥글기</h3>
              <div className="flex gap-2">
                {RADIUS_OPTIONS.map(({ value, label }) => (
                  <motion.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    transition={spring}
                    key={value}
                    onClick={() => setTheme((t) => ({ ...t, borderRadius: value }))}
                    className={`px-3 py-2 rounded-xl border text-sm transition-colors ${
                      theme.borderRadius === value
                        ? "border-violet-500 bg-violet-500/10 text-violet-500"
                        : "border-border hover:bg-secondary text-muted-foreground"
                    }`}
                  >
                    {label}
                  </motion.button>
                ))}
              </div>
            </section>
          </motion.div>
        )}
      </div>

      {/* 미리보기 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">미리보기</h3>
        <div
          className="rounded-2xl p-6 space-y-3"
          style={{
            backgroundColor: theme.bgColor,
            fontFamily: theme.font,
            borderRadius: theme.borderRadius,
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: theme.accentColor, borderRadius: theme.borderRadius ? `calc(${theme.borderRadius} * 0.6)` : undefined }}
          >
            W
          </div>
          <p className="font-semibold" style={{ color: theme.textColor }}>웨비나 제목 예시</p>
          <p className="text-sm opacity-70" style={{ color: theme.textColor }}>웨비나 설명 텍스트가 여기에 표시돼요</p>
          <button
            className="px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: theme.accentColor, borderRadius: theme.borderRadius ? `calc(${theme.borderRadius} * 0.7)` : "8px" }}
          >
            사전 등록하기
          </button>
        </div>
      </section>

      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={spring}
        onClick={handleSave}
        disabled={isSaving}
        className="px-5 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
      >
        {isSaving ? "저장 중..." : "테마 저장"}
      </motion.button>
    </div>
  );
}
