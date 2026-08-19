/**
 * 공고에서 **시스템이 만들어 넣는 문구**의 언어별 사전.
 *
 * 운영자가 쓴 글은 여기 없다 — 여기 있는 건 우리가 대신 써 주는 것뿐이다:
 * 선발 방식 막대 라벨과 라운드 설명, 카운트다운 단위, 접수 상태 버튼, 목차 폴백 이름.
 *
 * 이 사전이 없을 때 실제로 이런 일이 있었다: LA 대회를 영어로 다 써 놓았는데
 * "선발 방식"과 "심사 기준"이 machstudio 설정에서 자동으로 끌려오면서 그 두 섹션만
 * 한글로 남았다. 운영자가 손댈 수 있는 자리가 아니라 더 답답한 종류의 버그였다.
 *
 * **라운드 이름·심사 항목 이름은 여기 없다.** 그건 DB 에 있는 운영자의 글이라
 * 우리가 번역하면 안 된다 — 그 자리는 섹션을 "직접 입력"으로 돌리고
 * "설정값 불러오기" 로 복사해서 고쳐 쓴다.
 */
import type { NoticeLanguage, NoticeSectionKey } from "./config";

export interface NoticeStrings {
  /** 선발 방식 — 라운드 종류별 한 줄 설명 */
  roundNotePrelim: string;
  roundNoteFinal: string;
  /** 선발 방식 — 비율 막대 라벨 */
  barPublic: string;
  barJudge: string;
  /** 카운트다운 단위 */
  cdDays: string;
  cdHours: string;
  cdMins: string;
  cdSecs: string;
  /** 접수 상태에 따른 버튼 문구 */
  ctaApply: string;
  ctaUpcoming: string;
  ctaClosed: string;
  /** 목차 */
  tocLabel: string;
  /** 목차 폴백 — 섹션 제목을 안 적었을 때 쓴다 */
  sectionLabel: Record<NoticeSectionKey, string>;
}

const KO: NoticeStrings = {
  roundNotePrelim: "본선 진출자를 정합니다",
  roundNoteFinal: "최종 순위를 정합니다",
  barPublic: "관람객 투표",
  barJudge: "심사단 점수",
  cdDays: "일",
  cdHours: "시간",
  cdMins: "분",
  cdSecs: "초",
  ctaApply: "참가 신청하기",
  ctaUpcoming: "접수 시작 전",
  ctaClosed: "접수 마감",
  tocLabel: "섹션 목차",
  sectionLabel: {
    concept: "개념",
    snapshot: "한눈에 보기",
    timeline: "타임라인",
    apply: "신청 방법",
    eligibility: "자격 요건",
    selection: "선발 방식",
    criteria: "심사 기준",
    prizes: "상금 · 시상",
    countdown: "마감 카운트다운",
    faq: "자주 묻는 질문",
    sponsors: "주최 · 후원",
  },
};

const EN: NoticeStrings = {
  roundNotePrelim: "Decides who advances to the finals",
  roundNoteFinal: "Decides the final ranking",
  barPublic: "Audience vote",
  barJudge: "Judges' score",
  cdDays: "days",
  cdHours: "hrs",
  cdMins: "min",
  cdSecs: "sec",
  ctaApply: "Apply now",
  ctaUpcoming: "Applications open soon",
  ctaClosed: "Applications closed",
  tocLabel: "Sections",
  sectionLabel: {
    concept: "About",
    snapshot: "At a glance",
    timeline: "Timeline",
    apply: "How to apply",
    eligibility: "Eligibility",
    selection: "How winners are chosen",
    criteria: "Judging criteria",
    prizes: "Prizes",
    countdown: "Deadline",
    faq: "FAQ",
    sponsors: "Hosts & sponsors",
  },
};

export function noticeStrings(language: NoticeLanguage): NoticeStrings {
  return language === "en" ? EN : KO;
}
