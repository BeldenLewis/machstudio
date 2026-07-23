"use client";

// 랜딩 상세페이지(공개) — 외부 사이트(아임웹 등) iframe 임베드가 1차 사용처.
// - 콘텐츠는 웨비나 데이터 + config.landingPage 에서만 파생(만들기 → 랜딩 페이지에서 편집).
// - 임베드는 "높이 자동조절" 방식이라 iframe 내부 스크롤이 없다 → 스크롤 연출은 전부
//   IntersectionObserver 로 구현한다(iframe 안에서도 최상위 뷰포트를 기준으로 동작).
// - 100svh 는 auto-height iframe 안에서 문서 전체 높이가 되어 무한 성장 루프를 만든다 →
//   히어로 높이는 --lnd-vh 변수(임베드 스니펫이 postMessage 로 호스트 뷰포트를 전달)로 잡는다.
// - 디자인은 다크 에디토리얼 고정 테마(의도된 단일 테마), 키컬러만 theme.accentColor 에서 파생.

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatKst } from "@/lib/datetime";
import { normalizeLandingPageConfig, type LandingPageConfig } from "@/lib/webinar-config";

interface LandingSession {
  id: string;
  number: number;
  type?: string;
  title: string;
  speaker: string | null;
  speakerPhotoUrl?: string | null;
  description?: string | null;
  startTime: string;
  endTime: string;
}

interface LandingWebinar {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  liveStartAt: string;
  theme: Record<string, string>;
  config: Record<string, unknown>;
  sessions: LandingSession[];
}

const SAFE_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// 키컬러 위 텍스트 — 브랜드 요청으로 흰색 기본(라이브 페이지의 밝은 버튼 인상과 통일).
// 노랑·연회색처럼 아주 밝은 키컬러에서만 안전장치로 진한 글자(명도 0.78 이상).
function onPrimaryFor(accent: string): string {
  let hex = accent.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum >= 0.78 ? "#1a1a1f" : "#ffffff";
}

const TOC_DEF = [
  { id: "lnd-about", label: "About" },
  { id: "lnd-sessions", label: "Sessions" },
  { id: "lnd-timetable", label: "Time Table" },
  { id: "lnd-programs", label: "Programs" },
  { id: "lnd-highlights", label: "Highlights" },
  { id: "lnd-join", label: "Join" },
  { id: "lnd-faq", label: "FAQ" },
] as const;

export default function WebinarLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [webinar, setWebinar] = useState<LandingWebinar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEmbedded(typeof window !== "undefined" && window.self !== window.top);
    setIsPreview(typeof window !== "undefined" && new URLSearchParams(window.location.search).has("preview"));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/webinar/${slug}/info`);
        const data = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !data?.webinar) {
          setError(data?.error ?? "웨비나를 찾을 수 없어요");
          return;
        }
        setWebinar(data.webinar as LandingWebinar);
      } catch {
        if (alive) setError("불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (webinar?.name) document.title = `${webinar.name} — 사전 등록`;
  }, [webinar?.name]);

  // 임베드: 문서 높이를 부모로 전송(민감정보 없음) + 호스트 뷰포트 높이 수신(--lnd-vh)
  useEffect(() => {
    if (typeof window === "undefined" || window.self === window.top) return;
    let raf = 0;
    const post = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        window.parent.postMessage(
          { type: "machstudio:landing-height", slug, height: document.documentElement.scrollHeight },
          "*",
        );
      });
    };
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    ro.observe(document.body);
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; vh?: number } | null;
      if (d?.type === "machstudio:host-viewport" && typeof d.vh === "number" && wrapRef.current) {
        wrapRef.current.style.setProperty("--lnd-vh", `${Math.max(480, Math.min(1400, Math.round(d.vh)))}px`);
        post();
      }
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("load", post);
    post();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("message", onMsg);
      window.removeEventListener("load", post);
    };
  }, [slug, webinar]);

  if (error) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: "#06080d", color: "#abb5c7", fontFamily: "Pretendard, sans-serif", padding: 24, textAlign: "center" }}>
        {error}
      </div>
    );
  }
  if (!webinar) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: "#06080d" }}>
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#abb5c7" }} />
      </div>
    );
  }
  return <LandingContent webinar={webinar} embedded={embedded} isPreview={isPreview} wrapRef={wrapRef} />;
}

function LandingContent({
  webinar,
  embedded,
  isPreview,
  wrapRef,
}: {
  webinar: LandingWebinar;
  embedded: boolean;
  isPreview: boolean;
  wrapRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const lp = useMemo(() => normalizeLandingPageConfig(webinar.config), [webinar.config]);

  const accent = SAFE_HEX.test(String(webinar.theme?.accentColor ?? "")) ? String(webinar.theme.accentColor) : "#8b5cf6";
  const onPrimary = useMemo(() => onPrimaryFor(accent), [accent]);

  const brand = lp.brand.trim() || webinar.name;
  const titleLines = lp.titleLines.length ? lp.titleLines : [webinar.name];
  const subtitle = lp.subtitle.trim() || (webinar.description ?? "").split("\n")[0] || "";
  const dateStr = `${formatKst(webinar.liveStartAt, { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })} KST`;
  const registerUrl = `/webinar/${webinar.slug}/live?view=signup`;

  const sessionCards = lp.sessions.enabled ? webinar.sessions.filter((s) => (s.type ?? "session") === "session") : [];
  const timetableRows = lp.timetable.enabled ? webinar.sessions : [];
  const introTitle = lp.intro.title.trim() || subtitle;
  // 본문 기본값: 설명에서 제목으로 쓰인 첫 줄은 빼고 — 같은 문장이 제목·본문에 두 번 나오지 않게
  const descLines = (webinar.description ?? "").split("\n");
  const introBodyDefault = (descLines[0]?.trim() === introTitle.trim() ? descLines.slice(1) : descLines).join("\n").trim();
  const introBody = lp.intro.body.trim() || introBodyDefault;
  const showIntro = lp.intro.enabled && Boolean(introTitle || introBody);
  const showPrograms = lp.programs.enabled && lp.programs.items.length > 0;
  const showHighlights = lp.highlights.enabled && lp.highlights.items.length > 0;
  const showJoin = lp.join.enabled && lp.join.steps.length > 0;
  const showFaq = lp.faq.enabled && lp.faq.items.length > 0;

  const visible: Record<string, boolean> = {
    "lnd-about": showIntro,
    "lnd-sessions": sessionCards.length > 0,
    "lnd-timetable": timetableRows.length > 0,
    "lnd-programs": showPrograms,
    "lnd-highlights": showHighlights,
    "lnd-join": showJoin,
    "lnd-faq": showFaq,
  };
  const tocItems = TOC_DEF.filter((t) => visible[t.id]);

  const [activeToc, setActiveToc] = useState<string | null>(null);
  const faqCategories = useMemo(() => {
    const seen: string[] = [];
    for (const item of lp.faq.items) if (!seen.includes(item.category)) seen.push(item.category);
    return seen;
  }, [lp.faq.items]);
  const [faqCategory, setFaqCategory] = useState<string | null>(null);
  const activeFaqCategory = faqCategory && faqCategories.includes(faqCategory) ? faqCategory : faqCategories[0];

  // 스크롤 리빌 — transform 만 쓰므로 JS 미실행/미지원에서도 콘텐츠는 보인다
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(".rv"));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // 섹션 구성이 바뀌면(편집 미리보기) 새 .rv 도 관찰해야 한다
  }, [wrapRef, lp, webinar.sessions.length]);

  // 세션~타임테이블 구간 키컬러 배경 — IO 중앙 밴드(임베드 iframe 에서도 최상위 뷰포트 기준으로 동작)
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const zones = ["lnd-sessions", "lnd-timetable"]
      .map((id) => root.querySelector<HTMLElement>(`#${id}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!zones.length || !("IntersectionObserver" in window)) return;
    const active = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) active.add(entry.target);
          else active.delete(entry.target);
        });
        root.classList.toggle("on-accent", active.size > 0);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    zones.forEach((zone) => io.observe(zone));
    return () => io.disconnect();
  }, [wrapRef, lp.sessions.enabled, lp.timetable.enabled, webinar.sessions.length]);

  // 왼쪽 목차 스크롤 스파이(임베드에선 목차 자체를 숨김)
  useEffect(() => {
    const root = wrapRef.current;
    if (!root || embedded || !("IntersectionObserver" in window)) return;
    const sections = tocItems
      .map((t) => root.querySelector<HTMLElement>(`#${t.id}`))
      .filter((el): el is HTMLElement => Boolean(el));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveToc(entry.target.id);
        });
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    sections.forEach((section) => io.observe(section));
    return () => io.disconnect();
  }, [wrapRef, embedded, tocItems]);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  if (!lp.enabled && !isPreview) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: "#06080d", color: "#abb5c7", fontFamily: "Pretendard, sans-serif", padding: 24, textAlign: "center" }}>
        아직 공개되지 않은 페이지예요.
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`lnd${embedded ? " embedded" : ""}`}
      style={{ "--primary": accent, "--on-primary": onPrimary } as React.CSSProperties}
      lang="ko"
    >
      {/* Pretendard 웹폰트 — 뷰어 PC에 미설치여도 랜딩은 항상 Pretendard로(React가 head로 hoist·dedupe) */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
      />
      <style>{LANDING_CSS}</style>

      {!lp.enabled && isPreview && <div className="preview-badge">비공개 상태 · 미리보기</div>}

      {!embedded && tocItems.length > 1 && (
        <nav className="toc" aria-label="섹션 목차">
          {tocItems.map((item) => (
            <a
              key={item.id}
              className="toc-link"
              href={`#${item.id}`}
              aria-current={activeToc === item.id ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(item.id);
              }}
            >
              <span className="toc-mark" aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      )}

      <main>
        {/* HERO */}
        <section className="hero" aria-label="웨비나 소개">
          <div className={`hero-media${lp.heroMedia ? " has-media" : ""}`} aria-hidden="true">
            {lp.heroMedia?.type === "video" ? (
              <video src={lp.heroMedia.url} autoPlay muted loop playsInline />
            ) : lp.heroMedia ? (
              // eslint-disable-next-line @next/next/no-img-element -- 외부 임의 호스트 이미지(어드민 입력 URL)
              <img src={lp.heroMedia.url} alt="" loading="eager" />
            ) : null}
          </div>
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="eyebrow">{brand}</p>
              <h1>
                {titleLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h1>
              {subtitle && <p className="hero-subtitle">{subtitle}</p>}
            </div>
            <p className="hero-meta">
              {dateStr}
              {"\n"}
              {lp.venue}
            </p>
            <a
              className="hero-cta"
              href={registerUrl}
              target={embedded ? "_blank" : undefined}
              rel={embedded ? "noopener" : undefined}
            >
              <span>{lp.ctaLabel}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </section>

        {/* ABOUT */}
        {showIntro && (
          <section className="intro" id="lnd-about" aria-labelledby="lnd-about-title">
            <div className="intro-copy rv">
              <h2 id="lnd-about-title">{introTitle}</h2>
              {introBody && <p>{introBody}</p>}
            </div>
            <span className="scroll-cue" aria-hidden="true" />
          </section>
        )}

        {/* SESSIONS + TIMETABLE — 키컬러 전환 구간 */}
        {sessionCards.length > 0 && (
          <section className="section accent-zone" id="lnd-sessions" aria-labelledby="lnd-sessions-title">
            <h2 className="section-title rv" id="lnd-sessions-title">
              Sessions
            </h2>
            <div className="session-cards rv">
              {sessionCards.map((session) => (
                <article className="session-card" key={session.id}>
                  {session.speakerPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 세션 연사 사진(어드민 업로드 URL)
                    <img className="session-photo" src={session.speakerPhotoUrl} alt="" loading="lazy" />
                  ) : null}
                  <div className="session-card-body">
                    <span className="session-time">
                      {session.startTime}–{session.endTime}
                    </span>
                    <h3>{session.title}</h3>
                    <div className="speaker">{session.speaker && <b>{session.speaker}</b>}</div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {timetableRows.length > 0 && (
          <section className="section accent-zone" id="lnd-timetable" aria-labelledby="lnd-timetable-title">
            <h2 className="section-title rv" id="lnd-timetable-title">
              Time Table
            </h2>
            <ul className="schedule rv">
              {timetableRows.map((row) => {
                const type = row.type ?? "session";
                return (
                  <li className={`schedule-row${type === "break" ? " is-break" : ""}`} key={row.id}>
                    <div className="schedule-time">
                      {row.startTime}–{row.endTime}
                    </div>
                    <div className="schedule-content">
                      <span className="schedule-name">
                        {row.title}
                        {type === "qa" && <span className="tag">Live Q&amp;A</span>}
                      </span>
                      {type === "session" && row.speaker && <span className="schedule-speaker">{row.speaker}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="dark-zone">
          {showPrograms && (
            <section className="section" id="lnd-programs" aria-labelledby="lnd-programs-title">
              <h2 className="section-title rv" id="lnd-programs-title">
                Programs
              </h2>
              <div className="program-grid rv">
                {lp.programs.items.map((item, index) => (
                  <article className="program-card" key={index}>
                    <div className="program-heading">
                      {item.icon.trim() && (
                        <span className="program-icon" aria-hidden="true">
                          {item.icon}
                        </span>
                      )}
                      <h3>{item.title}</h3>
                    </div>
                    {item.description && <p>{item.description}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {showHighlights && (
            <section className="section" id="lnd-highlights" aria-labelledby="lnd-highlights-title">
              <h2 className="section-title rv" id="lnd-highlights-title">
                Highlights
              </h2>
              <div className="benefit-grid rv">
                {lp.highlights.items.map((item, index) => (
                  <article className="benefit-card" key={index}>
                    <span className="benefit-number">{String(index + 1).padStart(2, "0")}</span>
                    <h3>{item.title}</h3>
                    {item.description && <p>{item.description}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {showJoin && (
            <section className="section" id="lnd-join" aria-labelledby="lnd-join-title">
              <h2 className="section-title rv" id="lnd-join-title">
                How to Join
              </h2>
              <div className="join-grid rv">
                {lp.join.steps.map((step, index) => (
                  <article className="join-step" key={index}>
                    <span className="join-k">Step {index + 1}</span>
                    <h3>{step.title}</h3>
                    {step.description && <p>{step.description}</p>}
                  </article>
                ))}
              </div>
              <p className="deadline rv">
                <b>{dateStr}</b> 라이브 시작 · 사전 등록 후 입장 안내를 보내드려요
              </p>
            </section>
          )}

          {showFaq && (
            <section className="section" id="lnd-faq" aria-labelledby="lnd-faq-title">
              <h2 className="section-title rv" id="lnd-faq-title">
                FAQ
              </h2>
              {faqCategories.length > 1 && (
                <div className="faq-tabs rv" role="group" aria-label="FAQ 카테고리">
                  {faqCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className="faq-tab"
                      aria-pressed={category === activeFaqCategory}
                      onClick={() => setFaqCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
              <div className="faq-list rv">
                {lp.faq.items
                  .filter((item) => item.category === activeFaqCategory)
                  .map((item, index) => (
                    <details className="faq-item" key={`${activeFaqCategory}-${index}`} open={index === 0}>
                      <summary>{item.question}</summary>
                      <p>{item.answer}</p>
                    </details>
                  ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

// v3 확정 디자인 이식 — .lnd 스코프, 다크 에디토리얼 고정 테마(키컬러만 --primary 주입)
const LANDING_CSS = `
.lnd {
  --ink: #06080d;
  --ink-soft: #0d131d;
  --panel: #171d2a;
  --paper: #f6f8ff;
  --muted: #abb5c7;
  --line: rgba(255, 255, 255, .12);
  --primary-bright: color-mix(in srgb, var(--primary) 76%, #ffffff);
  --primary-soft: color-mix(in srgb, var(--primary) 70%, #05060a);
  --primary-ink: color-mix(in srgb, var(--primary) 52%, #050403);
  --max: 960px;
  --shadow: 0 26px 80px rgba(0, 6, 24, .38);
  --sans: "Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  min-height: 100%;
  background: var(--ink);
  color: var(--paper);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  transition: background-color .8s ease;
}
.lnd.on-accent { background: var(--primary); }
.lnd *, .lnd *::before, .lnd *::after { box-sizing: border-box; margin: 0; padding: 0; }
.lnd a { color: inherit; text-decoration: none; }
.lnd button { font: inherit; color: inherit; }
.lnd ::selection { background: var(--primary); color: var(--on-primary); }
.lnd :focus-visible { outline: 3px solid var(--primary-bright); outline-offset: 4px; }

.lnd .preview-badge {
  position: fixed; left: 12px; top: 12px; z-index: 200;
  padding: 6px 12px; border-radius: 999px;
  background: rgba(255, 255, 255, .92); color: #111827;
  font-size: 12px; font-weight: 800;
}

/* ── 왼쪽 세로 목차 — 넓은 화면 전용(임베드에선 미표시) ── */
.lnd .toc {
  position: fixed; left: 24px; top: 50%; transform: translateY(-50%); z-index: 90;
  display: none; flex-direction: column; gap: 2px;
}
@media (min-width: 1280px) { .lnd .toc { display: flex; } }
.lnd .toc-link {
  display: flex; align-items: center; gap: 11px; min-height: 30px;
  color: var(--muted); font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase;
  transition: color .4s ease;
}
.lnd .toc-mark {
  flex: 0 0 auto; width: 16px; height: 2px; background: currentColor; opacity: .5;
  transition: width .25s ease, opacity .25s ease, background .4s ease;
}
.lnd .toc-link:hover { color: var(--paper); }
.lnd .toc-link[aria-current="true"] { color: var(--primary-bright); }
.lnd .toc-link[aria-current="true"] .toc-mark { width: 30px; opacity: 1; background: var(--primary-bright); }
.lnd.on-accent .toc-link { color: color-mix(in srgb, var(--on-primary) 58%, transparent); }
.lnd.on-accent .toc-link:hover,
.lnd.on-accent .toc-link[aria-current="true"] { color: var(--on-primary); }
.lnd.on-accent .toc-link[aria-current="true"] .toc-mark { background: var(--on-primary); }

/* ── 히어로 — 임베드에선 호스트 뷰포트 높이(--lnd-vh)를 사용 ── */
.lnd .hero {
  position: relative;
  min-height: 100svh;
  display: grid; place-items: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 45%, rgba(7, 12, 26, .15) 0 20%, transparent 21%),
    linear-gradient(180deg, #05070c 0%, #05070d 100%);
}
.lnd.embedded .hero { min-height: var(--lnd-vh, 720px); }
.lnd .hero::before,
.lnd .hero::after {
  content: ""; position: absolute; inset: 50% auto auto 50%;
  transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none;
}
.lnd .hero::before {
  width: min(112vw, 1220px); aspect-ratio: 1;
  background: radial-gradient(circle,
    transparent 0 34%,
    color-mix(in srgb, var(--primary) 22%, transparent) 35%,
    var(--primary-bright) 44%,
    var(--primary-soft) 51%,
    color-mix(in srgb, var(--primary-soft) 62%, transparent) 59%,
    transparent 69%);
  filter: saturate(1.15); opacity: .92;
}
.lnd .hero::after {
  width: min(55vw, 590px); aspect-ratio: 1;
  background: radial-gradient(circle at 50% 45%, #05070b 0 56%, #02040a 72%);
  box-shadow: 0 0 100px rgba(0, 0, 0, .8);
}
.lnd .hero-media { position: absolute; inset: 0; z-index: 1; overflow: hidden; }
.lnd .hero-media img, .lnd .hero-media video { width: 100%; height: 100%; object-fit: cover; }
.lnd .hero-media.has-media::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(4, 6, 11, .5), rgba(4, 6, 11, .82));
}
.lnd .hero-inner {
  position: relative; z-index: 2; align-self: stretch; justify-self: center;
  width: min(100% - 40px, 980px);
  display: grid; place-items: center;
  padding: 96px 0 clamp(40px, 6vh, 76px);
}
.lnd .hero-copy { text-align: center; }
.lnd .eyebrow {
  margin: 0 0 6px;
  font-size: clamp(15px, 1.8vw, 22px); font-weight: 900; letter-spacing: -.03em;
  color: var(--primary-bright);
}
.lnd .hero h1 {
  font-size: clamp(44px, 7vw, 92px); font-weight: 900; letter-spacing: -.055em;
  line-height: .98; text-transform: uppercase; text-wrap: balance; word-break: keep-all;
}
.lnd .hero h1 span { display: block; }
.lnd .hero-subtitle {
  margin: 24px 0 0;
  font-size: clamp(17px, 2.3vw, 30px); font-weight: 800; letter-spacing: -.035em; word-break: keep-all;
}
.lnd .hero-meta {
  position: absolute; left: 0; bottom: 54px;
  color: #fff; font-size: clamp(16px, 2vw, 21px); font-weight: 700; line-height: 1.5;
  letter-spacing: -.01em; white-space: pre-line; font-variant-numeric: tabular-nums;
}
.lnd .hero-cta {
  position: absolute; right: 0; bottom: 48px;
  min-width: 210px; min-height: 58px;
  display: inline-flex; align-items: center; justify-content: space-between; gap: 20px;
  padding: 0 24px; border-radius: 999px;
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: 0 16px 34px color-mix(in srgb, var(--primary) 34%, transparent);
  font-weight: 850;
  transition: transform .2s ease, box-shadow .2s ease;
}
.lnd .hero-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 42px color-mix(in srgb, var(--primary) 46%, transparent);
}
.lnd .hero-cta svg { width: 23px; height: 23px; flex: 0 0 auto; }

/* ── ABOUT ── */
.lnd .intro {
  position: relative; min-height: 560px;
  display: grid; place-items: center;
  padding: 100px 24px; background: #000; text-align: center;
}
.lnd .intro-copy { max-width: 760px; }
.lnd .intro h2 {
  font-size: clamp(28px, 4vw, 48px); font-weight: 900; line-height: 1.28; letter-spacing: -.04em;
  white-space: pre-line; text-wrap: balance; word-break: keep-all;
}
.lnd .intro p {
  margin: 44px auto 0; color: #c3cad6;
  font-size: clamp(15px, 1.8vw, 21px); line-height: 1.85; letter-spacing: -.02em;
  white-space: pre-line; word-break: keep-all;
}
.lnd .scroll-cue {
  position: absolute; left: 50%; bottom: 44px;
  width: 22px; height: 22px;
  border-right: 2px solid rgba(255, 255, 255, .6); border-bottom: 2px solid rgba(255, 255, 255, .6);
  transform: translateX(-50%) rotate(45deg);
}

/* ── 섹션 공통 ── */
.lnd .section {
  width: min(100% - 36px, var(--max));
  margin: 0 auto;
  padding: clamp(92px, 12vw, 150px) 0;
}
.lnd .section-title {
  margin: 0 0 clamp(42px, 6vw, 70px);
  text-align: center;
  font-size: clamp(30px, 4vw, 44px); font-weight: 900; line-height: 1; letter-spacing: -.04em; text-transform: uppercase;
}
.lnd .accent-zone .section-title { transition: color .8s ease; }
.lnd.on-accent .accent-zone .section-title { color: var(--on-primary); }

/* ── 세션 카드 ── */
.lnd .session-cards { display: flex; flex-wrap: wrap; justify-content: center; gap: 18px; }
.lnd .session-card {
  position: relative;
  width: min(100%, 286px); aspect-ratio: .72;
  overflow: hidden; border-radius: 9px;
  background: linear-gradient(160deg, #1b2130, #12161f 60%, #0c0f16);
  box-shadow: var(--shadow);
  transform: translateZ(0);
}
.lnd .session-photo { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; object-fit: cover; }
.lnd .session-card::after {
  content: ""; position: absolute; inset: 0; z-index: 1;
  background: linear-gradient(180deg, transparent 26%, rgba(3, 7, 14, .12) 44%, rgba(3, 7, 14, .96) 100%);
}
.lnd .session-card-body {
  position: absolute; z-index: 2; inset: auto 16px 16px;
  display: flex; flex-direction: column; align-items: flex-start;
}
.lnd .session-time {
  display: inline-flex; align-items: center; min-height: 29px; padding: 0 9px; border-radius: 3px;
  background: var(--primary); color: var(--on-primary);
  font-size: 12px; font-weight: 850; font-variant-numeric: tabular-nums;
}
.lnd .session-card h3 {
  margin: 12px 0 20px;
  font-size: 17px; line-height: 1.35; letter-spacing: -.03em; word-break: keep-all;
}
.lnd .speaker { width: 100%; display: flex; justify-content: space-between; gap: 12px; color: #dfe5f0; font-size: 12px; }
.lnd .speaker b { color: #fff; }

/* ── 타임테이블 ── */
.lnd .schedule { display: grid; gap: 10px; list-style: none; }
.lnd .schedule-row {
  min-height: 62px;
  display: grid; grid-template-columns: 190px 1fr; align-items: center;
  border-radius: 6px; background: #f8f9fc; color: #111724;
  box-shadow: 0 10px 28px rgba(3, 9, 26, .12);
}
.lnd .schedule-row.is-break { background: rgba(58, 63, 98, .94); color: #f3f5fa; }
.lnd .schedule-time {
  padding: 0 23px; border-right: 1px solid rgba(21, 32, 51, .3);
  color: var(--primary-ink);
  font-size: 19px; font-weight: 900; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.lnd .is-break .schedule-time { border-color: rgba(255, 255, 255, .25); color: #fff; }
.lnd .schedule-content { padding: 10px 20px; }
.lnd .schedule-name { display: block; font-size: 15px; font-weight: 850; letter-spacing: -.02em; word-break: keep-all; }
.lnd .schedule-name .tag {
  display: inline-block; margin-left: 10px; padding: 2px 9px; border-radius: 999px;
  border: 1px solid var(--primary-ink); color: var(--primary-ink);
  font-size: 10px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; vertical-align: 2px;
}
.lnd .schedule-speaker { display: block; margin-top: 2px; color: #586074; font-size: 11px; }

/* ── 다크 존(Programs~FAQ) — 지브라 구분 ── */
.lnd .dark-zone { position: relative; background: var(--ink); }
.lnd .dark-zone .section { position: relative; }
.lnd .dark-zone .section > * { position: relative; z-index: 1; }
.lnd .dark-zone .section:nth-of-type(even)::before {
  content: ""; position: absolute; top: 0; bottom: 0;
  left: calc(50% - 50vw); right: calc(50% - 50vw);
  background: var(--ink-soft);
}

.lnd .program-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.lnd .program-card, .lnd .benefit-card, .lnd .join-step {
  border-radius: 8px; background: rgba(24, 31, 45, .94);
  box-shadow: 0 18px 48px rgba(2, 8, 24, .25);
}
.lnd .program-card { min-height: 142px; padding: 24px; }
.lnd .program-heading { display: flex; align-items: center; gap: 12px; }
.lnd .program-icon {
  min-width: 38px; height: 38px; display: grid; place-items: center; border-radius: 5px;
  background: var(--primary); color: var(--on-primary);
  font-size: 10px; font-weight: 900; letter-spacing: -.02em;
}
.lnd .program-card h3, .lnd .benefit-card h3, .lnd .join-step h3 { font-size: 19px; letter-spacing: -.03em; word-break: keep-all; }
.lnd .program-card p, .lnd .benefit-card p, .lnd .join-step p {
  margin: 14px 0 0; color: #b7c0d0;
  font-size: 13px; line-height: 1.7; white-space: pre-line; word-break: keep-all;
}
.lnd .benefit-grid, .lnd .join-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.lnd .benefit-card { min-height: 170px; padding: 22px; }
.lnd .benefit-number {
  display: block; margin-bottom: 6px;
  font-size: 21px; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--primary-bright);
}
.lnd .join-step { padding: 26px; }
.lnd .join-k {
  display: block; font-size: 12px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase;
  color: var(--primary-bright);
}
.lnd .join-step h3 { margin-top: 12px; }
.lnd .deadline {
  margin-top: clamp(40px, 7vh, 64px);
  text-align: center; color: var(--muted);
  font-size: clamp(13px, 1.7vw, 15px); font-variant-numeric: tabular-nums;
}
.lnd .deadline b { color: var(--paper); font-weight: 800; }

/* ── FAQ ── */
.lnd .faq-tabs { margin: -8px 0 26px; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
.lnd .faq-tab {
  min-height: 44px; padding: 0 18px;
  border: 1px solid rgba(255, 255, 255, .2); border-radius: 7px; background: transparent;
  cursor: pointer; font-weight: 750;
  transition: background .2s ease, border-color .2s ease, color .2s ease;
}
.lnd .faq-tab[aria-pressed="true"] { border-color: var(--primary); background: var(--primary); color: var(--on-primary); }
.lnd .faq-list { display: grid; gap: 12px; }
.lnd .faq-item { border-radius: 8px; background: rgba(45, 49, 57, .96); overflow: hidden; }
.lnd .faq-item summary {
  min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 20px;
  padding: 0 18px; cursor: pointer; list-style: none;
  font-size: 14px; font-weight: 750; word-break: keep-all;
}
.lnd .faq-item summary::-webkit-details-marker { display: none; }
.lnd .faq-item summary::after { content: "+"; color: #b9c1cf; font-size: 21px; font-weight: 400; }
.lnd .faq-item[open] summary::after { content: "\\2212"; }
.lnd .faq-item p { padding: 0 18px 20px; color: #c0c7d2; font-size: 13px; white-space: pre-line; }

/* ── 스크롤 리빌(transform 전용 — JS 미실행에서도 콘텐츠 가시) ── */
.lnd .rv { transform: translateY(12px); transition: transform .5s cubic-bezier(.22, .7, .2, 1); }
.lnd .rv.in { transform: translateY(0); }

@media (max-width: 760px) {
  .lnd .hero-inner { width: min(100% - 32px, 980px); padding-bottom: 150px; }
  .lnd .hero h1 { font-size: clamp(38px, 13vw, 66px); }
  .lnd .hero-subtitle { font-size: 17px; }
  .lnd .hero-meta { left: 50%; bottom: 116px; transform: translateX(-50%); width: 100%; text-align: center; font-size: 15px; }
  .lnd .hero-cta { left: 50%; right: auto; bottom: 36px; width: min(100%, 320px); transform: translateX(-50%); }
  .lnd .hero-cta:hover { transform: translate(-50%, -2px); }
  .lnd .intro { min-height: 480px; padding-inline: 20px; }
  .lnd .scroll-cue { bottom: 28px; }
  .lnd .section { width: min(100% - 28px, var(--max)); }
  .lnd .session-cards { gap: 14px; }
  .lnd .session-card { width: min(calc(50% - 7px), 286px); }
  .lnd .session-card-body { inset: auto 12px 12px; }
  .lnd .session-card h3 { margin: 9px 0 14px; font-size: 14px; }
  .lnd .session-time { min-height: 25px; font-size: 10px; }
  .lnd .schedule-row { min-height: 72px; grid-template-columns: 112px 1fr; }
  .lnd .schedule-time { padding: 0 12px; font-size: 14px; }
  .lnd .schedule-content { padding: 10px 12px; }
  .lnd .schedule-name { font-size: 13px; }
  .lnd .program-grid, .lnd .benefit-grid, .lnd .join-grid { grid-template-columns: 1fr; }
  .lnd .benefit-card { min-height: 130px; }
  .lnd .faq-tabs { overflow-x: auto; justify-content: flex-start; padding-bottom: 4px; }
  .lnd .faq-tab { flex: 0 0 auto; }
}

@media (max-width: 410px) {
  .lnd .session-card { width: 100%; max-width: 310px; }
  .lnd .session-card h3 { font-size: 16px; }
  .lnd .schedule-row { grid-template-columns: 1fr; gap: 0; }
  .lnd .schedule-time { padding: 10px 14px 6px; border-right: 0; border-bottom: 1px solid rgba(21, 32, 51, .15); }
  .lnd .is-break .schedule-time { border-color: rgba(255, 255, 255, .14); }
  .lnd .schedule-content { padding: 7px 14px 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .lnd, .lnd *, .lnd *::before, .lnd *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
  .lnd .rv { transform: none; }
}
`;
