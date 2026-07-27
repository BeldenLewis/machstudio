/**
 * 세션 로고의 **표시 규격** 한 곳 — 랜딩·대기·입장·시청·상세 팝업이 같은 크기로 보이게.
 *
 * 왜 모듈로 뺐나: 같은 로고가 면마다 다른 크기로 나왔다(실측).
 *   랜딩 타임테이블 22px / 최대 140px  ·  대기 화면 22px / 132px  ·  라이브 세션 목록 20px / 120px
 * CSS 문자열이 파일마다 따로 살아서(landing/css.ts, PreLiveWaiting, LiveContentStk) 한 곳을 고쳐도
 * 나머지가 안 따라왔다. 이제 숫자는 여기 한 벌이고 각 CSS 는 이 함수로 규칙을 찍어 낸다.
 *
 * 규격 근거:
 *   · height 만 고정하고 width 는 원본 비율(contain) — 로고는 가로세로비가 제각각이라
 *     둘 다 고정하면 찌그러지거나 잘린다(연사 사진의 cover 크롭과 다른 처리다).
 *   · max-width 로 가로로 긴 로고가 줄을 밀어내는 것을 막는다.
 *   · 22px: 타임테이블 한 줄(최소 62px) 안에서 제목·연사와 함께 놓이는 크기.
 *     20px 은 라이브 목록에서만 쓰였는데 두 면을 나란히 보면 작아 보인다 → 22 로 통일.
 */

/** 로고 높이(px) — 모든 면 공통. */
export const SESSION_LOGO_HEIGHT = 22;
/** 로고 최대 폭(px) — 가로로 긴 로고가 줄을 밀지 않게. */
export const SESSION_LOGO_MAX_WIDTH = 140;

/**
 * 로고 표시 규칙을 CSS 로 찍는다.
 *
 * @param selector 규칙을 붙일 셀렉터(예: `.lnd .schedule-logo`)
 * @param opts.plate 흰 판을 깔지 — 어두운 배경 위에서는 필수다(투명 PNG 가 대부분이라
 *   판이 없으면 검은 글자 로고가 배경에 묻혀 사라진다). 밝은 배경에서는 판이 오히려
 *   네모난 테두리처럼 보여서 끈다.
 * @param opts.align object-position 의 가로 정렬 — 왼쪽 정렬이 기본(글의 흐름과 맞춘다).
 */
export function sessionLogoCss(
  selector: string,
  opts?: { plate?: boolean; align?: "left" | "center" },
): string {
  const align = opts?.align ?? "left";
  const plate = opts?.plate
    ? " background:#fff; border-radius:4px; padding:2px 4px;"
    : "";
  /**
   * box-sizing 을 **명시**한다 — 두 가지 이유로 생략할 수 없다.
   *
   * 1) 흰 판을 깐 로고가 작아진다. border-box 에서는 height:22px 안에 padding 4px 이 들어가서
   *    마크가 18px 로 줄고, 판 없는 면(22px)과 나란히 보면 다른 크기가 된다. 실측: 같은 로고가
   *    타임테이블 108px 폭 vs 팝업 97px 폭. content-box 면 판은 밖으로 자라고 마크는 22px 로 같다.
   * 2) 랜딩은 **남의 사이트에 직접 마운트**된다. 호스트의 리셋이 border-box 든 content-box 든
   *    같은 크기로 보여야 하므로 이 규칙이 호스트 리셋에 의존하면 안 된다.
   */
  return `${selector} { display:block; box-sizing:content-box; height:${SESSION_LOGO_HEIGHT}px; width:auto; max-width:${SESSION_LOGO_MAX_WIDTH}px; object-fit:contain; object-position:${align} center;${plate} }`;
}
