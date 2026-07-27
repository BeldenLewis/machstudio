/**
 * 랜딩 Sessions / Time Table / 세션 상세 팝업 뷰 — 프레임워크 비의존.
 *
 * 원본은 `src/app/webinar/[slug]/landing/page.tsx` 의 JSX. 클래스명·DOM 구조·텍스트를 그대로 옮겼다
 * (CSS 는 이미 landing/css.ts 로 분리돼 있어 시각 회귀 0 이 목표).
 *
 * 원본과 의도적으로 달라지는 유일한 지점: 모달 위치.
 * 원본은 position:absolute + 클릭한 카드의 문서 Y 를 인라인 top 으로 박았지만, 호스트 DOM 에 직접
 * 마운트되면 조상의 position:relative/transform 이 containing block 이 되어 좌표가 어긋난다.
 * → 인라인 top/left/transform 을 일절 넣지 않고 위치는 CSS(fixed + 중앙 정렬)에 맡긴다.
 * ESC·포커스 트랩·스크롤 잠금도 여기서 하지 않는다(레이어를 소유한 mount 쪽 책임).
 */

import { isPauseSession, sessionHasSpeaker, sessionTypeMeta } from "@/lib/webinar-sessions";
import { cx, h, svg } from "./h";
import { parseSpeaker } from "./model";
import type { LandingModel, LandingSession } from "./types";

/** 카드/모달에서 반복되는 "→" 화살표. */
function arrowIcon(): SVGElement {
  return svg(
    "svg",
    { viewBox: "0 0 24 24" },
    svg("path", {
      d: "M5 12h13M13 6l6 6-6 6",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
}

/** 세션 카드 내부 — article/button 어느 쪽이든 같은 내용. */
function sessionCardInner(m: LandingModel, session: LandingSession): (Node | false)[] {
  const sp = parseSpeaker(session.speaker, session.speakerCompany);
  return [
    Boolean(session.speakerPhotoUrl) &&
      h("img", { class: "session-photo", src: session.speakerPhotoUrl, alt: "", loading: "lazy" }),
    h(
      "div",
      { class: "session-card-body" },
      h("span", { class: "session-time" }, session.startTime, "–", session.endTime),
      h("h3", null, session.title),
      /**
       * 연사 정보와 '자세히 보기' 를 **한 줄**에 둔다 — 이름·회사는 왼쪽, 링크는 오른쪽 하단.
       * 예전엔 세로로 쌓여서 링크가 이름 바로 아래 붙었는데, 카드 하단에서 두 정보가
       * 같은 축을 쓰다 보니 시선이 어디서 멈춰야 하는지 애매했다. 좌우로 갈라 두면
       * "누가" 와 "더 보기" 가 서로 다른 역할이라는 게 위치로 드러난다.
       */
      h(
        "div",
        { class: "session-foot" },
        h(
          "div",
          { class: "speaker" },
          Boolean(sp.name) && h("b", null, sp.name),
          Boolean(sp.company) && h("span", { class: "speaker-co" }, sp.company),
        ),
        m.detailPopup &&
          h("span", { class: "session-more", "aria-hidden": "true" }, "자세히 보기", arrowIcon()),
      ),
    ),
  ];
}

/**
 * Sessions 섹션. detailPopup 이면 카드가 버튼이 되고, 클릭 시 onOpen(세션, 누른 엘리먼트)을 부른다
 * (opener 는 모달 닫힐 때 포커스를 되돌리는 데 쓴다).
 */
export function renderSessions(
  m: LandingModel,
  onOpen: (s: LandingSession, opener: HTMLElement) => void,
): HTMLElement | null {
  if (m.sessionCards.length === 0) return null;
  const titleId = m.sectionId("lnd-sessions-title");
  return h(
    "section",
    { class: "section accent-zone", id: m.sectionId("lnd-sessions"), "aria-labelledby": titleId },
    h("h2", { class: "section-title rv", id: titleId }, "Sessions"),
    h(
      "div",
      { class: "session-cards rv" },
      m.sessionCards.map((session) =>
        m.detailPopup
          ? h(
              "button",
              {
                type: "button",
                class: "session-card is-clickable",
                "aria-haspopup": "dialog",
                "aria-label": `${session.title} — 연사 상세 보기`,
                onclick: (e: Event) => onOpen(session, e.currentTarget as HTMLElement),
              },
              sessionCardInner(m, session),
            )
          : h("article", { class: "session-card" }, sessionCardInner(m, session)),
      ),
    ),
  );
}

/** Time Table 섹션 — 세션·휴식·Q&A 를 한 줄씩. */
export function renderTimetable(m: LandingModel): HTMLElement | null {
  if (m.timetableRows.length === 0) return null;
  const titleId = m.sectionId("lnd-timetable-title");
  return h(
    "section",
    { class: "section accent-zone", id: m.sectionId("lnd-timetable"), "aria-labelledby": titleId },
    h("h2", { class: "section-title rv", id: titleId }, "Time Table"),
    h(
      "ul",
      { class: "schedule rv" },
      m.timetableRows.map((row) => {
        const meta = sessionTypeMeta(row.type);
        return h(
          "li",
          // 반전(어두운 행)은 **빈 시간에만**. 오프닝·클로징·Q&A 는 세션으로 세지 않지만
          // 콘텐츠라서 일반 행으로 그리고, 대신 아래 태그로 종류를 말한다.
          { class: cx("schedule-row", isPauseSession(row.type) && "is-break") },
          h("div", { class: "schedule-time" }, row.startTime, "–", row.endTime),
          h(
            "div",
            { class: "schedule-content" },
            h(
              "span",
              { class: "schedule-name" },
              row.title,
              // 태그 문구도 유형 표에서 — 여기만 "Live Q&A" 로 갈라져 있었다
              Boolean(meta?.landingTag) && h("span", { class: "tag" }, meta!.landingTag!),
            ),
            // 연사 표시 판정을 hasSpeaker 로 통일. 예전엔 `=== "session"` 정확일치라
            // **Q&A 의 "전체 연사" 가 랜딩에서만 사라졌다**(라이브는 `!== "break"` 로 보여 줬다).
            sessionHasSpeaker(row.type) && Boolean(row.speaker) && h("span", { class: "schedule-speaker" }, row.speaker),
            Boolean(row.logoUrl) &&
              h("img", { class: "schedule-logo", src: row.logoUrl, alt: "", loading: "lazy" }),
          ),
        );
      }),
    ),
  );
}

/**
 * 세션 상세 팝업(글래스모피즘). 배경/닫기 버튼 클릭만 여기서 처리하고, 위치는 CSS 가 잡는다.
 * 닫기 버튼에는 data-ms-modal-close 를 달아 통합자가 초기 포커스를 줄 수 있게 한다.
 */
export function createSessionDialog(
  m: LandingModel,
  session: LandingSession,
  opts: { onClose: () => void },
): HTMLElement {
  const sp = parseSpeaker(session.speaker, session.speakerCompany);
  const hasSpeaker = Boolean(sp.name || sp.company || session.speakerBio);
  const photo = session.speakerPhotoUrl;
  const titleId = m.sectionId("modal-title");

  const closeBtn = h(
    "button",
    {
      type: "button",
      class: "lnd-modal-close",
      "aria-label": "닫기",
      "data-ms-modal-close": "",
      onclick: () => opts.onClose(),
    },
    svg(
      "svg",
      { viewBox: "0 0 24 24", "aria-hidden": "true" },
      svg("path", {
        d: "M6 6l12 12M18 6 6 18",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
      }),
    ),
  );

  const dialog = h(
    "div",
    {
      class: cx("lnd-modal", Boolean(photo) && "has-photo"),
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
      // 카드 밖(배경) 클릭만 닫히게 — 모달 내부 클릭은 루트로 올라가지 않게 막는다.
      onclick: (e: Event) => e.stopPropagation(),
    },
    closeBtn,
    Boolean(photo) &&
      h(
        "div",
        { class: "lnd-modal-photo" },
        h("img", { src: photo, alt: sp.name || session.title }),
        Boolean(sp.name || sp.company) &&
          h(
            "div",
            { class: "lnd-modal-photo-cap" },
            Boolean(sp.name) && h("b", null, sp.name),
            Boolean(sp.company) && h("span", null, sp.company),
          ),
      ),
    h(
      "div",
      { class: "lnd-modal-main" },
      h("span", { class: "lnd-modal-time" }, session.startTime, "–", session.endTime),
      h("h3", { id: titleId }, session.title),
      /**
       * 세션 로고 — 제목 바로 아래. 연사 블록 안이 아니라 여기 두는 이유: 로고는 주최·협력사
       * 마크라 **연사가 없는 세션(오프닝·클로징)에도 있을 수 있다.** 연사 블록에 넣으면
       * hasSpeaker 가 false 인 세션에서 로고가 통째로 사라진다. 크기는 다른 면과 같은 규격
       * (webinar-logo.ts) — 같은 로고가 타임테이블과 팝업에서 다른 크기로 보이지 않게.
       */
      Boolean(session.logoUrl) &&
        h("img", { class: "lnd-modal-logo", src: session.logoUrl, alt: "", loading: "lazy" }),
      Boolean(session.description) && h("p", { class: "lnd-modal-desc" }, session.description),
      hasSpeaker &&
        h(
          "div",
          { class: "lnd-modal-speaker" },
          h(
            "div",
            { class: "lnd-modal-speaker-head" },
            h(
              "span",
              { class: "lnd-modal-avatar", "aria-hidden": "true" },
              photo ? h("img", { src: photo, alt: "" }) : sp.name.trim().charAt(0) || "·",
            ),
            h(
              "div",
              { class: "lnd-modal-speaker-id" },
              Boolean(sp.name) && h("b", null, sp.name),
              Boolean(sp.company) && h("span", null, sp.company),
            ),
          ),
          Boolean(session.speakerBio) &&
            h(
              "div",
              { class: "lnd-modal-bio" },
              h("h4", null, "약력"),
              h("p", null, session.speakerBio),
            ),
        ),
    ),
  );

  return h(
    "div",
    { class: "lnd-modal-root", role: "presentation", onclick: () => opts.onClose() },
    h("div", { class: "lnd-modal-backdrop" }),
    dialog,
  );
}
