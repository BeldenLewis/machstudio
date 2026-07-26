"use client";

/**
 * 브랜드(테마) 편집 — 원본 정보 안에 있다.
 *
 * 왜 여기로 옮겼나: 이 값들은 **공개 화면 대부분에 함께 적용**되는데(대기·입장·라이브·종료·
 * 등록 폼·설문 응답) 편집 UI 는 '라이브 페이지' 섹션 안에만 있었다. 그래서 대기 화면 색을
 * 바꾸려면 라이브 페이지로 들어가야 했고, 정작 그 화면이 스스로
 * "대기·입장·종료 화면과 등록 페이지에 공통 적용돼요" 라고 적어 두고 있었다 —
 * 소유 위치와 영향 범위가 어긋난 대표 사례다.
 *
 * 저장이 안전한 근거: `theme` 은 Prisma 의 **독립 최상위 컬럼**이고
 * PATCH /api/webinars/[id] 가 필드별로 따로 병합한다(mergeJson(webinar.theme, …)).
 * 라이브 페이지 탭은 `config` 를, 이 섹션은 `theme` 만 보내므로 서로 덮어쓰지 않는다.
 * (같은 blob 을 두 탭이 PATCH 하면 서로를 지우는 문제는 이 구조에선 생기지 않는다.)
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAutosave, useExternalSync } from "@/components/ui/use-autosave";
import { useReportAutosave } from "@/components/ui/autosave-scope";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

export interface Theme {
  accentColor: string;
  bgColor: string;
  surfaceColor: string;
  textColor: string;
  font: string;
  borderRadius?: string;
}

export const THEME_DEFAULTS: Theme = {
  accentColor: "#6d28d9",
  bgColor: "#0f0f0f",
  surfaceColor: "#1a1a1a",
  textColor: "#ffffff",
  font: "Pretendard",
  borderRadius: "16px",
};

const FONTS = ["Pretendard", "Noto Sans KR", "Inter", "Roboto", "Spoqa Han Sans Neo"];
const RADIUS_OPTIONS = [
  { value: "0px", label: "각진" },
  { value: "8px", label: "약간" },
  { value: "16px", label: "기본" },
  { value: "24px", label: "둥근" },
];
const COLOR_FIELDS: { key: keyof Theme; label: string }[] = [
  { key: "accentColor", label: "키 컬러" },
  { key: "bgColor", label: "배경 컬러" },
  { key: "surfaceColor", label: "서피스 컬러" },
  { key: "textColor", label: "텍스트 컬러" },
];

export default function BrandSection({
  webinarId,
  theme: incomingTheme,
  onSilentUpdate,
}: {
  webinarId: string;
  theme: Record<string, string>;
  onSilentUpdate: () => void;
}) {
  const [theme, setTheme] = useState<Theme>({ ...THEME_DEFAULTS, ...(incomingTheme as Partial<Theme>) });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const save = async () => {
    try {
      const res = await fetch(`/api/webinars/${webinarId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: true, // 페이지 이탈 중 flush 도 서버에 도달하도록
        body: JSON.stringify({ theme }), // 이 섹션이 소유한 키만 — config·components 는 건드리지 않는다
      });
      if (!res.ok) {
        toast.error("자동 저장 실패 — 잠시 후 다시 시도돼요", { id: "autosave-error" });
        return false;
      }
      onSilentUpdate();
      return true;
    } catch {
      return false;
    }
  };
  const { state: saveState, dirty, retry } = useAutosave(theme, save);
  // 표시는 껍데기 한 곳에서 그린다(만들기 화면당 1개) — 저장 경로는 그대로 각자.
  useReportAutosave(saveState, retry);

  // 다른 창·다른 기기에서 테마가 바뀌면 따라간다(편집 중이면 대기).
  const incoming = useMemo(
    () => ({ ...THEME_DEFAULTS, ...(incomingTheme as Partial<Theme>) }),
    [incomingTheme],
  );
  useExternalSync(incoming, setTheme, dirty);

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">브랜드</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            색상·폰트·모서리 — 공개 화면 전체에 함께 적용돼요(등록·대기·입장·시청·종료, 설문 응답 폼까지).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {COLOR_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3 rounded-xl bg-background p-3 shadow-sm">
            <div className="relative">
              <div
                className="h-9 w-9 cursor-pointer rounded-lg shadow-sm"
                style={{ backgroundColor: theme[key] as string }}
              />
              <input
                type="color"
                value={theme[key] as string}
                onChange={(e) => setTheme((t) => ({ ...t, [key]: e.target.value }))}
                aria-label={label}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium">{label}</p>
              <p className="font-mono text-xs text-muted-foreground">{theme[key] as string}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">폰트</p>
        <div className="flex flex-wrap gap-2">
          {FONTS.map((font) => (
            <motion.button
              key={font}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              transition={spring}
              onClick={() => setTheme((t) => ({ ...t, font }))}
              aria-pressed={theme.font === font}
              className={`rounded-xl px-3 py-2 text-sm shadow-sm transition-colors ${
                theme.font === font ? "bg-violet-500/10 text-violet-500" : "text-muted-foreground hover:bg-secondary"
              }`}
              style={{ fontFamily: font }}
            >
              {font}
            </motion.button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <motion.span animate={{ rotate: showAdvanced ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-block">
            ▶
          </motion.span>
          테두리 둥글기 {showAdvanced ? "접기" : "펼치기"}
        </button>
        {showAdvanced && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3">
            <div className="flex flex-wrap gap-2">
              {RADIUS_OPTIONS.map(({ value, label }) => (
                <motion.button
                  key={value}
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={spring}
                  onClick={() => setTheme((t) => ({ ...t, borderRadius: value }))}
                  aria-pressed={theme.borderRadius === value}
                  className={`rounded-xl px-3 py-2 text-sm shadow-sm transition-colors ${
                    theme.borderRadius === value ? "bg-violet-500/10 text-violet-500" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">미리보기</p>
        <div
          className="space-y-3 p-6 shadow-sm"
          style={{ backgroundColor: theme.bgColor, fontFamily: theme.font, borderRadius: theme.borderRadius }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center text-xs font-bold text-white"
            style={{
              backgroundColor: theme.accentColor,
              borderRadius: theme.borderRadius ? `calc(${theme.borderRadius} * 0.6)` : undefined,
            }}
          >
            W
          </div>
          <p className="font-semibold" style={{ color: theme.textColor }}>웨비나 제목 예시</p>
          <p className="text-sm opacity-70" style={{ color: theme.textColor }}>웨비나 설명 텍스트가 여기에 표시돼요</p>
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-white"
            style={{
              backgroundColor: theme.accentColor,
              borderRadius: theme.borderRadius ? `calc(${theme.borderRadius} * 0.7)` : "8px",
            }}
          >
            사전 등록하기
          </button>
        </div>
      </div>
    </section>
  );
}
