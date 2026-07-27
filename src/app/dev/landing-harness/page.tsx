"use client";

/**
 * 랜딩 뷰 검증용 하니스 — **개발 환경 전용**(프로덕션 404).
 *
 * 랜딩은 실제 웨비나 + `landingPage.enabled` + 세션 데이터가 다 있어야 뜬다. 그래서 카드 크기·
 * 텍스트 위계·상세 팝업 같은 **눈으로 봐야 아는 것**을 확인하려면 DB 를 고치거나 로그인해야 했다.
 * mountLanding 은 payload 를 인자로 받는 순수 함수라, 목업 하나만 있으면 그대로 띄울 수 있다.
 *
 * 이 하니스가 답하는 질문:
 *   · 연사 카드에서 이름·회사가 읽히는 크기인가, '자세히 보기' 가 오른쪽 하단에 있는가
 *   · 카드를 누르면 팝업이 뜨고 그 안에 **로고**가 보이는가
 *   · 로고가 타임테이블과 팝업에서 **같은 크기**인가(webinar-logo.ts 규격)
 */

import { useEffect, useRef } from "react";
import { notFound } from "next/navigation";
import { mountLanding } from "@/lib/landing/mount";
import type { LandingWebinar } from "@/lib/landing/types";

/**
 * 로고는 **절대 http(s) URL** 이어야 한다 — h() 의 URL_ATTRS 가드가 src 를 safeHttpUrl 로
 * 통과시키는데 그 함수는 `new URL()` 파싱을 요구해서 data: URI 도 상대경로도 지운다.
 * 랜딩이 파트너 도메인에 직접 마운트되기 때문에 둔 방어라, 하니스가 규칙에 맞춰야 한다.
 * (실제 로고는 Supabase 스토리지의 절대 https URL 이라 이 조건을 이미 만족한다.)
 * 그래서 MOCK 을 모듈 스코프에 두지 못하고 마운트 시점에 origin 을 붙여 만든다.
 */
const mockWebinar = (origin: string): LandingWebinar => ({
  id: "harness",
  name: "2026 스마트테크 코리아 마케팅 웨비나",
  slug: "harness",
  description: "AI 마케팅 자동화의 최신 트렌드와, 전시·웨비나 리드를 매출로 잇는 실전 전략.",
  liveStartAt: "2026-08-20T10:00:00.000Z",
  theme: { accentColor: "#6d28d9" },
  status: "scheduled",
  canRegister: true,
  entryOpen: false,
  config: {
    landingPage: {
      enabled: true,
      titleLines: ["리드를 매출로", "잇는 웨비나 운영"],
      detailPopup: true,
      /** 새 섹션 — 머리글을 비워 기본 문구가 나오는지, 아이콘 유무가 섞였을 때를 함께 본다. */
      audience: {
        enabled: true,
        title: "",
        items: [
          { icon: "", title: "미국 시장 진출을 준비하는 브랜드 담당자", description: "전시 참가는 결정했지만 후속 세일즈 설계가 막막한 분" },
          { icon: "🎯", title: "전시·웨비나 리드를 매출로 잇고 싶은 마케터", description: "" },
          { icon: "", title: "B2B 아웃바운드를 처음 세팅하는 팀", description: "무엇부터 손대야 할지 순서를 잡고 싶은 분\n(줄바꿈도 그대로 나갑니다)" },
        ],
      },
      sessions: { enabled: true },
      timetable: { enabled: true },
      programs: { enabled: false, items: [] },
      highlights: { enabled: false, items: [] },
      faq: { enabled: false, items: [] },
    },
  },
  sessions: [
    {
      id: "s1", number: 1, type: "session",
      title: "AI 마케팅 자동화, 어디까지 왔나",
      speaker: "김지수", speakerCompany: "ACME Corp",
      speakerRole: "그로스 리드",
      speakerBio: "10년간 B2B SaaS 그로스를 담당했고, 웨비나·전시 리드 파이프라인을 설계했습니다.",
      speakerPhotoUrl: null,
      logoUrl: `${origin}/next.svg`,
      description: "실제로 돌아가는 자동화와 그렇지 않은 것을 사례로 가릅니다.",
      startAt: "2026-08-20T10:00:00.000Z", endAt: "2026-08-20T10:40:00.000Z",
    },
    {
      id: "s2", number: 2, type: "session",
      title: "전시 리드를 매출로 잇는 후속 설계",
      speaker: "박민준", speakerCompany: "Northwind Partners",
      speakerRole: "파트너",
      speakerBio: "전시·컨퍼런스 리드의 후속 시퀀스를 설계합니다.",
      speakerPhotoUrl: null,
      logoUrl: `${origin}/next.svg`,
      description: null,
      startAt: "2026-08-20T10:40:00.000Z", endAt: "2026-08-20T11:20:00.000Z",
    },
  ] as unknown as LandingWebinar["sessions"],
});

export default function LandingHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = mountLanding({
      mount: host,
      webinar: mockWebinar(window.location.origin),
      embedded: false,
      isPreview: true, // 부작용(추적·전송) 차단
      origin: window.location.origin,
    });
    return () => handle.destroy();
  }, []);

  return <div ref={hostRef} />;
}
