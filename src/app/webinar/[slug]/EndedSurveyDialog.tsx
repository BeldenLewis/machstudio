"use client";

import { useEffect, useState } from "react";
import { formatSurveyOpensAt } from "@/lib/webinar-survey";
import ViewerModal from "./ViewerModal";
import SurveyForm, { SURVEY_FORM_CSS, clearSurveyDraft } from "./SurveyForm";
import type { SurveyAnswers, SurveyQuestion } from "@/lib/webinar-survey";

/**
 * 종료 화면 설문 팝업 — 카드의 CTA 를 누르면 **새 창 대신 이 자리에서** 답한다.
 *
 * 새 창을 버린 이유: 종료 화면은 여정의 끝이라 사람이 이미 떠날 준비를 한 상태다. 새 탭이
 * 열리면 원래 화면(자료 다운로드·다음 웨비나 티저)이 뒤로 밀려 잊히고, 모바일에서는 탭 전환
 * 자체가 이탈이 된다. 라이브 중 설문 푸시가 이미 같은 자리에서 답하게 하고 있어서
 * 종료 화면만 새 창인 것도 앞뒤가 맞지 않았다.
 *
 * 외부 설문 URL(config.surveyUrl)은 이 팝업을 쓰지 않는다 — 우리 문항이 아니라 남의 페이지라
 * 문항을 받아올 수 없고, iframe 은 상대가 X-Frame-Options 로 막으면 빈 사각형이 된다.
 * 그 경우는 새 탭이 정직한 동작이다(EndedScreen 이 판정한다).
 *
 * 임시저장 키를 라이브 푸시와 **다르게** 둔다(src=ended): 같은 설문이라도 라이브 중 쓰던
 * 초안이 종료 화면에 되살아나면, 방송 중 답하다 만 내용이 끝나고 갑자기 나타난다.
 */
export default function EndedSurveyDialog({
  slug,
  surveyId,
  fallbackTitle,
  registrationId,
  accent,
  surface,
  text,
  soft,
  onClose,
  /** 미리보기(소유자)에서는 응답을 전송하지 않는다 — 호출부의 isPreviewUrl() 결과. */
  readOnly = false,
}: {
  slug: string;
  surveyId: string;
  fallbackTitle: string;
  registrationId: string | null;
  accent: string;
  surface: string;
  text: string;
  soft: (pct: number) => string;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const [survey, setSurvey] = useState<{
    title: string;
    description: string | null;
    questions: SurveyQuestion[];
    isOpen: boolean;
    state?: "open" | "off" | "before" | "closed"; // 못 받는 이유 — 시작 전과 마감을 다르게 말한다
    opensAt?: string | null; // 시작 전일 때만 온다 — 언제 다시 오면 되는지
    doneTitle: string | null;
    doneDescription: string | null;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  const draftKey = `mach_survey_draft_${surveyId}_ended`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/webinar/${slug}/survey/${surveyId}`);
        if (cancelled) return;
        if (!res.ok) { setLoadError("설문을 불러오지 못했어요. 잠시 후 다시 시도해주세요."); return; }
        const data = await res.json();
        if (cancelled) return;
        setSurvey({
          title: data?.survey?.title ?? fallbackTitle,
          description: data?.survey?.description ?? null,
          questions: Array.isArray(data?.survey?.questions) ? data.survey.questions : [],
          isOpen: data?.survey?.isOpen === true,
          state: data?.survey?.state,
          opensAt: typeof data?.survey?.opensAt === "string" ? data.survey.opensAt : null,
          doneTitle: data?.survey?.doneTitle ?? null,
          doneDescription: data?.survey?.doneDescription ?? null,
        });
      } catch {
        if (!cancelled) setLoadError("연결 상태를 확인하고 다시 시도해주세요.");
      }
    })();
    return () => { cancelled = true; };
  }, [slug, surveyId, fallbackTitle]);

  const submit = async (answers: SurveyAnswers) => {
    if (readOnly) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/webinar/${slug}/survey/${surveyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, registrationId: registrationId ?? undefined, source: "ended" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "제출에 실패했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      clearSurveyDraft(draftKey);
      setDone(true);
      // 라이브 푸시와 달리 자동으로 닫지 않는다 — 종료 화면은 다음 행동(자료·다음 웨비나)이
      // 뒤에 있어서, 감사 문구를 읽고 **스스로** 닫는 편이 맥락을 잃지 않는다.
    } catch {
      setSubmitError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const closed = survey !== null && (!survey.isOpen || survey.questions.length === 0);

  return (
    <ViewerModal surface={surface} text={text} soft={soft} label={survey?.title || fallbackTitle} onClose={onClose}>
      <style dangerouslySetInnerHTML={{ __html: SURVEY_FORM_CSS }} />
      {done ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full" style={{ background: "color-mix(in srgb,#12B76A 14%,transparent)", color: "#12B76A" }}>✓</div>
          <p className="text-lg font-bold">{survey?.doneTitle?.trim() || "소중한 의견 감사합니다"}</p>
          {survey?.doneDescription?.trim() && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: soft(60) }}>{survey.doneDescription}</p>
          )}
          <button
            onClick={onClose}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-white"
            style={{ background: accent }}
          >
            닫기
          </button>
        </div>
      ) : loadError ? (
        <p className="py-8 text-center text-sm" style={{ color: soft(65) }} role="alert">{loadError}</p>
      ) : survey === null ? (
        <p className="py-8 text-center text-sm" style={{ color: soft(50) }}>설문을 불러오는 중…</p>
      ) : closed ? (
        // 마감/시작 전 — 종료 화면 카드는 노출 조건을 서버에서 판정하지만, 페이지를 열어 둔 채
        // 예약 시각이 지나는(또는 아직 오지 않은) 경우가 있다. 빈 폼 대신 이유를 말한다.
        <p className="py-8 text-center text-sm leading-relaxed" style={{ color: soft(65) }}>
          {survey.state === "before" ? (
            <>
              이 설문은 아직 응답을 받기 전이에요.
              {/* 서버가 시작 시각을 함께 보내는데 예전엔 읽지 않아서, 세 노출면 중 이 팝업만
                  "언제부터" 를 말하지 않았다. 다시 올 시점을 아는 게 이 화면의 전부다. */}
              {formatSurveyOpensAt(survey.opensAt) && (
                <>
                  <br />
                  {formatSurveyOpensAt(survey.opensAt)}부터 참여할 수 있어요.
                </>
              )}
            </>
          ) : (
            "이 설문은 응답이 마감됐어요."
          )}
        </p>
      ) : (
        <>
          <h2 className="mb-1 pr-9 text-lg font-bold leading-snug">{survey.title}</h2>
          {survey.description && (
            <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: soft(65) }}>{survey.description}</p>
          )}
          <div className="pt-2">
            <SurveyForm questions={survey.questions} submitting={submitting} onSubmit={submit} storageKey={draftKey} />
          </div>
          {submitError && <p className="mt-3 text-[13px] text-red-400" role="alert">{submitError}</p>}
        </>
      )}
    </ViewerModal>
  );
}
