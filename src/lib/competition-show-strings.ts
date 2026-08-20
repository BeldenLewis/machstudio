import type { NoticeLanguage } from "@/lib/notice/config";
import type { ShowMode } from "@/lib/competition-show";

/**
 * 발표(무대) 화면에서 **시스템이 만들어 넣는 문구**의 언어별 사전.
 *
 * 이 화면은 관객이 보는 스크린이다 — 영문 대회의 시상식 무대에 "축하합니다!"만 한글로 뜨면
 * 공고·투표에서 잡은 언어 일관성이 마지막 장면에서 깨진다.
 *
 * **연출 모드 이름(modeLabel)은 SHOW_MODES 의 관리자용 라벨과 다른 사전이다.** SHOW_MODES
 * 라벨은 발표 탭에서 운영자가 모드를 고를 때만 보이는 관리자 UI 라 번역 대상이 아니다.
 * 여기 modeLabel 은 무대 하단 운영자 바에 "카드 공개 · 2 / 5" 식으로 노출되는 값이라 화면
 * 언어를 따라야 한다 — 두 자리가 다른 이유이지 실수로 두 벌이 된 게 아니다.
 *
 * 리허설 더미 데이터(가나다 팀 등, competition-show.ts)는 여기 없다 — 연습용으로 일부러
 * 채운 가짜 값이라 번역 대상이 아니다.
 */
export interface CompetitionShowStrings {
  linkBroken: string;
  linkBrokenHint: string;
  loading: string;
  rehearsalFlag: string;
  staticFallbackFlag: string;
  prevBtn: string;
  startBtn: string;
  endBtn: string;
  nextBtn: string;
  toStatic: string;
  toShow: string;
  restartBtn: string;
  ceremony: string;
  /** 시작 화면 안내. {count} 를 장면 수로 채워 쓴다. */
  introHint: (count: number) => string;
  noAwards: string;
  cardHint: string;
  noRanking: string;
  /** 순위 표시. {rank} 를 채워 쓴다. */
  rank: (rank: number) => string;
  /** 종합 점수. {score} 를 채워 쓴다. */
  combinedScore: (score: string) => string;
  noRankingData: string;
  staticNoAwards: string;
  /** 정적 결과판 제목. {name} 을 대회 이름으로 채워 쓴다. */
  staticResultTitle: (name: string) => string;
  modeLabel: Record<ShowMode, string>;
}

const KO: CompetitionShowStrings = {
  linkBroken: "발표 링크를 열 수 없어요",
  linkBrokenHint: "링크를 다시 확인하거나, 대회 설정에서 새로 발급해주세요.",
  loading: "불러오는 중...",
  rehearsalFlag: "리허설 — 연습용 가짜 결과예요",
  staticFallbackFlag: "비상 결과판 (S 키로 해제)",
  prevBtn: "← 이전",
  startBtn: "시작",
  endBtn: "끝",
  nextBtn: "다음 →",
  toStatic: "결과판",
  toShow: "연출로",
  restartBtn: "처음으로",
  ceremony: "시상식",
  introHint: (count) => `스페이스바 또는 → 를 누르면 시작합니다 (${count}개 장면)`,
  noAwards: "공개할 수상 내역이 없어요",
  cardHint: "카드를 누르면 공개됩니다",
  noRanking: "공개할 순위가 없어요",
  rank: (rank) => `${rank}위`,
  combinedScore: (score) => `종합 ${score}점`,
  noRankingData: "집계된 순위가 없어요",
  staticNoAwards: "아직 배정된 수상작이 없어요.",
  staticResultTitle: (name) => `${name} 수상 결과`,
  modeLabel: {
    card: "카드 공개",
    countdown: "순위 역순",
    roulette: "룰렛",
    bars: "점수 바 레이스",
    static: "정적 결과판",
  },
};

const EN: CompetitionShowStrings = {
  linkBroken: "This show link can't be opened",
  linkBrokenHint: "Double-check the link, or issue a new one from the competition settings.",
  loading: "Loading...",
  rehearsalFlag: "Rehearsal — practice results, not real",
  staticFallbackFlag: "Emergency results board (press S to exit)",
  prevBtn: "← Back",
  startBtn: "Start",
  endBtn: "End",
  nextBtn: "Next →",
  toStatic: "Results board",
  toShow: "Back to show",
  restartBtn: "Restart",
  ceremony: "Awards ceremony",
  introHint: (count) => `Press space or → to start (${count} scenes)`,
  noAwards: "No awards to reveal yet",
  cardHint: "Tap the card to reveal",
  noRanking: "No ranking to reveal yet",
  rank: (rank) => `#${rank}`,
  combinedScore: (score) => `Score ${score}`,
  noRankingData: "No ranking data yet",
  staticNoAwards: "No awards have been assigned yet.",
  staticResultTitle: (name) => `${name} — Results`,
  modeLabel: {
    card: "Card reveal",
    countdown: "Countdown",
    roulette: "Roulette",
    bars: "Score bar race",
    static: "Static board",
  },
};

const FR: CompetitionShowStrings = {
  linkBroken: "Ce lien de diffusion ne peut pas être ouvert",
  linkBrokenHint: "Vérifiez le lien, ou générez-en un nouveau depuis les paramètres du concours.",
  loading: "Chargement...",
  rehearsalFlag: "Répétition — résultats fictifs",
  staticFallbackFlag: "Tableau de secours (touche S pour quitter)",
  prevBtn: "← Précédent",
  startBtn: "Démarrer",
  endBtn: "Fin",
  nextBtn: "Suivant →",
  toStatic: "Tableau des résultats",
  toShow: "Retour à la mise en scène",
  restartBtn: "Recommencer",
  ceremony: "Cérémonie de remise des prix",
  introHint: (count) => `Appuyez sur espace ou → pour commencer (${count} scènes)`,
  noAwards: "Aucun prix à révéler pour le moment",
  cardHint: "Touchez la carte pour révéler",
  noRanking: "Aucun classement à révéler pour le moment",
  rank: (rank) => `#${rank}`,
  combinedScore: (score) => `Score ${score}`,
  noRankingData: "Aucune donnée de classement pour le moment",
  staticNoAwards: "Aucun prix n'a encore été attribué.",
  staticResultTitle: (name) => `${name} — Résultats`,
  modeLabel: {
    card: "Cartes à révéler",
    countdown: "Compte à rebours",
    roulette: "Roulette",
    bars: "Course de barres",
    static: "Tableau statique",
  },
};

const JA: CompetitionShowStrings = {
  linkBroken: "発表リンクを開けません",
  linkBrokenHint: "リンクを確認するか、大会設定から再発行してください。",
  loading: "読み込み中...",
  rehearsalFlag: "リハーサル — 練習用の仮の結果です",
  staticFallbackFlag: "非常用結果ボード（Sキーで解除）",
  prevBtn: "← 戻る",
  startBtn: "開始",
  endBtn: "終了",
  nextBtn: "次へ →",
  toStatic: "結果ボード",
  toShow: "演出に戻る",
  restartBtn: "最初から",
  ceremony: "表彰式",
  introHint: (count) => `スペースキーまたは→で開始します（${count}シーン）`,
  noAwards: "公開できる受賞内容がありません",
  cardHint: "カードをタップすると公開されます",
  noRanking: "公開できる順位がありません",
  rank: (rank) => `${rank}位`,
  combinedScore: (score) => `総合 ${score}点`,
  noRankingData: "集計された順位がありません",
  staticNoAwards: "まだ受賞作品が割り当てられていません。",
  staticResultTitle: (name) => `${name} 受賞結果`,
  modeLabel: {
    card: "カード公開",
    countdown: "順位カウントダウン",
    roulette: "ルーレット",
    bars: "スコアバーレース",
    static: "静的結果ボード",
  },
};

/**
 * **Record 로 둔다.** 삼항으로 고르면 언어를 늘렸을 때 새 언어가 조용히 한국어로 떨어진다 —
 * 고를 수는 있는데 안 바뀌는 상태가 되고 타입 검사도 통과한다. 여기 한 줄이 비면 컴파일이 깨진다.
 */
const DICT: Record<NoticeLanguage, CompetitionShowStrings> = { ko: KO, en: EN, fr: FR, ja: JA };

export function competitionShowStrings(language: NoticeLanguage): CompetitionShowStrings {
  return DICT[language] ?? KO;
}
