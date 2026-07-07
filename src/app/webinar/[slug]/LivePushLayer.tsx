"use client";

// 라이브 시청 중 푸시 레이어 — 팝업 모달 + Tally 단독 푸시.
// 운영 콘솔에서 ON 한 항목을 15초 폴링으로 받아 시청자 화면에 띄운다 (레거시 STK 라이브 페이지 계승).
// - 닫음/열림 기억: id + updatedAt 키 (수정하거나 다시 ON 하면 updatedAt 이 바뀌어 재노출)
// - Tally: 공식 embed.js 를 지연 로드, hiddenFields 로 응답자 식별(registrationId) 전달

import { useCallback, useEffect, useRef, useState } from "react";

interface LivePopup {
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

interface LiveTallyPush {
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

interface TallyWindow extends Window {
  Tally?: { openPopup: (formId: string, options?: Record<string, unknown>) => void };
}

const POLL_MS = 15_000;

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
  active,
  registrationId,
  accentColor,
}: {
  slug: string;
  active: boolean;
  registrationId: string | null;
  accentColor?: string;
}) {
  const [popup, setPopup] = useState<LivePopup | null>(null);
  const openedTallyRef = useRef<Set<string>>(new Set());
  const accent = accentColor || "#6d28d9";

  const poll = useCallback(async () => {
    try {
      const [popupRes, tallyRes] = await Promise.all([
        fetch(`/api/webinar/${slug}/popups`),
        fetch(`/api/webinar/${slug}/tally-pushes`),
      ]);

      if (popupRes.ok) {
        const data = await popupRes.json();
        const activePopup: LivePopup | undefined = (data.popups ?? [])[0];
        if (activePopup) {
          const key = `mach_popup_${activePopup.id}_${activePopup.updatedAt}`;
          setPopup(activePopup.dismissible !== false && sessionGet(key) ? null : activePopup);
        } else {
          setPopup(null);
        }
      }

      if (tallyRes.ok) {
        const data = await tallyRes.json();
        const push: LiveTallyPush | undefined = (data.tallyPushes ?? [])[0];
        if (push) {
          const key = `mach_tally_${push.id}_${push.updatedAt}`;
          if (!sessionGet(key) && !openedTallyRef.current.has(key)) {
            openedTallyRef.current.add(key);
            sessionSet(key);
            openTally(push.formId, push, registrationId);
          }
        }
      }
    } catch { /* 폴링 실패는 다음 주기에 재시도 */ }
  }, [slug, registrationId]);

  useEffect(() => {
    if (!active) return;
    void poll();
    const interval = setInterval(() => {
      if (document.hidden) return;
      void poll();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [active, poll]);

  if (!active || !popup) return null;

  const dismiss = () => {
    sessionSet(`mach_popup_${popup.id}_${popup.updatedAt}`);
    setPopup(null);
  };

  const primaryIsTally = popup.integrationType === "tally" && popup.tallyFormId;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-5"
      style={{ background: "rgba(0,0,0,0.68)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && popup.dismissible !== false) dismiss(); }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1f] p-7 text-white shadow-2xl">
        <div className="absolute inset-x-[18%] top-0 h-0.5 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
        {popup.dismissible !== false && (
          <button
            onClick={dismiss}
            aria-label="팝업 닫기"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-base text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        )}
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
  );
}
