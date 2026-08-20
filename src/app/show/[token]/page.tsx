"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAccentColor } from "@/lib/competition-render";
import type { ShowConfig, ShowMode } from "@/lib/competition-show";
import { competitionShowStrings, type CompetitionShowStrings } from "@/lib/competition-show-strings";
import type { NoticeLanguage } from "@/lib/notice/config";
import "./show.css";

/**
 * 발표 화면 — 무대 스크린에 띄운다.
 *
 * 설계는 무대의 제약에서 나온다:
 *
 * - **자동 재생이 없다.** MC 가 얼마나 말할지는 아무도 모른다. 다음 장면은 운영자가 누른다.
 * - **로드 후엔 네트워크를 쓰지 않는다.** 현장 와이파이는 끊긴다. 결과를 통째로 받아 두고
 *   연출은 브라우저 안에서만 돈다.
 * - **폴백이 항상 한 손에.** `S` 한 번이면 정적 결과판이다. 무대에서 새로고침을 기다릴 수 없다.
 * - **되돌릴 수 있다.** 실수로 넘겼을 때 되돌아갈 수 없으면 그건 사고다.
 */

interface MediaItem { kind: "image" | "youtube"; url?: string; videoId?: string }
interface AwardDto {
  id: string;
  name: string;
  description: string | null;
  entry: { entryNo: string; title: string; teamName: string | null; summary: string | null; media: MediaItem[] };
}
interface RankRow {
  entryNo: string; title: string; teamName: string | null;
  rank: number; combined: number; publicScore: number; judgeScore: number; tied: boolean;
}
interface ShowData {
  competition: { name: string; theme: Record<string, string>; language: NoticeLanguage };
  config: ShowConfig;
  rehearsal: boolean;
  awards: AwardDto[];
  ranking: RankRow[];
  candidates: string[];
}

export default function ShowPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<ShowData | null>(null);
  const [failed, setFailed] = useState(false);

  /** 현재 장면 번호. 0 = 시작 대기. */
  const [step, setStep] = useState(0);
  /** 연출이 깨졌을 때 눌러 두는 비상 폴백. 설정된 모드보다 항상 우선한다. */
  const [forceStatic, setForceStatic] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      // 리허설 여부는 주소에서 읽고 서버가 되돌려준다(응답의 rehearsal) — 화면 상태로 따로
      // 들고 있으면 둘이 어긋나는 순간 진짜 결과를 리허설로 착각하게 된다.
      const asRehearsal = new URLSearchParams(window.location.search).get("rehearsal") === "1";
      const res = await fetch(`/api/show/${token}${asRehearsal ? "?rehearsal=1" : ""}`, { cache: "no-store" });
      if (!res.ok) { setFailed(true); return; }
      setData(await res.json());
      setStep(0);
    } catch {
      setFailed(true);
    }
  }, [token]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const mode: ShowMode = forceStatic ? "static" : (data?.config.mode ?? "static");
  const scenes = useMemo(() => sceneCount(mode, data), [mode, data]);
  // 언어는 대회 설정값 — 로드 전에는 한국어로 보여 두고 응답이 오면 확정한다.
  const t = useMemo(() => competitionShowStrings(data?.competition.language ?? "ko"), [data?.competition.language]);

  const next = useCallback(() => setStep((s) => Math.min(scenes, s + 1)), [scenes]);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter" || e.key === "PageDown") {
        e.preventDefault(); next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault(); back();
      } else if (e.key === "s" || e.key === "S") {
        setForceStatic((v) => !v);
      } else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back]);

  if (failed) {
    return (
      <main className="stage">
        <div className="stage-body">
          <p className="stage-title">{t.linkBroken}</p>
          <p className="stage-hint">{t.linkBrokenHint}</p>
        </div>
      </main>
    );
  }
  if (!data) {
    return <main className="stage"><div className="stage-body"><p className="stage-title">{t.loading}</p></div></main>;
  }

  const accent = data.competition.theme?.accentColor || "#7c3aed";
  const style = { "--accent": accent, "--on-accent": onAccentColor(accent) } as React.CSSProperties;

  return (
    <main className="stage" style={style}>
      {data.rehearsal && <div className="stage-flag">{t.rehearsalFlag}</div>}
      {forceStatic && data.config.mode !== "static" && <div className="stage-flag">{t.staticFallbackFlag}</div>}

      <div className="stage-body">
        <Scene mode={mode} step={step} data={data} t={t} />
      </div>

      {data.config.footnote && <p className="stage-foot">{data.config.footnote}</p>}

      {/* 운영자 바 — 마우스를 올렸을 때만 나타난다. 관객이 보는 화면에 컨트롤이 늘 떠 있으면 안 된다. */}
      <div className="stage-bar">
        <span className="stage-progress">
          {data.competition.name} · {t.modeLabel[mode]} · {step} / {scenes}
        </span>
        <div className="stage-bar-actions">
          <button className="stage-btn" onClick={back} disabled={step === 0}>{t.prevBtn}</button>
          <button className="stage-btn is-key" onClick={next} disabled={step >= scenes}>
            {step === 0 ? t.startBtn : step >= scenes ? t.endBtn : t.nextBtn}
          </button>
          <button className="stage-btn" onClick={() => setForceStatic((v) => !v)}>
            {forceStatic ? t.toShow : t.toStatic}
          </button>
          <button className="stage-btn" onClick={() => setStep(0)}>{t.restartBtn}</button>
        </div>
      </div>
    </main>
  );
}

/** 모드별 총 장면 수. 0 은 시작 대기라 여기 안 센다. */
function sceneCount(mode: ShowMode, data: ShowData | null): number {
  if (!data) return 0;
  switch (mode) {
    case "card": return data.awards.length;
    case "countdown": return data.ranking.length;
    case "roulette": return data.awards.length;
    case "bars": return 1;
    default: return 1;
  }
}

function Scene({
  mode, step, data, t,
}: { mode: ShowMode; step: number; data: ShowData; t: CompetitionShowStrings }) {
  if (mode === "static" || step === 0) {
    if (step === 0 && mode !== "static") return <Intro data={data} mode={mode} t={t} />;
    return <StaticBoard data={data} t={t} />;
  }
  // key={step} — 장면이 바뀌면 새로 마운트한다. 안 그러면 앞 장면에서 뒤집어 둔 카드가
  // 다음 상에서도 열린 채로 나온다(= 답을 미리 보여준다).
  if (mode === "card") return <CardReveal key={step} award={data.awards[step - 1]} config={data.config} t={t} />;
  if (mode === "countdown") return <Countdown data={data} step={step} t={t} />;
  if (mode === "roulette") return <Roulette key={step} award={data.awards[step - 1]} candidates={data.candidates} t={t} />;
  if (mode === "bars") return <BarRace data={data} t={t} />;
  return <StaticBoard data={data} t={t} />;
}

function Intro({ data, mode, t }: { data: ShowData; mode: ShowMode; t: CompetitionShowStrings }) {
  const total = sceneCount(mode, data);
  return (
    <div className="stage-winner stage-enter">
      <span className="stage-award">{data.competition.name}</span>
      <p className="stage-team">{t.ceremony}</p>
      <p className="stage-hint">{total > 0 ? t.introHint(total) : t.noAwards}</p>
    </div>
  );
}

function MediaBlock({ entry, config }: { entry: AwardDto["entry"]; config: ShowConfig }) {
  if (!config.showMedia) return null;
  const image = entry.media.find((m) => m.kind === "image" && m.url);
  if (image?.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="stage-media" src={image.url} alt="" />;
  }
  const video = entry.media.find((m) => m.kind === "youtube" && m.videoId);
  if (video?.videoId) {
    // 무대에서는 자동 재생하지 않는다 — 소리가 MC 를 덮는다. 정지 화면만 띄운다.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="stage-media" src={`https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`} alt="" />;
  }
  return null;
}

function CardReveal({
  award, config, t,
}: { award: AwardDto | undefined; config: ShowConfig; t: CompetitionShowStrings }) {
  const [open, setOpen] = useState(false);

  if (!award) return <p className="stage-title">{t.noAwards}</p>;

  return (
    <div className={`stage-card ${open ? "is-open" : ""}`} onClick={() => setOpen(true)} role="presentation">
      <div className="stage-card-inner">
        <div className="stage-card-face">
          <span className="stage-award">{award.name}</span>
          <p className="stage-hint">{t.cardHint}</p>
        </div>
        <div className="stage-card-face stage-card-back">
          <div className="stage-winner">
            <span className="stage-award">{award.name}</span>
            <p className="stage-team">{award.entry.teamName ?? award.entry.title}</p>
            {award.entry.teamName && <p className="stage-work">{award.entry.title}</p>}
            {award.description && <p className="stage-desc">{award.description}</p>}
            <MediaBlock entry={award.entry} config={config} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 순위 역순 — n위부터 하나씩. 마지막 장면이 1위다. */
function Countdown({ data, step, t }: { data: ShowData; step: number; t: CompetitionShowStrings }) {
  const rows = data.ranking;
  const row = rows[rows.length - step];
  if (!row) return <p className="stage-title">{t.noRanking}</p>;
  const isFirst = row.rank === 1;

  return (
    <div className="stage-winner stage-enter" key={row.entryNo}>
      <div className={`stage-rank-no ${isFirst ? "is-first" : ""}`}>{t.rank(row.rank)}</div>
      <p className="stage-team">{row.teamName ?? row.title}</p>
      {row.teamName && <p className="stage-work">{row.title}</p>}
      {data.config.showScores && <p className="stage-desc">{t.combinedScore(row.combined.toFixed(1))}</p>}
    </div>
  );
}

/**
 * 룰렛 — 후보 이름이 돌다가 감속하며 멈춘다.
 *
 * requestAnimationFrame 으로 직접 감속시킨다. CSS 트랜지션으로는 "정확히 이 항목에서 멈춘다"를
 * 보장할 수 없는데, 무대에서 엉뚱한 이름에 멈추면 그건 사고다.
 */
function Roulette({
  award, candidates, t,
}: { award: AwardDto | undefined; candidates: string[]; t: CompetitionShowStrings }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);

  const winner = award?.entry.teamName ?? award?.entry.title ?? "";
  // 후보를 여러 바퀴 이어 붙이고 **마지막 칸을 수상자로** 둔다 — 어디서 멈출지 계산이 단순해진다.
  const items = useMemo(() => {
    const pool = candidates.length ? candidates : [winner];
    const loops: string[] = [];
    for (let i = 0; i < 6; i++) loops.push(...pool);
    loops.push(winner);
    return loops;
  }, [candidates, winner]);

  // 장면마다 새로 마운트되므로(key={step}) done 은 항상 false 로 시작한다 — 여기서 되돌릴 필요가 없다.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const itemHeight = strip.firstElementChild?.getBoundingClientRect().height ?? 0;
    const target = (items.length - 1) * itemHeight;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 움직임을 줄여 달라고 했거나 높이를 못 재면 **결과만 즉시 보여준다** — 연출을 못 해도
    // 수상자는 나와야 한다.
    let raf = 0;
    if (reduce || !itemHeight) {
      strip.style.transform = `translateY(-${target}px)`;
      raf = requestAnimationFrame(() => setDone(true));
      return () => cancelAnimationFrame(raf);
    }

    const duration = 3400;
    const start = performance.now();

    const settle = () => {
      strip.style.transform = `translateY(-${target}px)`;
      setDone(true);
    };

    /**
     * 안전장치 — 애니메이션이 어떤 이유로든 안 끝나도 **수상자는 반드시 나온다.**
     * requestAnimationFrame 은 탭이 뒤로 가거나 화면이 꺼지면 멈춘다(실측: 창이 안 보이는
     * 동안 한 프레임도 안 돈다). 운영자가 다른 창을 잠깐 봤다는 이유로 룰렛이 멈춘 채
     * 무대가 굳으면 그건 사고다.
     */
    const failsafe = setTimeout(settle, duration + 1200);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutQuint — 끝에서 확실히 느려져야 "멈췄다"가 읽힌다.
      const eased = 1 - Math.pow(1 - progress, 5);
      strip.style.transform = `translateY(-${target * eased}px)`;
      if (progress < 1) raf = requestAnimationFrame(tick);
      else { clearTimeout(failsafe); setDone(true); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(failsafe); };
  }, [items]);

  if (!award) return <p className="stage-title">{t.noAwards}</p>;

  return (
    <div className="stage-winner">
      <span className="stage-award">{award.name}</span>
      <div className={`stage-roulette ${done ? "is-done" : ""}`} style={{ marginTop: "3vmin" }}>
        <div className="stage-roulette-strip" ref={stripRef}>
          {items.map((name, index) => (
            <div className="stage-roulette-item" key={`${name}-${index}`}>{name}</div>
          ))}
        </div>
      </div>
      {done && award.entry.teamName && <p className="stage-work stage-enter">{award.entry.title}</p>}
    </div>
  );
}

/** 점수 바 레이스 — 0에서 시작해 차오르며 순위가 드러난다. */
function BarRace({ data, t }: { data: ShowData; t: CompetitionShowStrings }) {
  const [grown, setGrown] = useState(false);
  const rows = data.ranking;
  const top = Math.max(1, ...rows.map((r) => r.combined));

  useEffect(() => {
    // 폭 0 이 한 번 그려진 다음에 바꿔야 트랜지션이 돈다.
    // requestAnimationFrame 이 아니라 타이머를 쓰는 이유: rAF 는 창이 안 보이면 아예 멈춘다.
    // 그 상태에서 다음 장면으로 넘어가면 막대가 0 인 채로 굳어 버린다 — 무대에서는 그게 끝이다.
    const id = setTimeout(() => setGrown(true), 30);
    return () => clearTimeout(id);
  }, []);

  if (rows.length === 0) return <p className="stage-title">{t.noRankingData}</p>;

  return (
    <div className="stage-bars">
      {rows.map((row) => (
        <div className={`stage-bar-row ${row.rank === 1 ? "is-top" : ""}`} key={row.entryNo}>
          <span className="stage-bar-rank">{row.rank}</span>
          <span className="stage-bar-name">{row.teamName ?? row.title}</span>
          <span className="stage-bar-track">
            <span className="stage-bar-fill" style={{ width: grown ? `${(row.combined / top) * 100}%` : "0%" }} />
          </span>
          <span className="stage-bar-score">{grown ? row.combined.toFixed(1) : "0.0"}</span>
        </div>
      ))}
    </div>
  );
}

function StaticBoard({ data, t }: { data: ShowData; t: CompetitionShowStrings }) {
  if (data.awards.length === 0) {
    return (
      <div className="stage-winner">
        <p className="stage-title">{data.competition.name}</p>
        <p className="stage-hint">{t.staticNoAwards}</p>
      </div>
    );
  }
  return (
    <>
      <p className="stage-title">{t.staticResultTitle(data.competition.name)}</p>
      <div className="stage-static stage-enter">
        {data.awards.map((award, index) => (
          <div className={`stage-static-item ${index === 0 ? "is-top" : ""}`} key={award.id}>
            <div className="stage-static-award">{award.name}</div>
            <p className="stage-static-team">{award.entry.teamName ?? award.entry.title}</p>
            {award.entry.teamName && <p className="stage-static-work">{award.entry.title}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
