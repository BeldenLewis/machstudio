"use client";

/**
 * 프리미티브 하니스 — **개발 환경 전용**.
 *
 * 만들기 탭은 로그인 뒤라 자동화로 열 수 없다. 그런데 리디자인의 핵심 질문("면 경계가
 * 라이트/다크 양쪽에서 실제로 보이는가")은 눈이나 픽셀 측정 없이는 답할 수 없다.
 * 그래서 프리미티브만 격리해 띄우고, 같은 화면에 **라이트·다크를 나란히** 놓는다.
 *
 * 특히 확인해야 하는 조합(실측에서 위험하다고 나온 것들):
 *   · Surface level 1 이 페이지 배경 위에서 보이는가 (라이트는 --card == --background)
 *   · Surface level 2 가 level 1 **안**에서 보이는가
 *   · 다크에서 오버레이가 카드 위에서 보이는가 (--popover == --card 라 색조로는 1.00:1)
 *   · 세그먼트 선택 칸이 두 테마에서 '솟음' 으로 읽히는가 (다크에서 홈처럼 보이면 실패)
 *
 * 프로덕션에서는 404 — proxy 가 /dev/ 를 통과시키지 않고 이 페이지도 notFound() 로 막는다.
 */

import { useState } from "react";
import { notFound } from "next/navigation";
import { Surface, Field, FieldArea, FieldSelect, Btn, Chip, Segmented, R, FINISH, SELECTED } from "@/components/ui/primitives";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** 한 테마 안의 전체 카탈로그. 라이트·다크 컨테이너가 각각 이걸 렌더한다. */
function Catalog({ tag }: { tag: string }) {
  const [seg, setSeg] = useState<"waiting" | "entry" | "live" | "ended">("live");

  return (
    <div className="space-y-5 p-5" data-testid={`catalog-${tag}`}>
      <Row label="Surface level 1 — 페이지 위">
        <Surface className="p-4" data-testid={`s1-${tag}`}>
          <p className="text-sm">level 1 (bg-card + finish-1)</p>
          <p className="mt-1 text-xs text-muted-foreground">라이트에서 --card 는 배경과 같은 색이라 헤어라인·그림자가 경계를 만든다.</p>

          <Surface level={2} radius="surface" className="mt-3 p-3" data-testid={`s2-${tag}`}>
            <p className="text-xs">level 2 (bg-secondary + finish-2) — 카드 안의 행</p>
          </Surface>
        </Surface>
      </Row>

      <Row label="입력 — 선언 1곳">
        <div className="space-y-2">
          <Field placeholder="Field — 기본" data-testid={`field-${tag}`} />
          <Field placeholder="Field — invalid" invalid />
          <FieldArea rows={2} placeholder="FieldArea" />
          <FieldSelect defaultValue="a">
            <option value="a">FieldSelect</option>
            <option value="b">다른 값</option>
          </FieldSelect>
        </div>
      </Row>

      <Row label="버튼">
        <div className="flex flex-wrap gap-2">
          <Btn tone="key" data-testid={`btn-key-${tag}`}>키 액션</Btn>
          <Btn tone="quiet">보조</Btn>
          <Btn tone="danger">삭제</Btn>
          <Btn tone="ghost">텍스트</Btn>
        </div>
      </Row>

      <Row label="칩 (rounded-full 축)">
        <div className="flex flex-wrap gap-1.5">
          <Chip>중립</Chip>
          <Chip tone="key">키</Chip>
          <Chip tone="warn">확인 3건</Chip>
          <Chip tone="ok">저장됨</Chip>
        </div>
      </Row>

      <Row label="세그먼트 — 선택 칸이 '솟음' 으로 읽혀야 한다">
        <Segmented
          label="시청 화면 상태"
          value={seg}
          onChange={setSeg}
          options={[
            { value: "waiting", label: "대기" },
            { value: "entry", label: "입장" },
            { value: "live", label: "라이브" },
            { value: "ended", label: "종료" },
          ]}
        />
      </Row>

      <Row label="오버레이 — 카드 위 (다크에서 --popover == --card)">
        <Surface className="p-4">
          <div className={`bg-card p-3 ${FINISH.overlay} ${R.panel}`} data-testid={`overlay-${tag}`}>
            <p className="text-xs">팝오버·모달 — finish-overlay</p>
          </div>
        </Surface>
      </Row>

      {/**
       * 레일 위의 선택 항목 — 여기서 색조 사다리가 고갈된다는 걸 실측으로 확인한 자리다.
       * 처음엔 bg-card(level 1)를 bg-secondary 레일 위에 얹었는데 명도 방향이 테마마다 뒤집혔다:
       * 라이트 L* 96.52 → 100(솟음), 다크 15.20 → 7.78(파임). 다크에서 레일보다 밝은 면이
       * 팔레트에 없다. 그래서 선택은 승격이 아니라 키 컬러 틴트(SELECTED)로 말한다.
       */}
      <Row label="레일 위의 선택 항목 — 승격이 아니라 키 컬러로">
        <div className={`space-y-1 bg-secondary p-2 ${FINISH.s2} ${R.panel}`} data-testid={`rail-${tag}`}>
          <div className={`px-3 py-2 text-sm ${SELECTED} ${R.surface}`} data-testid={`rail-active-${tag}`}>
            원본 정보 <span className="text-muted-foreground">— 활성</span>
          </div>
          <div className="px-3 py-2 text-sm text-muted-foreground">랜딩 페이지</div>
          <div className="px-3 py-2 text-sm text-muted-foreground">등록</div>
        </div>
      </Row>

      {/* 포커스 소유권 — 전역 규칙이 input 을 포함하게 되면서, 크롬을 가진 행 안의 맨입력은
          링이 두 겹으로 그려졌다. [data-focus-shell] 이 소유권을 행으로 넘긴다.
          중첩(행 ⊂ 카드)에서 바깥이 양보하는지도 같이 본다. */}
      <Row label="포커스 껍데기 — 링은 행에 한 겹만">
        <div data-focus-shell className={`bg-card p-3 ${FINISH.s1} ${R.panel}`} data-testid={`shell-outer-${tag}`}>
          <p className="mb-2 text-[11px] text-muted-foreground">바깥 껍데기(카드)</p>
          <div
            data-focus-shell
            className={`flex items-center gap-2 bg-secondary px-2.5 ${FINISH.s2} ${R.control}`}
            data-testid={`shell-inner-${tag}`}
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-muted-foreground/30" />
            <input
              data-testid={`shell-input-${tag}`}
              placeholder="맨입력 — 자기 아웃라인은 꺼져야 한다"
              className="min-w-0 flex-1 bg-transparent py-2 text-[13px] outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        </div>
      </Row>

      <Row label="반경 3단">
        <div className="flex flex-wrap items-end gap-2">
          {(["control", "surface", "panel"] as const).map((k) => (
            <div key={k} className={`bg-secondary px-3 py-2 text-[11px] ${FINISH.s2} ${R[k]}`}>
              {k} · {R[k]}
            </div>
          ))}
          <div className={"rounded-full bg-secondary px-3 py-2 text-[11px] " + FINISH.s2}>full · 별개 축</div>
        </div>
      </Row>
    </div>
  );
}

export default function PrimitivesHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-5 py-4">
        <h1 className="text-base font-semibold">프리미티브 하니스</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          개발 전용. 왼쪽 라이트 · 오른쪽 다크를 나란히 두고 <b>면 경계가 양쪽에서 보이는지</b> 확인한다.
          이 팔레트에는 3:1 을 넘는 면 경계가 없어서(다크 카드 vs 배경 1.10:1) 헤어라인을 그림자 안에 넣었다.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="bg-background">
          <p className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">라이트</p>
          <Catalog tag="light" />
        </div>
        {/* .dark 를 이 서브트리에만 걸어 같은 페이지에서 두 테마를 비교한다 */}
        <div className="dark border-t border-border bg-background text-foreground lg:border-l lg:border-t-0">
          <p className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">다크</p>
          <Catalog tag="dark" />
        </div>
      </div>
    </div>
  );
}
