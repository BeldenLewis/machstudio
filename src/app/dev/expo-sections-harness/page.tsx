"use client";

/**
 * 홈페이지 **구획 편집기** 하니스 — 개발 환경 전용(프로덕션 404).
 *
 * 어드민 화면은 로그인 벽 뒤라 브라우저로 열 수 없다. jsdom 테스트가 값의 흐름은 지키지만
 * **두 가지는 못 본다**:
 *   · 끌어서 순서 바꾸기 — dnd-kit 은 rAF·레이아웃 측정에 기대므로 jsdom 에서 재현되지 않는다.
 *     이 화면은 구획 목록 안에 행 목록이 또 들어가는 **중첩 EditableList** 라 특히 확인이 필요하다.
 *   · 좁은 가운데 칸에서의 실제 배치 — 카드 머리에 컨트롤이 몇 개나 들어가는가.
 *
 * 오른쪽에 발행 패널과 **저장될 뻔한 값**을 함께 둔다. 발행 패널은 상태를 토글로
 * 바꿔 가며 본다 — 상태 게이트가 있는 UI 는 보이는 상태와 숨는 상태를 둘 다 태워야
 * 하니스가 제 몫을 한다. 행 키를 떼고 서버 정규화를 통과시킨 결과라,
 * 화면과 저장이 갈라지는 순간(빈 필수 값 행이 사라지고, 키비주얼이 맨 위로 가는 것)이
 * 눈에 보인다. 저장은 하지 않는다 — 어떤 요청도 나가지 않는다.
 */

import { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { SectionsEditor } from "@/components/expo/SectionEditor";
import { ExpoPublishPanel } from "@/components/expo/ExpoPublishPanel";
import { ExpoPageTree } from "@/components/expo/ExpoPageTree";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { attachExpoRowKeys, stripExpoRowKeys, findRowKeyLeak } from "@/lib/expo/row-key";
import { normalizeExpoPage } from "@/lib/expo/config";
import { FINISH, R, Segmented } from "@/components/ui/primitives";
import type { ExpoSection } from "@/lib/expo/types";

const SID = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;

const SEED: ExpoSection[] = [
  {
    sid: SID(1), type: "kv", variant: "column", enabled: true, embedEnabled: false,
    design: { bg: "light", align: "left" },
    content: {
      eyebrow: { ko: "KOREA EXPO LA 2026" },
      title: { ko: "빛의 시간" },
      subtitle: { ko: "10월 22일부터 사흘간, 로스앤젤레스 컨벤션 센터." },
      cta: { label: "참가 신청", href: "https://example.com/apply" },
    },
  },
  {
    sid: SID(2), type: "textblock", variant: "prose", enabled: true, embedEnabled: false,
    design: { bg: "light" },
    content: {
      heading: { ko: "전시 소개" },
      // 줄바꿈이 보존되는지 눈으로 본다 — 사용자 텍스트다(AGENTS.md 공통).
      body: { ko: "첫째 줄입니다.\n둘째 줄입니다.\n\n한 줄 띄운 셋째 줄." },
    },
  },
  {
    sid: SID(3), type: "cardgrid", variant: "multicolumn", enabled: true, embedEnabled: true,
    design: { bg: "dark" },
    content: {
      heading: { ko: "프로그램" },
      items: [
        { tag: { ko: "무대" }, title: { ko: "커버댄스 경연" }, description: { ko: "예선과 본선." } },
        { tag: { ko: "전시" }, title: { ko: "브랜드관" }, description: { ko: "40개 부스." } },
        // 필수(title)가 빈 행 — 저장하면 서버가 버린다. 화면이 그걸 말하는지 본다.
        { tag: { ko: "아직 안 적음" } },
      ],
    },
  },
  {
    sid: SID(4), type: "toolbox", variant: "tiles", enabled: false, embedEnabled: false,
    design: { bg: "light" },
    content: {
      items: [
        { label: { ko: "오시는 길" }, link: { label: "지도", href: "https://example.com/map" } },
      ],
    },
  },
  {
    sid: SID(5), type: "custom-code", variant: "boxed", enabled: true, embedEnabled: false,
    design: { bg: "light" },
    content: { heading: { ko: "지도" }, code: '<div id="map">지도 자리</div>' },
  },
];

const PAGES = [
  { id: "page-home", title: "홈" },
  { id: "page-about", title: "전시 소개" },
];

const SOURCES = [
  { id: "src-1", name: "관람 신청", isActive: true },
  { id: "src-2", name: "바이어 사전등록 (지난 전시)", isActive: false },
];

export default function ExpoSectionsHarness() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Harness />;
}

function Harness() {
  // 행 키는 **여기서 한 번만** 붙인다 — 렌더마다 붙이면 자동저장이 끝없이 돈다.
  const [sections, setSections] = useState(() => attachExpoRowKeys(SEED));
  const [width, setWidth] = useState<"narrow" | "wide">("narrow");
  const [canEdit, setCanEdit] = useState(true);
  const [stage, setStage] = useState<"draft" | "published" | "live">("draft");

  /** 저장될 뻔한 값 — 행 키를 떼고 서버 정규화까지 통과시킨 결과다. */
  const saved = useMemo(() => {
    const stripped = stripExpoRowKeys(sections);
    return {
      leak: findRowKeyLeak(stripped),
      normalized: normalizeExpoPage({ sections: stripped }),
    };
  }, [sections]);

  return (
    // 발행 패널이 공용 확인 모달을 쓴다 — 프로바이더 없이 렌더하면 훅이 던진다.
    <ConfirmProvider>
    <div className="min-h-screen bg-background p-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            expo sections harness
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            요청은 하나도 나가지 않아요. 오른쪽은 <b>저장될 뻔한 값</b>(행 키 제거 + 서버 정규화)입니다.
          </p>
        </div>
        <Segmented
          label="편집 칸 폭"
          value={width}
          onChange={setWidth}
          options={[
            { value: "narrow", label: "실제 폭(가운데 칸)" },
            { value: "wide", label: "넓게" },
          ]}
        />
        <Segmented
          label="권한"
          value={canEdit ? "edit" : "view"}
          onChange={(next) => setCanEdit(next === "edit")}
          options={[
            { value: "edit", label: "편집 가능" },
            { value: "view", label: "뷰어" },
          ]}
        />
        <Segmented
          label="발행 상태"
          value={stage}
          onChange={setStage}
          options={[
            { value: "draft", label: "초안" },
            { value: "published", label: "발행됨" },
            { value: "live", label: "공개 중" },
          ]}
        />
      </header>

      <div className="flex flex-wrap items-start gap-4">
        {/* 왼쪽 칸 — 실제 폭(200~240px)에서 핸들·상태점·이름·삭제가 다 들어가는지 본다. */}
        <div style={{ width: 240 }}>
          <ExpoPageTree
            siteId="harness-site"
            pages={[
              { id: "home", title: "홈", isHome: true, hasPublished: true, liveAt: "2026-08-01T00:00:00.000Z" },
              { id: "about", title: "전시 소개", isHome: false, hasPublished: true, liveAt: null },
              { id: "apply", title: "참가 신청 안내와 유의사항", isHome: false, hasPublished: false, liveAt: null },
            ]}
            selectedId="about"
            canEdit={canEdit}
            canManageSite={canEdit}
            onSelect={() => {}}
            onAdd={() => {}}
            onReload={() => {}}
            onPendingChange={() => {}}
          />
        </div>

        {/* 편집기가 실제로 앉는 칸 폭을 흉내낸다 — 3열 레이아웃의 가운데는 넓지 않다. */}
        <div
          className={`${R.panel} ${FINISH.s1} min-w-0 bg-card p-5`}
          style={{ width: width === "narrow" ? 560 : "100%", maxWidth: "100%" }}
        >
          <SectionsEditor
            sections={sections}
            onChange={setSections}
            canEdit={canEdit}
            siteId="harness-site"
            sources={SOURCES}
            pages={PAGES}
            locale="ko"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <ExpoPublishPanel
            pageId="harness-page"
            pageTitle="홈"
            hasPublished={stage !== "draft"}
            liveAt={stage === "live" ? "2026-08-01T00:00:00.000Z" : null}
            canPublish={canEdit}
            onChanged={() => { /* 하니스는 서버를 안 부른다 */ }}
            readiness={{
              canPublish: true,
              canGoLive: stage !== "draft",
              publishIssues: [],
              liveIssues: stage === "draft"
                ? [{ code: "not-published", message: "아직 발행하지 않았어요. 발행해야 밖으로 나갈 사본이 만들어져요." }]
                : [],
              notes: stage === "published"
                ? [{ code: "draft-ahead-of-published", message: "발행 뒤에 고친 내용이 있어요. 다시 발행해야 밖에 반영돼요." }]
                : [],
            }}
            snippets={{
              ok: true,
              page: {
                src: "https://machstudio.example.com/h/harness-page",
                code: '<script async src="https://machstudio.example.com/h/harness-page"></script>\n<div data-mach-expo></div>',
              },
              sections: [{
                sid: SID(3),
                label: "카드",
                snippet: {
                  src: `https://machstudio.example.com/h/harness-page/${SID(3)}`,
                  code: `<script async src="https://machstudio.example.com/h/harness-page/${SID(3)}"></script>\n<div data-mach-expo-section></div>`,
                },
                issues: stage === "draft"
                  ? [{ code: "section-not-published", message: "이 구획은 발행본에 없어요. 페이지를 발행하면 코드를 복사할 수 있어요." }]
                  : [],
              }],
            }}
          />

        <div className={`${R.panel} ${FINISH.s1} min-w-0 bg-card p-4`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">저장될 뻔한 값</h2>
            <span className="text-[11px] text-muted-foreground">
              구획 {sections.length}개 → {saved.normalized.sections.length}개
            </span>
          </div>
          {saved.leak ? (
            <p className={`mt-2 ${R.surface} ${FINISH.s2Danger} bg-secondary p-2 text-[11px]`}>
              행 키가 새어 나갔어요: <code>{saved.leak}</code>
            </p>
          ) : null}
          <pre className="mt-2 max-h-[70vh] overflow-auto text-[11px] leading-relaxed">
            {JSON.stringify(saved.normalized, null, 2)}
          </pre>
        </div>
        </div>
      </div>
    </div>
    </ConfirmProvider>
  );
}
