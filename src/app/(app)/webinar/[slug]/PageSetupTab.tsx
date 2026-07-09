"use client";

import { type ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, ListChecks, Palette, SlidersHorizontal } from "lucide-react";
import SettingsTab from "./SettingsTab";
import RegistrationFormTab from "./RegistrationFormTab";
import SessionsTab from "./SessionsTab";
import ThemeTab from "./ThemeTab";

interface WebinarSession {
  id: string;
  number: number;
  type: string;
  title: string;
  speaker: string | null;
  speakerPhotoUrl: string | null;
  description: string | null;
  startTime: string;
  endTime: string;
}

interface Webinar {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  liveStartAt: string;
  liveEndAt: string;
  signupDeadline: string;
  theme: Record<string, string>;
  config: Record<string, unknown>;
  components?: Record<string, unknown> | null;
  sessions: WebinarSession[];
}

type PageSetupSection = "general" | "form" | "sessions" | "theme";

const sections: { id: PageSetupSection; label: string; desc: string; icon: ElementType }[] = [
  { id: "general", label: "기본 설정", desc: "일정, 영상, 링크 등 웨비나의 기본 정보를 관리합니다.", icon: SlidersHorizontal },
  { id: "form", label: "등록폼", desc: "사전등록에서 수집할 항목과 동의 문구를 설정합니다.", icon: FileText },
  { id: "sessions", label: "세션", desc: "라이브 페이지에 표시될 아젠다와 시간표를 정리합니다.", icon: ListChecks },
  { id: "theme", label: "테마", desc: "외부 페이지의 색상, 폰트, 화면 톤을 맞춥니다.", icon: Palette },
];

export default function PageSetupTab({
  webinar,
  onUpdate,
  section,
  onSectionChange,
}: {
  webinar: Webinar;
  onUpdate: () => void;
  section: PageSetupSection;
  onSectionChange: (section: PageSetupSection) => void;
}) {
  const activeMeta = sections.find((item) => item.id === section) ?? sections[0];
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="flex flex-col lg:grid lg:h-full lg:grid-cols-[230px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="border-b lg:border-r border-border bg-secondary/20 p-4 lg:p-5">
        <div className="mb-5">
          <h2 className="text-sm font-semibold">만들기</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            외부 페이지와 운영 기본값을 정리합니다.
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0 lg:space-y-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((item) => {
            const Icon = item.icon;
            const active = item.id === section;

            return (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => onSectionChange(item.id)}
                whileTap={{ scale: 0.98 }}
                className={`relative flex w-auto lg:w-full shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm whitespace-nowrap transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="page-setup-section-bg"
                    className="absolute inset-0 rounded-xl bg-background shadow-sm"
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    style={{ zIndex: 0 }}
                  />
                )}
                <Icon className="relative z-10 h-4 w-4 shrink-0" />
                <span className="relative z-10">{item.label}</span>
              </motion.button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 min-h-0 flex flex-col lg:overflow-hidden">
        <div className="shrink-0 border-b border-border px-4 sm:px-6 lg:px-8 py-4 lg:py-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex items-center gap-2">
                <ActiveIcon className="h-4 w-4 text-violet-500" />
                <h2 className="text-sm font-semibold">{activeMeta.label}</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{activeMeta.desc}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="min-h-0 flex-1 lg:overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              {section === "general" && (
                <div className="lg:h-full overflow-auto">
                  <SettingsTab webinar={webinar} onUpdate={onUpdate} />
                </div>
              )}
              {section === "form" && (
                <div className="lg:h-full overflow-auto">
                  <RegistrationFormTab webinar={webinar} onUpdate={onUpdate} />
                </div>
              )}
              {section === "sessions" && (
                <div className="lg:h-full overflow-auto">
                  <SessionsTab webinarId={webinar.id} sessions={webinar.sessions} onUpdate={onUpdate} />
                </div>
              )}
              {section === "theme" && (
                <div className="lg:h-full overflow-auto">
                  <ThemeTab webinar={webinar} onUpdate={onUpdate} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
