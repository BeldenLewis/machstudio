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
        <div className="max-h-[70vh] overflow-y-auto">
          <style>{css}</style>
          {/* 실제 팝업과 같은 클래스 구조(mc > mc-modal). form 태그가 아니라 div 라 제출이 아예 안 된다. */}
          <div className="mc">
            <div
              className="mc-modal"
              style={{ maxWidth: "100%", boxShadow: "none", borderRadius: 0 }}
              /* 미리보기에서 탭 키가 갇히지 않게 — 어드민 폼과 포커스 순서를 섞지 않는다. */
              inert
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        실제 화면에서는 팝업으로 떠요. 여기서는 입력·제출이 되지 않습니다.
      </p>
    </div>
  );
}
