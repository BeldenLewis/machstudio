// 공용 UTM/어트리뷰션 클라이언트 코드 — collect 스크립트와 웨비나 로더가 공유한다.
// localStorage/sessionStorage/cookie 삼중 저장, first/last-touch, 여정(최대 20), 클릭ID 추론.
// 노출 함수: migrateLegacyUtm(), captureUtm(), storageGet(key), emptyUtm(), inferFromReferrer()
// 상수: UTM_LAST_KEY, UTM_FIRST_KEY, JOURNEY_KEY (localStorage 키를 공유하므로 collect와 웨비나가 같은 방문자 여정을 본다)
//
// 주의: **사이트별로 달라지는 보간은 금지**다(로더 캐시가 사이트마다 갈라진다). 아래 맵 주입은
// 앱 전체에서 상수라 캐시 키에 영향이 없다 — 채널 맵을 TS 모듈에서 가져와 박는 이유는, 예전에
// 이 문자열과 서버·라이브 페이지가 각자 맵을 들고 있어서 같은 리퍼러가 경로마다 다른 채널로
// 기록됐기 때문이다(정본: attribution-normalize.ts).

import { CLICK_ID_MAP, REFERRER_MAP, UTM_MAX_LENGTH } from "./attribution-normalize";

// REFERRER_MAP 은 [source, medium] 튜플 — 아래 문자열 코드가 배열 인덱스로 읽으므로 그대로 직렬화한다.
const CLICK_ID_MAP_JSON = JSON.stringify(CLICK_ID_MAP);
const REFERRER_MAP_JSON = JSON.stringify(REFERRER_MAP);

export const ATTRIBUTION_CORE_JS = `  /* iOS Safari ITP: localStorage가 7일 후 만료될 수 있음. 서버측 first-party cookie 도입 시까지 제약. */
  var UTM_LAST_KEY  = "mach_utm";
  var UTM_FIRST_KEY = "mach_utm_first";
  var SESSION_KEY   = "mach_session";
  var JOURNEY_KEY   = "mach_utm_journey";
  var LEGACY_UTM_LAST_KEY  = "x" + "flow_utm";
  var LEGACY_UTM_FIRST_KEY = "x" + "flow_utm_first";
  var UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000;   // 30분
  var JOURNEY_MAX = 20;
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"];

  // 클릭 ID → source/medium 매핑, 리퍼러 호스트 → [source, medium]
  // 둘 다 정본은 attribution-normalize.ts — 서버·라이브 페이지와 같은 맵을 쓰기 위해 주입한다.
  var CLICK_ID_MAP = ${CLICK_ID_MAP_JSON};
  var REFERRER_MAP = ${REFERRER_MAP_JSON};

  function emptyUtm() { return { utmSource:"", utmMedium:"", utmCampaign:"", utmTerm:"", utmContent:"", utmId:"", referrer:"", seenAt:"" }; }

  function isBot() {
    var ua = navigator.userAgent || "";
    return /bot|crawl|spider|slurp|googlebot|bingbot|facebookexternalhit|whatsapp|telegram|twitterbot|linkedinbot/i.test(ua);
  }

  function isKakaoInApp() { return /KAKAOTALK/i.test(navigator.userAgent || ""); }

  function getCookieDomain() {
    var host = location.hostname;
    if (!host || /^[0-9.]+$/.test(host) || host === "localhost") return null;
    var parts = host.split(".");
    if (parts.length < 2) return null;
    if (parts.length >= 3 && (parts[parts.length - 2] === "co" || parts[parts.length - 2] === "ne" || parts[parts.length - 2] === "or")) {
      return "." + parts.slice(-3).join(".");
    }
    return "." + parts.slice(-2).join(".");
  }

  function storageGet(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed._exp && parsed._exp > Date.now()) return parsed.v;
        if (parsed && !parsed._exp) return parsed;
      }
    } catch(e) {}
    try {
      var raw2 = sessionStorage.getItem(key);
      if (raw2) {
        var p2 = JSON.parse(raw2);
        return (p2 && p2.v) ? p2.v : p2;
      }
    } catch(e) {}
    try {
      var cookies = document.cookie ? document.cookie.split(";") : [];
      for (var i = 0; i < cookies.length; i++) {
        var c = cookies[i].replace(/^\\s+/, "");
        if (c.indexOf(key + "=") === 0) return JSON.parse(decodeURIComponent(c.substring(key.length + 1)));
      }
    } catch(e) {}
    return null;
  }

  function storageSet(key, value, ttlMs) {
    var payload = JSON.stringify({ v: value, _exp: Date.now() + ttlMs });
    try { localStorage.setItem(key, payload); } catch(e) {}
    try { sessionStorage.setItem(key, payload); } catch(e) {}
    try {
      var maxAge = Math.floor(ttlMs / 1000);
      var cookieStr = key + "=" + encodeURIComponent(JSON.stringify(value)) + ";path=/;max-age=" + maxAge + ";SameSite=Lax";
      var dom = getCookieDomain();
      if (dom) cookieStr += ";domain=" + dom;
      document.cookie = cookieStr;
    } catch(e) {}
  }

  function migrateLegacyUtm() {
    if (!storageGet(UTM_LAST_KEY)) {
      var legacyLast = storageGet(LEGACY_UTM_LAST_KEY);
      if (legacyLast) storageSet(UTM_LAST_KEY, legacyLast, UTM_TTL_MS);
    }
    if (!storageGet(UTM_FIRST_KEY)) {
      var legacyFirst = storageGet(LEGACY_UTM_FIRST_KEY);
      if (legacyFirst) storageSet(UTM_FIRST_KEY, legacyFirst, UTM_TTL_MS);
    }
  }

  function param(params, key) {
    return params.get(key) || params.get(key.toUpperCase()) || params.get(key.replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); })) || "";
  }

  function hasAnyUtm(params) {
    for (var i = 0; i < UTM_KEYS.length; i++) {
      if (param(params, UTM_KEYS[i])) return true;
    }
    return false;
  }

  function findClickId(params) {
    for (var k in CLICK_ID_MAP) {
      var v = params.get(k) || params.get(k.toLowerCase());
      if (v) return { id: v, source: CLICK_ID_MAP[k].source, medium: CLICK_ID_MAP[k].medium, key: k };
    }
    return null;
  }

  // utmSource/utmMedium 은 lowercase+trim(+"어트리뷰션 없음" 센티널 접기), 나머지는 trim 만.
  // 길이 컷은 서버(방문·등록)와 같은 값이어야 한다 — 예전엔 방문 100자/등록 500자라 긴 값이
  // 두 키로 갈라져 같은 유입이 표에서 분리됐다.
  var UTM_MAX_LEN = ${UTM_MAX_LENGTH};
  var DIRECT_SENTINELS = ["(direct)", "(none)", "(not set)", "direct", "none"];
  function foldDirect(v) {
    for (var i = 0; i < DIRECT_SENTINELS.length; i++) { if (v === DIRECT_SENTINELS[i]) return ""; }
    return v;
  }
  function normalizeUtm(u) {
    var lcTrim = function(s) { return foldDirect((s || "").toString().trim().toLowerCase()).slice(0, UTM_MAX_LEN); };
    var tr = function(s) { return (s || "").toString().trim().slice(0, UTM_MAX_LEN); };
    return {
      utmSource:   lcTrim(u.utmSource),
      utmMedium:   lcTrim(u.utmMedium),
      utmCampaign: tr(u.utmCampaign),
      utmTerm:     tr(u.utmTerm),
      utmContent:  tr(u.utmContent),
      utmId:       tr(u.utmId),
      referrer:    u.referrer || "",
      seenAt:      u.seenAt || new Date().toISOString()
    };
  }

  function readUrlUtm() {
    var params = new URLSearchParams(window.location.search);
    var hasUtm = hasAnyUtm(params);
    var click = findClickId(params);
    if (!hasUtm && !click) return null;
    var base = {
      utmSource:   param(params, "utm_source"),
      utmMedium:   param(params, "utm_medium"),
      utmCampaign: param(params, "utm_campaign"),
      utmTerm:     param(params, "utm_term"),
      utmContent:  param(params, "utm_content"),
      utmId:       param(params, "utm_id"),
      referrer:    document.referrer || "",
      seenAt:      new Date().toISOString()
    };
    // 클릭 ID 있고 utm_source/medium 비어있으면 derive
    if (click) {
      if (!base.utmSource) base.utmSource = click.source;
      if (!base.utmMedium) base.utmMedium = click.medium;
      if (!base.utmId)     base.utmId    = click.id;
    }
    return normalizeUtm(base);
  }

  function inferFromReferrer() {
    var ref = document.referrer;
    if (!ref) return null;
    try {
      var u = new URL(ref);
      var host = u.hostname.replace(/^www\\./, "").toLowerCase();
      if (u.hostname === location.hostname) return null;
      var matched = null;
      for (var k in REFERRER_MAP) {
        if (host === k || host.endsWith("." + k)) { matched = REFERRER_MAP[k]; break; }
      }
      if (matched) {
        return normalizeUtm({
          utmSource: matched[0], utmMedium: matched[1],
          utmCampaign: "", utmTerm: "", utmContent: "", utmId: "",
          referrer: ref, seenAt: new Date().toISOString()
        });
      }
      return normalizeUtm({
        utmSource: host, utmMedium: "referral",
        utmCampaign: "", utmTerm: "", utmContent: "", utmId: "",
        referrer: ref, seenAt: new Date().toISOString()
      });
    } catch(e) { return null; }
  }

  /* 완전 다이렉트는 **빈 값**으로 기록한다.
     예전엔 리터럴 "(direct)"/"(none)" 을 저장했는데, 같은 상황을 자체 라이브 페이지는 null,
     스토리지 실패는 "" 로 저장해서 집계가 세 키로 갈라졌다 — 표에는 똑같이 '직접 유입' 으로
     보이는 행이 두 줄 생기고 방문과 등록이 서로 다른 줄에 붙었다. 라벨은 화면에서만 붙인다. */
  function inferDirect() {
    return normalizeUtm({
      utmSource: "", utmMedium: "",
      utmCampaign: "", utmTerm: "", utmContent: "", utmId: "",
      referrer: "", seenAt: new Date().toISOString()
    });
  }

  // 30분 세션 — lastActivity 기준
  function getSession() {
    var s = storageGet(SESSION_KEY);
    if (s && s.lastActivity && (Date.now() - s.lastActivity) < SESSION_TIMEOUT_MS) return s;
    return null;
  }
  function updateSessionActivity() {
    storageSet(SESSION_KEY, { lastActivity: Date.now() }, UTM_TTL_MS);
  }

  function appendToJourney(utm) {
    var journey = storageGet(JOURNEY_KEY) || [];
    if (!Array.isArray(journey)) journey = [];
    var last = journey[journey.length - 1];
    if (last && last.utmSource === utm.utmSource && last.utmMedium === utm.utmMedium && last.utmCampaign === utm.utmCampaign) return;
    journey.push({
      utmSource: utm.utmSource, utmMedium: utm.utmMedium, utmCampaign: utm.utmCampaign,
      utmId: utm.utmId || "", referrer: utm.referrer || "", seenAt: utm.seenAt
    });
    if (journey.length > JOURNEY_MAX) journey = journey.slice(-JOURNEY_MAX);
    storageSet(JOURNEY_KEY, journey, UTM_TTL_MS);
  }

  function captureUtm() {
    if (isBot()) return;

    var urlUtm = readUrlUtm();
    var existingSession = getSession();

    if (urlUtm) {
      // URL에 UTM/clickID 있음 → last 갱신, first 미설정 시 first도 설정, journey 추가
      storageSet(UTM_LAST_KEY, urlUtm, UTM_TTL_MS);
      if (!storageGet(UTM_FIRST_KEY)) storageSet(UTM_FIRST_KEY, urlUtm, UTM_TTL_MS);
      appendToJourney(urlUtm);
      updateSessionActivity();
      return;
    }

    if (existingSession) {
      // 세션 계속 (30분 이내) — last 변경하지 않음, journey 추가하지 않음
      updateSessionActivity();
      return;
    }

    // 새 세션 시작, URL UTM 없음 → referrer / kakao / direct 순서로 추론
    var refUtm = inferFromReferrer();
    if (refUtm) {
      storageSet(UTM_LAST_KEY, refUtm, UTM_TTL_MS);
      if (!storageGet(UTM_FIRST_KEY)) storageSet(UTM_FIRST_KEY, refUtm, UTM_TTL_MS);
      appendToJourney(refUtm);
      updateSessionActivity();
      return;
    }

    if (isKakaoInApp()) {
      var kakaoUtm = normalizeUtm({
        utmSource: "kakao", utmMedium: "messenger",
        utmCampaign: "", utmTerm: "", utmContent: "", utmId: "",
        referrer: "", seenAt: new Date().toISOString()
      });
      storageSet(UTM_LAST_KEY, kakaoUtm, UTM_TTL_MS);
      if (!storageGet(UTM_FIRST_KEY)) storageSet(UTM_FIRST_KEY, kakaoUtm, UTM_TTL_MS);
      appendToJourney(kakaoUtm);
      updateSessionActivity();
      return;
    }

    // 완전 다이렉트 — first 가 아직 없을 때만 (direct) 로 마킹
    if (!storageGet(UTM_FIRST_KEY)) {
      var directUtm = inferDirect();
      storageSet(UTM_LAST_KEY, directUtm, UTM_TTL_MS);
      storageSet(UTM_FIRST_KEY, directUtm, UTM_TTL_MS);
      appendToJourney(directUtm);
    }
    updateSessionActivity();
  }
`;
