"use client";

// 랜딩 상세페이지(공개) — 외부 사이트(아임웹 등) iframe 임베드가 1차 사용처.
// - 콘텐츠는 웨비나 데이터 + config.landingPage 에서만 파생(만들기 → 랜딩 페이지에서 편집).
// - 임베드는 "높이 자동조절" 방식이라 iframe 내부 스크롤이 없다 → 스크롤 연출은 전부
//   IntersectionObserver 로 구현한다(iframe 안에서도 최상위 뷰포트를 기준으로 동작).
// - 100svh 는 auto-height iframe 안에서 문서 전체 높이가 되어 무한 성장 루프를 만든다 →
//   히어로 높이는 --lnd-vh 변수로 잡는다. 스니펫이 postMessage 로 (호스트 뷰포트 − 상단 헤더)를
//   전달하고, 자식은 마운트 시 landing-ready 를 보내 재전송을 유도한다(최초 로드 레이스·헤더 밀림 방지).
// - 디자인은 다크 에디토리얼 고정 테마(의도된 단일 테마), 키컬러만 theme.accentColor 에서 파생.

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatKst } from "@/lib/datetime";
import { normalizeLandingPageConfig, type LandingPageConfig } from "@/lib/webinar-config";
import { LANDING_CSS } from "@/lib/landing/css";
import { SAFE_HEX, TOC_DEF, onPrimaryFor, parseSpeaker } from "@/lib/landing/model";
import type { LandingSession, LandingWebinar } from "@/lib/landing/types";


export default function WebinarLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [webinar, setWebinar] = useState<LandingWebinar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // 임베드 호스트가 보낸 뷰포트/상단 고정영역(헤더) 높이. wrap 마운트 전 도착분도 보관해 늦게 반영.
  const viewportRef = useRef<{ vh: number; top: number } | null>(null);

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

  // 임베드: 문서 높이를 부모로 전송(민감정보 없음) + 호스트 뷰포트/헤더 높이 수신(--lnd-vh)
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
    // 히어로 높이 = 호스트 뷰포트 − 상단 고정영역(아임웹 헤더). 값은 ref에 보관해 wrap 마운트 순서와 무관하게 반영.
    const applyViewport = () => {
      const v = viewportRef.current;
      if (!v || !wrapRef.current) return;
      const usable = Math.max(480, Math.min(1400, Math.round(v.vh - v.top)));
      wrapRef.current.style.setProperty("--lnd-vh", `${usable}px`);
    };
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    ro.observe(document.body);
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; vh?: number; top?: number } | null;
      if (d?.type === "machstudio:host-viewport" && typeof d.vh === "number") {
        viewportRef.current = { vh: d.vh, top: typeof d.top === "number" ? d.top : 0 };
        applyViewport();
        post();
      }
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("load", post);
    // 준비 완료 신호 → 호스트가 뷰포트를 (재)전송. wrap 마운트 후 재전송을 보장해 최초 로드 레이스를 없앤다.
    window.parent.postMessage({ type: "machstudio:landing-ready", slug }, "*");
    applyViewport(); // 이전 실행에서 저장된 값이 있으면 즉시 반영
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

  // 세션 상세 팝업(글래스모피즘). 임베드 iframe 은 내부 스크롤이 없어 카드의
  // getBoundingClientRect().top(+scrollY) 이 곧 문서 Y → 클릭한 카드 중심에 absolute 로
  // 앵커하면 임베드·단독 모두 사용자의 현재 시야 안에 뜬다(position:fixed 는 임베드에서 안 통함).
  const detailPopup = lp.sessions.enabled && lp.sessions.detailPopup;
  const [activeSession, setActiveSession] = useState<{ session: LandingSession; top: number } | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const openSession = useCallback((session: LandingSession, el: HTMLButtonElement) => {
    const rect = el.getBoundingClientRect();
    openerRef.current = el;
    setActiveSession({ session, top: rect.top + window.scrollY + rect.height / 2 });
  }, []);
  const closeSession = useCallback(() => {
    setActiveSession(null);
    openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSession(); };
    window.addEventListener("keydown", onKey);
    // 단독 페이지에서만 배경 스크롤 잠금 — 임베드는 호스트가 스크롤하므로 iframe 안에서 잠글 수 없다.
    let prevOverflow = "";
    if (!embedded) { prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; }
    return () => {
      window.removeEventListener("keydown", onKey);
      if (!embedded) document.documentElement.style.overflow = prevOverflow;
    };
  }, [activeSession, embedded, closeSession]);
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
              {sessionCards.map((session) => {
                const sp = parseSpeaker(session.speaker, session.speakerCompany);
                const inner = (
                  <>
                    {session.speakerPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 세션 연사 사진(어드민 업로드 URL)
                      <img className="session-photo" src={session.speakerPhotoUrl} alt="" loading="lazy" />
                    ) : null}
                    <div className="session-card-body">
                      <span className="session-time">
                        {session.startTime}–{session.endTime}
                      </span>
                      <h3>{session.title}</h3>
                      <div className="speaker">
                        {sp.name && <b>{sp.name}</b>}
                        {sp.company && <span className="speaker-co">{sp.company}</span>}
                      </div>
                      {detailPopup && (
                        <span className="session-more" aria-hidden="true">
                          자세히 보기
                          <svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                      )}
                    </div>
                  </>
                );
                return detailPopup ? (
                  <button
                    type="button"
                    className="session-card is-clickable"
                    key={session.id}
                    aria-haspopup="dialog"
                    aria-label={`${session.title} — 연사 상세 보기`}
                    onClick={(e) => openSession(session, e.currentTarget)}
                  >
                    {inner}
                  </button>
                ) : (
                  <article className="session-card" key={session.id}>
                    {inner}
                  </article>
                );
              })}
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

      {/* 세션 상세 팝업 — 글래스모피즘. 클릭한 카드 중심(문서 Y)에 앵커 → 임베드에서도 시야 안. */}
      {activeSession && (() => {
        const s = activeSession.session;
        const sp = parseSpeaker(s.speaker, s.speakerCompany);
        const hasSpeaker = Boolean(sp.name || sp.company || s.speakerBio);
        return (
          <div className="lnd-modal-root" role="presentation" onClick={closeSession}>
            <div className="lnd-modal-backdrop" />
            <div
              className={`lnd-modal${s.speakerPhotoUrl ? " has-photo" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="lnd-modal-title"
              style={{ top: `${activeSession.top}px` }}
              onClick={(e) => e.stopPropagation()}
            >
              <button ref={closeBtnRef} type="button" className="lnd-modal-close" onClick={closeSession} aria-label="닫기">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>

              {s.speakerPhotoUrl && (
                <div className="lnd-modal-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 연사 사진(어드민 업로드 URL) */}
                  <img src={s.speakerPhotoUrl} alt={sp.name || s.title} />
                  {(sp.name || sp.company) && (
                    <div className="lnd-modal-photo-cap">
                      {sp.name && <b>{sp.name}</b>}
                      {sp.company && <span>{sp.company}</span>}
                    </div>
                  )}
                </div>
              )}

              <div className="lnd-modal-main">
                <span className="lnd-modal-time">{s.startTime}–{s.endTime}</span>
                <h3 id="lnd-modal-title">{s.title}</h3>
                {s.description && <p className="lnd-modal-desc">{s.description}</p>}

                {hasSpeaker && (
                  <div className="lnd-modal-speaker">
                    <div className="lnd-modal-speaker-head">
                      <span className="lnd-modal-avatar" aria-hidden="true">
                        {s.speakerPhotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 연사 사진(어드민 업로드 URL)
                          <img src={s.speakerPhotoUrl} alt="" />
                        ) : (sp.name.trim().charAt(0) || "·")}
                      </span>
                      <div className="lnd-modal-speaker-id">
                        {sp.name && <b>{sp.name}</b>}
                        {sp.company && <span>{sp.company}</span>}
                      </div>
                    </div>
                    {s.speakerBio && (
                      <div className="lnd-modal-bio">
                        <h4>약력</h4>
                        <p>{s.speakerBio}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// v3 확정 디자인 이식 — .lnd 스코프, 다크 에디토리얼 고정 테마(키컬러만 --primary 주입)
