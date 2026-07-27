"use client";

import { FINISH, JumpLink, R } from "@/components/ui/primitives";
import {
  SURFACES,
  type ElementRow,
  type ElementState,
  type ExposureReport,
  type SurfaceId,
} from "@/lib/webinar-exposure";

/**
 * 노출 점검 — **읽는 영역**이다(AGENTS §1 Calm Hierarchy).
 *
 * 판별 질문 1("이 값은 여기서 읽히는가, 고쳐지는가")에 이 화면은 명확히 "읽힌다" 로 답한다.
 * 값의 집은 각 블록이고 이 표는 그 거울이다. 그래서 요약 먼저 · 디테일은 디스클로저 뒤가
 * **허용**되고, 모든 행에 같은 시각적 무게를 주지 않는다.
 *
 * 반대로 **셀에 토글을 넣지 않는다.** 넣는 순간 존이 고치는 영역으로 넘어가고, §2 의
 * "편집 가능한 값은 절대 접기/모달 뒤에 숨기지 않는다" 가 걸려 접힌 카드 안의 표 전체가
 * 원칙 위반이 된다. 고치러 가는 길은 JumpLink 로만 낸다 — 읽기 전용이 이 배치의 성립 조건이다.
 *
 * 3층 구조:
 *   0층 한 줄 판정  — 피곤한 사용자가 라벨을 다 읽지 않고도 어디부터 볼지 안다
 *   1층 사실 매트릭스 — 여러 면에 걸치는 값이 어디로 가는지. **빈칸이 정보다**
 *   2층 면 카드 6장 — 기본 접힘. 펼치면 그 면의 요소 목록
 */

const STATE_META: Record<ElementState, { mark: string; label: string; cls: string }> = {
  // 글리프로도 구분한다 — 색만으로 상태를 말하면 색각에서 안 갈린다(AGENTS 공통).
  on: { mark: "●", label: "보임", cls: "text-emerald-600 dark:text-emerald-400" },
  empty: { mark: "!", label: "켰는데 비었음", cls: "text-amber-600 dark:text-amber-400" },
  off: { mark: "–", label: "끔", cls: "text-muted-foreground/40" },
  default: { mark: "◐", label: "기본값이 나감", cls: "text-muted-foreground" },
  broken: { mark: "✕", label: "렌더처 없음", cls: "text-destructive" },
};

const USE_META = {
  on: { cls: "bg-emerald-500", label: "쓰는 중" },
  off: { cls: "bg-transparent shadow-[inset_0_0_0_1.5px_var(--muted-foreground)]", label: "사용 안 함" },
  unknown: { cls: "bg-transparent shadow-[inset_0_0_0_1.5px_var(--border)]", label: "확인 중" },
} as const;

export default function ExposureTab({
  report,
  onGoToSection,
  onGoToWatchState,
}: {
  report: ExposureReport;
  onGoToSection: (section: ElementRow["owner"]) => void;
  /** 시청 화면 요소는 상태까지 지정해 보내야 그 자리가 열린다. */
  onGoToWatchState: (state: NonNullable<ElementRow["watchState"]>) => void;
}) {
  /** 여러 면에 걸치는 사실 — 매트릭스로 그릴 값들. 한 면에만 나가는 요소는 2층 카드가 맡는다. */
  const factRows = report.elements.filter((e) => e.surfaces.length > 1);
  const off = report.surfaces.filter((s) => s.use === "off");

  const goTo = (r: ElementRow) => {
    if (r.owner === "watch" && r.watchState) onGoToWatchState(r.watchState);
    else onGoToSection(r.owner);
  };

  return (
    <div className="max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
      {/* ── 0층: 한 줄 판정 ─────────────────────────────────────────────── */}
      <div className={`bg-card p-4 sm:p-5 ${R.panel} ${FINISH.s1}`}>
        <p className="text-sm leading-relaxed">
          {report.emptyCount === 0 ? (
            <>공개 면 {report.surfaces.length}개에 <b className="font-semibold">조용히 사라지는 것은 없어요.</b></>
          ) : (
            <>
              켜 놨는데 내용이 없어 시청자 화면에서 사라지는 것{" "}
              <b className="font-semibold text-amber-700 dark:text-amber-400">{report.emptyCount}건</b>이 있어요.
            </>
          )}
          {off.length > 0 && (
            <> 지금 안 쓰는 면은 {off.map((s) => s.label).join(" · ")} 예요.</>
          )}
        </p>
        {report.brokenCount > 0 && (
          /* 코드 결함은 운영자 카운트와 섞지 않는다 — 고칠 사람이 다르다. */
          <p className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
            그리고 편집 화면이 나간다고 표시하지만 실제로 그리는 코드가 없는 항목이 {report.brokenCount}건 있어요
            (운영자가 고칠 수 있는 게 아니라 위 건수에는 넣지 않았어요).
          </p>
        )}
      </div>

      {/* ── 1층: 사실 매트릭스 ─────────────────────────────────────────── */}
      <section className={`overflow-hidden bg-card ${R.panel} ${FINISH.s1}`}>
        <div className="p-4 sm:p-5">
          <h3 className="text-sm font-semibold">한 값이 여러 면으로</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            원본 정보 하나를 고치면 여기 표시된 면이 모두 따라 바뀝니다. <b className="font-semibold">빈칸도 정보예요</b> —
            그 면은 그 값을 쓰지 않아요.
          </p>
        </div>
        {/* 넓은 표는 자기 컨테이너 안에서만 가로 스크롤한다 — 페이지 본문이 밀리지 않게. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-border bg-secondary/40">
                <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground sm:px-5">값</th>
                {SURFACES.map((s) => (
                  <th key={s.id} scope="col" title={s.hint} className="px-2 py-2 text-center text-[11px] font-semibold text-muted-foreground">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {factRows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-normal sm:px-5">
                    <JumpLink onClick={() => goTo(r)}>{r.label}</JumpLink>
                  </th>
                  {SURFACES.map((s) => {
                    const on = r.surfaces.includes(s.id as SurfaceId);
                    return (
                      <td key={s.id} className="px-2 py-2 text-center">
                        {on ? (
                          <span className={STATE_META[r.state].cls} title={r.why ?? STATE_META[r.state].label} aria-label={STATE_META[r.state].label}>
                            {STATE_META[r.state].mark}
                          </span>
                        ) : (
                          /* 빈칸을 진짜로 비운다 — 회색 점을 찍으면 "안 나감" 과 "꺼짐" 이 안 갈린다. */
                          <span className="text-muted-foreground/25" aria-label="이 면에는 안 나가요">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 2층: 면 카드 ────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">면별로 보기</h3>
        {report.surfaces.map((s) => {
          /**
           * 이 면에 나가는 **전체** 요소. 위 매트릭스와 겹치는 행이 있어도 그대로 싣는다 —
           * 두 층이 다른 질문에 답하기 때문이다: 매트릭스는 "이 값이 어디로 가나",
           * 카드는 "이 화면에 무엇이 있나". 겹침을 피하려고 단일 면 요소만 셌더니
           * 대기 화면이 "보임 0" 이라고 말했다(아젠다·공유가 실제로는 보이는데).
           */
          const rows = report.elements.filter((e) => e.surfaces.includes(s.id));
          const emptyHere = rows.filter((r) => r.state === "empty").length;
          const shownHere = rows.filter((r) => r.state === "on" || r.state === "default").length;
          const use = USE_META[s.use];
          return (
            /* 기본 접힘 — 6면 × 요소를 다 펼쳐 두면 첫 화면이 벽이 된다(§1 여백이 구조다). */
            <details key={s.id} className={`group bg-card ${R.surface} ${FINISH.s1}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-3 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${use.cls}`} title={use.label} aria-hidden />
                <span className="font-medium">{s.label}</span>
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {s.use === "off" ? "사용 안 함" : s.audience}
                </span>
                {s.use === "off" ? (
                  <span className="text-[11px] text-muted-foreground">{s.offReason}</span>
                ) : (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    보임 {shownHere}
                    {emptyHere > 0 && <span className="text-amber-700 dark:text-amber-400"> · 켰는데 빈 것 {emptyHere}</span>}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground/60 group-open:hidden">펼치기</span>
              </summary>
              {rows.length === 0 ? (
                <p className="px-4 pb-3 text-[11px] text-muted-foreground">이 면에 나가는 요소가 없어요.</p>
              ) : (
                <ul className="border-t border-border px-4 py-2">
                  {rows.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
                      <span className={`w-3 shrink-0 text-center text-xs ${STATE_META[r.state].cls}`} aria-label={STATE_META[r.state].label}>
                        {STATE_META[r.state].mark}
                      </span>
                      <JumpLink onClick={() => goTo(r)}>{r.label}</JumpLink>
                      {r.why && <span className="text-[11px] leading-relaxed text-muted-foreground">{r.why}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </section>

      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        여기서는 아무것도 저장되지 않아요 — 조건을 읽고 고칠 자리로 가는 거울입니다.
        &ldquo;지금 실제로 몇 명이 보고 있는가&rdquo;는 운영 탭이 답합니다.
      </p>
    </div>
  );
}
