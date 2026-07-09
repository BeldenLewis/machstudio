/**
 * 웨비나 로더 스크립트 생성 — 아임웹 등 외부 사이트에 1회 부착되는 클라이언트 코드.
 *
 *   <script async src="https://machstudio.vercel.app/w/SITE_ID"></script>
 *
 * 동작:
 *  - /api/webinar-embed/{siteId}/config 를 런타임 fetch (sessionStorage 60초 SWR)
 *    → 문구·테마·일정 변경이 코드 재부착 없이 반영된다.
 *  - 마운트 마커에 컴포넌트 렌더:
 *      <div data-mach-webinar-mount="hero-button"></div>
 *      <div data-mach-webinar-mount="register-form"></div>
 *      <div data-mach-webinar-mount="live"></div>   (라이브 전용 페이지)
 *    하단 배너는 마커 없이 body 에 부착 (live 마운트가 있는 페이지에서는 미표시).
 *  - 상태 머신(webinar-status.ts 와 동일 값): upcoming/registration/live/ended + entryOpen.
 *    serverNow 오프셋 보정 + 경계 통과 시 재렌더 + 라이브 윈도(시작−30분~종료+30분) 120초 폴링
 *    + visibilitychange 재fetch(30초 스로틀).
 *  - 등록 제출: /api/webinar/{slug}/register 로 직행, _utm 봉투(attribution-core)와 _hp 허니팟 동봉.
 *  - seen 비콘: 세션당 1회 — 연결 감지 + 방문 집계.
 *  - 전체 try/catch — 실패 시 호스트 페이지를 건드리지 않고 조용히 종료.
 *
 * 주의: 클라이언트 코드 안에서 백틱과 "달러+중괄호" 시퀀스를 쓰지 않는다 (TS 템플릿 리터럴 안전).
 * 정규식 백슬래시 이스케이프 사고를 피하기 위해 글로브 매칭은 indexOf 워크로 구현.
 */
import { ATTRIBUTION_CORE_JS } from "./attribution-core";

export function buildWebinarLoaderScript({ siteId, baseUrl }: { siteId: string; baseUrl: string }): string {
  return `(function() {
  var SITE_ID = ${JSON.stringify(siteId)};
  // 가드는 사이트 단위 — 같은 페이지에 다른 임베드 사이트의 옛 로더 태그가 남아 있어도
  // 두 번째가 조용히 죽지 않고 경고를 남긴다 (동일 사이트 이중 부착은 여전히 1회만 실행).
  if (window.__MACH_WEBINAR_LOADER__) {
    if (window.__MACH_WEBINAR_LOADER__ !== SITE_ID) {
      try { if (window.console && console.warn) console.warn("[mach webinar] 다른 사이트 로더가 이미 로드됨 — 이 태그(" + SITE_ID + ")는 무시됩니다. 아임웹에 남은 옛 임베드 태그를 제거해주세요."); } catch (e) {}
    }
    return;
  }
  window.__MACH_WEBINAR_LOADER__ = SITE_ID;

  var BASE = ${JSON.stringify(baseUrl)};
  var CONFIG_URL = BASE + "/api/webinar-embed/" + SITE_ID + "/config";
  var SEEN_URL = BASE + "/api/webinar-embed/" + SITE_ID + "/seen";
  var CFG_CACHE_KEY = "mw_cfg_" + SITE_ID;
  var CFG_CACHE_TTL = 60 * 1000;
  var LIVE_WINDOW_PAD_MS = 30 * 60 * 1000;
  var LIVE_POLL_MS = 120 * 1000;
  var VIS_REFETCH_THROTTLE_MS = 30 * 1000;

${ATTRIBUTION_CORE_JS}

  try { migrateLegacyUtm(); } catch (e) {}
  try { captureUtm(); } catch (e) {}

  var CFG = null;
  var serverOffsetMs = 0;
  var lastRenderKey = "";
  var lastVisRefetchAt = 0;
  var pollTimer = null;
  var boundaryTimer = null;

  function warn(msg, e) {
    try { if (window.console && console.warn) console.warn("[mach webinar] " + msg, e || ""); } catch (e2) {}
  }

  function serverNowMs() { return Date.now() + serverOffsetMs; }

  function parseMs(iso) {
    var t = new Date(iso).getTime();
    return isNaN(t) ? null : t;
  }

  /* ── 상태 판정 (webinar-status.ts 와 동일 규칙) ── */
  function computeStatus() {
    if (!CFG) return "upcoming";
    if (CFG.statusOverride === "registration" || CFG.statusOverride === "live" || CFG.statusOverride === "ended") {
      return CFG.statusOverride;
    }
    var now = serverNowMs();
    var start = parseMs(CFG.liveStartAt);
    var end = parseMs(CFG.liveEndAt);
    var deadline = parseMs(CFG.signupDeadline);
    if (end !== null && now >= end) return "ended";
    if (start !== null && now >= start) return "live";
    if (deadline !== null && now <= deadline) return "registration";
    return "upcoming";
  }

  function isEntryOpen(status) {
    if (status === "live") return true;
    if (status === "ended") return false;
    var openAt = parseMs(CFG.entryOpenAt);
    return openAt !== null && serverNowMs() >= openAt;
  }

  function canRegisterNow(status) {
    if (status === "registration") return true;
    if (status === "live") {
      // 명시 설정이 있으면 그대로, 없으면(null) 서버 마감 규칙과 동일하게 deadline 을 실시간 비교.
      // (config 가 fetch 시점 boolean 으로 굳으면 마감→라이브 전환 구간에 서버가 거절할 폼을 노출할 수 있음)
      if (CFG.allowLiveRegistration === true) return true;
      if (CFG.allowLiveRegistration === false) return false;
      var deadline = parseMs(CFG.signupDeadline);
      return deadline !== null && serverNowMs() <= deadline;
    }
    return false;
  }

  /* ── 글로브 매칭 (백슬래시 없는 indexOf 워크) ── */
  function normPath(p) {
    p = (p || "/").toLowerCase();
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return p;
  }
  function pathMatchesPattern(pathname, pattern) {
    var path = normPath(pathname);
    var pat = normPath(pattern);
    var parts = pat.split("*");
    if (parts.length === 1) return path === pat;
    if (parts[0] && path.indexOf(parts[0]) !== 0) return false;
    var pos = parts[0].length;
    for (var i = 1; i < parts.length; i++) {
      if (!parts[i]) continue;
      var idx = path.indexOf(parts[i], pos);
      if (idx === -1) return false;
      pos = idx + parts[i].length;
    }
    var lastPart = parts[parts.length - 1];
    if (lastPart && path.slice(-lastPart.length) !== lastPart) return false;
    return true;
  }
  function bannerAllowedOnPage() {
    var patterns = (CFG && CFG.bannerPagePatterns) || [];
    if (!patterns.length) return true;
    var path = window.location.pathname || "/";
    for (var i = 0; i < patterns.length; i++) {
      if (pathMatchesPattern(path, patterns[i])) return true;
    }
    return false;
  }

  /* ── 설정 fetch (sessionStorage 60초 SWR) ── */
  function readCachedCfg() {
    try {
      var raw = sessionStorage.getItem(CFG_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.cfg) return null;
      return parsed;
    } catch (e) { return null; }
  }
  function writeCachedCfg(cfg) {
    try { sessionStorage.setItem(CFG_CACHE_KEY, JSON.stringify({ t: Date.now(), cfg: cfg })); } catch (e) {}
  }
  function applyConfig(cfg, fetchedAtMs) {
    if (!cfg || !cfg.slug) return;
    CFG = cfg;
    var serverNow = parseMs(cfg.serverNow);
    if (serverNow !== null && fetchedAtMs) serverOffsetMs = serverNow - fetchedAtMs;
    renderAll();
    scheduleBoundary();
    schedulePolling();
  }
  function fetchConfig(force) {
    var fetchedAt = Date.now();
    // no-store: 브라우저 캐시 우회 (신선도는 sessionStorage SWR + CDN s-maxage 가 담당 —
    // 브라우저 휴리스틱 캐시가 끼면 상태 전환이 페이지에 반영되지 않는다)
    fetch(CONFIG_URL, { method: "GET", cache: "no-store" }).then(function(res) {
      if (!res.ok) throw new Error("config " + res.status);
      return res.json();
    }).then(function(cfg) {
      writeCachedCfg(cfg);
      applyConfig(cfg, fetchedAt);
    }).catch(function(e) {
      if (!CFG) warn("config fetch failed — 렌더 생략", e);
    });
  }
  function initConfig() {
    var cached = readCachedCfg();
    if (cached) {
      // cached.t(= fetch 시각)를 넘겨 serverNow 오프셋을 복원 — 캐시 신선(<60초)해서 재fetch 를
      // 건너뛰는 페이지뷰에서도 클럭 스큐 보정이 유지된다 (절대시각 차이라 경과시간 무관).
      applyConfig(cached.cfg, cached.t);
      if (Date.now() - cached.t < CFG_CACHE_TTL) return;
    }
    fetchConfig(false);
  }

  /* ── seen 비콘: 연결 감지(어느 페이지든 1회) + 방문 집계(웨비나 컴포넌트가 있는 페이지 1회) ──
   * 배너는 사이트 전역에 붙을 수 있어, 배너만 뜨는 일반 페이지를 "방문"으로 세면 퍼널 상단이 부풀려진다.
   * 따라서 mount 마커(hero/form/live)가 있는 페이지에서만 visit=true 로 집계한다. dedup 키를 분리해
   * 배너 페이지 → 웨비나 페이지로 이동해도 방문이 1회 정확히 기록되게 한다. */
  function sendSeen() {
    try {
      var last = storageGet(UTM_LAST_KEY) || emptyUtm();
      var hasMount = !!document.querySelector("[data-mach-webinar-mount]");
      var seenKey = "mw_seen_" + SITE_ID;
      var visitKey = "mw_visit_" + SITE_ID;
      // 스토리지 접근 실패가 비콘 전송을 막지 않도록 dedup 가드는 best-effort 로 분리
      var seenDone = false, visitDone = false;
      try { seenDone = !!sessionStorage.getItem(seenKey); } catch (e) {}
      try { visitDone = !!sessionStorage.getItem(visitKey); } catch (e) {}
      var needSeen = !seenDone;
      var needVisit = hasMount && !visitDone;
      if (!needSeen && !needVisit) return;
      if (needSeen) { try { sessionStorage.setItem(seenKey, "1"); } catch (e) {} }
      if (needVisit) { try { sessionStorage.setItem(visitKey, "1"); } catch (e) {} }
      var payload = JSON.stringify({ utmSource: last.utmSource || "", utmMedium: last.utmMedium || "", visit: needVisit });
      // 순수 문자열 = text/plain simple request — sendBeacon 은 CORS preflight 를 못 하므로
      // application/json Blob 을 쓰면 크로스오리진에서 차단된다 (서버는 text 바디도 JSON 파싱함)
      if (navigator.sendBeacon) {
        navigator.sendBeacon(SEEN_URL, payload);
      } else {
        fetch(SEEN_URL, { method: "POST", body: payload, keepalive: true });
      }
    } catch (e) {}
  }

  /* ── UTM 봉투 (register 동봉 — 서버 parseUtmEnvelope 와 flat 키 계약) ── */
  function buildUtmEnvelope() {
    try {
      var last = storageGet(UTM_LAST_KEY) || emptyUtm();
      var first = storageGet(UTM_FIRST_KEY) || last;
      var journey = storageGet(JOURNEY_KEY) || [];
      if (!Array.isArray(journey)) journey = [];
      return {
        utmSource: last.utmSource || null, utmMedium: last.utmMedium || null,
        utmCampaign: last.utmCampaign || null, utmTerm: last.utmTerm || null,
        utmContent: last.utmContent || null, utmId: last.utmId || null,
        firstUtmSource: first.utmSource || null, firstUtmMedium: first.utmMedium || null,
        firstUtmCampaign: first.utmCampaign || null, firstUtmTerm: first.utmTerm || null,
        firstUtmContent: first.utmContent || null, firstUtmId: first.utmId || null,
        firstReferrer: first.referrer || null, firstSeenAt: first.seenAt || null,
        journey: journey, referrer: document.referrer || null
      };
    } catch (e) { return null; }
  }

  /* ── 테마/스타일 ── */
  function theme() {
    var t = (CFG && CFG.theme) || {};
    return {
      accent: t.accentColor || "#6d28d9",
      radius: t.borderRadius || "12px"
    };
  }
  function injectStyles() {
    if (document.getElementById("mw-styles")) {
      document.getElementById("mw-styles").textContent = buildCss();
      return;
    }
    var style = document.createElement("style");
    style.id = "mw-styles";
    style.textContent = buildCss();
    document.head.appendChild(style);
  }
  function buildCss() {
    var t = theme();
    return [
      ".mw-reset, .mw-reset * { box-sizing: border-box; margin: 0; }",
      ".mw-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 28px; border: 0; border-radius: " + t.radius + "; font-size: 15px; font-weight: 700; line-height: 1.2; cursor: pointer; text-decoration: none !important; white-space: nowrap; transition: transform .18s ease, opacity .18s ease, box-shadow .18s ease; }",
      ".mw-btn:hover { transform: translateY(-1px); }",
      ".mw-btn-primary { background: " + t.accent + " !important; color: #fff !important; -webkit-text-fill-color: #fff !important; box-shadow: 0 4px 16px rgba(0,0,0,0.18); }",
      ".mw-btn-primary:hover { opacity: .92; }",
      ".mw-btn-secondary { background: rgba(120,120,128,0.12) !important; color: #333 !important; -webkit-text-fill-color: #333 !important; border: 1px solid rgba(120,120,128,0.25) !important; }",
      ".mw-btn-disabled { background: rgba(120,120,128,0.16) !important; color: #999 !important; -webkit-text-fill-color: #999 !important; cursor: not-allowed; }",
      ".mw-btn-disabled:hover { transform: none; }",
      ".mw-hero { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }",
      ".mw-form-card { max-width: 520px; padding: 28px 24px; border: 1px solid rgba(120,120,128,0.22); border-radius: 16px; background: #ffffff; color: #111 !important; font-size: 14px; }",
      ".mw-form-card, .mw-form-card * { -webkit-text-fill-color: initial; }",
      ".mw-form-title { font-size: 18px; font-weight: 800; color: #111; margin-bottom: 18px; }",
      ".mw-field { margin-bottom: 14px; }",
      ".mw-label { display: block; font-size: 13px; font-weight: 600; color: #444; margin-bottom: 6px; }",
      ".mw-req { color: " + t.accent + "; margin-left: 2px; }",
      ".mw-input, .mw-select { width: 100%; padding: 11px 13px; border: 1px solid rgba(120,120,128,0.35); border-radius: 9px; background: #fff; color: #111; font-size: 14px; outline: none; }",
      ".mw-input:focus, .mw-select:focus { border-color: " + t.accent + "; }",
      ".mw-check { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #555; margin-bottom: 10px; cursor: pointer; }",
      ".mw-check input { margin-top: 2px; accent-color: " + t.accent + "; }",
      ".mw-submit { width: 100%; margin-top: 8px; }",
      ".mw-msg { display: none; margin-top: 14px; padding: 12px 14px; border-radius: 9px; font-size: 13px; line-height: 1.55; }",
      ".mw-msg-error { display: block; background: rgba(220,38,38,0.08); border: 1px solid rgba(220,38,38,0.25); color: #b91c1c; }",
      ".mw-msg-success { display: block; background: rgba(22,163,74,0.08); border: 1px solid rgba(22,163,74,0.25); color: #15803d; }",
      ".mw-live-frame { width: 100%; border: 0; display: block; min-height: 520px; }",
      ".mw-banner { position: fixed !important; left: 50% !important; bottom: 24px !important; transform: translateX(-50%) !important; width: 680px; max-width: calc(100vw - 32px); z-index: 999900 !important; border-radius: 16px; background: linear-gradient(180deg, rgba(24,24,28,0.92), rgba(14,14,18,0.88)); border: 1px solid rgba(255,255,255,0.14); color: #fff !important; box-shadow: 0 16px 48px rgba(0,0,0,0.4); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); overflow: hidden; }",
      ".mw-banner-inner { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px 14px 20px; }",
      ".mw-banner-text { min-width: 0; }",
      ".mw-banner-title { font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.95) !important; -webkit-text-fill-color: rgba(255,255,255,0.95) !important; line-height: 1.45; word-break: keep-all; }",
      ".mw-banner-sub { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12px; font-weight: 600; color: #fbbf24 !important; -webkit-text-fill-color: #fbbf24 !important; }",
      ".mw-banner-ctas { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }",
      ".mw-banner .mw-btn { padding: 11px 18px; font-size: 13px; }",
      ".mw-banner .mw-btn-secondary { background: rgba(255,255,255,0.09) !important; color: #fff !important; -webkit-text-fill-color: #fff !important; border: 1px solid rgba(255,255,255,0.18) !important; }",
      ".mw-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: mw-pulse 1.5s ease-in-out infinite; }",
      ".mw-live-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; margin-right: 6px; border-radius: 6px; background: rgba(34,197,94,0.16); border: 1px solid rgba(34,197,94,0.32); color: #4ade80 !important; -webkit-text-fill-color: #4ade80 !important; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }",
      "@keyframes mw-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }",
      ".mw-reg-dot { width: 7px; height: 7px; border-radius: 50%; background: #fbbf24; animation: mw-pulse 1.5s ease-in-out infinite; }",
      ".mw-reg-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; margin-right: 6px; border-radius: 6px; background: rgba(251,191,36,0.16); border: 1px solid rgba(251,191,36,0.32); color: #fbbf24 !important; -webkit-text-fill-color: #fbbf24 !important; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }",
      ".mw-modal-overlay { position: fixed; inset: 0; z-index: 999950; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(0,0,0,0.62); }",
      ".mw-modal-card { position: relative; width: 100%; max-width: 480px; max-height: 86vh; overflow-y: auto; border-radius: 16px; }",
      ".mw-modal-close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(120,120,128,0.3); border-radius: 8px; background: #fff; color: #666; font-size: 17px; line-height: 1; cursor: pointer; z-index: 2; }",
      "@media (max-width: 600px) { .mw-banner { left: 12px !important; right: 12px !important; bottom: 12px !important; width: auto; transform: none !important; } .mw-banner-inner { flex-direction: column; align-items: stretch; gap: 10px; } .mw-banner-ctas { width: 100%; } .mw-banner .mw-btn { flex: 1; } }"
    ].join("\\n");
  }

  /* ── 유틸 ── */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function mounts(kind) {
    return Array.prototype.slice.call(document.querySelectorAll('[data-mach-webinar-mount="' + kind + '"]'));
  }
  function labels() {
    var c = (CFG && CFG.components) || {};
    var hb = c.heroButton || {};
    return hb.labelByStatus || {};
  }
  function bannerTexts() {
    var c = (CFG && CFG.components) || {};
    var b = c.banner || {};
    return b.textByStatus || {};
  }
  function componentEnabled(name, defaultOn) {
    var c = (CFG && CFG.components) || {};
    var comp = c[name];
    if (!comp || typeof comp.enabled !== "boolean") return defaultOn;
    return comp.enabled;
  }
  function livePageUrl() {
    return (CFG.links && CFG.links.livePageUrl) || (BASE + "/webinar/" + CFG.slug + "/live");
  }
  function surveyUrl() { return (CFG.links && CFG.links.surveyUrl) || ""; }
  function endedMode() {
    var c = (CFG && CFG.components) || {};
    return c.endedMode === "hidden" ? "hidden" : "survey";
  }

  /* ── 캘린더 ── */
  function toGoogleDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split(".")[0].split("-").join("").split(":").join("") + "Z";
  }
  function openCalendar() {
    try {
      var isMobile = window.innerWidth <= 1024;
      if (isMobile && CFG.ics) {
        var blob = new Blob([CFG.ics], { type: "text/calendar;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = (CFG.name || "webinar") + ".ics";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      var calUrl = (CFG.links && CFG.links.calendarUrl) || "";
      if (!calUrl) {
        calUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" +
          encodeURIComponent(CFG.name || "Webinar") +
          "&dates=" + toGoogleDate(CFG.liveStartAt) + "/" + toGoogleDate(CFG.liveEndAt) +
          "&ctz=Asia/Seoul";
      }
      window.open(calUrl, "_blank", "noopener");
    } catch (e) { warn("calendar open failed", e); }
  }

  /* ── 등록 폼 ── */
  function buildFormInto(container, opts) {
    clear(container);
    container.classList.add("mw-reset");
    var status = computeStatus();
    var card = el("div", "mw-form-card");

    if (status === "ended") {
      card.appendChild(el("div", "mw-form-title", (CFG.name || "웨비나") + "가 종료되었습니다"));
      if (endedMode() === "survey" && surveyUrl()) {
        var sBtn = el("a", "mw-btn mw-btn-primary mw-submit", "만족도 조사 참여하기");
        sBtn.href = surveyUrl();
        sBtn.target = "_blank";
        sBtn.rel = "noopener noreferrer";
        card.appendChild(sBtn);
      }
      container.appendChild(card);
      return;
    }

    if (!canRegisterNow(status)) {
      card.appendChild(el("div", "mw-form-title", "사전등록이 마감되었습니다"));
      if (isEntryOpen(status)) {
        var eBtn = el("a", "mw-btn mw-btn-primary mw-submit", labels().live || "웨비나 입장하기");
        eBtn.href = livePageUrl();
        card.appendChild(eBtn);
      }
      container.appendChild(card);
      return;
    }

    var form = (CFG.registrationForm || {});
    var fields = form.fields || [];
    card.appendChild(el("div", "mw-form-title", (CFG.name || "웨비나") + " 사전등록"));

    var formEl = document.createElement("form");
    formEl.noValidate = true;
    var inputs = {};

    for (var i = 0; i < fields.length; i++) {
      (function(field) {
        var wrap = el("div", "mw-field");
        if (field.type === "checkbox") {
          var lab = el("label", "mw-check");
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.setAttribute("data-mw-key", field.key);
          lab.appendChild(cb);
          var span = el("span", "", field.label + (field.required ? " (필수)" : ""));
          lab.appendChild(span);
          wrap.appendChild(lab);
          inputs[field.key] = { el: cb, field: field };
        } else {
          var label = el("label", "mw-label", field.label);
          if (field.required) label.appendChild(el("span", "mw-req", "*"));
          wrap.appendChild(label);
          var input;
          if (field.type === "select") {
            input = document.createElement("select");
            input.className = "mw-select";
            var empty = document.createElement("option");
            empty.value = "";
            empty.textContent = "선택해주세요";
            input.appendChild(empty);
            var options = field.options || [];
            for (var j = 0; j < options.length; j++) {
              var opt = document.createElement("option");
              opt.value = options[j];
              opt.textContent = options[j];
              input.appendChild(opt);
            }
          } else {
            input = document.createElement("input");
            input.className = "mw-input";
            input.type = field.type === "tel" ? "tel" : field.type === "email" ? "email" : "text";
            input.placeholder = field.placeholder || "";
          }
          input.setAttribute("data-mw-key", field.key);
          wrap.appendChild(input);
          inputs[field.key] = { el: input, field: field };
        }
        formEl.appendChild(wrap);
      })(fields[i]);
    }

    /* 개인정보/마케팅 동의 */
    var privacyLab = el("label", "mw-check");
    var privacyCb = document.createElement("input");
    privacyCb.type = "checkbox";
    privacyCb.setAttribute("data-mw-key", "__privacy");
    privacyLab.appendChild(privacyCb);
    privacyLab.appendChild(el("span", "", form.privacyText || "[필수] 개인정보 수집 및 이용에 동의합니다"));
    formEl.appendChild(privacyLab);

    var mktLab = el("label", "mw-check");
    var mktCb = document.createElement("input");
    mktCb.type = "checkbox";
    mktCb.setAttribute("data-mw-key", "__marketing");
    mktLab.appendChild(mktCb);
    mktLab.appendChild(el("span", "", form.marketingText || "[선택] 마케팅 정보 수신에 동의합니다"));
    formEl.appendChild(mktLab);

    /* 허니팟 — 화면 밖 배치, 봇만 채운다 */
    var hp = document.createElement("input");
    hp.type = "text";
    hp.name = "website";
    hp.tabIndex = -1;
    hp.autocomplete = "off";
    hp.setAttribute("aria-hidden", "true");
    hp.style.cssText = "position:absolute;left:-9999px;top:-9999px;height:1px;width:1px;opacity:0;";
    formEl.appendChild(hp);

    var submitBtn = el("button", "mw-btn mw-btn-primary mw-submit", form.submitLabel || "사전 등록하기");
    submitBtn.type = "submit";
    formEl.appendChild(submitBtn);

    var msg = el("div", "mw-msg");
    formEl.appendChild(msg);

    function showMsg(kind, text) {
      msg.className = "mw-msg mw-msg-" + kind;
      msg.textContent = text;
    }

    formEl.addEventListener("submit", function(ev) {
      ev.preventDefault();
      if (submitBtn.disabled) return;

      if (!privacyCb.checked) { showMsg("error", "개인정보 수집 및 이용에 동의해주세요."); return; }

      var systemBody = {};
      var customBody = {};
      for (var key in inputs) {
        if (!Object.prototype.hasOwnProperty.call(inputs, key)) continue;
        var entry = inputs[key];
        var value = entry.field.type === "checkbox" ? (entry.el.checked ? "동의" : "") : String(entry.el.value || "").trim();
        if (entry.field.required && !value) {
          showMsg("error", entry.field.label + " 항목을 입력해주세요.");
          return;
        }
        if (entry.field.system) systemBody[key] = value;
        else customBody[key] = value;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "등록 중...";
      msg.className = "mw-msg";

      var payload = systemBody;
      payload.customFields = customBody;
      payload.agreePrivacy = true;
      payload.agreeMarketing = mktCb.checked;
      payload._hp = hp.value || "";
      payload._utm = buildUtmEnvelope();

      fetch(BASE + "/api/webinar/" + CFG.slug + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function(res) {
        return res.json().then(function(data) { return { ok: res.ok, data: data }; });
      }).then(function(result) {
        if (!result.ok) {
          showMsg("error", (result.data && result.data.error) || "등록에 실패했어요. 잠시 후 다시 시도해주세요.");
          submitBtn.disabled = false;
          submitBtn.textContent = form.submitLabel || "사전 등록하기";
          return;
        }
        var c = (CFG.components || {});
        var fw = c.formWidget || {};
        var successText = result.data && result.data.alreadyRegistered
          ? "이미 등록되어 있어요. 웨비나 당일 등록하신 연락처/이메일로 입장하실 수 있어요."
          : (fw.successMessage || "사전등록이 완료되었습니다! 웨비나 당일 등록하신 연락처/이메일로 입장하실 수 있어요.");
        showMsg("success", successText);
        formEl.querySelectorAll("input, select, button").forEach(function(node) { node.disabled = true; });
        submitBtn.textContent = "등록 완료";
        if (opts && opts.onSuccess) opts.onSuccess();
      }).catch(function() {
        showMsg("error", "네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
        submitBtn.disabled = false;
        submitBtn.textContent = form.submitLabel || "사전 등록하기";
      });
    });

    // 재렌더 시 작성 중이던 입력값 복원 (경계 통과·문구 수정으로 폼이 다시 그려져도 유실 방지)
    if (opts && opts.prefill) {
      try {
        var pf = opts.prefill;
        var nodes = formEl.querySelectorAll("[data-mw-key]");
        for (var r = 0; r < nodes.length; r++) {
          var rk = nodes[r].getAttribute("data-mw-key");
          if (pf[rk] === undefined) continue;
          if (nodes[r].type === "checkbox") nodes[r].checked = !!pf[rk];
          else nodes[r].value = pf[rk];
        }
      } catch (e) {}
    }

    card.appendChild(formEl);
    container.appendChild(card);
  }

  function snapshotForm(container) {
    var snap = {};
    try {
      var nodes = container.querySelectorAll("[data-mw-key]");
      for (var i = 0; i < nodes.length; i++) {
        var k = nodes[i].getAttribute("data-mw-key");
        snap[k] = nodes[i].type === "checkbox" ? nodes[i].checked : nodes[i].value;
      }
    } catch (e) {}
    return snap;
  }

  /* ── 폼 모달 (폼 마운트가 없는 페이지에서 등록 CTA 클릭 시) ── */
  function openFormModal() {
    var existing = document.getElementById("mw-form-modal");
    if (existing) { existing.style.display = "flex"; return; }
    var overlay = el("div", "mw-modal-overlay mw-reset");
    overlay.id = "mw-form-modal";
    var cardWrap = el("div", "mw-modal-card");
    var closeBtn = el("button", "mw-modal-close", "\\u00d7");
    closeBtn.type = "button";
    closeBtn.addEventListener("click", function() { overlay.style.display = "none"; });
    overlay.addEventListener("click", function(ev) { if (ev.target === overlay) overlay.style.display = "none"; });
    cardWrap.appendChild(closeBtn);
    var formHost = el("div", "");
    cardWrap.appendChild(formHost);
    overlay.appendChild(cardWrap);
    document.body.appendChild(overlay);
    buildFormInto(formHost, null);
  }

  function goRegister() {
    var formMounts = mounts("register-form");
    if (formMounts.length) {
      try { formMounts[0].scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { formMounts[0].scrollIntoView(); }
      return;
    }
    openFormModal();
  }

  /* ── 히어로 버튼 ── */
  function renderHero() {
    var heroMounts = mounts("hero-button");
    if (!heroMounts.length || !componentEnabled("heroButton", true)) return;
    var status = computeStatus();
    var entry = isEntryOpen(status);
    var lb = labels();

    heroMounts.forEach(function(mount) {
      clear(mount);
      mount.classList.add("mw-reset");
      var row = el("div", "mw-hero");

      if (status === "ended") {
        var c = (CFG.components || {});
        var hb = c.heroButton || {};
        var links = Array.isArray(hb.endedLinks) ? hb.endedLinks : [];
        if (!links.length && endedMode() === "survey" && surveyUrl()) {
          links = [{ label: "만족도 조사 참여하기", url: surveyUrl(), style: "primary" }];
        }
        links.forEach(function(link) {
          if (!link || !link.url || !link.label) return;
          var a = el("a", "mw-btn " + (link.style === "secondary" ? "mw-btn-secondary" : "mw-btn-primary"), link.label);
          a.href = link.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          row.appendChild(a);
        });
      } else if (entry) {
        var enterBtn = el("a", "mw-btn mw-btn-primary", lb.live || "웨비나 입장하기");
        enterBtn.href = livePageUrl();
        row.appendChild(enterBtn);
        if (canRegisterNow(status)) {
          var regBtn2 = el("button", "mw-btn mw-btn-secondary", lb.registration || "사전등록하기");
          regBtn2.type = "button";
          regBtn2.addEventListener("click", goRegister);
          row.appendChild(regBtn2);
        }
      } else if (canRegisterNow(status)) {
        var regBtn = el("button", "mw-btn mw-btn-primary", lb.registration || "웨비나 사전등록");
        regBtn.type = "button";
        regBtn.addEventListener("click", goRegister);
        row.appendChild(regBtn);
      } else {
        row.appendChild(el("span", "mw-btn mw-btn-disabled", lb.upcoming || "사전등록 마감"));
      }

      mount.appendChild(row);
    });
  }

  /* ── 등록 폼 마운트 ── */
  function renderForms() {
    if (!componentEnabled("formWidget", true)) return;
    mounts("register-form").forEach(function(mount) {
      buildFormInto(mount, { prefill: snapshotForm(mount) });
    });
  }

  /* ── 라이브 iframe ── */
  function renderLive() {
    var liveMounts = mounts("live");
    if (!liveMounts.length) return;
    liveMounts.forEach(function(mount) {
      // slug 기준 가드 — activeWebinar 전환(전시 교체)이 config 로 오면 iframe 을 새 슬러그로 재렌더.
      if (mount.getAttribute("data-mw-slug") === CFG.slug) return;
      mount.setAttribute("data-mw-slug", CFG.slug);
      clear(mount);
      var frame = document.createElement("iframe");
      frame.className = "mw-live-frame";
      frame.src = BASE + "/webinar/" + CFG.slug + "/live";
      frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
      frame.setAttribute("allowfullscreen", "true");
      mount.appendChild(frame);
      window.addEventListener("message", function(ev) {
        try {
          // 이 프레임이 보낸 메시지만 신뢰 — 호스트 페이지의 다른 iframe/스크립트 위조 차단
          if (ev.source !== frame.contentWindow) return;
          var data = ev.data;
          if (data && data.type === "mach-resize" && typeof data.height === "number" && data.height > 200) {
            frame.style.height = Math.ceil(data.height) + "px";
          }
        } catch (e) {}
      });
    });
  }

  /* ── 하단 배너 ── */
  function bannerDismissKey(status) { return "mw_banner_off_" + SITE_ID + "_" + status; }
  function renderBanner() {
    var old = document.getElementById("mw-banner");
    if (old) old.parentNode.removeChild(old);

    if (mounts("live").length) return;
    if (!componentEnabled("banner", true)) return;
    if (!bannerAllowedOnPage()) return;

    var status = computeStatus();
    var entry = isEntryOpen(status);
    var c = (CFG.components || {});
    var bc = c.banner || {};
    var texts = bannerTexts();

    if (status === "ended" && (endedMode() === "hidden" || !surveyUrl())) return;
    try { if (bc.dismissible !== false && sessionStorage.getItem(bannerDismissKey(status))) return; } catch (e) {}

    var banner = el("div", "mw-banner mw-reset");
    banner.id = "mw-banner";
    var inner = el("div", "mw-banner-inner");
    var textArea = el("div", "mw-banner-text");
    var title = el("div", "mw-banner-title");
    var ctas = el("div", "mw-banner-ctas");

    if (status === "ended") {
      title.textContent = texts.ended || ((CFG.name || "웨비나") + "가 종료되었습니다. 참여해주셔서 감사합니다!");
      var sv = el("a", "mw-btn mw-btn-primary", "만족도 조사 참여하기");
      sv.href = surveyUrl();
      sv.target = "_blank";
      sv.rel = "noopener noreferrer";
      ctas.appendChild(sv);
    } else if (entry) {
      var badge = el("span", "mw-live-badge");
      badge.appendChild(el("span", "mw-live-dot"));
      badge.appendChild(document.createTextNode(status === "live" ? "LIVE" : "OPEN"));
      title.appendChild(badge);
      title.appendChild(document.createTextNode(
        texts.live || ((CFG.name || "웨비나") + (status === "live" ? "가 지금 진행 중입니다!" : " 입장이 시작됐어요!"))
      ));
      if (canRegisterNow(status)) {
        var rBtn = el("button", "mw-btn mw-btn-secondary", "사전등록");
        rBtn.type = "button";
        rBtn.addEventListener("click", openFormModal);
        ctas.appendChild(rBtn);
      }
      var goBtn = el("a", "mw-btn mw-btn-primary", "웨비나 입장하기");
      goBtn.href = livePageUrl();
      ctas.appendChild(goBtn);
    } else if (canRegisterNow(status)) {
      // 등록 중: 사전등록만 강조(입장 버튼은 오픈 전이므로 노출하지 않음). 앰버 펄스 배지로 "접수 중" 표시.
      var regBadge = el("span", "mw-reg-badge");
      regBadge.appendChild(el("span", "mw-reg-dot"));
      regBadge.appendChild(document.createTextNode("사전등록"));
      title.appendChild(regBadge);
      title.appendChild(document.createTextNode(
        texts.registration || ((CFG.name || "웨비나") + " 사전등록이 진행 중입니다.")
      ));
      var startTxt = fmtKstDateTime(CFG.liveStartAt);
      if (startTxt) {
        var sub = el("div", "mw-banner-sub");
        sub.textContent = "\\ud83d\\udcc5 " + startTxt + " 라이브";
        textArea.appendChild(title);
        textArea.appendChild(sub);
      }
      if (bc.showCalendarButton !== false) {
        var calBtn = el("button", "mw-btn mw-btn-secondary", "캘린더 추가");
        calBtn.type = "button";
        calBtn.addEventListener("click", openCalendar);
        ctas.appendChild(calBtn);
      }
      var regBtn = el("button", "mw-btn mw-btn-primary", "웨비나 사전등록");
      regBtn.type = "button";
      regBtn.addEventListener("click", openFormModal);
      ctas.appendChild(regBtn);
    } else {
      title.textContent = texts.upcoming || ((CFG.name || "웨비나") + "가 곧 시작됩니다.");
      if (bc.showCalendarButton !== false) {
        var calBtn2 = el("button", "mw-btn mw-btn-secondary", "캘린더 추가");
        calBtn2.type = "button";
        calBtn2.addEventListener("click", openCalendar);
        ctas.appendChild(calBtn2);
      }
    }

    if (!textArea.firstChild) textArea.appendChild(title);
    inner.appendChild(textArea);
    inner.appendChild(ctas);
    banner.appendChild(inner);

    document.body.appendChild(banner);
  }

  // KST 절대 시각 포맷 (예: "7월 7일 오후 7:44")
  function fmtKstDateTime(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
    } catch (e) { return ""; }
  }

  /* ── 렌더 오케스트레이션 ── */
  function renderAll() {
    if (!CFG) return;
    var status = computeStatus();
    var key = status + "|" + (isEntryOpen(status) ? "1" : "0") + "|" + (CFG.updatedKey || "");
    injectStyles();
    renderLive();
    if (key === lastRenderKey) return;
    lastRenderKey = key;
    renderHero();
    renderForms();
    renderBanner();
  }

  function scheduleBoundary() {
    if (boundaryTimer) clearTimeout(boundaryTimer);
    if (!CFG) return;
    var now = serverNowMs();
    var candidates = [parseMs(CFG.entryOpenAt), parseMs(CFG.liveStartAt), parseMs(CFG.liveEndAt), parseMs(CFG.signupDeadline)];
    var next = null;
    for (var i = 0; i < candidates.length; i++) {
      var t = candidates[i];
      if (t !== null && t > now && (next === null || t < next)) next = t;
    }
    if (next === null) return;
    var delay = Math.min(next - now + 1000, 12 * 60 * 60 * 1000);
    boundaryTimer = setTimeout(function() {
      renderAll();
      fetchConfig(true);
      scheduleBoundary();
    }, delay);
  }

  function inLiveWindow() {
    if (!CFG) return false;
    var now = serverNowMs();
    var start = parseMs(CFG.liveStartAt);
    var end = parseMs(CFG.liveEndAt);
    if (start === null || end === null) return false;
    return now >= start - LIVE_WINDOW_PAD_MS && now <= end + LIVE_WINDOW_PAD_MS;
  }
  function schedulePolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function() {
      if (inLiveWindow()) fetchConfig(true);
    }, LIVE_POLL_MS);
  }

  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState !== "visible") return;
    var now = Date.now();
    if (now - lastVisRefetchAt < VIS_REFETCH_THROTTLE_MS) return;
    lastVisRefetchAt = now;
    fetchConfig(true);
  });

  /* ── 부트 ── */
  function boot() {
    try {
      sendSeen();
      initConfig();
    } catch (e) { warn("boot failed", e); }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.MachWebinar = {
    refresh: function() { fetchConfig(true); },
    getState: function() { return { cfg: CFG, status: computeStatus(), entryOpen: CFG ? isEntryOpen(computeStatus()) : null }; }
  };
})();`;
}
