/**
 * 만들기 준비 상태 — "시청자에게 빈 화면은 없어요" 검사.
 *
 * ── 이 파일은 이제 **판정하지 않는다** ─────────────────────────────────────────
 * 예전에는 checkWebinarReadiness 가 config 를 직접 읽어 자기 게이트 식을 갖고 있었다.
 * 노출 점검 표(webinar-exposure.ts)가 같은 질문에 답하기 시작한 뒤로 두 판정기가 갈렸고,
 * 갈린 자리마다 **뷰어와 대조해 보면 준비 상태가 틀린 쪽**이었다:
 *
 *   · 대기 아젠다  — 실제 세션(type=session)만 세어 "세션이 없어요" 라고 경고했다.
 *                    뷰어는 전체 행으로 아젠다를 그린다(PreLiveWaiting: sessions.length > 0).
 *                    오프닝·Q&A 만 있는 웨비나가 "사라져요" 경고를 받았고, 그 말을 믿고
 *                    토글을 끄면 **그때 실제로 사라졌다.**
 *   · 랜딩        — programs/faq 의 **원시 배열 길이**를 셌다. 제목이 빈 행도 1로 세어
 *                    "본문 있음" 이 되고, 그러면 '빈 페이지' 경고가 통째로 꺼졌다.
 *                    정규화는 제목 없는 행을 버리므로 뷰어에는 그 섹션이 없다.
 *                    반대 방향도 틀렸다 — 참여 절차는 입력하지 않아도 기본 3스텝이 나가는데
 *                    steps 키가 없으면 0으로 세어 '내용 없음' 쪽으로 기울였다.
 *   · 등록 폼     — `type !== "select"` 로 걸러서, 새로 생긴 복수 선택(multiple)의 선택지
 *                    0개를 못 봤다. 또 '기타(직접입력)' 예외를 몰라 정상 항목을 고장으로 신고했다.
 *
 * 그래서 판정을 하나로 만들고 **표에서 파생**시킨다. 규칙은 하나다:
 *   노출 표에서 state === "empty" 인 행 = 확인할 것 한 건.
 * empty 의 정의가 이미 "켰는데 내용이 없어 조용히 사라진다" 이므로 준비 상태의 원래 계약과 같다.
 *
 * broken(렌더처 없는 코드 결함)은 넣지 않는다 — 운영자가 고칠 수 있는 게 아니다.
 * default(입력 안 했지만 기본값이 나감)도 넣지 않는다 — 사라지지 않으므로 문제가 아니다.
 *
 * 순수 함수인 이유는 그대로다: 만들기 탭은 로그인 뒤에 있어 브라우저 자동화로 열 수 없다.
 */

import type { ElementRow, ExposureReport } from "./webinar-exposure";

export type ReadinessSection = "source" | "landing" | "registration" | "watch" | "survey";
export type WatchStateId = "waiting" | "entry" | "live" | "ended";

export interface ReadinessIssue {
  section: ReadinessSection;
  /** 시청 화면 안의 어느 상태인지 — 클릭해서 그 자리로 보낼 때 쓴다. */
  watchState?: WatchStateId;
  title: string;
  detail: string;
  /**
   * blocking — 시청자 여정이 막힌다(영상 미연결, 이름 없음).
   * empty    — 켜 놨는데 내용이 없어 그 영역이 조용히 사라진다.
   */
  severity: "blocking" | "empty";
}

/** 고치러 가는 자리를 사람 말로 — detail 은 "무엇이 문제인가" 다음에 "어디서 고치나" 를 답한다. */
const WHERE: Record<ReadinessSection, string> = {
  source: "원본 정보",
  landing: "랜딩 페이지",
  registration: "등록 폼",
  watch: "시청 화면",
  survey: "설문",
};
const WATCH_WHERE: Record<WatchStateId, string> = {
  waiting: "시청 화면 › 대기",
  entry: "시청 화면 › 입장",
  live: "시청 화면 › 라이브",
  ended: "시청 화면 › 종료",
};

function issueFrom(row: ElementRow): ReadinessIssue {
  const where = row.owner === "watch" && row.watchState ? WATCH_WHERE[row.watchState] : WHERE[row.owner];
  return {
    section: row.owner,
    ...(row.watchState ? { watchState: row.watchState } : {}),
    // 표의 why 가 이미 "무엇이 어떻게 사라지는가" 한 줄이다 — 문구를 두 벌로 만들지 않는다.
    title: row.why ?? `${row.label} 을 확인해주세요`,
    detail: `${where}에서 고칠 수 있어요.`,
    severity: row.blocks ? "blocking" : "empty",
  };
}

/**
 * 노출 리포트 → 확인할 것 목록.
 *
 * 정렬: 여정을 막는 것(blocking)이 먼저. 목록은 상위 4건만 보여 주므로, 급한 것이 랜딩 섹션
 * 경고 여섯 개에 밀려 잘리면 그 자리가 제 일을 못 한다. 같은 급 안에서는 표의 행 순서를
 * 유지한다(원본 → 랜딩 → 등록 → 시청 → 설문 = 만들기 레일 순서).
 */
export function readinessFromExposure(report: ExposureReport): ReadinessIssue[] {
  const empties = report.elements.filter((r) => r.state === "empty");
  const blocking = empties.filter((r) => r.blocks).map(issueFrom);
  const rest = empties.filter((r) => !r.blocks).map(issueFrom);
  return [...blocking, ...rest];
}

/** 섹션별 미완 개수 — 내비의 상태 점에 쓴다. */
export function readinessBySection(issues: readonly ReadinessIssue[]): Record<ReadinessSection, number> {
  const base: Record<ReadinessSection, number> = { source: 0, landing: 0, registration: 0, watch: 0, survey: 0 };
  for (const i of issues) base[i.section] += 1;
  return base;
}
