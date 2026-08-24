import type { NoticeLanguage } from "@/lib/notice/config";

/**
 * 결과 발표 화면에서 **시스템이 만들어 넣는 문구**의 언어별 사전.
 *
 * 투표·공고와 같은 문제: 대회 이름·상 이름은 운영자가 쓰지만 "축하합니다!" 같은 곁문구는
 * 우리가 넣는 것이라 여기가 비면 영문 대회에서 그 한 줄만 한글로 남는다.
 */
export interface CompetitionResultStrings {
  loadFailed: string;
  previewBannerNotPublished: string;
  previewBannerNotVisible: string;
  emptyTitleNotYet: string;
  emptyTitlePublishedNoAwards: string;
  emptySubNotYet: string;
  emptySubOther: string;
  /** 페이지 상단 제목. {name} 을 대회 이름으로 채워 쓴다. */
  resultTitle: (name: string) => string;
  congrats: string;
  /** 참가번호 라벨. {no} 를 채워 쓴다. */
  entryNo: (no: string) => string;
  playAriaLabel: string;
  videoTitle: string;
}

const KO: CompetitionResultStrings = {
  loadFailed: "결과를 불러오지 못했어요. 잠시 후 새로고침해주세요.",
  previewBannerNotPublished: "미리보기입니다. 아직 공개되지 않았어요.",
  previewBannerNotVisible: "미리보기입니다. 아직 관람객에게는 보이지 않아요.",
  emptyTitleNotYet: "결과 발표를 준비하고 있어요",
  emptyTitlePublishedNoAwards: "공개된 수상 내역이 없어요",
  emptySubNotYet: "발표가 끝나면 이 자리에 수상작이 올라옵니다.",
  emptySubOther: "잠시 후 다시 확인해주세요.",
  resultTitle: (name) => `${name} 수상 결과`,
  congrats: "축하합니다!",
  entryNo: (no) => `참가번호 ${no}`,
  playAriaLabel: "영상 재생",
  videoTitle: "수상작 영상",
};

const EN: CompetitionResultStrings = {
  loadFailed: "Couldn't load the results. Please refresh in a moment.",
  previewBannerNotPublished: "This is a preview. Results aren't published yet.",
  previewBannerNotVisible: "This is a preview. The audience can't see this yet.",
  emptyTitleNotYet: "Results are being prepared",
  emptyTitlePublishedNoAwards: "No awards have been published",
  emptySubNotYet: "Winners will appear here once announced.",
  emptySubOther: "Please check back in a moment.",
  resultTitle: (name) => `${name} — Results`,
  congrats: "Congratulations!",
  entryNo: (no) => `Entry no. ${no}`,
  playAriaLabel: "Play video",
  videoTitle: "Winning entry video",
};

const FR: CompetitionResultStrings = {
  loadFailed: "Impossible de charger les résultats. Merci d'actualiser dans un instant.",
  previewBannerNotPublished: "Ceci est un aperçu. Les résultats ne sont pas encore publiés.",
  previewBannerNotVisible: "Ceci est un aperçu. Le public ne le voit pas encore.",
  emptyTitleNotYet: "Les résultats sont en préparation",
  emptyTitlePublishedNoAwards: "Aucun prix n'a été publié",
  emptySubNotYet: "Les lauréats apparaîtront ici après l'annonce.",
  emptySubOther: "Merci de revenir dans un instant.",
  resultTitle: (name) => `${name} — Résultats`,
  congrats: "Félicitations !",
  entryNo: (no) => `N° de dossier ${no}`,
  playAriaLabel: "Lire la vidéo",
  videoTitle: "Vidéo de la candidature primée",
};

const JA: CompetitionResultStrings = {
  loadFailed: "結果を読み込めませんでした。しばらくしてから更新してください。",
  previewBannerNotPublished: "プレビューです。まだ公開されていません。",
  previewBannerNotVisible: "プレビューです。まだ来場者には表示されません。",
  emptyTitleNotYet: "結果発表の準備中です",
  emptyTitlePublishedNoAwards: "公開された受賞作品がありません",
  emptySubNotYet: "発表が終わるとここに受賞作品が表示されます。",
  emptySubOther: "しばらくしてからもう一度ご確認ください。",
  resultTitle: (name) => `${name} 受賞結果`,
  congrats: "おめでとうございます！",
  entryNo: (no) => `エントリー番号 ${no}`,
  playAriaLabel: "動画を再生",
  videoTitle: "受賞作品の動画",
};

/**
 * **Record 로 둔다.** 삼항으로 고르면 언어를 늘렸을 때 새 언어가 조용히 한국어로 떨어진다 —
 * 고를 수는 있는데 안 바뀌는 상태가 되고 타입 검사도 통과한다. 여기 한 줄이 비면 컴파일이 깨진다.
 */
const DICT: Record<NoticeLanguage, CompetitionResultStrings> = { ko: KO, en: EN, fr: FR, ja: JA };

export function competitionResultStrings(language: NoticeLanguage): CompetitionResultStrings {
  return DICT[language] ?? KO;
}
