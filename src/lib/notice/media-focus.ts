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

/**
 * 배경 위 가독성 손잡이.
 *
 * 카드들은 평평한 색 위에 놓일 걸 전제로 --paper 5% 정도의 옅은 막으로 그려져 있다.
 * 뒤에 사진이 깔리면 그 막이 사실상 사라져 카드 안이 안 읽힌다. 사진마다 밝기가 달라
 * 한 값으로는 못 맞추므로, 섹션마다 정한 값을 변수로 실어 보내고 계산은 CSS 가 한다.
 *
 * 배경이 없는 섹션에는 아무것도 안 싣는다 — 변수가 없으면 CSS 의 기본값이 그대로 산다.
 */
export function bgVars(media: { scrim: number; panel: number } | null | undefined): Record<string, string> {
  if (!media) return {};
  return { "--scrim-a": `${media.scrim}%`, "--panel-a": `${media.panel}%` };
}
