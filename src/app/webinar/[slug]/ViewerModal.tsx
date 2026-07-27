"use client";

import type { ReactNode } from "react";

/**
 * 시청자용 모달 껍데기 — 배경·카드·닫기 버튼·스크롤 컨테이너.
 *
 * 왜 뺐나: 라이브 푸시 설문 모달의 껍데기를 종료 화면 설문·등록 완료 팝업이 그대로 필요로 했다.
 * 세 곳에 같은 마크업을 두면 한 곳만 고쳐져 갈라진다(모바일에서 긴 내용이 닫기 버튼을 밀어내는
 * 문제를 예전에 여기서 한 번 고쳤는데, 그게 사본에는 반영되지 않는다).
 *
 * 스크롤 규칙이 이 컴포넌트의 핵심이다: **콘텐츠만** 스크롤하고 ×·카드 테두리는 고정한다
 * (min-h-0 + overflow-y-auto). 카드 전체를 스크롤하게 두면 모바일에서 닫기 버튼이 화면 밖으로
 * 밀려 나가 모달을 닫을 수 없다.
 *
 * 테마: .stk-live 스코프를 스스로 붙인다 — 호스트가 buildStkCss 를 이미 주입했다는 전제.
 */
export default function ViewerModal({
  surface,
  text,
  soft,
  label,
  onClose,
  zIndex = 65,
  maxWidthClass = "max-w-lg",
  children,
}: {
  surface: string;
  text: string;
  /** 텍스트 색에서 파생한 반투명 색 — 호출부의 soft() 를 그대로 받는다(테마 일관). */
  soft: (pct: number) => string;
  /** 스크린리더용 이름 — 모달이 무엇인지 말한다. */
  label: string;
  /** 닫기(× · 배경 클릭). 닫을 수 없는 모달은 이 값을 주지 않는다. */
  onClose?: () => void;
  zIndex?: number;
  maxWidthClass?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="stk-live fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)" }}
      // 배경 클릭만 닫는다 — 카드 안에서 시작한 클릭이 올라와 닫히는 일이 없게 target 을 대조한다.
      onClick={(e) => { if (onClose && e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`relative flex max-h-[85vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-2xl shadow-2xl`}
        style={{ background: surface, color: text }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {onClose && (
          <button
            onClick={onClose}
            aria-label="닫기"
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors"
            style={{ color: soft(50), background: soft(6) }}
          >
            ×
          </button>
        )}
        <div className="min-h-0 overflow-y-auto p-7">{children}</div>
      </div>
    </div>
  );
}
