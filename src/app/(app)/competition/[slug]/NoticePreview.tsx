"use client";

import { useMemo } from "react";
import { R, FINISH } from "@/components/ui/primitives";
import type { CompetitionConfig } from "@/lib/competition-config";
import { buildCompetitionCss, renderNoticeHtml } from "@/lib/competition-render";
import type { CompetitionPhase } from "@/lib/competition-status";

/**
 * 어드민 옆칸 미리보기.
 *
 * 임베드와 **같은 렌더 함수**(competition-render)를 쓴다 — React 로 다시 그리면
 * "미리보기와 실제가 다르다"가 반드시 생긴다. HTML 문자열이라 dangerouslySetInnerHTML 을
 * 쓰지만, 사용자 입력은 렌더러 안에서 전부 escapeHtml 을 통과한다.
 */
export default function NoticePreview({
  notice,
  theme,
  competitionName,
  phase = "recruiting",
  canApply = true,
}: {
  notice: CompetitionConfig["notice"];
  theme: Record<string, string>;
  competitionName: string;
  phase?: CompetitionPhase;
  canApply?: boolean;
}) {
  const html = useMemo(
    () =>
      renderNoticeHtml({
        // 미리보기는 공고 영역만 본다 — form/statusMessages 는 렌더에 필요한 최소값만 채운다.
        config: {
          notice,
          form: {} as CompetitionConfig["form"],
          statusMessages: { upcoming: "접수 시작 전이에요.", closed: "접수가 마감되었어요." },
        } as CompetitionConfig,
        competitionName,
        phase,
        canApply,
      }),
    [notice, competitionName, phase, canApply],
  );
  const css = useMemo(() => buildCompetitionCss(theme), [theme]);

  return (
    <div className={`overflow-hidden bg-white ${R.panel} ${FINISH.s1}`}>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-1">
        <style>{css}</style>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
