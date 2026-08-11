// 시청자 문의(Q&A) — 상태 라벨과 한 줄 요약. 운영 콘솔·등록자 상세·CSV 가 공유한다.

export type QAStatus = "pending" | "answered" | "dismissed";

/**
 * 상태 라벨은 세 곳에 나온다(운영 콘솔 필터·등록자 상세·CSV). 문자열을 각자 들고 있으면
 * 한 곳만 바뀌어, 같은 문의가 화면에서는 "답변 완료" 인데 파일에는 "answered" 로 적힌다.
 */
export const QA_STATUS_LABEL: Record<QAStatus, string> = {
  pending: "대기 중",
  answered: "답변 완료",
  dismissed: "미채택",
};

export function qaStatusLabel(status: string): string {
  return QA_STATUS_LABEL[status as QAStatus] ?? status;
}

/** 상태를 아는 값으로 좁힌다 — DB 는 String 컬럼이라 모르는 값이 들어올 수 있다. */
export function asQAStatus(status: string): QAStatus {
  return status === "answered" || status === "dismissed" ? status : "pending";
}

/**
 * CSV 한 칸에 넣을 문의 목록.
 *
 * 왜 열로 펴지 않나: 설문은 문항 세트가 고정이라 `[설문] 문항` 열로 펼 수 있지만, 문의는
 * 한 사람이 0건에서 수십 건까지 남긴다 — 열로 펴면 열 개수가 데이터에 따라 달라져서
 * 지난달 파일과 이번달 파일의 열이 어긋난다. 그래서 개수는 별 열로, 본문은 한 칸에 합친다.
 *
 * 번호를 붙이는 이유: 질문 본문 자체에 줄바꿈이 있을 수 있어서, 줄바꿈만으로는 어디서
 * 다음 질문이 시작되는지 알 수 없다.
 */
export function formatQAForCell(
  // sessionNo 는 **표시번호**다(실제 세션만 1..N). 참조 키를 그대로 받으면 오프닝·휴식이 번호를
  // 차지한 만큼 어긋난 값이 파일에 찍힌다 — 변환은 라우트에서 resolveSessionRef 로 끝낸다.
  items: { question: string; status: string; sessionNo?: number | null; createdAt: Date | string }[],
): string {
  return items
    .map((item, i) => {
      const tags = [
        item.sessionNo != null ? `세션 ${item.sessionNo}` : null,
        // 대기 중은 적지 않는다 — 대부분이 대기라서, 적으면 칸이 상태 표시로 뒤덮인다.
        asQAStatus(item.status) === "pending" ? null : qaStatusLabel(item.status),
      ].filter(Boolean);
      const prefix = tags.length ? ` [${tags.join(" · ")}]` : "";
      return `${i + 1}.${prefix} ${item.question.trim()}`;
    })
    .join("\n");
}
