"use client";

import { useMemo } from "react";
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

  const enabled = config.form.fields.filter((f) => f.enabled);
  const required = enabled.filter((f) => f.required);

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
        <style>{css}</style>
        {/*
          실제 팝업(.mc-modal)은 자기 자신이 뷰포트 높이에 맞춰 내부 스크롤한다
          (max-height: calc(100dvh - 32px) + .mc-modal-body{overflow-y:auto}) — 화면
          한가운데 떠 있는 고정 오버레이라서다. 여기서는 그 캡을 풀고(스타일로 override)
          내용이 자연스러운 높이만큼 늘어나게 둔다 — 예전엔 바깥에 max-h-[70vh]로 따로
          스크롤 상자를 만들었는데, 이 패널이 옆 칸에서 sticky 로 붙어 있다 보니 "페이지를
          스크롤"하는 손짓과 "미리보기 상자 안에서만 스크롤"하는 손짓이 서로 다른 영역이라
          신청자는 페이지를 내렸는데 미리보기는 그대로 멈춰 있는 것처럼 보였다(실제로는
          안 보이는 좁은 상자 안에 갇혀 있었을 뿐). 스크롤을 페이지 하나로 모아서 신청 항목이
          많아도 페이지를 계속 내리면 끝까지 보이게 한다.
        */}
        <style>{`.mc-preview .mc-modal-body { overflow: visible; }`}</style>
        {/* 실제 팝업과 같은 클래스 구조(mc > mc-modal). form 태그가 아니라 div 라 제출이 아예 안 된다. */}
        <div className="mc mc-preview">
          <div
            className="mc-modal"
            style={{ maxWidth: "100%", maxHeight: "none", boxShadow: "none", borderRadius: 0, overflow: "visible" }}
            /* 미리보기에서 탭 키가 갇히지 않게 — 어드민 폼과 포커스 순서를 섞지 않는다. */
            inert
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        실제 화면에서는 팝업으로 떠요. 여기서는 입력·제출이 되지 않습니다.
      </p>
    </div>
  );
}
