// 등록자 삭제 = 개인정보 파기 경로. 등록 행 하나만 지우면 끝나지 않는다.
//
// registrationId 를 들고 있는 모델이 8개인데 FK+cascade 가 걸린 건 WebinarAttendanceSegment
// 하나뿐이었다. 그래서 등록자를 지워도:
//  - WebinarReminder 가 email 을 들고 남았다 → reminders/send 는
//    `findMany({ where: { webinarId } , select: { email } })` 로 전부 긁어 발송하므로
//    **삭제를 요청한 사람에게 리마인더가 계속 갔다.** (파기 의무 위반)
//  - WebinarQA 가 이름·회사·전화·이메일 사본을 들고 공개 표시면에 남았다.
//  - WebinarChatMessage 가 이름을 들고 남았다.
//  - 투표·클릭·설문응답은 사라진 등록자를 가리키는 고아 참조가 됐다.
//
// 처리 원칙 — **행사 기록은 남기고 사람은 지운다**:
//  · 리마인더 = 이메일 발송 구독 그 자체 → 삭제
//  · Q&A·채팅 = 다른 참석자가 보고 추천한 공개 기록 → 본문은 남기고 PII 만 제거(익명화)
//  · 투표·클릭·설문응답 = 집계용 → 연결만 끊는다(registrationId = null)
//    (설문 개별 응답은 분석 탭에서 따로 지울 수 있다)
import type { Prisma } from "@/generated/prisma";

export type PurgeSummary = {
  reminders: number;
  qa: number;
  chat: number;
  pollVotes: number;
  qaVotes: number;
  popupClicks: number;
  surveyResponses: number;
};

/** 채팅은 name 이 NOT NULL 이라 지울 수 없다 — 사람을 알 수 없는 값으로 바꾼다. */
export const ANONYMIZED_CHAT_NAME = "삭제된 참석자";

/**
 * 등록자들의 흔적을 정리한다. **삭제와 같은 트랜잭션에서** 호출할 것
 * (중간에 실패해 리마인더만 남으면 다시 발송 대상이 된다).
 */
export async function purgeRegistrantTraces(
  tx: Prisma.TransactionClient,
  webinarId: string,
  registrationIds: string[],
): Promise<PurgeSummary> {
  if (registrationIds.length === 0) {
    return { reminders: 0, qa: 0, chat: 0, pollVotes: 0, qaVotes: 0, popupClicks: 0, surveyResponses: 0 };
  }
  // webinarId 를 함께 걸어 다른 웨비나 행에 손대지 않게 한다.
  const scope = { webinarId, registrationId: { in: registrationIds } };

  const reminders = await tx.webinarReminder.deleteMany({ where: scope });

  const qa = await tx.webinarQA.updateMany({
    where: scope,
    data: { registrationId: null, name: null, company: null, phone: null, email: null },
  });

  const chat = await tx.webinarChatMessage.updateMany({
    where: scope,
    data: { registrationId: null, name: ANONYMIZED_CHAT_NAME },
  });

  const popupClicks = await tx.webinarPopupClick.updateMany({ where: scope, data: { registrationId: null } });

  // 투표 두 모델만 webinarId 컬럼이 없다(부모 poll/qa 를 통해 웨비나에 매달린다) →
  // registrationId 로만 스코프한다. registrationId 는 전역 유일(cuid)이라 다른 웨비나와 섞이지 않는다.
  // 유니크 제약(pollId+registrationId, qaId+registrationId)은 Postgres 가 NULL 을 서로 다른 값으로
  // 취급하므로 여러 행을 null 로 바꿔도 충돌하지 않는다.
  const byReg = { registrationId: { in: registrationIds } };
  const pollVotes = await tx.webinarPollVote.updateMany({ where: byReg, data: { registrationId: null } });
  const qaVotes = await tx.webinarQAVote.updateMany({ where: byReg, data: { registrationId: null } });

  const surveyResponses = await tx.webinarSurveyResponse.updateMany({
    where: { webinarId, registrationId: { in: registrationIds } },
    data: { registrationId: null },
  });

  return {
    reminders: reminders.count,
    qa: qa.count,
    chat: chat.count,
    pollVotes: pollVotes.count,
    qaVotes: qaVotes.count,
    popupClicks: popupClicks.count,
    surveyResponses: surveyResponses.count,
  };
}
