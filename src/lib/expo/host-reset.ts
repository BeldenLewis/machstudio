/**
 * Shadow 호스트의 **인라인 리셋** — 파트너 사이트의 CSS 와 맞붙는 자리.
 *
 * ── 두 겹으로 되어 있다 ───────────────────────────────────────────────
 * `all:initial` 은 파트너의 **일반 선언**을 한 번에 이긴다. 그 뒤의 짧은 `!important`
 * 목록은 파트너의 **`!important` 선언**과 맞붙는다. 전부 !important 로 도배하지 않는
 * 이유는, 그러면 나중에 우리가 테마를 얹을 때 우리 자신이 못 덮기 때문이다.
 *
 * ── 형태의 규칙 ───────────────────────────────────────────────────────
 * 여기 있는 선언은 하나하나 **"남이 우리 박스에 걸어 둔 제약을 무력화"** 한다.
 * **크기나 위치를 주장하지 않는다.** 유일한 예외가 `display:block` 인데,
 * `display:inline` 인 Shadow 호스트는 레이아웃 컨테이너가 아예 될 수 없다.
 *
 * 그래서 `width`·`z-index`·`background`·`position:absolute|fixed|relative`·
 * `margin:auto`·음수 마진·`vw` 길이는 **섹션 호스트에 절대 넣지 않는다**:
 *  - `width:100%` 는 flex/gap 컨테이너에서 넘쳐 파트너 페이지에 가로 스크롤을 만든다
 *  - `position:absolute` 는 컨테이너를 0 높이로 접어 그 자리에 구멍을 남긴다
 *  - `z-index` 는 우리를 파트너의 sticky 헤더 위로 올린다
 *  - 호스트 배경은 구획 사이 여백에 우리 색을 칠해 파트너 배경을 덮는다
 * `max-width:none`·`min-width:0` 은 예외가 아니다 — 우리 요소만 제약한다.
 *
 * ── `all` 이 건드리지 않는 두 가지 ────────────────────────────────────
 * `all` 은 `direction` 과 `unicode-bidi` **를 제외한** 모든 속성의 단축이다. 그래서
 * `html{direction:rtl}` 인 페이지에서는 상속된 rtl 이 호스트까지 그대로 온다 —
 * 우리 박스가 float 반대쪽에 놓이고 주변 텍스트가 우리를 감싸며 재배열된다.
 * 시트가 안쪽(`.msx-root`)을 고치고, 여기서 **박스 자체**를 고정한다.
 */

/** 두 호스트가 공유하는 뼈대. 순서는 뜻이 있다 — `all` 이 먼저다. */
const BASE = [
  "all:initial",
  // all:initial 은 display 를 inline 으로 만든다. inline 호스트는 컨테이너가 못 된다.
  "display:block!important",
  "margin:0!important",
  "padding:0!important",
  "min-width:0!important",
  "max-width:none!important",
  "overflow:visible!important",
  // 아임웹 스크롤 리빌 테마는 `.ani{opacity:0}` 로 시작해 자기 요소만 IntersectionObserver
  // 로 풀어 준다. 그 시작 상태에 걸리면 우리 구획은 **라이브에서 영영 안 보인다**.
  "visibility:visible!important",
  "opacity:1!important",
  "pointer-events:auto!important",
  // transform 계열은 포털에서 특히 치명적이다(overlay.ts) — 여기서도 남은 변환을 끊는다.
  "transform:none!important",
  "filter:none!important",
  "will-change:auto!important",
  "contain:none!important",
  // `*{animation:fadeInUp .8s both!important}` + 첫 키프레임 opacity:0 = 영구 비표시.
  "animation:none!important",
  // `*{transition:all .3s!important}` 이면 iframe 자동높이가 중간값을 읽어 진동한다.
  "transition:none!important",
  // all 이 건드리지 않는 둘.
  "direction:ltr!important",
  "unicode-bidi:isolate!important",
];

/** 섹션 호스트 — 파트너 컨테이너 **안에** 놓인다. 폭은 컨테이너가 정한다. */
export const EXPO_HOST_RESET_CSS = [
  ...BASE,
  "position:static!important",
  "float:none!important",
  "height:auto!important",
  "min-height:0!important",
  "max-height:none!important",
].join(";") + ";";

/**
 * 포털 호스트 — `document.body` 직계다. 섹션 호스트와 다른 점만 적는다.
 *
 * `position:static` 이 아니라 **0×0 고정 박스**인 이유: body 에 `display:flex` 를 쓰는
 * 테마(아임웹에 흔하다)에서 static 블록은 **flex 항목**이 되어 유령 칸을 하나 만든다.
 * 0×0 fixed 는 흐름에서 완전히 빠진다.
 *
 * `z-index` 는 여기서만 필수다. `position:fixed` 는 항상 쌓임 문맥을 만들므로, 시트의
 * `.msx-portal{z-index:...}` 는 이 호스트 **안에** 갇혀 파트너의 `z-index:9999` sticky
 * 헤더와 겨룰 수 없다 — 호스트에 z-index 가 없으면 모달이 그 헤더 **뒤에** 그려진다.
 *
 * 그리고 transform·filter·backdrop-filter·perspective 를 none 으로 못 박는 것이
 * 여기서는 장식이 아니다: 그중 하나라도 걸리면 이 호스트가 `.msx-portal{inset:0}` 의
 * 컨테이닝 블록이 되어 **0×0 기준으로 계산되고 모달이 사라진다.**
 */
export const EXPO_PORTAL_RESET_CSS = [
  ...BASE,
  "position:fixed!important",
  "top:0!important",
  "left:0!important",
  "right:auto!important",
  "bottom:auto!important",
  "width:0!important",
  "height:0!important",
  "z-index:2147483000!important",
  "backdrop-filter:none!important",
  "perspective:none!important",
].join(";") + ";";
