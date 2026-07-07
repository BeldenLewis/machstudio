"use client";

// 운영 탭 — 라이브 콘솔(기본)과 등록자 관리를 하나의 탭 아래 묶는다.
// 설계 §2: RegistrantsTab 은 "운영 > 등록자"로 이동.

import { Radio, Users } from "lucide-react";
import LiveConsoleTab from "./LiveConsoleTab";
import RegistrantsTab from "./RegistrantsTab";

export type OperateSection = "console" | "registrants";

interface WebinarForConsole {
  config: Record<string, unknown>;
  sessions: { id: string }[];
  _count: { registrations: number };
}

export default function OperateTab({
  webinarId,
  webinar,
  onNavigate,
  section,
  onSectionChange,
}: {
  webinarId: string;
  webinar?: WebinarForConsole;
  onNavigate?: (target: string) => void;
  section: OperateSection;
  onSectionChange: (section: OperateSection) => void;
}) {
  const setSection = onSectionChange;

  const items: { id: OperateSection; label: string; icon: typeof Radio }[] = [
    { id: "console", label: "라이브 콘솔", icon: Radio },
    { id: "registrants", label: "등록자", icon: Users },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-background p-1">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              section === id ? "bg-violet-500 text-white" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {section === "console" ? (
        <LiveConsoleTab webinarId={webinarId} webinar={webinar} onNavigate={onNavigate} />
      ) : (
        <div className="-m-4 sm:-m-6 lg:-m-8 lg:-mt-4">
          <RegistrantsTab webinarId={webinarId} />
        </div>
      )}
    </div>
  );
}
