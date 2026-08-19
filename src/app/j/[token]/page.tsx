"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Lock, Star } from "lucide-react";

/**
 * 심사 화면 — machstudio 계정 없이 링크 + 비밀번호로 들어온다.
 *
 * 임시저장이 자동으로 돌아간다(채점 중 창을 닫아도 남는다). 제출하면 잠기고, 그 뒤에는
 * 운영자만 풀 수 있다 — 제출 후에도 계속 고칠 수 있으면 언제 확정인지가 사라진다.
 */

interface Criterion { key: string; label: string; description: string; maxScore: number }
interface MediaItem { kind: "image" | "youtube"; url?: string; videoId?: string }
interface Entry {
  id: string; entryNo: string; title: string; teamName: string | null;
  summary: string | null; media: MediaItem[];
}
interface ScoreRow {
  entryId: string; scores: Record<string, number>; total: number;
  comment: string | null; submitted: boolean;
}

interface JudgeState {
  authed: boolean;
  judgeName: string;
  competitionName: string;
  round?: { id: string; kind: string; name: string };
  criteria?: Criterion[];
  criteriaMax?: number;
  entries?: Entry[];
  scores?: ScoreRow[];
}

export default function JudgePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<JudgeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authing, setAuthing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/judge/${token}`, { cache: "no-store" });
      if (!res.ok) { setState(null); return; }
      setState(await res.json());
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthing(true);
    setAuthError("");
    try {
      const res = await fetch(`/api/judge/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setAuthError(data.error ?? "인증에 실패했어요."); return; }
      setPassword("");
      await load();
    } finally {
      setAuthing(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
        <div>
          <p className="text-sm font-medium text-neutral-800">심사 링크를 찾을 수 없어요.</p>
          <p className="mt-1 text-xs text-neutral-500">주최측에서 받은 링크를 다시 확인해주세요.</p>
        </div>
      </main>
    );
  }

  if (!state.authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <form onSubmit={submitPassword} className="w-full max-w-sm">
          <div className="mb-5 flex flex-col items-center text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-violet-500/10 text-violet-600">
              <Lock className="h-5 w-5" />
            </span>
            <h1 className="text-lg font-semibold text-neutral-900">{state.competitionName}</h1>
            <p className="mt-1 text-sm text-neutral-500">{state.judgeName} 심사위원</p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-600">비밀번호</span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500"
            />
          </label>
          {authError && <p className="mt-2 text-xs text-red-600">{authError}</p>}
          <button
            type="submit"
            disabled={authing || !password}
            className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {authing ? "확인 중..." : "심사 시작"}
          </button>
          <p className="mt-3 text-center text-[11px] text-neutral-400">
            주최측에서 받은 비밀번호를 입력해주세요.
          </p>
        </form>
      </main>
    );
  }

  return <JudgeBoard token={token} state={state} />;
}

export function JudgeBoard({ token, state }: { token: string; state: JudgeState }) {
  const criteria = state.criteria ?? [];
  const entries = state.entries ?? [];
  const roundId = state.round?.id ?? "";

  const [rows, setRows] = useState<Record<string, ScoreRow>>(() => {
    const map: Record<string, ScoreRow> = {};
    for (const entry of entries) {
      const found = state.scores?.find((s) => s.entryId === entry.id);
      map[entry.id] = found ?? { entryId: entry.id, scores: {}, total: 0, comment: null, submitted: false };
    }
    return map;
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /**
   * 디바운스 저장이 **최신 점수**를 보게 하는 통로.
   * ref 없이 rows 를 클로저로 읽으면, 타이머를 거는 시점의 렌더에 묶인 옛 값이 전송된다 —
   * 마지막으로 만진 항목이 영영 저장되지 않는다(실측: 슬라이더 40→12 뒤 서버에 40 이 남음).
   */
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const save = useCallback(
    async (entryId: string, submitted: boolean) => {
      const row = rowsRef.current[entryId];
      if (!row || row.submitted) return;
      setSavingId(entryId);
      try {
        const res = await fetch(`/api/judge/${token}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roundId, entryId, scores: row.scores, comment: row.comment, submitted }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setMessage(data.error ?? "저장에 실패했어요."); return; }
        setRows((prev) => ({ ...prev, [entryId]: { ...prev[entryId], total: data.total, submitted: data.submitted } }));
        setMessage(submitted ? "제출했어요." : "");
      } catch {
        setMessage("네트워크 오류가 발생했어요.");
      } finally {
        setSavingId(null);
      }
    },
    [roundId, token],
  );

  /** 항목을 만질 때마다 800ms 뒤 임시저장 — 창을 닫아도 남는다. */
  const scheduleSave = (entryId: string) => {
    clearTimeout(timers.current[entryId]);
    timers.current[entryId] = setTimeout(() => void save(entryId, false), 800);
  };

  const setScore = (entryId: string, key: string, value: number) => {
    setRows((prev) => ({
      ...prev,
      [entryId]: { ...prev[entryId], scores: { ...prev[entryId].scores, [key]: value } },
    }));
    scheduleSave(entryId);
  };

  const submittedCount = Object.values(rows).filter((r) => r.submitted).length;

  return (
    <main className="min-h-screen bg-neutral-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-5 py-3">
          <div>
            <h1 className="text-sm font-semibold text-neutral-900">{state.competitionName}</h1>
            <p className="text-[11px] text-neutral-500">
              {state.judgeName} 심사위원 · {state.round?.name}
            </p>
          </div>
          <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-700">
            제출 {submittedCount} / {entries.length}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-3 px-5 py-5">
        {message && <p className="rounded-xl bg-neutral-900/90 px-3 py-2 text-xs text-white">{message}</p>}

        {entries.length === 0 && (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white py-14 text-center text-sm text-neutral-500">
            심사할 참가작이 아직 없어요.
          </p>
        )}

        {entries.map((entry) => {
          const row = rows[entry.id];
          const done = row?.submitted;
          const filled = criteria.every((c) => typeof row?.scores[c.key] === "number");
          // 합계는 화면에서 바로 계산한다 — 서버 응답을 기다리면 슬라이더와 숫자가 어긋나 보인다.
          // 저장 값의 진위는 여전히 서버가 정한다(judgeScoreTotal).
          const total = criteria.reduce((sum, c) => sum + (row?.scores[c.key] ?? 0), 0);
          const video = entry.media.find((m) => m.kind === "youtube" && m.videoId);
          const image = entry.media.find((m) => m.kind === "image" && m.url);

          return (
            <section
              key={entry.id}
              className={`overflow-hidden rounded-2xl border bg-white ${done ? "border-violet-300" : "border-neutral-200"}`}
            >
              <div className="flex items-start gap-3 p-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-neutral-100 text-xs font-bold text-neutral-600">
                  {entry.entryNo}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-neutral-900">{entry.title}</h2>
                  {entry.teamName && <p className="text-[11px] text-neutral-500">{entry.teamName}</p>}
                  {entry.summary && (
                    <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-neutral-600">{entry.summary}</p>
                  )}
                </div>
                {done && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                    <CheckCircle2 className="h-3 w-3" /> 제출됨
                  </span>
                )}
              </div>

              {(video || image) && (
                <div className="px-4 pb-3">
                  {video?.videoId ? (
                    <iframe
                      className="aspect-video w-full rounded-xl border-0"
                      src={`https://www.youtube-nocookie.com/embed/${video.videoId}`}
                      allow="accelerometer; encrypted-media; picture-in-picture"
                      allowFullScreen
                      title={`${entry.title} 영상`}
                    />
                  ) : image?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt="" className="w-full rounded-xl" />
                  ) : null}
                </div>
              )}

              <div className="space-y-3 border-t border-neutral-100 bg-neutral-50/60 p-4">
                {criteria.map((criterion) => {
                  const value = row?.scores[criterion.key];
                  return (
                    <div key={criterion.key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-neutral-700">{criterion.label}</span>
                        <span className="tabular-nums text-neutral-500">
                          {typeof value === "number" ? value : "-"} / {criterion.maxScore}
                        </span>
                      </div>
                      {/*
                        항목 이름만 보여주면 심사위원마다 다르게 해석한다 — 채점표가 갈리는
                        가장 흔한 원인이라, 운영자가 적어 둔 기준을 슬라이더 바로 위에 붙인다.
                      */}
                      {criterion.description && (
                        <p className="mb-1.5 whitespace-pre-line text-[11px] leading-relaxed text-neutral-500">
                          {criterion.description}
                        </p>
                      )}
                      <input
                        type="range"
                        min={0}
                        max={criterion.maxScore}
                        value={typeof value === "number" ? value : 0}
                        disabled={done}
                        onChange={(e) => setScore(entry.id, criterion.key, Number(e.target.value))}
                        className="w-full accent-violet-600 disabled:opacity-50"
                      />
                    </div>
                  );
                })}

                <textarea
                  value={row?.comment ?? ""}
                  disabled={done}
                  placeholder="심사 의견 (선택)"
                  onChange={(e) => {
                    setRows((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], comment: e.target.value } }));
                    scheduleSave(entry.id);
                  }}
                  rows={2}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs outline-none focus:border-violet-500 disabled:opacity-60"
                />

                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs font-semibold text-neutral-700">
                    <Star className="h-3.5 w-3.5 text-violet-500" />
                    합계 {total} / {state.criteriaMax ?? 0}
                  </span>
                  <button
                    onClick={() => save(entry.id, true)}
                    disabled={done || !filled || savingId === entry.id}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
                  >
                    {done ? "제출 완료" : savingId === entry.id ? "저장 중..." : "제출"}
                  </button>
                </div>
                {!done && !filled && (
                  <p className="text-[11px] text-neutral-500">모든 항목에 점수를 매기면 제출할 수 있어요.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
