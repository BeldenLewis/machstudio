import type { NoticeLanguage } from "@/lib/notice/config";

/**
 * 투표 화면에서 **시스템이 만들어 넣는 문구**의 언어별 사전.
 *
 * 공고·신청 폼과 같은 문제: 투표 버튼·남은 표·오류 메시지는 운영자가 손댈 자리가 아니라
 * 우리가 대신 써 주는 것뿐이다. 여기가 비면 영문 대회에서 "투표하기" 버튼만 한글로 남는다.
 *
 * 마운트 실패 경고(console.warn)는 여기 없다 — 그건 방문자가 아니라 스니펫을 붙이는
 * 개발자에게 하는 말이라 번역 대상이 아니다.
 */
export interface CompetitionVoteStrings {
  loadFailed: string;
  previewBanner: string;
  /** 남은 표 안내. {remaining}/{max} 를 채워 쓴다. */
  remaining: (remaining: number, max: number) => string;
  emptyEntries: string;
  /** 실시간 집계 배지(showLiveTally 켰을 때만). {count} 를 채워 쓴다. */
  voteCount: (count: number) => string;
  voteBtnVoted: string;
  voteBtnDefault: string;
  playAriaLabel: string;
  videoTitle: string;
  cannotVoteNow: string;
  alreadyVoted: string;
  /** 상한 도달 안내. {max} 를 채워 쓴다. */
  limitReached: (max: number) => string;
  previewNoEffect: string;
  genericError: string;
  undone: string;
  votedSuccess: string;
  networkError: string;
  competitionClosed: string;
  noSelection: string;
  invalidEntries: string;
  ipExceeded: string;
  undoNotAllowed: string;
  entryRequired: string;
  cannotIdentifyVoter: string;
  /** 상단 상태 배지 — 문장이 아니라 한눈에 읽는 짧은 라벨이다("투표가 아직 열리지 않았어요" 와는 별개). */
  statusOpen: string;
  statusBefore: string;
  statusClosed: string;
}

const KO: CompetitionVoteStrings = {
  loadFailed: "투표 정보를 불러오지 못했어요. 잠시 후 새로고침해주세요.",
  previewBanner: "미리보기입니다. 투표해도 반영되지 않아요.",
  remaining: (remaining, max) => `남은 표 ${remaining} / ${max}`,
  emptyEntries: "아직 공개된 참가작이 없어요.",
  voteCount: (count) => `${count}표`,
  voteBtnVoted: "투표함",
  voteBtnDefault: "투표하기",
  playAriaLabel: "영상 재생",
  videoTitle: "참가작 영상",
  cannotVoteNow: "지금은 투표할 수 없어요.",
  alreadyVoted: "이미 투표한 참가작이에요.",
  limitReached: (max) => `이 투표는 ${max}표까지 할 수 있어요.`,
  previewNoEffect: "미리보기라 반영되지 않았어요.",
  genericError: "처리에 실패했어요.",
  undone: "투표를 취소했어요.",
  votedSuccess: "투표했어요.",
  networkError: "네트워크 오류가 발생했어요.",
  competitionClosed: "종료된 대회예요.",
  noSelection: "투표할 참가작을 선택해주세요.",
  invalidEntries: "투표할 수 없는 참가작이 있어요.",
  ipExceeded: "같은 네트워크에서 투표가 너무 많아요. 잠시 후 다시 시도해주세요.",
  undoNotAllowed: "이 투표는 취소할 수 없어요.",
  entryRequired: "참가작을 지정해주세요.",
  cannotIdentifyVoter: "투표자를 식별할 수 없어요.",
  statusOpen: "투표 중",
  statusBefore: "투표 예정",
  statusClosed: "투표 마감",
};

const EN: CompetitionVoteStrings = {
  loadFailed: "Couldn't load the vote. Please refresh in a moment.",
  previewBanner: "This is a preview. Votes are not counted.",
  remaining: (remaining, max) => `${remaining} of ${max} votes left`,
  emptyEntries: "No entries are open for voting yet.",
  voteCount: (count) => `${count} vote${count === 1 ? "" : "s"}`,
  voteBtnVoted: "Voted",
  voteBtnDefault: "Vote",
  playAriaLabel: "Play video",
  videoTitle: "Entry video",
  cannotVoteNow: "Voting isn't open right now.",
  alreadyVoted: "You already voted for this entry.",
  limitReached: (max) => `You can vote for up to ${max} entries.`,
  previewNoEffect: "Not counted — this is a preview.",
  genericError: "Something went wrong.",
  undone: "Your vote was removed.",
  votedSuccess: "Vote counted.",
  networkError: "A network error occurred.",
  competitionClosed: "This competition has ended.",
  noSelection: "Please select an entry to vote for.",
  invalidEntries: "One or more entries can't be voted for.",
  ipExceeded: "Too many votes from this network. Please try again later.",
  undoNotAllowed: "This vote can't be undone.",
  entryRequired: "Please specify an entry.",
  cannotIdentifyVoter: "We couldn't identify you as a voter.",
  statusOpen: "Voting open",
  statusBefore: "Voting soon",
  statusClosed: "Voting closed",
};

const FR: CompetitionVoteStrings = {
  loadFailed: "Impossible de charger le vote. Merci d'actualiser dans un instant.",
  previewBanner: "Ceci est un aperçu. Les votes ne sont pas comptabilisés.",
  remaining: (remaining, max) => `${remaining} vote(s) restant(s) sur ${max}`,
  emptyEntries: "Aucune candidature n'est encore ouverte au vote.",
  voteCount: (count) => `${count} vote${count === 1 ? "" : "s"}`,
  voteBtnVoted: "Voté",
  voteBtnDefault: "Voter",
  playAriaLabel: "Lire la vidéo",
  videoTitle: "Vidéo de la candidature",
  cannotVoteNow: "Le vote n'est pas ouvert pour le moment.",
  alreadyVoted: "Vous avez déjà voté pour cette candidature.",
  limitReached: (max) => `Vous pouvez voter pour ${max} candidature(s) maximum.`,
  previewNoEffect: "Non comptabilisé — ceci est un aperçu.",
  genericError: "Une erreur est survenue.",
  undone: "Votre vote a été retiré.",
  votedSuccess: "Vote enregistré.",
  networkError: "Une erreur réseau est survenue.",
  competitionClosed: "Ce concours est terminé.",
  noSelection: "Merci de sélectionner une candidature à voter.",
  invalidEntries: "Certaines candidatures ne peuvent pas recevoir de vote.",
  ipExceeded: "Trop de votes depuis ce réseau. Merci de réessayer plus tard.",
  undoNotAllowed: "Ce vote ne peut pas être annulé.",
  entryRequired: "Merci d'indiquer une candidature.",
  cannotIdentifyVoter: "Nous n'avons pas pu vous identifier comme électeur.",
  statusOpen: "Vote ouvert",
  statusBefore: "Vote à venir",
  statusClosed: "Vote fermé",
};

const JA: CompetitionVoteStrings = {
  loadFailed: "投票情報を読み込めませんでした。しばらくしてから更新してください。",
  previewBanner: "プレビューです。投票しても反映されません。",
  remaining: (remaining, max) => `残り投票数 ${remaining} / ${max}`,
  emptyEntries: "まだ投票対象の参加作品がありません。",
  voteCount: (count) => `${count}票`,
  voteBtnVoted: "投票済み",
  voteBtnDefault: "投票する",
  playAriaLabel: "動画を再生",
  videoTitle: "参加作品の動画",
  cannotVoteNow: "現在は投票できません。",
  alreadyVoted: "この参加作品にはすでに投票しています。",
  limitReached: (max) => `この投票は最大${max}票まで投票できます。`,
  previewNoEffect: "プレビューのため反映されません。",
  genericError: "処理に失敗しました。",
  undone: "投票を取り消しました。",
  votedSuccess: "投票しました。",
  networkError: "ネットワークエラーが発生しました。",
  competitionClosed: "終了した大会です。",
  noSelection: "投票する参加作品を選んでください。",
  invalidEntries: "投票できない参加作品があります。",
  ipExceeded: "同じネットワークからの投票が多すぎます。しばらくしてからもう一度お試しください。",
  undoNotAllowed: "この投票は取り消せません。",
  entryRequired: "参加作品を指定してください。",
  cannotIdentifyVoter: "投票者を識別できませんでした。",
  statusOpen: "投票受付中",
  statusBefore: "投票開始前",
  statusClosed: "投票終了",
};

/**
 * **Record 로 둔다.** 삼항으로 고르면 언어를 늘렸을 때 새 언어가 조용히 한국어로 떨어진다 —
 * 고를 수는 있는데 안 바뀌는 상태가 되고 타입 검사도 통과한다. 여기 한 줄이 비면 컴파일이 깨진다.
 */
const DICT: Record<NoticeLanguage, CompetitionVoteStrings> = { ko: KO, en: EN, fr: FR, ja: JA };

export function competitionVoteStrings(language: NoticeLanguage): CompetitionVoteStrings {
  return DICT[language] ?? KO;
}
