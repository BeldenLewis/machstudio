"use client";

/**
 * 공고 상세페이지 렌더 하니스 — **개발 환경 전용**(프로덕션 404).
 *
 * 공고는 로그인 뒤 대회 상세에서 만들고, 임베드는 외부 사이트에 붙는다. 둘 다 붙잡고
 * 디자인을 보기 어려우므로 렌더만 격리해 태운다 — form-preview-harness 와 같은 방식.
 *
 * 데이터는 K-EXPO LA 실제 공고 내용을 그대로 넣었다. 가짜 문구로는 줄바꿈·글자 수에서
 * 깨지는 것들이 안 보인다.
 */

import { useEffect, useRef, useState } from "react";
import { notFound } from "next/navigation";
import { mountNotice } from "@/lib/notice/mount";
import type { NoticeCompetition } from "@/lib/notice/types";

const COMPETITION: NoticeCompetition = {
  id: "harness",
  name: "K-POP Dance Blast: Stage",
  description: "Korea Expo LA 2026 시그니처 커버댄스 경연",
  theme: { accentColor: "#ffc94d" },
  recruitOpenAt: "2026-09-01T00:00:00+09:00",
  recruitCloseAt: "2026-09-21T23:59:59-07:00",
  phase: "recruiting",
  canApply: true,
  statusMessages: { upcoming: "접수 시작 전이에요.", closed: "접수가 마감되었어요." },
  rounds: [
    {
      kind: "prelim",
      name: "예선",
      publicWeight: 40,
      judgeWeight: 60,
      criteria: [],
    },
    {
      kind: "final",
      name: "본선",
      publicWeight: 50,
      judgeWeight: 50,
      criteria: [
        { name: "창의성 · 독창성", description: "원곡 무대와 구별되는 콘셉트·안무·스타일링", points: 20 },
        { name: "퍼포먼스 완성도", description: "정확도, 리듬, 기술 난이도", points: 20 },
        { name: "무대 장악력", description: "관객과의 교감, 표현력, 조명 아래의 존재감", points: 20 },
        { name: "싱크로 · 팀워크", description: "크루가 하나로 움직이는 정도", points: 20 },
        { name: "무대 활용 · 의상", description: "동선과 의상·소품의 어울림", points: 20 },
      ],
    },
  ],
};

const CONFIG = {
  noticePage: {
    enabled: true,
    colors: { lightBg: "#f5f3f0", darkBg: "#0a0a0f" },
    sectionBg: {
      hero: "dark", concept: "dark", snapshot: "dark", timeline: "dark", apply: "dark",
      eligibility: "dark", selection: "dark", criteria: "dark", prizes: "dark",
      countdown: "dark", faq: "light", sponsors: "dark",
    },
    hero: {
      media: null,
      brand: "K-EXPO LA 2026 · SIGNATURE PROGRAM",
      titleLines: ["Own", "the Stage."],
      subtitle:
        "K-pop 커버댄스 크루를 찾습니다. 영상을 제출하고, 온라인 투표를 통과해, LA 관객 앞에서 Stage Blast Champion 자리를 두고 겨루세요.",
      ctaLabel: "참가 신청하기",
      secondaryLabel: "전체 일정 보기",
      facts: [
        { label: "결선", value: "2026. 10. 24" },
        { label: "장소", value: "Korea Expo LA 메인 스테이지" },
        { label: "본선 진출", value: "8팀" },
        { label: "대상 상금", value: "$1,000" },
      ],
    },
    concept: {
      enabled: true,
      kicker: "The Concept",
      headline: "보는 K-POP이 아니라,",
      highlight: "하는 K-POP.",
      body:
        "관객석에서 무대 위로 자리를 옮기는 순간입니다. 공식 무대에서, 심사위원과 여러분을 보러 온 관객 앞에서 직접 퍼포먼스를 선보입니다.\n\nK-POP Dance Blast: Stage는 Korea Expo LA의 시그니처 커버댄스 경연입니다. 크루가 영상을 제출하고, 온라인 예선 투표를 거쳐, 가장 강한 8팀이 메인 스테이지에서 맞붙습니다.",
    },
    snapshot: {
      enabled: true,
      kicker: "Event Snapshot",
      title: "한눈에 보기",
      items: [
        { label: "형식", value: "커버댄스 경연", note: "" },
        { label: "진행", value: "신청 → 투표 → 무대", note: "" },
        { label: "결선 일시", value: "2026. 10. 24", note: "토요일 10:30 – 12:30" },
        { label: "본선 진출", value: "8팀", note: "" },
        { label: "배점", value: "심사 50% + 관객 50%", note: "" },
        { label: "심사단", value: "3인", note: "" },
      ],
    },
    timeline: {
      enabled: true,
      kicker: "Road to the Finals",
      title: "모집 일정",
      description: "공고부터 결선까지 6주 — 날짜를 표시해두세요.",
      items: [
        { date: "8월 25일", title: "모집 공고", description: "Korea Expo LA 채널에 공개됩니다.", emphasis: false },
        { date: "9월 1일 – 21일", title: "참가 접수", description: "팀 정보와 1분 퍼포먼스 영상을 제출합니다.", emphasis: true },
        { date: "9월 22일 – 30일", title: "온라인 예선 투표", description: "제출된 팀 프로필과 영상으로 공개 투표를 진행합니다.", emphasis: false },
        { date: "10월 2일", title: "본선 8팀 발표", description: "메인 스테이지에 오를 크루를 공개합니다.", emphasis: true },
        { date: "10월 2일 – 16일", title: "본선 준비", description: "음원·명단·무대 정보를 제출합니다.", emphasis: false },
        { date: "10월 24일", title: "결선", description: "라이브 퍼포먼스, 관객 투표, 시상식.", emphasis: true },
      ],
    },
    apply: {
      enabled: true,
      kicker: "Enter the Competition",
      title: "신청 방법",
      description: "한 번의 제출, 네 가지 준비물. 9월 21일 전까지 준비해주세요.",
      items: [
        { title: "팀 정보", items: ["공식 팀명", "팀 로고", "짧은 소개(30–50자) · 긴 소개(300–500자)"] },
        { title: "연락처 · SNS", items: ["대표자 이름, 연락처, 이메일", "팀 인스타그램 · 틱톡 · 유튜브"] },
        { title: "퍼포먼스 영상", items: ["1분 K-pop 커버댄스 영상", "선명한 음질, 크루 전원이 보이게"] },
        { title: "결선 참가 확인", items: ["10월 24일 LA 현장 참석 가능 여부", "촬영물의 홍보 활용 동의"] },
      ],
    },
    eligibility: {
      enabled: true,
      kicker: "Before You Apply",
      title: "참가 자격",
      items: [
        "만 14세 이상, 또는 보호자 동의서 제출",
        "4인 이상 팀 권장",
        "K-pop 커버댄스 퍼포먼스가 가능할 것",
        "10월 24일 LA 결선에 현장 참석 가능할 것",
        "제출 영상과 결선 촬영물의 홍보 활용에 동의",
        "음원 사용·의상·퍼포먼스 가이드라인 준수",
      ],
    },
    selection: {
      enabled: true,
      kicker: "Two Rounds",
      title: "선발 방식",
      source: "auto",
      rounds: [],
      footnote: "인기상은 별도로 집계합니다 — 결선 당일 관객 투표 100%이며, 1·2위와 중복 수상할 수 없습니다.",
    },
    criteria: {
      enabled: true,
      kicker: "",
      title: "심사 기준",
      description: "결선 당일 심사단이 보는 것.",
      source: "auto",
      items: [],
    },
    prizes: {
      enabled: true,
      kicker: "What's at Stake",
      title: "상금",
      items: [
        { rank: "1st Place", title: "Stage Blast Champion", description: "심사 + 관객 점수 1위", amount: "$1,000" },
        { rank: "2nd Place", title: "Stage Blast Runner-up", description: "심사 + 관객 점수 2위", amount: "$300" },
        { rank: "Fan Favorite", title: "인기상", description: "결선 당일 관객 투표 100%", amount: "$200" },
      ],
    },
    countdown: {
      enabled: true,
      kicker: "8 Crews. 1 Stage. One Blast.",
      title: "접수 마감까지",
      description: "먼저 본선 8팀에 들어야 합니다.",
      ctaLabel: "지금 신청하기",
    },
    faq: {
      enabled: true,
      kicker: "",
      title: "자주 묻는 질문",
      items: [
        { question: "팀 인원 제한이 있나요?", answer: "4인 이상을 권장하지만 상한은 없습니다. 무대 규모상 12인을 넘으면 사전에 협의해주세요." },
        { question: "예선 영상은 새로 찍어야 하나요?", answer: "기존 영상도 괜찮습니다. 다만 크루 전원이 보이고 음질이 선명해야 합니다." },
      ],
    },
    sponsors: {
      enabled: true,
      kicker: "",
      title: "주최 · 후원",
      items: [{ tier: "주최", name: "Korea Expo LA", logoUrl: "", url: "" }],
    },
  },
};

/** 히어로 배경 샘플 — 실제로는 운영자가 올린 이미지가 들어간다. */
const SAMPLE_HERO =
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1600&q=70";

type Mode = "dark" | "light" | "mixed";

/** ?mode=light|dark|mixed 로 전체 모드를, ?hero=on 으로 배경 이미지를 켠다. */
function buildConfig(mode: Mode, heroImage: boolean) {
  const np = CONFIG.noticePage;
  const keys = Object.keys(np.sectionBg);
  const sectionBg =
    mode === "mixed"
      ? np.sectionBg
      : Object.fromEntries(keys.map((key) => [key, mode]));
  return {
    noticePage: {
      ...np,
      sectionBg,
      hero: { ...np.hero, media: heroImage ? { type: "image", url: SAMPLE_HERO } : null },
    },
  };
}

export default function NoticeHarness() {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("dark");
  const [heroImage, setHeroImage] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const handle = mountNotice({
      mount: ref.current,
      competition: COMPETITION,
      config: buildConfig(mode, heroImage),
      embedded: false,
      isPreview: false,
      onApply: () => window.alert("신청 팝업 자리 — 하니스에서는 열지 않습니다."),
    });
    return () => handle.destroy();
  }, [mode, heroImage]);

  if (process.env.NODE_ENV === "production") notFound();

  const btn = (active: boolean): React.CSSProperties => ({
    padding: "7px 12px", border: 0, borderRadius: 8, cursor: "pointer",
    font: "inherit", fontSize: 12, fontWeight: 700,
    background: active ? "#7c3aed" : "rgba(128,128,140,.22)",
    color: active ? "#fff" : "inherit",
  });

  return (
    <>
      {/* 하니스 조작대 — 공고 위에 떠 있는다. 실제 화면에는 없다. */}
      <div
        style={{
          position: "fixed", zIndex: 99999, top: 12, right: 12, display: "flex", gap: 6,
          padding: 8, borderRadius: 12, background: "rgba(20,20,26,.92)", color: "#fff",
          boxShadow: "0 8px 28px rgba(0,0,0,.35)",
        }}
      >
        {(["dark", "light", "mixed"] as const).map((value) => (
          <button key={value} style={btn(mode === value)} onClick={() => setMode(value)}>
            {value === "dark" ? "전체 다크" : value === "light" ? "전체 라이트" : "섹션별"}
          </button>
        ))}
        <button style={btn(heroImage)} onClick={() => setHeroImage((v) => !v)}>
          히어로 배경
        </button>
      </div>
      <div ref={ref} />
    </>
  );
}
