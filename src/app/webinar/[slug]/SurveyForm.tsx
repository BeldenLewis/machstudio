"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { validateSurveyAnswers, type SurveyAnswers, type SurveyQuestion } from "@/lib/webinar-survey";

/**
 * 설문 응답 폼 — 독립 응답 페이지와 라이브 푸시 모달이 공유.
 * STK 토큰(.stk-live 스코프의 --key/--card/--text …) 위에서 동작 — 호스트가 buildStkCss + SURVEY_FORM_CSS 를 주입한다.
 */
const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

export const SURVEY_FORM_CSS = `
.stk-live .sv-q { margin-bottom: 22px; }
.stk-live .sv-q-title { font-size:14.5px; font-weight:700; color:var(--text); margin:0 0 10px; word-break:keep-all; }
.stk-live .sv-q-title .req { color:var(--key); margin-left:3px; }
.stk-live .sv-stars { display:flex; gap:6px; }
.stk-live .sv-star { width:44px; height:44px; border:0; border-radius:var(--radius-sm); background:var(--card-2); box-shadow:var(--btn-shadow); font-size:22px; line-height:1; color:var(--sub); cursor:pointer; transition:transform .12s ease, color .12s ease, background .12s ease; }
.stk-live .sv-star:hover { transform:translateY(-2px); }
.stk-live .sv-star.on { color:#F59E0B; background:color-mix(in srgb,#F59E0B 12%,transparent); }
.stk-live .sv-opts { display:flex; flex-direction:column; gap:8px; }
.stk-live .sv-opt { display:flex; align-items:center; gap:10px; padding:11px 14px; border:0; border-radius:var(--radius-sm); background:var(--card-2); box-shadow:var(--btn-shadow); font:inherit; font-size:14px; color:var(--text); text-align:left; cursor:pointer; transition:transform .12s ease, background .12s ease; }
.stk-live .sv-opt:hover { transform:translateY(-1px); }
.stk-live .sv-opt.on { background:var(--key-dim); box-shadow:0 0 0 1.5px var(--key); }
.stk-live .sv-opt .dot { width:16px; height:16px; border-radius:50%; box-shadow:inset 0 0 0 1.5px var(--line-md); flex-shrink:0; display:grid; place-items:center; background:var(--card); }
.stk-live .sv-opt.on .dot { box-shadow:inset 0 0 0 5px var(--key); }
.stk-live .sv-opt .sq { border-radius:5px; }
.stk-live .sv-opt.on .sq { box-shadow:inset 0 0 0 5px var(--key); }
.stk-live .sv-nps { display:grid; grid-template-columns:repeat(11, 1fr); gap:5px; }
.stk-live .sv-nps button { height:38px; border:0; border-radius:9px; background:var(--card-2); box-shadow:var(--btn-shadow); font:inherit; font-size:13px; font-weight:650; color:var(--muted); cursor:pointer; transition:transform .12s ease, background .12s ease, color .12s ease; }
.stk-live .sv-nps button:hover { transform:translateY(-2px); }
.stk-live .sv-nps button.on { background:var(--key); color:#fff; box-shadow:var(--btn-shadow-key); }
.stk-live .sv-nps-labels { display:flex; justify-content:space-between; margin-top:6px; font-size:11px; color:var(--sub); }
.stk-live .sv-text { width:100%; min-height:88px; padding:12px 14px; border:1.5px solid var(--line-md); border-radius:var(--radius-sm); background:var(--card-2); color:var(--text); font:inherit; font-size:14px; resize:vertical; outline:none; transition:border-color .15s ease; }
.stk-live .sv-text:focus { border-color:var(--key); }
.stk-live .sv-err { font-size:13px; color:#ef4444; margin:0 0 12px; }
.stk-live .sv-q-err { font-size:12px; color:#ef4444; margin:8px 0 0; }
.stk-live .sv-submit { display:flex; align-items:center; justify-content:center; width:100%; height:50px; border:0; border-radius:var(--radius-sm); background:var(--key); color:#fff; font:inherit; font-size:15px; font-weight:800; cursor:pointer; box-shadow:var(--btn-shadow-key); transition:transform .15s ease; }
.stk-live .sv-submit:hover:not(:disabled) { transform:translateY(-2px); }
.stk-live .sv-submit:disabled { opacity:.55; cursor:not-allowed; }
@media (max-width:480px){ .stk-live .sv-star { width:38px; height:38px; font-size:19px; } .stk-live .sv-nps button { height:32px; font-size:12px; } }
`;

export default function SurveyForm({
  questions,
  submitting,
  submitLabel = "제출하기",
  onSubmit,
}: {
  questions: SurveyQuestion[];
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (answers: SurveyAnswers) => void;
}) {
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [error, setError] = useState("");
  // 필수 미응답은 해당 문항 바로 아래 인라인으로 (제출 전에 어디가 비었는지 바로 보이게)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const set = (qid: string, v: number | string | string[]) => {
    setAnswers((a) => ({ ...a, [qid]: v }));
    setFieldErrors((e) => {
      if (!e[qid]) return e;
      const next = { ...e };
      delete next[qid];
      return next;
    });
  };

  const handleSubmit = () => {
    setError("");
    const nextErrors: Record<string, string> = {};
    for (const q of questions) {
      const v = answers[q.id];
      const empty =
        v === undefined || v === null || v === "" ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === "string" && v.trim() === "");
      if (q.required && empty) nextErrors[q.id] = "필수 항목이에요 — 답해주세요.";
    }
    setFieldErrors(nextErrors);
    const firstErrorId = questions.find((q) => nextErrors[q.id])?.id;
    if (firstErrorId) {
      document.getElementById(`sv-q-${firstErrorId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const result = validateSurveyAnswers(questions, answers);
    if (!result.ok) { setError(result.error); return; }
    if (Object.keys(result.cleaned).length === 0) { setError("답변을 입력해주세요."); return; }
    onSubmit(result.cleaned);
  };

  return (
    <div>
      {questions.map((q) => (
        <div key={q.id} id={`sv-q-${q.id}`} className="sv-q">
          <p className="sv-q-title">{q.title}{q.required && <span className="req">*</span>}</p>

          {q.type === "rating" && (
            <div className="sv-stars" role="radiogroup" aria-label={q.title}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={answers[q.id] === n} aria-label={`${n}점`}
                  onClick={() => set(q.id, n)}
                  className={`sv-star ${typeof answers[q.id] === "number" && (answers[q.id] as number) >= n ? "on" : ""}`}>
                  ★
                </button>
              ))}
            </div>
          )}

          {q.type === "single" && (
            <div className="sv-opts" role="radiogroup" aria-label={q.title}>
              {q.options.map((opt) => (
                <button key={opt} type="button" role="radio" aria-checked={answers[q.id] === opt}
                  onClick={() => set(q.id, opt)}
                  className={`sv-opt ${answers[q.id] === opt ? "on" : ""}`}>
                  <span className="dot" />{opt}
                </button>
              ))}
            </div>
          )}

          {q.type === "multiple" && (
            <div className="sv-opts">
              {q.options.map((opt) => {
                const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                const on = cur.includes(opt);
                return (
                  <button key={opt} type="button" role="checkbox" aria-checked={on}
                    onClick={() => set(q.id, on ? cur.filter((o) => o !== opt) : [...cur, opt])}
                    className={`sv-opt ${on ? "on" : ""}`}>
                    <span className="dot sq" />{opt}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === "nps" && (
            <div>
              <div className="sv-nps" role="radiogroup" aria-label={q.title}>
                {Array.from({ length: 11 }, (_, n) => (
                  <button key={n} type="button" role="radio" aria-checked={answers[q.id] === n}
                    onClick={() => set(q.id, n)}
                    className={answers[q.id] === n ? "on" : ""}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="sv-nps-labels"><span>전혀 아니에요</span><span>매우 그래요</span></div>
            </div>
          )}

          {q.type === "text" && (
            <textarea
              className="sv-text"
              maxLength={2000}
              value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
              onChange={(e) => set(q.id, e.target.value)}
              placeholder="자유롭게 적어주세요"
              aria-label={q.title}
            />
          )}

          {fieldErrors[q.id] && <p className="sv-q-err" role="alert">{fieldErrors[q.id]}</p>}
        </div>
      ))}

      {error && <p className="sv-err" role="alert">{error}</p>}
      <motion.button whileTap={{ scale: 0.97 }} transition={spring} type="button" onClick={handleSubmit} disabled={submitting} className="sv-submit">
        {submitting ? "제출 중…" : submitLabel}
      </motion.button>
    </div>
  );
}
