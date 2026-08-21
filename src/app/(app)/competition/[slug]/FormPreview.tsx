"use client";

import { useEffect, useMemo, useRef } from "react";
import { R, FINISH } from "@/components/ui/primitives";
import type { CompetitionConfig } from "@/lib/competition-config";
import { buildCompetitionCss, renderFormModalHtml } from "@/lib/competition-render";

/**
 * 신청 폼 옆칸 미리보기.
 *
 * 공고 미리보기(NoticePreview)와 같은 원칙 — 임베드와 **같은 렌더 함수**를 쓴다.
 * React 로 폼을 다시 그리면 항목 순서·필수 표시·동의 문구가 조용히 어긋난다.
 *
 * **입력은 되지만 아무 데도 안 간다.** 폼이 아니라 div 안에 넣고 제출 버튼을 막아 두었다 —
 * 여기서 실수로 제출돼 참가작이 하나 생기면 그게 더 나쁜 일이다.
 */
export default function FormPreview({
  config,
  theme,
}: {
  config: CompetitionConfig;
  theme: Record<string, string>;
}) {
  const html = useMemo(() => renderFormModalHtml(config), [config]);
  const css = useMemo(() => buildCompetitionCss(theme), [theme]);
  const modalRef = useRef<HTMLDivElement>(null);

  const enabled = config.form.fields.filter((f) => f.enabled);
  const required = enabled.filter((f) => f.required);

  /**
   * 탭 키로 들어오는 포커스만 걸러낸다 — **`inert` 를 쓰지 않는 이유.**
   *
   * `inert` 는 포커스뿐 아니라 그 안의 휠 스크롤까지 함께 죽인다(크로미움이 inert 서브트리를
   * 스크롤 대상에서 제외한다) — 항목이 많아 미리보기가 길어지면 마우스 휠로 못 내려가고
   * 스크롤바를 손으로 정확히 잡아야만 움직였다.
   *
   * 여기서 막아야 하는 건 "어드민 폼 Tab 순서에 미리보기 입력칸이 끼어드는 것" 하나뿐이다 —
   * **클릭으로 들어오는 포커스까지 돌려보내면 타이핑 자체가 안 된다**(예전에 focusin 을
   * 무조건 blur 했다가 이 버그를 만들었다). 그래서 마우스/터치가 먼저 눌렀는지를 표시해 두고,
   * 그 표시가 없는 포커스(=키보드 Tab)만 튕겨낸다.
   */
  useEffect(() => {
    const node = modalRef.current;
    if (!node) return;
    let pointerEntry = false;
    const markPointerEntry = () => { pointerEntry = true; };
    const returnKeyboardFocus = (e: FocusEvent) => {
      if (pointerEntry) { pointerEntry = false; return; }
      (e.target as HTMLElement).blur();
    };
    node.addEventListener("mousedown", markPointerEntry, true);
    node.addEventListener("touchstart", markPointerEntry, true);
    node.addEventListener("focusin", returnKeyboardFocus);
    return () => {
      node.removeEventListener("mousedown", markPointerEntry, true);
      node.removeEventListener("touchstart", markPointerEntry, true);
      node.removeEventListener("focusin", returnKeyboardFocus);
    };
  }, [html]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">미리보기</h2>
        <span className="text-[11px] text-muted-foreground">
          항목 {enabled.length}개 · 필수 {required.length}개
          {config.form.fields.length > enabled.length && ` · 꺼둔 항목 ${config.form.fields.length - enabled.length}개는 안 보여요`}
        </span>
      </div>

      <div className={`overflow-hidden bg-white ${R.panel} ${FINISH.s1}`}>
        <div className="max-h-[70vh] overflow-y-auto">
          <style>{css}</style>
          {/* 실제 팝업과 같은 클래스 구조(mc > mc-modal). form 태그가 아니라 div 라 제출이 아예 안 된다. */}
          <div className="mc">
            <div
              ref={modalRef}
              className="mc-modal"
              style={{ maxWidth: "100%", boxShadow: "none", borderRadius: 0 }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        실제 화면에서는 팝업으로 떠요. 여기서는 입력은 되지만 제출은 되지 않습니다.
      </p>
    </div>
  );
}
