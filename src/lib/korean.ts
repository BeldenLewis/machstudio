/**
 * 한국어 조사 선택 — 앞 단어의 종성 유무로 갈린다.
 *
 * 왜 필요한가: 문구를 `${itemNoun}을 삭제했어요` 처럼 하드코딩하면 단어에 따라 틀린다.
 * "질문을"(종성 ㄴ)은 맞지만 "단계을"·"자료을"·"하이라이트을"은 틀린 말이 된다.
 * 공용 컴포넌트가 항목 이름을 받아 문구를 만드는 구조라면 조사도 함께 계산해야 한다.
 */

const HANGUL_START = 0xac00; // '가'
const HANGUL_END = 0xd7a3; // '힣'
const JONGSEONG_COUNT = 28; // 종성 개수(없음 포함)

/**
 * 마지막 글자에 종성(받침)이 있는가.
 * 한글 음절이 아니면(영문·숫자·기호) null — 호출자가 기본값을 고르게 한다.
 */
export function hasFinalConsonant(word: string): boolean | null {
  const last = word.trimEnd().slice(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return null;
  return (code - HANGUL_START) % JONGSEONG_COUNT !== 0;
}

/**
 * 조사를 붙인다. 한글이 아니면 종성 있는 쪽(withFinal)을 쓴다 —
 * "URL을", "CSV을" 처럼 영문 약어는 대개 받침 있는 발음으로 읽힌다.
 */
function attach(word: string, withFinal: string, withoutFinal: string): string {
  const final = hasFinalConsonant(word);
  return `${word}${final === false ? withoutFinal : withFinal}`;
}

/** 을/를 — 목적격 */
export const objectParticle = (word: string) => attach(word, "을", "를");
/** 이/가 — 주격 */
export const subjectParticle = (word: string) => attach(word, "이", "가");
/** 은/는 — 보조사 */
export const topicParticle = (word: string) => attach(word, "은", "는");
/** 와/과 — 접속 */
export const withParticle = (word: string) => attach(word, "과", "와");
