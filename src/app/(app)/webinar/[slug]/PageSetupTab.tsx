"use client";

import { Fragment, useEffect, useMemo, useState, type ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, MonitorPlay, SlidersHorizontal, ClipboardCheck, Megaphone } from "lucide-react";
import SourceInfoTab from "./SourceInfoTab";
import RegistrationFormTab from "./RegistrationFormTab";
import LivePageTab, { type WatchState } from "./LivePageTab";
import { AutosaveScope, AggregateAutosaveIndicator } from "@/components/ui/autosave-scope";
import { checkWebinarReadiness, readinessBySection } from "@/lib/webinar-readiness";
import SurveyTab from "./SurveyTab";
import LandingPageTab from "./LandingPageTab";

interface WebinarSession {
  id: string;
  number: number;
  type: string;
  title: string;
  speaker: string | null;
  speakerCompany: string | null;
  speakerPhotoUrl: string | null;
  description: string | null;
  speakerBio: string | null;
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
  /** 약관 전문 템플릿 — 등록 폼이 "상속 중" 을 보여주려면 값이 필요하다(IA 8단계). */
  workspace?: { id: string; name: string; privacyBodyTemplate?: string | null; marketingBodyTemplate?: string | null } | null;
}

type PageSetupSection = "source" | "landing" | "registration" | "watch" | "survey";

/**
 * 승인된 IA 재설계 — 축을 하나로 바꿨다: **"사실인가, 표현인가"**.
 * "이 값이 어느 화면에 보이나"는 여러 화면에 나가는 값(테마·세션)에 답이 없어서
 * 그 값들이 마지막에 손댄 섹션에 얹혀 있었다.
 *
 * 1단계에서 합친 것: 기본 정보 + 세션 + (라이브 페이지 안의) 디자인 → '원본 정보'.
 * 2단계에서 대기·라이브·종료가 '시청 화면' 4상태로 합쳐지면 산출물이 4개가 된다.
 */
const sections: { id: PageSetupSection; label: string; desc: string; icon: ElementType; group: "사실" | "산출물" }[] = [
  { id: "source", group: "사실", label: "원본 정보", desc: "이름·일정, 진행 순서, 브랜드 — 네 산출물이 모두 여기서 읽어갑니다.", icon: SlidersHorizontal },
  // 랜딩은 홍보 진입점이라 등록보다 앞 — 산출물 순서 = 시청자 여정 순서
  { id: "landing", group: "산출물", label: "랜딩 페이지", desc: "외부 사이트에 임베드하는 상세페이지 — 히어로·소개·프로그램·FAQ를 구성합니다.", icon: Megaphone },
  { id: "registration", group: "산출물", label: "등록", desc: "사전등록에서 수집할 항목과 동의 문구를 설정합니다.", icon: FileText },
  // 대기·입장·라이브·종료는 **한 라우트의 네 순간**이라 메뉴 한 칸 + 상태 세그먼트로 합쳤다.
  { id: "watch", group: "산출물", label: "시청 화면", desc: "등록자가 라이브 전·중·후에 보는 한 몸의 화면 — 상태별로 골라 편집합니다.", icon: MonitorPlay },
  { id: "survey", group: "산출물", label: "설문", desc: "자체 설문을 만들어 종료 화면·라이브 푸시·링크로 응답을 모읍니다.", icon: ClipboardCheck },
];


export default function PageSetupTab({
  webinar,
  onUpdate,
  onSilentUpdate,
  section,
  onSectionChange,
  watchState,
  onWatchStateChange,
  isLive,
}: {
  webinar: Webinar;
  onUpdate: () => void;
  onSilentUpdate: () => void;
  section: PageSetupSection;
  onSectionChange: (section: PageSetupSection) => void;
  /** 시청 화면의 편집 상태 — URL 이 단일 소스라 page.tsx 가 들고 있다. */
  watchState: WatchState;
  onWatchStateChange: (next: WatchState) => void;
  /** 방송 중인가 — 상단 띠 표시용(상태 판정은 page.tsx 의 resolveWebinarStatus 가 단일 소스). */
  isLive?: boolean;
}) {
  /**
   * 종료 화면에 실제로 연결된 자체 설문이 있는가 — 준비 상태의 '설문 영역' 판정 근거.
   * 서버(info 라우트)와 같은 조건을 쓴다: showOnEnded + isOpen + 마감 전.
   */
  const [hasLinkedEndedSurvey, setHasLinkedEndedSurvey] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/webinars/${webinar.id}/surveys`);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const list = (data.surveys ?? []) as { showOnEnded?: boolean; isOpen?: boolean; closesAt?: string | null }[];
        setHasLinkedEndedSurvey(list.some((v) =>
          v.showOnEnded === true && v.isOpen === true &&
          (!v.closesAt || new Date(v.closesAt).getTime() > Date.now())));
      } catch { /* 준비 상태는 부가 정보라 실패해도 화면을 막지 않는다 */ }
    })();
    return () => { cancelled = true; };
  }, [webinar.id]);

  /**
   * 종료 화면의 설문 영역이 켜져 있는가 — 설문 탭의 "켰는데 안 보인다" 안내 판정에 쓴다.
   * 저장 위치가 config 안쪽이라 여기서 읽어 내려보낸다(설문 탭은 config 를 받지 않는다).
   */
  const endedSurveyAreaOn =
    ((((webinar.config?.livePage as Record<string, unknown> | undefined)?.screens as Record<string, unknown> | undefined)
      ?.ended as Record<string, unknown> | undefined)?.survey) === true;

  /**
   * 준비 상태 — "시청자에게 빈 화면은 없어요" 검사(순수 함수 + vitest 로 검증).
   * 완성도가 아니라 **토글 ON + 내용 있음** 이중 게이트만 본다.
   */
  const issues = useMemo(
    () => checkWebinarReadiness({
      name: webinar.name,
      sessionCount: webinar.sessions.length,
      config: webinar.config,
      hasLinkedEndedSurvey,
    }),
    [webinar.name, webinar.sessions.length, webinar.config, hasLinkedEndedSurvey],
  );
  const issuesBySection = useMemo(() => readinessBySection(issues), [issues]);

  const activeMeta = sections.find((item) => item.id === section) ?? sections[0];
  const ActiveIcon = activeMeta.icon;

  // 폼 탭은 자동저장이라 미저장 가드가 필요 없다 — 섹션 전환은 즉시(대기 중 저장은 각 탭이 언마운트 시 flush).
  const changeSection = (id: PageSetupSection) => {
    if (id === section) return;
    onSectionChange(id);
  };

  return (
    <AutosaveScope>
    <div className="flex min-h-0 flex-col lg:h-full lg:overflow-hidden">
    {/**
     * 방송 띠 — 라이브 중에는 이 화면의 자동저장이 **시청자에게 즉시 반영**된다.
     * 평소와 똑같이 보이면 운영자는 그 사실을 모른 채 문구를 고친다. 순수 표시(저장 없음).
     */}
    {isLive && (
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2 text-xs text-white sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-1.5 font-semibold tracking-wide">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
          ON AIR
        </span>
        <span className="opacity-90">지금 고치는 값은 시청자 화면에 바로 반영돼요.</span>
      </div>
    )}
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="border-b lg:border-r border-border bg-secondary/20 p-4 lg:p-5">
        <div className="mb-5">
          <h2 className="text-sm font-semibold">만들기</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            외부 페이지와 운영 기본값을 정리합니다.
          </p>
        </div>
        {/**
         * 준비 상태 — 완성도 점수가 아니다. "켜 놨는데 내용이 없어서 시청자 화면에서 조용히
         * 사라지는 것"만 모은다. 조용히 사라지는 게 문제인 이유: 운영자는 켰다고 믿는다.
         * 순수 읽기 — 여기서 저장하는 것은 없다.
         */}
        {issues.length > 0 && (
          <div className="mb-4 rounded-xl bg-background p-3 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold">확인할 것</span>
              <span className="text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">{issues.length}건</span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {issues.slice(0, 4).map((it, i) => (
                <li key={`${it.section}-${i}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSectionChange(it.section as PageSetupSection);
                      if (it.watchState) onWatchStateChange(it.watchState);
                    }}
                    className="block w-full text-left text-[11px] leading-snug text-muted-foreground transition-colors hover:text-foreground"
                    title={it.detail}
                  >
                    <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${it.severity === "blocking" ? "bg-red-500" : "bg-amber-500"}`} aria-hidden />
                    {it.title}
                  </button>
                </li>
              ))}
            </ul>
            {issues.length > 4 && (
              <p className="mt-1.5 text-[10.5px] text-muted-foreground/70">그리고 {issues.length - 4}건 더</p>
            )}
            <p className="mt-2 border-t border-border pt-2 text-[10.5px] leading-relaxed text-muted-foreground/70">
              완성도가 아니라 <b className="font-semibold">켜져 있는데 내용이 없는 것</b>만 봐요.
            </p>
          </div>
        )}

        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0 lg:space-y-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((item, i) => {
            const Icon = item.icon;
            const active = item.id === section;
            // 묶음이 바뀌는 첫 항목 앞에만 라벨을 넣는다 — 데스크톱에서만(모바일은 가로 스크롤 한 줄).
            const groupStart = i === 0 || sections[i - 1].group !== item.group;

            return (
              // Fragment 라 DOM 노드를 만들지 않는다 — 라벨과 버튼이 nav 의 **직접 자식**이 되어야
              // lg:space-y-1 이 먹는다. 래퍼 div 에 display:contents 를 주면 박스가 없어서
              // space-y 의 margin-top 이 적용되지 않고 항목 간격이 사라진다.
              <Fragment key={item.id}>
              {groupStart && (
                <p className={`hidden px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70 lg:block ${i === 0 ? "pt-0" : "pt-3"}`}>
                  {item.group}
                </p>
              )}
              <motion.button
                type="button"
                onClick={() => changeSection(item.id)}
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
                {/* 미완 개수 — 색만으로 알리지 않고 숫자를 함께 둔다(색각·흑백 출력) */}
                {issuesBySection[item.id] > 0 && (
                  <span
                    className="relative z-10 ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-700 dark:text-amber-400"
                    title={`이 섹션에 확인할 것 ${issuesBySection[item.id]}건`}
                  >
                    {issuesBySection[item.id]}
                  </span>
                )}
              </motion.button>
              </Fragment>
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-2">
                  <ActiveIcon className="h-4 w-4 text-violet-500" />
                  <h2 className="text-sm font-semibold">{activeMeta.label}</h2>
                </div>
                {/* 만들기 화면당 자동저장 표시 1개 — 각 편집 영역이 useReportAutosave 로 올려 보낸다.
                    긴 화면에서 표시가 스크롤 밖으로 밀려 "저장됐나?" 를 알 수 없던 문제를 없앤다. */}
                <span className="ml-auto shrink-0">
                  <AggregateAutosaveIndicator />
                </span>
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
              {section === "source" && (
                <div className="lg:h-full overflow-auto">
                  <SourceInfoTab webinar={webinar} onUpdate={onUpdate} onSilentUpdate={onSilentUpdate} />
                </div>
              )}
              {section === "landing" && (
                <div className="lg:h-full overflow-auto">
                  <LandingPageTab
                    webinar={{ id: webinar.id, slug: webinar.slug, name: webinar.name, description: webinar.description, config: webinar.config }}
                    onSilentUpdate={onSilentUpdate}
                  />
                </div>
              )}
              {section === "registration" && (
                <div className="lg:h-full overflow-auto">
                  <RegistrationFormTab
                    webinar={{
                      id: webinar.id, slug: webinar.slug, config: webinar.config, theme: webinar.theme,
                      // 접수 창(마감·라이브 중 접수)이 이 탭으로 옮겨와 일정·components 가 필요하다
                      liveStartAt: webinar.liveStartAt, signupDeadline: webinar.signupDeadline, components: webinar.components,
                      workspace: webinar.workspace,
                    }}
                    onSilentUpdate={onSilentUpdate}
                  />
                </div>
              )}
              {section === "watch" && (
                <div className="lg:h-full overflow-auto">
                  <LivePageTab
                    webinar={webinar}
                    slug={webinar.slug}
                    state={watchState}
                    onStateChange={onWatchStateChange}
                    onSilentUpdate={onSilentUpdate}
                  />
                </div>
              )}
              {section === "survey" && (
                <div className="lg:h-full overflow-auto">
                  <SurveyTab
                    webinarId={webinar.id}
                    slug={webinar.slug}
                    webinarName={webinar.name}
                    theme={webinar.theme}
                    // '종료 화면에 연결' 을 켜도 이 영역이 꺼져 있으면 시청자에게 안 보인다 —
                    // 설문 탭이 그 사실을 알리고 고칠 자리로 보낼 수 있게 상태와 이동을 넘긴다.
                    endedSurveyAreaOn={endedSurveyAreaOn}
                    onGoToEndedScreen={() => {
                      onSectionChange("watch");
                      onWatchStateChange("ended");
                    }}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
    </div>
    </AutosaveScope>
  );
}
