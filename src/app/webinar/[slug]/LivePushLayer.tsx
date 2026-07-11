"use client";

// 라이브 시청 중 푸시 레이어 — 팝업 모달 + Tally 단독 푸시 + 실시간 투표 토스트.
// 운영 콘솔에서 ON 한 항목을 부모(live/page)가 통합 /live-state 폴링으로 받아 props 로 내려준다.
// (예전엔 이 컴포넌트가 popups/tally-pushes/polls 를 각각 자체 폴링했으나, egress 절감 위해 폴링 일원화)
// - 닫음/열림 기억: id + updatedAt 키 (수정하거나 다시 ON 하면 updatedAt 이 바뀌어 재노출)
// - Tally: 공식 embed.js 를 지연 로드, hiddenFields 로 응답자 식별(registrationId) 전달

import { useEffect, useRef, useState } from "react";

export interface LivePopup {
  id: string;
  type: string;
  title: string;
  message: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  secondaryLabel: string | null;
  secondaryUrl: string | null;
  integrationType: string;
  tallyFormId: string | null;
  tallyEmojiText: string | null;
  tallyEmojiAnimation: string | null;
  tallyLayout: string | null;
  tallyWidth: number | null;
  tallyAutoClose: number | null;
  dismissible: boolean;
  updatedAt: string;
}

export interface LiveTallyPush {
  id: string;
  title: string;
  formId: string;
  emojiText: string | null;
  emojiAnimation: string | null;
  layout: string;
  width: number;
  autoClose: number;
  showOnce: boolean;
  doNotShowAfterSubmit: boolean;
  updatedAt: string;
}

interface LivePollOption {
  id: string;
  label: string;
  voteCount: number;
}

export interface LivePoll {
  id: string;
  question: string;
  updatedAt: string;
  options: LivePollOption[];
}

interface TallyWindow extends Window {
  Tally?: { openPopup: (formId: string, options?: Record<string, unknown>) => void };
}

function sessionGet(key: string): boolean {
  try { return !!sessionStorage.getItem(key); } catch { return false; }
}
function sessionSet(key: string) {
  try { sessionStorage.setItem(key, "1"); } catch { /* 스토리지 차단 무시 */ }
}

function ensureTallyScript(callback: () => void) {
  const w = window as TallyWindow;
  if (w.Tally?.openPopup) { callback(); return; }
  const existing = document.querySelector<HTMLScriptElement>('script[src="https://tally.so/widgets/embed.js"]');
  if (existing) {
    existing.addEventListener("load", callback, { once: true });
    setTimeout(() => { if ((window as TallyWindow).Tally?.openPopup) callback(); }, 1500);
    return;
  }
  const script = document.createElement("script");
  script.src = "https://tally.so/widgets/embed.js";
  script.async = true;
  script.onload = callback;
  document.head.appendChild(script);
}

function openTally(formId: string, options: { layout?: string | null; width?: number | null; autoClose?: number | null; emojiText?: string | null; emojiAnimation?: string | null }, registrationId: string | null) {
  ensureTallyScript(() => {
    try {
      (window as TallyWindow).Tally?.openPopup(formId, {
        layout: options.layout === "default" ? "default" : "modal",
        width: options.width ?? 700,
        autoClose: options.autoClose ?? 5000,
        emoji: { text: options.emojiText ?? "👋", animation: options.emojiAnimation ?? "wave" },
        hiddenFields: {
          source: "mach_webinar_live",
          originPage: window.location.pathname,
          ...(registrationId ? { registrationId } : {}),
        },
      });
    } catch { /* Tally 로드 실패는 조용히 무시 */ }
  });
}

export default function LivePushLayer({
  slug,
  registrationId,
  accentColor,
  popup: incomingPopup,
  tally: incomingTally,
  poll: incomingPoll,
}: {
  slug: string;
  registrationId: string | null;
  accentColor?: string;
  popup: LivePopup | null;
  tally: LiveTallyPush | null;
  poll: LivePoll | null;
}) {
  // 표시 상태 — props(통합 폴링 결과)를 받아 세션 기억(닫음/투표)을 반영해 실제 노출 여부를 정한다.
  const [popup, setPopup] = useState<LivePopup | null>(null);
  const [activePoll, setActivePoll] = useState<LivePoll | null>(null);
  const [voted, setVoted] = useState(false);
  const openedTallyRef = useRef<Set<string>>(new Set());
  const accent = accentColor || "#6d28d9";

  // 팝업 — 닫음(dismissible + updatedAt 키) 기억을 반영. 수정/재ON 시 updatedAt 이 바뀌어 다시 노출.
  useEffect(() => {
    if (incomingPopup) {
      const key = `mach_popup_${incomingPopup.id}_${incomingPopup.updatedAt}`;
      const dismissed = incomingPopup.dismissible !== false && sessionGet(key);
      setPopup(dismissed ? null : incomingPopup);
    } else {
      setPopup(null);
    }
  }, [incomingPopup]);

  // 실시간 투표 — 닫음(updatedAt 키)·투표 여부는 세션 기억. 프롭이 갱신되면 득표수도 함께 갱신.
  useEffect(() => {
    if (incomingPoll && !sessionGet(`mach_pollclosed_${incomingPoll.id}_${incomingPoll.updatedAt}`)) {
      setActivePoll(incomingPoll);
      setVoted(sessionGet(`mach_pollvote_${incomingPoll.id}`));
    } else {
      setActivePoll(null);
    }
  }, [incomingPoll]);

  // 단독 Tally 자동 오픈 — 한 번만(키 기억). 팝업 모달이 (닫히지 않고) 뜰 상황이면 보류하고,
  // 닫히면 다음 틱에 이 이펙트가 재실행되어 그때 연다(팝업 우선, z-index 겹침 방지).
  // 팝업 표시 여부는 파생 상태 popup 이 아직 반영되기 전(둘 다 같은 틱에 켜진 채 진입)에도
  // 정확히 판정하도록 원본 프롭(incomingPopup)으로 직접 계산한다.
  useEffect(() => {
    if (!incomingTally) return;
    const popupWillShow =
      incomingPopup != null &&
      !(incomingPopup.dismissible !== false && sessionGet(`mach_popup_${incomingPopup.id}_${incomingPopup.updatedAt}`));
    if (popupWillShow) return;
    const key = `mach_tally_${incomingTally.id}_${incomingTally.updatedAt}`;
    if (sessionGet(key) || openedTallyRef.current.has(key)) return;
    openedTallyRef.current.add(key);
    sessionSet(key);
    openTally(incomingTally.formId, incomingTally, registrationId);
  }, [incomingTally, incomingPopup, registrationId]);

  const dismiss = () => {
    if (!popup) return;
    sessionSet(`mach_popup_${popup.id}_${popup.updatedAt}`);
    setPopup(null);
  };

  const dismissPoll = () => {
    if (!activePoll) return;
    sessionSet(`mach_pollclosed_${activePoll.id}_${activePoll.updatedAt}`);
    setActivePoll(null);
  };

  const castVote = async (optionId: string) => {
    if (!activePoll || voted) return;
    try {
      const res = await fetch(`/api/webinar/${slug}/polls/${activePoll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId, registrationId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      sessionSet(`mach_pollvote_${activePoll.id}`);
      setActivePoll((p) => (p ? { ...p, options: data.options ?? p.options } : p));
      setVoted(true);
    } catch { /* 투표 전송 실패는 무시 (다음 시도 가능) */ }
  };

  const primaryIsTally = !!popup && popup.integrationType === "tally" && !!popup.tallyFormId;
  const pollTotal = activePoll ? activePoll.options.reduce((s, o) => s + o.voteCount, 0) : 0;

  if (!popup && !activePoll) return null;

  return (
    <>
      {popup && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-5"
          style={{ background: "rgba(0,0,0,0.68)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget && popup.dismissible !== false) dismiss(); }}
        >
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1f] text-white shadow-2xl">
            <div className="absolute inset-x-[18%] top-0 z-10 h-0.5 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
            {popup.dismissible !== false && (
              <button
                onClick={dismiss}
                aria-label="팝업 닫기"
                className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-base text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            )}
            {/* 콘텐츠만 스크롤 — 긴 내용도 닫기(×)·CTA 가 잘리지 않게(모바일). ×·상단바는 고정. */}
            <div className="min-h-0 overflow-y-auto p-7">
            <h2 className="mb-2 pr-9 text-lg font-bold leading-snug">{popup.title}</h2>
            {popup.message && <p className="mb-5 whitespace-pre-wrap text-sm leading-relaxed text-white/70">{popup.message}</p>}
            <div className="space-y-2">
              {popup.buttonLabel && (primaryIsTally ? (
                <button
                  onClick={() => openTally(popup.tallyFormId!, { layout: popup.tallyLayout, width: popup.tallyWidth, autoClose: popup.tallyAutoClose, emojiText: popup.tallyEmojiText, emojiAnimation: popup.tallyEmojiAnimation }, registrationId)}
                  className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-px"
                  style={{ background: accent }}
                >
                  {popup.buttonLabel}
                </button>
              ) : popup.buttonUrl ? (
                <a
                  href={popup.buttonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-px"
                  style={{ background: accent }}
                >
                  {popup.buttonLabel}
                </a>
              ) : null)}
              {popup.secondaryLabel && popup.secondaryUrl && (
                <a
                  href={popup.secondaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
                >
                  {popup.secondaryLabel}
                </a>
              )}
            </div>
            {popup.dismissible !== false && (
              <p className="mt-3 text-center text-[11px] text-white/40">닫으면 이 팝업은 다시 표시되지 않아요.</p>
            )}
            </div>
          </div>
        </div>
      )}

      {/* 실시간 투표 토스트 — 우하단. 팝업 모달이 떠 있을 땐 숨김(팝업 우선), 닫히면 다시 노출 */}
      {activePoll && !popup && (
        <div className="fixed bottom-4 right-4 z-[60] w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1f]/95 p-4 text-white shadow-2xl backdrop-blur">
          <button
            onClick={dismissPoll}
            aria-label="투표 닫기"
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
          <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: accent }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
            실시간 투표
          </div>
          <h5 className="mb-3 mt-2 pr-6 text-[15px] font-semibold leading-snug">{activePoll.question}</h5>
          <div className="space-y-1.5">
            {activePoll.options.map((o) => {
              const pct = pollTotal > 0 ? Math.round((o.voteCount / pollTotal) * 100) : 0;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => castVote(o.id)}
                  disabled={voted}
                  className="relative w-full overflow-hidden rounded-xl border border-white/12 px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors enabled:hover:border-white/30 disabled:cursor-default"
                >
                  <span className="absolute inset-y-0 left-0 transition-all duration-500" style={{ width: voted ? `${pct}%` : 0, background: `color-mix(in srgb, ${accent} 26%, transparent)` }} />
                  <span className="relative flex items-center justify-between gap-2">
                    <span className="truncate">{o.label}</span>
                    {voted && <span className="tabular-nums text-white/70">{pct}%</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-white/45">{voted ? "참여해주셔서 감사합니다" : "탭해서 투표에 참여하세요"}</p>
        </div>
      )}
    </>
  );
}
