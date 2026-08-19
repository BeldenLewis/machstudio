/**
 * 대회 공고 상세페이지 설정.
 *
 * 웨비나 랜딩(LandingPageConfig)과 같은 규약을 따른다 — 섹션마다 enabled 토글, 섹션마다
 * 라이트/다크, 배경 키컬러 두 개에서 나머지 색을 파생. 같은 껍데기를 쓰므로 계약도 같아야
 * "한쪽에서 되던 게 다른 쪽에서 안 되는" 일이 안 생긴다.
 *
 * 저장 위치는 Competition.config.noticePage 다. 예전 블록 빌더(config.notice)는 지우지 않는다
 * — 이미 만든 대회의 내용이 사라지면 안 된다.
 */

/** 렌더 순서 그대로. 편집 UI 도 이 순서를 쓴다. */
export const NOTICE_SECTIONS = [
  { key: "concept", label: "개념", note: "이 대회가 무엇인지 한 문장으로" },
  { key: "snapshot", label: "한눈에 보기", note: "형식·일시·인원 같은 사실을 카드로" },
  { key: "timeline", label: "타임라인", note: "접수부터 결선까지 날짜" },
  { key: "apply", label: "신청 방법", note: "준비물을 번호 카드로" },
  { key: "eligibility", label: "자격 요건", note: "체크 목록" },
  { key: "selection", label: "선발 방식", note: "라운드별 반영 비율 막대" },
  { key: "criteria", label: "심사 기준", note: "항목과 배점" },
  { key: "prizes", label: "상금 · 시상", note: "1등은 자동으로 강조돼요" },
  { key: "countdown", label: "마감 카운트다운", note: "접수 마감까지 남은 시간" },
  { key: "faq", label: "자주 묻는 질문", note: "" },
  { key: "sponsors", label: "주최 · 후원", note: "로고는 어느 모드에서든 흰 판 위에 올라갑니다" },
] as const;

export type NoticeSectionKey = (typeof NOTICE_SECTIONS)[number]["key"];
export type NoticeSectionBg = "light" | "dark";
export type NoticeBgKey = NoticeSectionKey | "hero";
export type NoticeSectionBgMap = Record<NoticeBgKey, NoticeSectionBg>;

export interface NoticeHeroFact { label: string; value: string }
export interface NoticeStatItem { label: string; value: string; note: string }
/** emphasis: 그 줄의 점을 키컬러로 — 접수 마감·결선처럼 눈이 먼저 가야 하는 날. */
export interface NoticeTimelineItem { date: string; title: string; description: string; emphasis: boolean }
export interface NoticeStepItem { title: string; items: string[] }
export interface NoticeSelectionBar { label: string; percent: number }
export interface NoticeSelectionRound { title: string; note: string; bars: NoticeSelectionBar[] }
export interface NoticeCriterionItem { name: string; description: string; points: number }
export interface NoticePrizeItem { rank: string; title: string; description: string; amount: string }
export interface NoticeFaqItem { question: string; answer: string }
export interface NoticeSponsorItem { tier: string; name: string; logoUrl: string; url: string }

export type NoticeHeroMedia = { type: "image" | "video"; url: string } | null;

export interface NoticeHero {
  media: NoticeHeroMedia;
  /** 히어로 상단 작은 라벨 — 비우면 대회 이름 */
  brand: string;
  /** 대형 타이틀(줄 단위) — 두 번째 줄부터 키컬러가 된다 */
  titleLines: string[];
  subtitle: string;
  /** 주 버튼 — 신청 팝업을 연다 */
  ctaLabel: string;
  /**
   * 접수 전·마감 후에 버튼과 그 아래에 뜨는 문구.
   *
   * 이 자리는 원래 손댈 수 없었다 — 시스템이 "접수 시작 전" / "접수 시작 전이에요." 를
   * 넣었고, 영문 공고에서도 그대로 한글이 떴다. 대회마다 하고 싶은 말이 다른 자리라
   * (사전 등록 안내, 다음 회차 링크) 사전 기본값을 두되 덮어쓸 수 있게 연다.
   * 비우면 언어 사전의 기본값을 쓴다.
   */
  upcomingLabel: string;
  upcomingNote: string;
  closedLabel: string;
  closedNote: string;
  /** 보조 버튼 — 켜 둔 첫 섹션으로 스크롤. 비우면 안 그린다 */
  secondaryLabel: string;
  /** 히어로 하단 가로 팩트 — 결선일·장소·정원·상금 같은 것 */
  facts: NoticeHeroFact[];
}

/**
 * 심사 기준·선발 방식은 **machstudio 안에 이미 데이터가 있다**(심사단 탭의 항목·배점,
 * 투표 설정의 대중:심사 비율). auto 면 그 값을 끌어다 그린다 — 손으로 옮겨 적게 하면
 * 배점을 바꿨을 때 공고만 옛날 숫자로 남는다.
 */
export type NoticeSource = "auto" | "manual";

/**
 * 공고에 **시스템이 만들어 넣는 문구**의 언어.
 *
 * 운영자가 직접 쓴 글은 건드리지 않는다 — 여기서 바뀌는 건 우리가 생성하는 것뿐이다:
 * 선발 방식 막대의 "관람객 투표 / 심사단 점수", 라운드 설명, 카운트다운의 일·시간·분·초,
 * 신청 버튼 기본값. LA 처럼 영어 대회를 열면 설정에서 끌어온 값만 한글로 남아
 * 페이지 하나에 두 언어가 섞인다 — 실제로 그렇게 나왔다.
 *
 * 라운드 이름·심사 항목 이름은 **DB 에 있는 운영자의 글**이라 자동 번역하지 않는다.
 * 그 자리는 해당 섹션을 manual 로 돌리고 "설정값 불러오기" 로 복사해 고쳐 쓴다.
 */
export type NoticeLanguage = "ko" | "en";

export interface NoticePageConfig {
  enabled: boolean;
  language: NoticeLanguage;
  hero: NoticeHero;
  /**
   * 색.
   *
   * **키컬러는 여기 없다** — Competition.theme.accentColor 다. 그건 공고뿐 아니라 신청 폼·
   * 투표·결과 화면이 함께 쓰는 브랜드색이라, 공고만 따로 들고 있으면 같은 대회가 화면마다
   * 다른 제품처럼 보인다. 여기 두 색은 공고 전용 **덮어쓰기**이고, 비우면 키컬러를 따른다.
   *
   * - accentAlt : 글자 강조 자리(제목 둘째 줄·섹션 라벨·강조구)
   * - button    : 신청 버튼 등 눌리는 것
   */
  colors: { lightBg: string; darkBg: string; accentAlt: string; button: string };
  sectionBg: NoticeSectionBgMap;
  concept: { enabled: boolean; kicker: string; headline: string; highlight: string; body: string };
  snapshot: { enabled: boolean; kicker: string; title: string; items: NoticeStatItem[] };
  timeline: { enabled: boolean; kicker: string; title: string; description: string; items: NoticeTimelineItem[] };
  apply: { enabled: boolean; kicker: string; title: string; description: string; items: NoticeStepItem[] };
  eligibility: { enabled: boolean; kicker: string; title: string; items: string[] };
  selection: { enabled: boolean; kicker: string; title: string; source: NoticeSource; rounds: NoticeSelectionRound[]; footnote: string };
  criteria: { enabled: boolean; kicker: string; title: string; description: string; source: NoticeSource; items: NoticeCriterionItem[] };
  prizes: { enabled: boolean; kicker: string; title: string; items: NoticePrizeItem[] };
  countdown: { enabled: boolean; kicker: string; title: string; description: string; ctaLabel: string };
  faq: { enabled: boolean; kicker: string; title: string; items: NoticeFaqItem[] };
  sponsors: { enabled: boolean; kicker: string; title: string; items: NoticeSponsorItem[] };
}

/** 랜딩과 같은 기본 색 — 두 페이지가 같은 제품으로 보여야 한다. */
export const DEFAULT_NOTICE_COLORS = { lightBg: "#f6f8ff", darkBg: "#06080d" };

/** 기본은 전부 다크. 대회 공고는 무대·경연 성격이라 어두운 쪽이 기본값으로 맞다. */
export const DEFAULT_NOTICE_SECTION_BG: NoticeSectionBgMap = {
  hero: "dark", concept: "dark", snapshot: "dark", timeline: "dark", apply: "dark",
  eligibility: "dark", selection: "dark", criteria: "dark", prizes: "dark",
  countdown: "dark", faq: "dark", sponsors: "dark",
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const hex = (v: unknown, def: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def);
/** 0~100 정수. 막대 폭이라 범위를 벗어나면 화면이 깨진다. */
const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0);
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

export interface NormalizeNoticeOptions {
  /**
   * 어드민 편집용. 내용이 빈 행도 남긴다 —
   * 공개 렌더는 빈 행을 버리지만, 편집 중에 아직 안 쓴 행이 리마운트로 사라지면 안 된다.
   */
  keepEmptyRows?: boolean;
}

export function normalizeNoticePageConfig(config: unknown, opts?: NormalizeNoticeOptions): NoticePageConfig {
  const keep = opts?.keepEmptyRows === true;
  const c = obj(config);
  const np = obj(c.noticePage);

  const rawBg = obj(np.sectionBg);
  const bgOf = (key: NoticeBgKey): NoticeSectionBg =>
    rawBg[key] === "light" || rawBg[key] === "dark" ? (rawBg[key] as NoticeSectionBg) : DEFAULT_NOTICE_SECTION_BG[key];
  const sectionBg = { hero: bgOf("hero") } as NoticeSectionBgMap;
  for (const item of NOTICE_SECTIONS) sectionBg[item.key] = bgOf(item.key);

  const heroRaw = obj(np.hero);
  const mediaRaw = obj(heroRaw.media);
  const mediaUrl = str(mediaRaw.url).trim();
  const hero: NoticeHero = {
    media:
      mediaUrl && (mediaRaw.type === "image" || mediaRaw.type === "video")
        ? { type: mediaRaw.type, url: mediaUrl }
        : null,
    brand: str(heroRaw.brand),
    titleLines: arr(heroRaw.titleLines).map(str).filter((line) => keep || line.trim()),
    subtitle: str(heroRaw.subtitle),
    /* 비워 두면 build-model 이 언어에 맞는 기본값을 넣는다. 여기서 한글로 굳히면
       영어 공고에서 버튼만 한글로 남고 되돌릴 방법이 없다. */
    ctaLabel: str(heroRaw.ctaLabel),
    upcomingLabel: str(heroRaw.upcomingLabel),
    upcomingNote: str(heroRaw.upcomingNote),
    closedLabel: str(heroRaw.closedLabel),
    closedNote: str(heroRaw.closedNote),
    secondaryLabel: str(heroRaw.secondaryLabel),
    facts: arr(heroRaw.facts)
      .map((f) => ({ label: str(obj(f).label), value: str(obj(f).value) }))
      .filter((f) => keep || f.value.trim()),
  };

  const raw = (key: NoticeSectionKey) => obj(np[key]);
  const on = (key: NoticeSectionKey) => bool(raw(key).enabled, false);

  return {
    enabled: bool(np.enabled, false),
    language: np.language === "en" ? "en" : "ko",
    hero,
    colors: {
      lightBg: hex(obj(np.colors).lightBg, DEFAULT_NOTICE_COLORS.lightBg),
      darkBg: hex(obj(np.colors).darkBg, DEFAULT_NOTICE_COLORS.darkBg),
      // 빈 문자열 = "키컬러를 따른다". 기본값을 넣어 두면 키컬러를 바꿔도 여기가 안 따라온다.
      accentAlt: hex(obj(np.colors).accentAlt, ""),
      button: hex(obj(np.colors).button, ""),
    },
    sectionBg,

    concept: {
      enabled: on("concept"),
      kicker: str(raw("concept").kicker),
      headline: str(raw("concept").headline),
      highlight: str(raw("concept").highlight),
      body: str(raw("concept").body),
    },

    snapshot: {
      enabled: on("snapshot"),
      kicker: str(raw("snapshot").kicker),
      title: str(raw("snapshot").title),
      items: arr(raw("snapshot").items)
        .map((i) => ({ label: str(obj(i).label), value: str(obj(i).value), note: str(obj(i).note) }))
        .filter((i) => keep || i.value.trim()),
    },

    timeline: {
      enabled: on("timeline"),
      kicker: str(raw("timeline").kicker),
      title: str(raw("timeline").title),
      description: str(raw("timeline").description),
      items: arr(raw("timeline").items)
        .map((i) => ({
          date: str(obj(i).date),
          title: str(obj(i).title),
          description: str(obj(i).description),
          emphasis: bool(obj(i).emphasis, false),
        }))
        .filter((i) => keep || i.title.trim()),
    },

    apply: {
      enabled: on("apply"),
      kicker: str(raw("apply").kicker),
      title: str(raw("apply").title),
      description: str(raw("apply").description),
      items: arr(raw("apply").items)
        .map((i) => ({
          title: str(obj(i).title),
          items: arr(obj(i).items).map(str).filter((v) => keep || v.trim()),
        }))
        .filter((i) => keep || i.title.trim()),
    },

    eligibility: {
      enabled: on("eligibility"),
      kicker: str(raw("eligibility").kicker),
      title: str(raw("eligibility").title),
      items: arr(raw("eligibility").items).map(str).filter((v) => keep || v.trim()),
    },

    selection: {
      enabled: on("selection"),
      kicker: str(raw("selection").kicker),
      title: str(raw("selection").title),
      footnote: str(raw("selection").footnote),
      source: raw("selection").source === "manual" ? "manual" : "auto",
      rounds: arr(raw("selection").rounds)
        .map((round) => ({
          title: str(obj(round).title),
          note: str(obj(round).note),
          bars: arr(obj(round).bars)
            .map((b) => ({ label: str(obj(b).label), percent: pct(obj(b).percent) }))
            .filter((b) => keep || b.label.trim()),
        }))
        .filter((round) => keep || round.title.trim()),
    },

    criteria: {
      enabled: on("criteria"),
      kicker: str(raw("criteria").kicker),
      title: str(raw("criteria").title),
      description: str(raw("criteria").description),
      source: raw("criteria").source === "manual" ? "manual" : "auto",
      items: arr(raw("criteria").items)
        .map((i) => ({ name: str(obj(i).name), description: str(obj(i).description), points: int(obj(i).points) }))
        .filter((i) => keep || i.name.trim()),
    },

    prizes: {
      enabled: on("prizes"),
      kicker: str(raw("prizes").kicker),
      title: str(raw("prizes").title),
      items: arr(raw("prizes").items)
        .map((i) => ({
          rank: str(obj(i).rank),
          title: str(obj(i).title),
          description: str(obj(i).description),
          amount: str(obj(i).amount),
        }))
        .filter((i) => keep || i.title.trim()),
    },

    countdown: {
      enabled: on("countdown"),
      kicker: str(raw("countdown").kicker),
      title: str(raw("countdown").title),
      description: str(raw("countdown").description),
      ctaLabel: str(raw("countdown").ctaLabel),
    },

    faq: {
      enabled: on("faq"),
      kicker: str(raw("faq").kicker),
      title: str(raw("faq").title),
      items: arr(raw("faq").items)
        .map((i) => ({ question: str(obj(i).question), answer: str(obj(i).answer) }))
        .filter((i) => keep || i.question.trim()),
    },

    sponsors: {
      enabled: on("sponsors"),
      kicker: str(raw("sponsors").kicker),
      title: str(raw("sponsors").title),
      items: arr(raw("sponsors").items)
        .map((i) => ({
          tier: str(obj(i).tier),
          name: str(obj(i).name),
          logoUrl: str(obj(i).logoUrl),
          url: str(obj(i).url),
        }))
        .filter((i) => keep || i.name.trim()),
    },
  };
}
