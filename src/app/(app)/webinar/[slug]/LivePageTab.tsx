"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAutosave, useExternalSync, diffPatch } from "@/components/ui/use-autosave";
import { EditableList, ROW_KEY, withRowKeys, stripRowKeys, type WithRowKey } from "@/components/ui/editable-list";
import {
  normalizeLivePageConfig, safeHttpUrl, DEFAULT_ENDED_TITLE, DEFAULT_ENDED_DESCRIPTION,
  type LivePageConfig, type LiveResource, type LiveNextWebinar,
} from "@/lib/webinar-config";
import { useReportAutosave } from "@/components/ui/autosave-scope";
import { getYouTubeVideoId } from "@/lib/youtube";
import { Switch } from "@/components/ui/switch";
import { goesFor } from "@/lib/webinar-exposure";
import { Blk, JumpLink, btnCls, FIELD_CLS, FIELD_CLS_DANGER, FINISH, R, SELECTED, Segmented } from "@/components/ui/primitives";

/** 시청자에게 보이는 한 페이지의 네 순간. 어드민에서는 이 상태로 편집 대상을 고른다. */
export type WatchState = "waiting" | "entry" | "live" | "ended";
const WATCH_STATES: { id: WatchState; label: string; hint: string }[] = [
  { id: "waiting", label: "대기", hint: "라이브 전 등록자가 보는 화면" },
  { id: "entry", label: "입장", hint: "라이브 중 미인증 방문자가 보는 입장 확인 화면" },
  { id: "live", label: "라이브", hint: "방송 중 시청 화면" },
  { id: "ended", label: "종료", hint: "방송이 끝난 뒤 화면" },
];

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${checked ? "bg-violet-500" : `bg-secondary ${FINISH.s2}`}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

/**
 * 이름 있는 모드 두 개 중 하나를 고르는 컨트롤. on/off 가 아니라 "어느 쪽인가"라서
 * Toggle 대신 라디오로 둔다 — 토글은 꺼진 쪽이 무엇인지 라벨로 드러나지 않는다.
 * 선택 상태는 외곽선이 아니라 그림자로 마감(제품 원칙).
 */
function ModeChoice<T extends string>({ value, onChange, label, desc, options }: {
  value: T;
  onChange: (v: T) => void;
  label: string;
  desc?: string;
  options: { value: T; title: string; desc: string }[];
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      {desc && <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed">{desc}</p>}
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              /* rgb(139 92 246) 는 리브랜드 이전 순보라 — 현재 팔레트에 없는 색이다(violet 계열이
                 딥네이비로 재정의됨). 선택 표현도 여기만 또 달랐다(외곽 1.5px 그림자). SELECTED 로. */
              className={`p-3 text-left transition-all ${R.surface} ${
                on ? SELECTED : `bg-secondary hover:bg-secondary/70 ${FINISH.s2}`
              }`}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <span
                  aria-hidden
                  className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full transition-colors ${
                    on ? "bg-violet-500" : `bg-transparent ${FINISH.s2}`
                  }`}
                >
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                {o.title}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground/80">{o.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// CTA 카드 편집 폼 (여러 장 지원)
// 버튼 연결: 링크(URL) 또는 폼(자체 설문 = 커스텀 폼 — 문의·신청 등), 열기 방식: 새 창/모달
type CtaBtnAction = "url" | "form";
type CtaBtnOpen = "newTab" | "modal";
interface CtaBtnForm { label: string; action: CtaBtnAction; url: string; surveyId: string; open: CtaBtnOpen }
interface CtaFormCard {
  id: string;
  eyebrow: string; title: string; description: string; benefits: string;
  primary: CtaBtnForm; secondary: CtaBtnForm;
}
const emptyBtn = (): CtaBtnForm => ({ label: "", action: "url", url: "", surveyId: "", open: "newTab" });
const emptyCta = (): CtaFormCard => ({
  id: crypto.randomUUID(),
  eyebrow: "", title: "", description: "", benefits: "",
  primary: emptyBtn(), secondary: emptyBtn(),
});
interface RawCtaButton { label?: string; url?: string; style?: string; action?: string; surveyId?: string; open?: string }
function btnToForm(b?: RawCtaButton): CtaBtnForm {
  return {
    label: b?.label ?? "",
    action: b?.action === "form" ? "form" : "url",
    url: b?.url ?? "",
    surveyId: b?.surveyId ?? "",
    open: b?.open === "modal" ? "modal" : "newTab",
  };
}
function ctaToForm(raw: Record<string, unknown>): CtaFormCard {
  const buttons = Array.isArray(raw.buttons) ? (raw.buttons as RawCtaButton[]) : [];
  return {
    id: crypto.randomUUID(),
    eyebrow: (raw.eyebrow as string) ?? "",
    title: (raw.title as string) ?? "",
    description: (raw.description as string) ?? "",
    benefits: Array.isArray(raw.benefits) ? (raw.benefits as string[]).join("\n") : "",
    primary: btnToForm(buttons.find((b) => b.style !== "ghost")),
    secondary: btnToForm(buttons.find((b) => b.style === "ghost")),
  };
}
/** 편집 폼 → 저장용 버튼 config. 라벨 + (URL 또는 폼) 이 갖춰져야 저장. */
function btnToConfig(b: CtaBtnForm, style: "white" | "ghost"): Record<string, unknown> | null {
  if (!b.label.trim()) return null;
  if (b.action === "form") {
    if (!b.surveyId) return null;
    return { label: b.label.trim(), action: "form", surveyId: b.surveyId, open: b.open, style };
  }
  if (!b.url.trim()) return null;
  const o: Record<string, unknown> = { label: b.label.trim(), url: b.url.trim(), style };
  if (b.open === "modal") o.open = "modal"; // 기본(새 창)은 저장하지 않아 기존 config 와 동일 형태 유지
  return o;
}


interface Webinar {
  id: string;
  theme: Record<string, string>;
  config: Record<string, unknown>;
  components?: Record<string, unknown> | null;
}


const inputCls = FIELD_CLS;

// 만들기 › 대기/라이브/종료 화면 편집.
// ⚠️ 세 메뉴가 하나의 인스턴스를 공유한다(PageSetupTab 그룹 키) — livePage 를 통째로 재구성해 저장하므로
// 상태를 쪼개면 다른 화면 데이터가 유실된다. 렌더만 section 으로 게이트.
export default function LivePageTab({ webinar, slug, state, onStateChange, onSilentUpdate, onGoToSurvey, onGoToConsole, confirmLiveOff }: {
  webinar: Webinar;
  slug: string;
  /** 편집 중인 시청 화면 상태. URL 이 단일 소스라 부모가 들고 있다(새로고침·딥링크 복원). */
  state: WatchState;
  onStateChange: (next: WatchState) => void;
  onSilentUpdate: () => void;
  /** "설문에서 먼저 만들어 주세요" 를 누를 수 있게(만들기 안 섹션 전환). */
  onGoToSurvey?: () => void;
  /** "운영 → 라이브 콘솔에서" 를 누를 수 있게(다른 탭이라 껍데기가 이동시킨다). */
  onGoToConsole?: () => void;
  /**
   * 라이브 중 "끄는" 변경에 확인을 붙인다 — 켜는 쪽은 시청자에게 더 주는 변경이라 통과.
   * 껍데기가 시청자 수를 알고 있어서 문구에 실제 인원이 들어간다.
   */
  confirmLiveOff?: (what: string, effect: string) => Promise<boolean>;
}) {
  const livePage = (webinar.config?.livePage ?? {}) as Record<string, unknown>;
  const notify = (livePage.notify ?? {}) as Record<string, unknown>;
  const components = (webinar.components ?? {}) as Record<string, unknown>;
  const initialCtas: CtaFormCard[] = (Array.isArray(livePage.ctas)
    ? (livePage.ctas as Record<string, unknown>[])
    : livePage.cta ? [livePage.cta as Record<string, unknown>] : []
  ).map(ctaToForm);

  const uid = useId();
  const [form, setForm] = useState({
    youtubeId: (webinar.config?.youtubeId as string) ?? "",
    surveyUrl: (webinar.config?.surveyUrl as string) ?? "",
    lpContact: (livePage.infoContact as string) ?? "",
    lpNotice: (livePage.notice as string) ?? "",
    chatEnabled: components.chatEnabled === true,
    qaMode: components.qaMode === "closed" ? ("closed" as const) : ("open" as const),
    notifyEnabled: notify.enabled === true,
    notifyKicker: (notify.kicker as string) ?? "",
    notifyTitle: (notify.title as string) ?? "",
    notifyDescription: (notify.description as string) ?? "",
    notifySwitchLabel: (notify.switchLabel as string) ?? "",
  });
  const [ctaCards, setCtaCards] = useState<CtaFormCard[]>(initialCtas);
  const youtubeVideoId = getYouTubeVideoId(form.youtubeId);

  // 라이브 페이지 화면(대기·입장·종료) 섹션 on/off + 자료·다음웨비나 데이터
  const [screens, setScreens] = useState(() => normalizeLivePageConfig(webinar.config));
  const waitingFollowUpUrlInvalid = screens.waiting.followUp.ctaUrl.trim() !== "" && safeHttpUrl(screens.waiting.followUp.ctaUrl) === "";
  // 자료는 스키마에 id 가 없다 → 편집 중에만 클라이언트 키를 붙여 안정 키를 확보하고,
  // 저장 직전 stripRowKeys 로 떼어낸다(저장 형태는 그대로).
  const [resources, setResources] = useState<WithRowKey<LiveResource>[]>(
    () => withRowKeys(normalizeLivePageConfig(webinar.config).resources),
  );
  const [nextWeb, setNextWeb] = useState<LiveNextWebinar>(() => normalizeLivePageConfig(webinar.config).nextWebinar ?? { title: "", when: "", url: "" });
  type WaitingToggleKey = "agenda" | "social" | "calendar" | "share" | "notify";
  const setW = (k: WaitingToggleKey, v: boolean) => setScreens((s) => ({ ...s, waiting: { ...s.waiting, [k]: v } }));
  /** 안내 항목 편집 상태 — EditableList 는 행마다 안정 키가 필요해 문자열 배열을 객체로 감싼다. */
  const [followUpItems, setFollowUpItems] = useState<WithRowKey<{ value: string }>[]>(
    () => withRowKeys(screens.waiting.followUp.items.map((value) => ({ value }))),
  );
  // 편집값 → 설정. 빈 줄은 정규화가 걸러내므로 여기서는 그대로 넘긴다.
  useEffect(() => {
    setFollowUp({ items: stripRowKeys(followUpItems).map((r) => r.value) });
    // setFollowUp 은 매 렌더 새로 만들어져 의존성에 넣으면 무한 루프가 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followUpItems]);

  const setAbout = (patch: Partial<LivePageConfig["waiting"]["about"]>) =>
    setScreens((s) => ({
      ...s,
      waiting: { ...s.waiting, about: { ...s.waiting.about, ...patch } },
    }));
  const setFollowUp = (patch: Partial<LivePageConfig["waiting"]["followUp"]>) =>
    setScreens((s) => ({
      ...s,
      waiting: {
        ...s.waiting,
        followUp: { ...s.waiting.followUp, ...patch },
      },
    }));
  // ended 는 토글(boolean)과 문구(string)가 섞여 있어 세터를 나눈다 — 한 세터로 두면 타입이 풀린다.
  const setEn = (k: "replay" | "survey" | "resources" | "nextWebinar" | "share", v: boolean) =>
    setScreens((s) => ({ ...s, ended: { ...s.ended, [k]: v } }));
  const setEnText = (k: "title" | "description", v: string) =>
    setScreens((s) => ({ ...s, ended: { ...s.ended, [k]: v } }));


  // 자체 설문 목록 — CTA 폼형 버튼의 연결 대상이자, 종료 화면 '설문 연결' 의 선택지.
  // showOnEnded 를 함께 받는다: 종료 화면에 지금 무엇이 연결돼 있는지 판정하는 근거다.
  const [surveyOptions, setSurveyOptions] = useState<{ id: string; title: string; showOnEnded: boolean }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/webinars/${webinar.id}/surveys`);
        if (cancelled) return;
        if (!res.ok) { setSurveyOptions([]); return; }
        const data = await res.json();
        setSurveyOptions(((data.surveys ?? []) as { id: string; title: string; showOnEnded?: boolean }[])
          .map((s) => ({ id: s.id, title: s.title, showOnEnded: s.showOnEnded === true })));
      } catch { if (!cancelled) setSurveyOptions([]); }
    })();
    return () => { cancelled = true; };
  }, [webinar.id]);

  /**
   * 종료 화면 설문 연결 — **3중 소유를 단일 결정으로**.
   *
   * 지금까지 종료 화면에 설문이 뜨려면 세 곳이 맞아야 했다:
   *   ① config.livePage.ended.survey 토글 (여기) — screens 층은 없다
   *   ② 자체 설문의 showOnEnded (설문 탭)  ‖  ③ config.surveyUrl (여기)
   * 그래서 설문 탭에서 '종료 화면에 연결' 을 켜도 ①이 꺼져 있으면 **아무 일도 일어나지 않았다.**
   * 게다가 자체 설문이 외부 URL 보다 우선하므로, 둘 다 있으면 URL 은 조용히 무시됐다.
   * (그 토글의 설명은 "아래 설문 URL이 있을 때만 표시" 였는데 사실과 다르다.)
   *
   * 여기서는 셋을 하나의 3택으로 묶는다. 저장 위치는 그대로 두고 **결정만 한 자리로** 모은다.
   */
  /**
   * 연결된 자체 설문은 **여러 개**일 수 있다 — 만족도 설문과 다음 회차 사전조사를 함께 거는 게
   * 실제 운영 패턴이라 웨비나당 1개 제약을 걷었다(webinar-ended-surveys.ts 의 규칙).
   * 자체 설문 vs 외부 URL 은 여전히 배타적이다 — 자체가 하나라도 있으면 URL 은 무시된다.
   */
  const linkedSurveys = surveyOptions?.filter((s) => s.showOnEnded) ?? [];
  const surveyLink: "none" | "internal" | "external" =
    !screens.ended.survey ? "none" : linkedSurveys.length > 0 ? "internal" : "external";

  /**
   * 자체 설문 연결 토글 — 설문은 별도 엔드포인트라 즉시 저장된다(설문 탭과 같은 방식).
   *
   * ⚠ 예전 구현은 "연결하면 서버가 나머지를 자동으로 끈다(웨비나당 1개)" 에 기대어 로컬
   * 상태에서 다른 행을 통째로 끄고 있었다. 그 서버 동작을 없앤 뒤에도 남아 있으면
   * **화면만 하나로 보이고** 새로고침하면 다른 연결이 되살아난다. 지금은 건드린 행만 바꾼다.
   */
  const toggleInternalSurvey = async (id: string, on: boolean) => {
    const list = surveyOptions ?? [];
    setSurveyOptions(list.map((s) => (s.id === id ? { ...s, showOnEnded: on } : s)));
    const res = await fetch(`/api/webinars/${webinar.id}/surveys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showOnEnded: on }),
    });
    if (!res.ok) {
      toast.error("설문 연결을 바꾸지 못했어요");
      setSurveyOptions(list); // 낙관적 업데이트 되돌리기
    }
  };

  /** 자체 설문 전체 해제 — '연결 안 함'·'외부 링크' 로 넘어갈 때. */
  const unlinkAllSurveys = async () => {
    for (const s of surveyOptions ?? []) if (s.showOnEnded) await toggleInternalSurvey(s.id, false);
  };

  const buildLivePage = () => {
    const ctas = ctaCards
      .map((card) => {
        const buttons = [btnToConfig(card.primary, "white"), btnToConfig(card.secondary, "ghost")]
          .filter((b): b is Record<string, unknown> => b !== null);
        const benefits = card.benefits.split("\n").map((s) => s.trim()).filter(Boolean);
        const c: Record<string, unknown> = {};
        if (card.eyebrow.trim()) c.eyebrow = card.eyebrow.trim();
        if (card.title.trim()) c.title = card.title.trim();
        if (card.description.trim()) c.description = card.description.trim();
        if (benefits.length) c.benefits = benefits;
        if (buttons.length) c.buttons = buttons;
        return c;
      })
      .filter((c) => Object.keys(c).length > 0);

    const notifyObj: Record<string, unknown> = { enabled: form.notifyEnabled };
    if (form.notifyKicker.trim()) notifyObj.kicker = form.notifyKicker.trim();
    if (form.notifyTitle.trim()) notifyObj.title = form.notifyTitle.trim();
    if (form.notifyDescription.trim()) notifyObj.description = form.notifyDescription.trim();
    if (form.notifySwitchLabel.trim()) notifyObj.switchLabel = form.notifySwitchLabel.trim();

    const lp: Record<string, unknown> = {};
    if (form.lpContact.trim()) lp.infoContact = form.lpContact.trim();
    if (form.lpNotice.trim()) lp.notice = form.lpNotice.trim();
    if (ctas.length) lp.ctas = ctas;
    lp.notify = notifyObj;
    // 화면 구성 — 섹션 on/off + 자료·다음웨비나 (뷰어는 normalizeLivePageConfig 로 읽음)
    lp.waiting = screens.waiting;
    lp.entry = screens.entry;
    lp.ended = screens.ended;
    const res = stripRowKeys(resources).filter((r) => r.url.trim());
    /* surveyId 를 반드시 실어야 한다 — 여기서 빠뜨려 어드민에서 조건을 골라도 저장되지 않았고,
       뷰어는 조건 없는 자료로 보고 그대로 열어 줬다(게이팅이 통째로 무력화). */
    if (res.length) lp.resources = res.map((r) => ({
      title: r.title.trim() || "자료",
      meta: r.meta.trim(),
      url: r.url.trim(),
      surveyId: r.surveyId.trim(),
    }));
    if (nextWeb.title.trim()) lp.nextWebinar = { title: nextWeb.title.trim(), when: nextWeb.when.trim(), url: nextWeb.url.trim() };
    return lp;
  };

  // 자동저장 — 폼·CTA·테마 변경 시 디바운스 후 PATCH. 성공하면 상위 config 를 조용히 최신화.
  const save = async () => {
    try {
      // 입력이 비면 의도적 해제(null)지만, 값이 있는데 파싱 실패면 저장에서 제외한다.
      // 오타 한 글자로 방송 중인 영상 ID 가 지워지는 걸 막는다(경고는 입력란 아래 인라인).
      const youtubeTouched = form.youtubeId.trim() === "" || youtubeVideoId !== null;

      // components 는 **운영 콘솔도 같은 키를 쓴다**(chatEnabled·qaMode). 그래서 바뀐 키만 보낸다.
      // 바로 아래 주석의 규칙("옛 스냅샷을 스프레드하면 다른 탭이 방금 저장한 값을 되돌린다")이
      // config 에는 지켜졌는데 components 에는 빠져 있었다 — 두 키를 항상 함께 쓰면
      // 콘솔에서 Q&A 를 폐쇄형으로 바꾼 직후 만들기에서 문구 하나만 고쳐도 오픈형으로 복귀한다.
      const componentsPatch = diffPatch(
        {
          chatEnabled: components.chatEnabled === true,
          qaMode: components.qaMode === "closed" ? "closed" : "open",
        },
        { chatEnabled: form.chatEnabled, qaMode: form.qaMode },
      );

      const res = await fetch(`/api/webinars/${webinar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: true, // 페이지 이탈 중 flush 도 서버에 도달하도록
        // 이 탭이 소유한 키만 보낸다 — 서버가 config 를 키 단위로 병합하므로
        // 옛 스냅샷을 스프레드하면 다른 탭이 방금 저장한 값을 되돌린다.
        body: JSON.stringify({
          config: {
            ...(youtubeTouched ? { youtubeId: youtubeVideoId } : {}),
            surveyUrl: form.surveyUrl.trim() || null,
            livePage: buildLivePage(),
          },
          // 바뀐 키가 없으면 components 를 아예 보내지 않는다(다른 키·다른 창의 값 보존)
          ...(Object.keys(componentsPatch).length ? { components: componentsPatch } : {}),
        }),
      });
      if (!res.ok) { toast.error("자동 저장 실패 — 잠시 후 다시 시도돼요", { id: "autosave-error" }); return false; }
      onSilentUpdate(); // 상위 webinar.config 를 조용히 최신화(탭 간 config 유지, 로더 플래시 없음)
      return true;
    } catch { return false; }
  };
  const { state: saveState, dirty, retry } = useAutosave({ form, ctaCards, screens, resources, nextWeb }, save);
  // 표시는 껍데기 한 곳에서 그린다(만들기 화면당 1개) — 저장 경로는 그대로 각자.
  useReportAutosave(saveState, retry);

  // 다른 창·다른 기기·운영 콘솔에서 같은 웨비나가 바뀌면 이 폼도 따라간다(편집 중이면 대기).
  // 특히 채팅·Q&A 는 콘솔과 같은 키를 공유하므로, 여기 표시가 낡으면 운영자가 사실과 다른 걸 본다.
  const incomingForm = useMemo(
    () => ({
      youtubeId: (webinar.config?.youtubeId as string) ?? "",
      surveyUrl: (webinar.config?.surveyUrl as string) ?? "",
      lpContact: (livePage.infoContact as string) ?? "",
      lpNotice: (livePage.notice as string) ?? "",
      chatEnabled: components.chatEnabled === true,
      qaMode: components.qaMode === "closed" ? ("closed" as const) : ("open" as const),
      notifyEnabled: notify.enabled === true,
      notifyKicker: (notify.kicker as string) ?? "",
      notifyTitle: (notify.title as string) ?? "",
      notifyDescription: (notify.description as string) ?? "",
      notifySwitchLabel: (notify.switchLabel as string) ?? "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [webinar.config, webinar.components],
  );
  useExternalSync(incomingForm, setForm, dirty);


  /**
   * 어드민 상태 → 뷰어 미리보기 파라미터.
   *
   * 이름이 어긋나는 건 뷰어 쪽 기존 계약이다 — `?preview=registration` 이 실제로 렌더하는 것은
   * **등록자 관점의 대기 화면**(PreLiveWaiting)이다(live/page.tsx 의 주석이 그렇게 적어 두었다).
   * 여기서 한 번 매핑해 두고 링크는 이 표만 쓴다.
   */
  const PREVIEW_PARAM: Record<WatchState, string> = {
    waiting: "registration",
    entry: "entry",
    live: "live",
    ended: "ended",
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl space-y-8">
      {/**
       * 상태 세그먼트 — 옛 메뉴에서 '대기 화면 / 라이브 페이지 / 종료 화면' 세 항목이던 것.
       * 시청자에게는 URL 하나(/webinar/[slug]/live)이고 상태만 바뀌는데 메뉴가 나란한 세 페이지처럼
       * 보여 주고 있었다. 코드도 이미 한 인스턴스를 공유했으니(옛 LIVE_GROUP) 이건 구조를 바꾸는
       * 게 아니라 구조를 드러내는 것이다. '입장'은 원래 라이브 안에 묶여 있어 메뉴에도 미리보기
       * 경로에도 없었는데, 별개 공개 화면이라 상태로 승격했다.
       */}
      {/**
       * 상태 선택 + 그 상태의 미리보기를 **한 줄에** 둔다.
       * 미리보기 링크는 원래 이 화면 맨 아래, 설정 400여 줄 뒤에 있었다. 그런데 이건
       * 상태를 고른 **직후**에 가장 쓰고 싶은 동작이다 — 고른 상태가 실제로 어떻게 보이는지
       * 확인하려고 고르는 것이니까. 상태에 종속된 액션이라 상태 선택기 옆이 제 자리다.
       *
       * 세그먼트는 손으로 짜여 있었고 선택 칸이 bg-background + shadow-sm(승격)이었다 —
       * primitives 의 SELECTED 주석에 적은 이유로 다크에서 방향이 뒤집힌다. Segmented 로 교체.
       */}
      <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          label="시청 화면 상태"
          value={state}
          onChange={onStateChange}
          options={WATCH_STATES.map(({ id, label, hint }) => ({ value: id, label, hint }))}
        />
        {/* 목업 라우트(/live-preview)가 아니라 **실제 공개 페이지**를 소유자 미리보기로 연다 —
            같은 컴포넌트·같은 데이터라 "미리보기와 실제가 다르다" 가 생기지 않는다.
            부작용(추적·전송)은 뷰어 쪽 isPreviewUrl 가드가 막는다. */}
        <a href={`/webinar/${encodeURIComponent(slug)}/live?preview=${PREVIEW_PARAM[state]}`} target="_blank" rel="noopener noreferrer"
          title="저장된 내용 기준으로 새 탭에서 실제 화면을 미리봅니다"
          /* lg 이상에서는 인접 미리보기 패널이 같은 일을 하므로 숨긴다. lg 미만에서는 패널이
             렌더되지 않으니(폭이 없다) 이 링크가 유일한 경로 — 그래서 지우지 않고 숨긴다. */
          className={`ml-auto shrink-0 lg:hidden ${btnCls("quiet", "text-xs")}`}>
          {WATCH_STATES.find((w) => w.id === state)?.label} 화면 미리보기 ↗
        </a>
      </div>

      {/* ══════════ 대기 ══════════ */}
      {state === "waiting" && (
        <>
          <Blk title="화면 구성" tag="read" goes={goesFor("waiting", "entry")} hint="대기 화면에 보여줄 요소예요. 데이터가 없으면 켜져 있어도 자동으로 숨겨져요.">
            <div className="space-y-2.5">
              <Toggle label="세션 순서(아젠다)" checked={screens.waiting.agenda} onChange={(v) => setW("agenda", v)} desc="세션 탭에 등록한 시간표가 타임라인으로 표시돼요" />
              <Toggle label="함께 기다리는 인원 밴드" checked={screens.waiting.social} onChange={(v) => setW("social", v)} desc="현재 대기 중인 사람이 2명 이상일 때만 표시돼요" />
              <Toggle label="캘린더에 추가" checked={screens.waiting.calendar} onChange={(v) => setW("calendar", v)} desc="웨비나 일정으로 만들어 담아요 · 모바일에서만 보여요" />
              <Toggle label="초대 공유" checked={screens.waiting.share} onChange={(v) => setW("share", v)} />
              <Toggle label="시작 알림 받기" checked={screens.waiting.notify} onChange={(v) => setW("notify", v)} desc="이메일 등록자에게 시작 리마인더를 보낼 수 있어요" />
            </div>
          </Blk>

          {/* 소개 카드 — 세 칸 모두 선택이다. 비우면 웨비나 기본정보(이름·설명)가 그대로 나가고,
              채우면 이 화면에서만 그 값을 쓴다. 기본정보의 이름은 목록·메일·리마인더까지 쓰는
              식별자라 길고 정확해야 하는데 이 카드는 읽히는 카피라 요구가 다르다. */}
          <Blk title="이 웨비나는 소개 카드" goes={goesFor("waiting", "entry")} hint="비우면 웨비나 이름·설명이 그대로 나가요.">
            <div className="space-y-3">
              <input
                aria-label="소개 카드 라벨"
                value={screens.waiting.about.eyebrow}
                onChange={(e) => setAbout({ eyebrow: e.target.value })}
                className={inputCls}
                placeholder="예: 이 웨비나는 (비우면 그대로)"
              />
              <input
                aria-label="소개 카드 제목"
                value={screens.waiting.about.title}
                onChange={(e) => setAbout({ title: e.target.value })}
                className={inputCls}
                placeholder="비우면 웨비나 이름"
              />
              <textarea
                aria-label="소개 카드 본문"
                value={screens.waiting.about.body}
                onChange={(e) => setAbout({ body: e.target.value })}
                className={inputCls}
                rows={3}
                placeholder="비우면 웨비나 설명 · 줄바꿈은 그대로 보여요"
              />
            </div>
          </Blk>

          <Blk title="이 웨비나는 추가 카드" goes={goesFor("waiting", "entry")} hint="인원 밴드와 아젠다 설정과 별개로 소개 카드 아래에 표시돼요.">
            <div className="space-y-3">
              <Toggle
                label="안내 영역 표시"
                checked={screens.waiting.followUp.enabled}
                onChange={(enabled) => setFollowUp({ enabled })}
              />
              {/* 제목은 선택 — 비우면 제목 줄 자체를 안 그린다(기존 웨비나 화면이 바뀌지 않게). */}
              <input
                aria-label="추가 카드 제목"
                value={screens.waiting.followUp.title}
                onChange={(e) => setFollowUp({ title: e.target.value })}
                className={FIELD_CLS}
                placeholder="예: 오픈채팅방에서 미리 만나요 (비우면 제목 없음)"
              />
              <textarea
                aria-label="대기 화면 안내 문구"
                value={screens.waiting.followUp.text}
                onChange={(e) => setFollowUp({ text: e.target.value })}
                className={FIELD_CLS}
                rows={3}
                placeholder={"예: 라이브 자료는 종료 후\n등록 이메일로 보내드려요."}
              />
              {/* 나열 항목은 한 덩어리 텍스트가 아니라 행으로 받는다 — 문단 안에 줄바꿈으로 넣으면
                  화면에서 목록으로 안 읽히고 정렬에만 기대야 한다. 순서가 의미 있어 드래그도 켠다. */}
              <EditableList<WithRowKey<{ value: string }>>
                listId="waiting-followup-items"
                itemNoun="항목"
                items={followUpItems}
                onChange={setFollowUpItems}
                rowKey={(r) => r[ROW_KEY]}
                makeItem={() => ({ value: "", [ROW_KEY]: crypto.randomUUID() })}
                addLabel="항목 추가"
                reorderable
                rowChrome="bare"
                emptyState={
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    항목을 추가하면 안내 문구 아래 체크 목록으로 표시돼요.
                  </p>
                }
                renderRow={({ item, patch }) => (
                  <input
                    aria-label="안내 항목"
                    className={inputCls}
                    placeholder="예: 해외 진출 인사이트 컬럼"
                    value={item.value}
                    onChange={(e) => patch({ value: e.target.value })}
                  />
                )}
              />
              <input
                aria-label="대기 CTA 버튼 문구"
                value={screens.waiting.followUp.ctaLabel}
                onChange={(e) => setFollowUp({ ctaLabel: e.target.value })}
                className={FIELD_CLS}
                placeholder="예: 행사 안내 보기"
              />
              <input
                aria-label="대기 CTA 연결 URL"
                type="url"
                value={screens.waiting.followUp.ctaUrl}
                onChange={(e) => setFollowUp({ ctaUrl: e.target.value })}
                className={waitingFollowUpUrlInvalid ? FIELD_CLS_DANGER : FIELD_CLS}
                placeholder="https://..."
              />
              {waitingFollowUpUrlInvalid && (
                <p className="text-[11px] text-destructive">http:// 또는 https:// 주소를 입력해 주세요.</p>
              )}
            </div>
          </Blk>
        </>
      )}

      {/* ══════════ 라이브 ══════════ */}
      {state === "live" && (
        <>
          {/* 영상 */}
          <Blk title="영상" tag="risk" goes={goesFor("live")} pinned hint="시청 화면에 재생될 라이브 방송 소스예요.">
            <div>
              <label htmlFor={`${uid}-yt`} className="text-xs text-muted-foreground mb-1 block">YouTube 공유 링크 또는 영상 ID</label>
              <input id={`${uid}-yt`} type="text" placeholder="예: https://youtu.be/dQw4w9WgXcQ" value={form.youtubeId}
                onChange={(e) => setForm((f) => ({ ...f, youtubeId: e.target.value }))}
                className={`${form.youtubeId.trim() && !youtubeVideoId ? FIELD_CLS_DANGER : FIELD_CLS} font-mono`} />
              <p className={`mt-1 text-[11px] ${form.youtubeId.trim() && !youtubeVideoId ? "text-destructive" : "text-muted-foreground"}`}>
                {form.youtubeId.trim() && !youtubeVideoId
                  ? "YouTube 공유 링크 또는 11자리 영상 ID를 입력해 주세요."
                  : "공유 링크를 그대로 붙여 넣어도 자동으로 영상 ID로 저장돼요."}
              </p>
            </div>
          </Blk>

          {/* 콘텐츠 */}
          <Blk title="콘텐츠" goes={goesFor("live")} hint="시청 화면의 정보·안내 문구예요. 비워두면 표시되지 않아요.">
            <div className="space-y-3">
              <div>
                <label htmlFor={`${uid}-contact`} className="text-xs text-muted-foreground mb-1 block">문의처 (정보 카드)</label>
                <input id={`${uid}-contact`} type="text" placeholder="예: STK 운영사무국" value={form.lpContact}
                  onChange={(e) => setForm((f) => ({ ...f, lpContact: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label htmlFor={`${uid}-notice`} className="text-xs text-muted-foreground mb-1 block">안내 문구 (하단 노티스)</label>
                <textarea id={`${uid}-notice`} rows={2} placeholder="비워두면 기본 안내 문구가 표시돼요." value={form.lpNotice}
                  onChange={(e) => setForm((f) => ({ ...f, lpNotice: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
            </div>
          </Blk>

          {/* 자료 받기 카드 (CTA) — 여러 장 */}
          <Blk title="자료 받기 카드 (CTA)" goes={goesFor("live")} hint="시청 화면 하단에 표시돼요.">
            {/**
             * 골격 이관. 여기서 고쳐지는 실제 결함이 하나 있다: 카드는 key={card.id} 로
             * 그려지는데 **수정·삭제는 인덱스**였다 — `updateCta(i, …)` 와 `filter((_, j) => j !== i)`.
             * 지금은 순서를 바꿀 방법이 없어 드러나지 않았지만, 재정렬을 붙이는 순간
             * 인덱스가 어긋나 **다른 카드가 수정되거나 지워진다**. 그래서 이관과 함께
             * 골격의 id 기반 patch 로 갈아탄다 — 순서를 붙이려면 먼저 이걸 고쳐야 했다.
             *
             * layout 프롭도 함께 사라진다(framer 가 transform 저자가 되는 그 프롭).
             */}
            <EditableList<CtaFormCard>
              listId="live-cta-cards"
              itemNoun="CTA 카드"
              items={ctaCards}
              onChange={setCtaCards}
              rowKey={(c) => c.id}
              makeItem={emptyCta}
              reorderable
              rowChrome="bare"
              emptyState={
                <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">아직 CTA 카드가 없어요. 아래 버튼으로 추가하세요.</p>
              }
              renderAdd={({ add }) => (
                <motion.button type="button" whileTap={{ scale: 0.98 }} transition={spring}
                  onClick={() => add()}
                  className="w-full rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-violet-500 transition-colors hover:bg-violet-500/5">
                  + CTA 카드 추가
                </motion.button>
              )}
              renderRow={({ item: card, visibleIndex, patch: patchCard, handle, removeButton }) => (
                <div className={`bg-secondary p-4 space-y-3 ${R.panel} ${FINISH.s2}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {handle}
                      <p className="text-xs font-medium text-muted-foreground">카드 {visibleIndex + 1}</p>
                    </div>
                    {removeButton({ label: `${card.title || `카드 ${visibleIndex + 1}`} 삭제` })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input aria-label="CTA 카드 상단 라벨" type="text" placeholder="상단 라벨 (예: 세션 자료)" value={card.eyebrow} onChange={(e) => patchCard({ eyebrow: e.target.value })} className={inputCls} />
                    <input aria-label="CTA 카드 제목" type="text" placeholder="제목 (예: 발표 자료·템플릿 받기)" value={card.title} onChange={(e) => patchCard({ title: e.target.value })} className={inputCls} />
                  </div>
                  <textarea aria-label="CTA 카드 설명" rows={2} placeholder="설명" value={card.description} onChange={(e) => patchCard({ description: e.target.value })} className={`${inputCls} resize-none`} />
                  <textarea aria-label="CTA 카드 혜택 목록" rows={2} placeholder="혜택 목록 — 한 줄에 하나씩 (선택)" value={card.benefits} onChange={(e) => patchCard({ benefits: e.target.value })} className={`${inputCls} resize-none`} />
                  <div className="space-y-2">
                    {(["primary", "secondary"] as const).map((slot) => {
                      const btn = card[slot];
                      const upd = (next: Partial<CtaBtnForm>) => patchCard({ [slot]: { ...btn, ...next } } as Partial<CtaFormCard>);
                      return (
                        <div key={slot} className={`space-y-2 bg-background p-2.5 ${R.surface} ${FINISH.s2}`}>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_130px_96px]">
                            <input
                              type="text"
                              aria-label={slot === "primary" ? "메인 버튼 라벨" : "보조 버튼 라벨"}
                              placeholder={slot === "primary" ? "메인 버튼 라벨 (예: 자료 받기·문의하기)" : "보조 버튼 라벨 (선택)"}
                              value={btn.label}
                              onChange={(e) => upd({ label: e.target.value })}
                              className={inputCls}
                            />
                            <select value={btn.action} onChange={(e) => upd({ action: e.target.value as CtaBtnAction })} aria-label="버튼 연결 대상" className={inputCls}>
                              <option value="url">링크 (URL)</option>
                              <option value="form">폼 (문의·신청)</option>
                            </select>
                            <select value={btn.open} onChange={(e) => upd({ open: e.target.value as CtaBtnOpen })} aria-label="열기 방식" className={inputCls}>
                              <option value="newTab">새 창</option>
                              <option value="modal">모달</option>
                            </select>
                          </div>
                          {btn.action === "url" ? (
                            <>
                              <input aria-label="버튼 연결 URL" type="url" placeholder="연결 URL (https://…)" value={btn.url} onChange={(e) => upd({ url: e.target.value })} className={inputCls} />
                              {btn.open === "modal" && (
                                <p className="text-[11px] text-amber-600">일부 사이트는 페이지 안 임베드(모달)를 차단해요 — 모달이 비어 보이면 새 창으로 바꿔주세요.</p>
                              )}
                            </>
                          ) : surveyOptions === null ? (
                            <p className="text-[11px] text-muted-foreground">폼 목록 불러오는 중…</p>
                          ) : surveyOptions.length === 0 ? (
                            <p className="text-[11px] text-amber-600">
                                연결할 폼이 없어요 —{" "}
                                {onGoToSurvey ? <JumpLink onClick={onGoToSurvey}>설문에서 먼저 만들기</JumpLink> : "만들기 → 설문에서 먼저 만들어주세요"}
                              </p>
                          ) : (
                            <>
                              <select value={btn.surveyId} onChange={(e) => upd({ surveyId: e.target.value })} aria-label="연결할 폼" className={inputCls}>
                                <option value="">폼 선택…</option>
                                {surveyOptions.map((s) => (
                                  <option key={s.id} value={s.id}>{s.title}</option>
                                ))}
                              </select>
                              <p className="text-[11px] text-muted-foreground">응답은 분석 탭 → 설문 결과에서 개별 확인·CSV로 내려받을 수 있어요.</p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            />
          </Blk>

          {/* 이 블록만 제목이 토글 라벨이었다 — 다른 블록과 같은 헤더를 갖도록 Blk 으로 통일하고
              켜고 끄는 스위치는 헤더 우측 action 으로 올린다(제목과 스위치가 한 줄). */}
          <Blk
            title="알림 받고 이어보기 카드"
            goes={goesFor("live")}
            hint="시청 화면 하단에 다음 세션 알림·다시보기 안내 카드를 보여줘요."
            action={
              <Switch
                checked={form.notifyEnabled}
                onChange={(v) => setForm((f) => ({ ...f, notifyEnabled: v }))}
                label="알림 받고 이어보기 카드 표시"
              />
            }
          >
            {form.notifyEnabled && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input aria-label="알림 박스 상단 라벨" type="text" placeholder="상단 라벨 (예: 다음 세션 · 20:20)" value={form.notifyKicker}
                    onChange={(e) => setForm((f) => ({ ...f, notifyKicker: e.target.value }))} className={inputCls} />
                  <input aria-label="알림 박스 제목" type="text" placeholder="제목 (예: 알림 받고 이어보기)" value={form.notifyTitle}
                    onChange={(e) => setForm((f) => ({ ...f, notifyTitle: e.target.value }))} className={inputCls} />
                </div>
                <textarea aria-label="알림 박스 설명" rows={2} placeholder="설명 (비워두면 기본 문구)" value={form.notifyDescription}
                  onChange={(e) => setForm((f) => ({ ...f, notifyDescription: e.target.value }))} className={`${inputCls} resize-none`} />
                <input aria-label="알림 스위치 문구" type="text" placeholder="스위치 문구 (예: 세션 시작 알림 받기)" value={form.notifySwitchLabel}
                  onChange={(e) => setForm((f) => ({ ...f, notifySwitchLabel: e.target.value }))} className={inputCls} />
              </div>
            )}
          </Blk>

          {/* 참여 구성 */}
          <Blk title="참여 구성" tag="sync" goes={goesFor("live")}
            action={onGoToConsole ? <JumpLink onClick={onGoToConsole}>라이브 콘솔</JumpLink> : undefined} hint="시청 화면 참여 박스(Q&amp;A·채팅·세션) 구성이에요.">
            <div className="space-y-4">
              <Toggle
                checked={form.chatEnabled}
                onChange={(v) => {
                  // 끌 때만 확인 — 라이브 중이면 시청자 화면에서 채팅 탭이 즉시 사라진다.
                  if (v || !confirmLiveOff) { setForm((f) => ({ ...f, chatEnabled: v })); return; }
                  void confirmLiveOff("채팅 탭", "시청 화면 참여 박스에서 채팅 탭이 사라져요.").then((ok) => {
                    if (ok) setForm((f) => ({ ...f, chatEnabled: false }));
                  });
                }}
                label="채팅 탭 사용"
                desc="끄면 참여 박스에서 채팅 탭이 사라져요."
              />
              <div className="border-t border-border/60 pt-4">
                <ModeChoice
                  value={form.qaMode}
                  onChange={(v) => setForm((f) => ({ ...f, qaMode: v }))}
                  label="Q&A 공개 범위"
                  desc="라이브 중에도 바꿀 수 있어요."
                  options={[
                    { value: "open", title: "오픈형", desc: "올라온 질문을 시청자끼리 보고 추천할 수 있어요." },
                    { value: "closed", title: "폐쇄형", desc: "질문은 주최자만 봐요. 시청자에겐 질문하기 입력만 보여요." },
                  ]}
                />
              </div>
            </div>
          </Blk>

        </>
      )}

      {/* ══════════ 입장 — 라이브 중 미인증 방문자가 보는 화면(별개 공개 화면이라 상태로 승격) ══════════ */}
      {state === "entry" && (
        <>
          {/* 입장 화면 */}
          <Blk title="입장 화면" goes={goesFor("entry")} hint="라이브 중 미인증 방문자가 보는 입장 확인 화면이에요.">
            <div>
              <Toggle label="실시간 시청자 수" checked={screens.entry.viewerCount} onChange={(v) => setScreens((s) => ({ ...s, entry: { viewerCount: v } }))}
                desc="'지금 N명이 함께 보고 있어요' — 입장을 유도하는 사회적 증거예요" />
            </div>
          </Blk>

        </>
      )}

      {/* ══════════ 종료 ══════════ */}
      {state === "ended" && (
        <>
          {/* 문구를 화면 구성보다 위에 둔다 — 종료 화면에서 시청자가 가장 먼저 읽는 부분이라
              편집 순서도 화면 순서와 같게 맞춘다. */}
          <Blk title="인사말" goes={goesFor("ended")} hint="종료 화면 맨 위에 크게 보이는 문구예요. 비우면 기본 문구가 쓰여요.">
            <div className="space-y-2">
              <div>
                <label htmlFor="ended-title" className="mb-1 block text-xs text-muted-foreground">제목</label>
                <textarea
                  id="ended-title"
                  rows={2}
                  value={screens.ended.title}
                  onChange={(e) => setEnText("title", e.target.value)}
                  placeholder={DEFAULT_ENDED_TITLE}
                  className={`${inputCls} resize-y`}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">줄바꿈한 위치에서 그대로 줄이 나뉘어요.</p>
              </div>
              <div>
                <label htmlFor="ended-desc" className="mb-1 block text-xs text-muted-foreground">설명</label>
                <textarea
                  id="ended-desc"
                  rows={2}
                  value={screens.ended.description}
                  onChange={(e) => setEnText("description", e.target.value)}
                  placeholder={DEFAULT_ENDED_DESCRIPTION}
                  className={`${inputCls} resize-y`}
                />
              </div>
            </div>
          </Blk>

          <Blk title="화면 구성" tag="read" goes={goesFor("ended")} hint="종료 화면에 보여줄 요소예요. 데이터가 없으면 켜져 있어도 자동으로 숨겨져요.">
            <div className="space-y-2.5">
              <Toggle label="다시보기 신청" checked={screens.ended.replay} onChange={(v) => setEn("replay", v)} desc="신청자는 알림 수신 목록에 담겨요 — 다시보기 링크를 이메일로 보내세요" />
              <Toggle label="자료 다운로드" checked={screens.ended.resources} onChange={(v) => setEn("resources", v)} desc="아래 자료를 1개 이상 추가해야 표시" />
              <Toggle label="다음 웨비나" checked={screens.ended.nextWebinar} onChange={(v) => setEn("nextWebinar", v)} desc="아래 제목을 입력해야 표시" />
              <Toggle label="공유" checked={screens.ended.share} onChange={(v) => setEn("share", v)} />
            </div>
          </Blk>

          <Blk title="설문 연결" tag="sync" goes={goesFor("ended")} hint={<>종료 화면에 어떤 설문을 걸지 — 자체 설문은 여러 개, 외부 링크는 하나예요.</>}>
            <div className="space-y-3 rounded-2xl bg-secondary/20 p-4">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="설문 연결">
                {([
                  { v: "none", label: "연결 안 함" },
                  { v: "internal", label: "자체 설문" },
                  { v: "external", label: "외부 링크" },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    role="radio"
                    aria-checked={surveyLink === opt.v}
                    onClick={() => {
                      if (opt.v === "none") { setEn("survey", false); void unlinkAllSurveys(); return; }
                      setEn("survey", true);
                      if (opt.v === "external") {
                        // 자체 설문이 외부 URL 보다 우선하므로, 외부를 고르면 자체 연결을 전부 끊는다 —
                        // 안 끊으면 URL 을 입력해도 조용히 무시된다(예전의 그 혼란).
                        void unlinkAllSurveys();
                      } else if (linkedSurveys.length === 0 && surveyOptions?.length) {
                        // 자체 설문으로 넘어올 때 첫 칸을 켜 준다 — 아무것도 안 켜진 '자체 설문' 은
                        // 화면상 외부와 구분되지 않고, 그 상태로는 버튼이 안 뜬다.
                        void toggleInternalSurvey(surveyOptions[0].id, true);
                      }
                    }}
                    className={`rounded-lg px-3 py-2 text-xs font-medium shadow-sm transition-colors ${
                      surveyLink === opt.v ? "bg-violet-500 text-white" : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {surveyLink === "internal" && (
                surveyOptions === null ? (
                  <p className="text-[11px] text-muted-foreground">설문 목록을 불러오는 중…</p>
                ) : surveyOptions.length === 0 ? (
                  <p className="text-[11px] text-amber-600">
                    연결할 자체 설문이 없어요 —{" "}
                    {onGoToSurvey ? <JumpLink onClick={onGoToSurvey}>설문에서 먼저 만들기</JumpLink> : "만들기 → 설문에서 먼저 만들어 주세요"}
                  </p>
                ) : (
                  /* 드롭다운이 아니라 체크 목록인 이유: 여러 개를 걸 수 있게 됐고, 드롭다운은
                     **하나만 고를 수 있다고 말한다.** 켜진 것이 전부 한눈에 보여야 종료 화면에
                     카드가 몇 장 나가는지 알 수 있다(AGENTS §2 — 고치는 값은 항상 보이게). */
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">연결할 설문 — 여러 개 고를 수 있어요</p>
                    <div className="space-y-1">
                      {surveyOptions.map((o) => (
                        <label key={o.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[13px]">
                          <input
                            type="checkbox"
                            checked={o.showOnEnded}
                            onChange={(e) => void toggleInternalSurvey(o.id, e.target.checked)}
                            className="size-4 shrink-0 accent-violet-500"
                          />
                          <span className={o.showOnEnded ? "" : "text-muted-foreground"}>{o.title || "제목 없는 설문"}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      고른 순서가 아니라 <b className="font-medium">설문을 만든 순서</b>로 종료 화면에 나란히 놓여요.
                      설문이 닫혀 있거나 마감이 지나면 그 카드는 표시되지 않아요.
                    </p>
                  </div>
                )
              )}

              {surveyLink === "external" && (
                <div className="space-y-1.5">
                  <label className="block text-xs text-muted-foreground" htmlFor="ended-survey-url">설문 URL</label>
                  <input id="ended-survey-url" type="url" placeholder="https://tally.so/..." value={form.surveyUrl}
                    onChange={(e) => setForm((f) => ({ ...f, surveyUrl: e.target.value }))} className={inputCls} />
                  {!form.surveyUrl.trim() && (
                    <p className="text-[11px] text-amber-600">URL 을 입력해야 버튼이 표시돼요.</p>
                  )}
                </div>
              )}
            </div>
          </Blk>

          {screens.ended.resources && (
            <Blk title="받아가세요 · 자료" goes={goesFor("ended")} hint="종료 화면에서 다운로드 리스트로 표시돼요.">
              {/* 공용 골격(EditableList)으로 통일 — 예전엔 key={i} 라 중간 행을 지우면 아래 행들의
                  입력값·IME 조합이 엉켰고, 삭제는 "삭제" 텍스트 버튼에 되돌리기가 없었고, 순서도 못 바꿨다. */}
              <EditableList
                listId="live-resources"
                itemNoun="자료"
                items={resources}
                onChange={setResources}
                rowKey={(r) => r[ROW_KEY]}
                makeItem={() => ({ title: "", meta: "", url: "", surveyId: "", [ROW_KEY]: crypto.randomUUID() })}
                addLabel="자료 추가"
                reorderable
                emptyState={
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    아직 자료가 없어요. 아래에서 추가하면 종료 화면에 다운로드 리스트로 표시돼요.
                  </p>
                }
                renderRow={({ item, index, patch }) => (
                  <>
                    <span className="text-[11px] text-muted-foreground">자료 {index + 1}</span>
                    <input aria-label="자료 제목" className={inputCls} placeholder="제목 (예: 발표자료)" value={item.title} onChange={(e) => patch({ title: e.target.value })} />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input aria-label="자료 설명" className={inputCls} placeholder="설명 (예: PDF · 4.2MB)" value={item.meta} onChange={(e) => patch({ meta: e.target.value })} />
                      <input aria-label="자료 다운로드 URL" className={inputCls} type="url" placeholder="다운로드 URL" value={item.url} onChange={(e) => patch({ url: e.target.value })} />
                    </div>
                    {/* 자료별 대가 — 만족도 설문을 낸 사람에게 발표자료를, 사전조사를 낸 사람에게
                        다음 행사 자료를 주는 식으로 자료마다 조건이 다른 게 실제 운영이다.
                        선택지는 **종료 화면에 걸린 설문**뿐이다 — 시청자가 그 화면에서 바로 낼 수
                        있어야 자물쇠를 풀 길이 있다. */}
                    {linkedSurveys.length > 0 ? (
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-muted-foreground">받기 조건</span>
                        <select
                          aria-label="자료 다운로드 조건 설문"
                          className={inputCls}
                          value={item.surveyId}
                          onChange={(e) => patch({ surveyId: e.target.value })}
                        >
                          <option value="">조건 없음 — 누구나 받기</option>
                          {linkedSurveys.map((sv) => (
                            <option key={sv.id} value={sv.id}>{sv.title} 완료해야 받기</option>
                          ))}
                        </select>
                      </label>
                    ) : item.surveyId ? (
                      <p className="text-[11px] text-destructive">
                        조건으로 걸린 설문이 종료 화면에서 빠졌어요 — 지금은 아무도 이 자료를 받을 수 없어요.
                      </p>
                    ) : null}
                  </>
                )}
              />
            </Blk>
          )}

          {screens.ended.nextWebinar && (
            <Blk title="다음 웨비나" goes={goesFor("ended")} hint="종료 화면 하단에 사전등록 티저로 표시돼요.">
              <input aria-label="다음 웨비나 제목" className={inputCls} placeholder="제목 (예: 미국 아마존 입점 A to Z)" value={nextWeb.title} onChange={(e) => setNextWeb((n) => ({ ...n, title: e.target.value }))} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input aria-label="다음 웨비나 일시" className={inputCls} placeholder="일시 (예: 8월 21일 오후 2시)" value={nextWeb.when} onChange={(e) => setNextWeb((n) => ({ ...n, when: e.target.value }))} />
                <input aria-label="다음 웨비나 사전등록 URL" className={inputCls} type="url" placeholder="사전등록 URL" value={nextWeb.url} onChange={(e) => setNextWeb((n) => ({ ...n, url: e.target.value }))} />
              </div>
            </Blk>
          )}
        </>
      )}

    </div>
  );
}
