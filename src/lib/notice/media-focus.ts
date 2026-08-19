import type { NoticeMediaFocus } from "./config";

/**
 * 배경 이미지의 초점을 CSS 변수로 넘긴다.
 *
 * object-position 을 인라인으로 직접 쓰지 않는 이유: **모바일 값이 따로 있어서**다.
 * 인라인 스타일은 미디어 쿼리를 못 쓰므로, 값만 변수로 심어 두고 실제 적용은 CSS 가 한다
 * (css.ts 의 `.nt-bg img` 규칙). 그래야 한 장의 사진으로 가로·세로 화면을 각각 맞출 수 있다.
 */
export function focusVars(focus: NoticeMediaFocus, mobileFocus: NoticeMediaFocus): Record<string, string> {
  return {
    "--fx": `${focus.x}%`,
    "--fy": `${focus.y}%`,
    "--mfx": `${mobileFocus.x}%`,
    "--mfy": `${mobileFocus.y}%`,
  };
}
