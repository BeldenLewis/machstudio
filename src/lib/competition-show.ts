/**
 * 발표 연출 설정 — 무대에서 결과를 어떻게 드러낼지.
 *
 * 무대 위에서는 되돌릴 수 없다. 그래서 두 가지가 설계의 전부다:
 *
 * 1. **자동 재생 금지.** MC 진행 속도는 아무도 예측할 수 없다. 모든 전환은 운영자가 누른다.
 * 2. **폴백이 항상 한 손에.** 연출이 깨져도 정적 결과판으로 즉시 넘어갈 수 있어야 한다.
 *    무대 위에서 새로고침을 기다릴 수는 없다.
 */

export type ShowMode = "static" | "card" | "countdown" | "roulette" | "bars";

export const SHOW_MODES: Array<{ value: ShowMode; label: string; hint: string }> = [
  { value: "card", label: "카드 공개", hint: "상 이름 카드를 넘기면 수상자가 나와요. MC가 읽는 진행에 가장 안전합니다." },
  { value: "countdown", label: "순위 역순", hint: "아래 순위부터 하나씩 올라오고 1위가 마지막이에요. 시상식 정석." },
  { value: "roulette", label: "룰렛", hint: "후보 이름이 돌다가 감속하며 멈춰요. 분위기가 오릅니다." },
  { value: "bars", label: "점수 바 레이스", hint: "종합 점수가 차오르며 순위가 정렬돼요. 근거가 함께 보입니다." },
  { value: "static", label: "정적 결과판", hint: "전체 결과를 한 번에. 리허설·아카이브용이자 비상 폴백이에요." },
];

export interface ShowConfig {
  mode: ShowMode;
  /** 참가작 이미지·영상 썸네일을 함께 띄운다. 무대 스크린이 작으면 끄는 게 낫다. */
  showMedia: boolean;
  /** 점수를 관객에게 보여준다. bars 모드는 켠 것으로 간주한다(점수가 곧 연출이라). */
  showScores: boolean;
  /** 화면 하단 안내 문구. 비우면 안 나온다. */
  footnote: string;
}

const DEFAULT_CONFIG: ShowConfig = {
  mode: "card",
  showMedia: true,
  showScores: false,
  footnote: "",
};

export function normalizeShowConfig(raw: unknown): ShowConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONFIG };
  const c = raw as Record<string, unknown>;
  const mode = SHOW_MODES.some((m) => m.value === c.mode) ? (c.mode as ShowMode) : DEFAULT_CONFIG.mode;
  return {
    mode,
    showMedia: typeof c.showMedia === "boolean" ? c.showMedia : DEFAULT_CONFIG.showMedia,
    // bars 는 점수 자체가 연출이라 따로 끌 수 없다.
    showScores: mode === "bars" ? true : typeof c.showScores === "boolean" ? c.showScores : DEFAULT_CONFIG.showScores,
    footnote: typeof c.footnote === "string" ? c.footnote.slice(0, 200) : DEFAULT_CONFIG.footnote,
  };
}

/**
 * 리허설용 더미 결과.
 *
 * **실제 결과로 연습하면 안 된다.** 리허설은 무대·조명·MC 동선을 맞추는 자리고, 그 자리에는
 * 스태프 말고도 사람이 있다. 진짜 수상자를 띄우는 순간 발표는 끝난 것이다.
 */
export function rehearsalPayload(competitionName: string) {
  const teams = ["가나다 팀", "라마바 팀", "사아자 팀", "차카타 팀", "파하가 팀"];
  const awards = ["대상", "최우수상", "우수상"];
  return {
    competition: { name: `${competitionName} (리허설)`, theme: {} as Record<string, string> },
    rehearsal: true,
    awards: awards.map((name, index) => ({
      id: `rehearsal-${index}`,
      name,
      description: null,
      entry: {
        entryNo: String(index + 1),
        title: `연습용 작품 ${index + 1}`,
        teamName: teams[index],
        summary: null,
        media: [],
      },
    })),
    ranking: teams.map((teamName, index) => ({
      entryNo: String(index + 1),
      title: `연습용 작품 ${index + 1}`,
      teamName,
      rank: index + 1,
      combined: Math.round((92 - index * 11.5) * 10) / 10,
      publicScore: Math.round((90 - index * 12) * 10) / 10,
      judgeScore: Math.round((94 - index * 11) * 10) / 10,
      tied: false,
    })),
    candidates: teams,
  };
}
