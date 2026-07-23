// 랜딩 임베드 로더 — <script src="/webinar/{slug}/embed"> 한 줄이:
//   ① 랜딩을 "자동높이 iframe"으로 삽입(호스트 페이지가 자연스럽게 스크롤 → 중첩 스크롤 없음).
//      - 자식(landing)이 문서 높이를 postMessage → 로더가 iframe height 갱신.
//      - 로더가 호스트 뷰포트 높이를 자식에 전달(--lnd-vh) → 히어로만 풀스크린, 나머지는 흐름.
//   ② 웨비나 상태(등록중/라이브중/종료)에 맞춰 호스트 페이지 하단에 "고정 배너"를 주입.
//      - 서버 계산 상태(/api/webinar/{slug}/info: status·entryOpen·canRegister)를 그대로 사용.
//      - 폴링(120초) + 탭 복귀 시 재fetch(30초 스로틀)로 상태 전환 자동 반영.
// 히어로 버튼은 랜딩 페이지 안에서 상태별로 전환된다(여기선 하단 배너만 담당).
// 기존 /w/{siteId} 로더·마운트 마커 방식은 그대로 유지(직접 아임웹 랜딩 구축용).

const POLL_MS = 120 * 1000;
const VIS_THROTTLE_MS = 30 * 1000;

export function buildLandingLoaderScript(origin: string, slug: string): string {
  const BASE = JSON.stringify(origin);
  const SLUG = JSON.stringify(slug);
  return `(function(){
  "use strict";
  var BASE = ${BASE};
  var SLUG = ${SLUG};
  var INFO_URL = BASE + "/api/webinar/" + encodeURIComponent(SLUG) + "/info";
  var LANDING_URL = BASE + "/webinar/" + encodeURIComponent(SLUG) + "/landing";
  var LIVE_URL = BASE + "/webinar/" + encodeURIComponent(SLUG) + "/live";
  var REGISTER_URL = LIVE_URL + "?view=signup";
  var mountId = "ms-webinar-" + SLUG;
  var scriptEl = document.currentScript;
  var STATE = null, lastVis = 0, banner = null;

  function el(tag, cls, text){ var e=document.createElement(tag); if(cls)e.className=cls; if(text!=null)e.textContent=text; return e; }

  /* ── ① 자동높이 iframe ── */
  function findMount(){
    var m = document.getElementById(mountId);
    if (m) return m;
    m = el("div"); m.id = mountId;
    if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.insertBefore(m, scriptEl);
    else document.body.appendChild(m);
    return m;
  }
  var frame = document.createElement("iframe");
  function mountFrame(){
    var mount = findMount();
    frame.src = LANDING_URL;
    frame.title = "웨비나 랜딩페이지";
    frame.setAttribute("allow", "autoplay; fullscreen");
    frame.setAttribute("loading", "eager");
    frame.style.cssText = "display:block;width:100%;border:0;min-height:640px";
    mount.appendChild(frame);
    function sendViewport(){
      try { if (frame.contentWindow) frame.contentWindow.postMessage({ type:"machstudio:host-viewport", vh: window.innerHeight }, BASE); } catch(e){}
    }
    frame.addEventListener("load", sendViewport);
    window.addEventListener("resize", sendViewport);
    window.addEventListener("message", function(ev){
      if (ev.origin !== BASE) return;
      var d = ev.data || {};
      if (d.type === "machstudio:landing-height" && d.slug === SLUG && typeof d.height === "number") {
        frame.style.height = Math.ceil(d.height) + "px";
      }
    });
  }

  /* ── ② 상태 배너 ── */
  function injectStyles(){
    if (document.getElementById("mslb-styles")) return;
    var css = [
      ".mslb-reset, .mslb-reset * { box-sizing:border-box; }",
      ".mslb { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); width:680px; max-width:calc(100vw - 32px); z-index:2147483000; border-radius:16px; background:linear-gradient(180deg, rgba(20,20,26,0.94), rgba(12,12,17,0.9)); border:1px solid rgba(255,255,255,0.14); color:#fff; box-shadow:0 16px 48px rgba(0,0,0,0.42); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); font-family:Pretendard,'Noto Sans KR',-apple-system,BlinkMacSystemFont,sans-serif; }",
      ".mslb-inner { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 16px 14px 20px; }",
      ".mslb-text { min-width:0; }",
      ".mslb-title { font-size:14px; font-weight:700; color:rgba(255,255,255,0.96); line-height:1.45; word-break:keep-all; }",
      ".mslb-sub { display:inline-flex; align-items:center; gap:6px; margin-top:4px; font-size:12px; font-weight:600; color:#fbbf24; font-variant-numeric:tabular-nums; }",
      ".mslb-ctas { display:flex; align-items:center; gap:8px; flex:0 0 auto; }",
      ".mslb-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:11px 18px; border-radius:10px; border:0; font-size:13px; font-weight:800; cursor:pointer; text-decoration:none; white-space:nowrap; }",
      ".mslb-btn-primary { background:var(--mslb-accent,#ff8500); color:var(--mslb-on-accent,#fff); }",
      ".mslb-btn-secondary { background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); }",
      ".mslb-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; margin-right:6px; border-radius:6px; font-size:11px; font-weight:800; letter-spacing:0.04em; vertical-align:1px; }",
      ".mslb-badge-live { background:rgba(34,197,94,0.16); border:1px solid rgba(34,197,94,0.34); color:#4ade80; }",
      ".mslb-badge-reg { background:rgba(251,191,36,0.16); border:1px solid rgba(251,191,36,0.34); color:#fbbf24; }",
      ".mslb-dot { width:7px; height:7px; border-radius:50%; background:currentColor; animation:mslb-pulse 1.5s ease-in-out infinite; }",
      "@keyframes mslb-pulse { 0%,100%{opacity:1;} 50%{opacity:0.35;} }",
      ".mslb-close { flex:0 0 auto; width:26px; height:26px; margin-left:2px; border:0; border-radius:8px; background:transparent; color:rgba(255,255,255,0.6); font-size:18px; line-height:1; cursor:pointer; }",
      ".mslb-close:hover { background:rgba(255,255,255,0.1); color:#fff; }",
      "@media (prefers-reduced-motion: reduce){ .mslb-dot{ animation:none; } }",
      "@media (max-width:600px){ .mslb{ left:12px; right:12px; bottom:12px; width:auto; transform:none; } .mslb-inner{ flex-direction:column; align-items:stretch; gap:10px; } .mslb-ctas{ width:100%; } .mslb-btn{ flex:1; } .mslb-close{ position:absolute; top:8px; right:8px; } }"
    ].join("\\n");
    var style = el("style"); style.id = "mslb-styles"; style.textContent = css;
    document.head.appendChild(style);
  }

  function texts(){
    var c = (STATE && STATE.components) || {};
    return (c.banner && c.banner.textByStatus) || {};
  }
  function accent(){
    var t = (STATE && STATE.theme) || {};
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t.accentColor || "") ? t.accentColor : "#ff8500";
  }
  function onAccent(a){
    var h = a.replace("#",""); if (h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    return ((0.299*r+0.587*g+0.114*b)/255) >= 0.78 ? "#1a1a1f" : "#fff";
  }
  function fmtKst(iso){
    try { var d=new Date(iso); if(isNaN(d.getTime()))return "";
      return new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(d);
    } catch(e){ return ""; }
  }
  function calUrl(){
    var name = encodeURIComponent((STATE && STATE.name) || "Webinar");
    function g(iso){ var d=new Date(iso); return isNaN(d.getTime())?"":d.toISOString().split(".")[0].replace(/[-:]/g,"")+"Z"; }
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text="+name+"&dates="+g(STATE.liveStartAt)+"/"+g(STATE.liveEndAt)+"&ctz=Asia/Seoul";
  }
  function dismissKey(){ return "mslb-x-" + SLUG + "-" + (STATE ? STATE.status : ""); }

  function renderBanner(){
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
    if (!STATE) return;
    var status = STATE.status, entry = STATE.entryOpen, canReg = STATE.canRegister;
    if (status === "ended" && (STATE.endedMode === "hidden")) return;
    try { if (sessionStorage.getItem(dismissKey())) return; } catch(e){}

    injectStyles();
    var name = (STATE && STATE.name) || "웨비나";
    var t = texts();
    var a = accent();

    banner = el("div", "mslb mslb-reset");
    banner.style.setProperty("--mslb-accent", a);
    banner.style.setProperty("--mslb-on-accent", onAccent(a));
    var inner = el("div", "mslb-inner");
    var textArea = el("div", "mslb-text");
    var title = el("div", "mslb-title");
    var ctas = el("div", "mslb-ctas");

    if (status === "ended") {
      title.textContent = t.ended || (name + " 웨비나가 종료되었습니다. 참여해주셔서 감사합니다!");
      var rep = el("a", "mslb-btn mslb-btn-primary", "다시보기");
      rep.href = LIVE_URL; rep.target = "_blank"; rep.rel = "noopener";
      ctas.appendChild(rep);
    } else if (entry) {
      var badge = el("span", "mslb-badge mslb-badge-live");
      badge.appendChild(el("span", "mslb-dot"));
      badge.appendChild(document.createTextNode(status === "live" ? "LIVE" : "OPEN"));
      title.appendChild(badge);
      title.appendChild(document.createTextNode(
        t.live || (name + (status === "live" ? "가 지금 진행 중입니다!" : " 입장이 시작됐어요!"))
      ));
      if (canReg) {
        var rBtn = el("a", "mslb-btn mslb-btn-secondary", "사전등록");
        rBtn.href = REGISTER_URL; rBtn.target = "_blank"; rBtn.rel = "noopener";
        ctas.appendChild(rBtn);
      }
      var go = el("a", "mslb-btn mslb-btn-primary", "웨비나 입장하기");
      go.href = LIVE_URL; go.target = "_blank"; go.rel = "noopener";
      ctas.appendChild(go);
    } else if (canReg) {
      var rb = el("span", "mslb-badge mslb-badge-reg");
      rb.appendChild(el("span", "mslb-dot"));
      rb.appendChild(document.createTextNode("사전등록"));
      title.appendChild(rb);
      title.appendChild(document.createTextNode(t.registration || (name + " 사전등록이 진행 중입니다.")));
      var startTxt = fmtKst(STATE.liveStartAt);
      if (startTxt) {
        var sub = el("div", "mslb-sub", "\\uD83D\\uDCC5 " + startTxt + " 라이브");
        textArea.appendChild(title);
        textArea.appendChild(sub);
      }
      var cal = el("a", "mslb-btn mslb-btn-secondary", "캘린더 추가");
      cal.href = calUrl(); cal.target = "_blank"; cal.rel = "noopener";
      ctas.appendChild(cal);
      var reg = el("a", "mslb-btn mslb-btn-primary", "사전 등록하기");
      reg.href = REGISTER_URL; reg.target = "_blank"; reg.rel = "noopener";
      ctas.appendChild(reg);
    } else {
      title.textContent = t.upcoming || (name + "가 곧 시작됩니다.");
      var cal2 = el("a", "mslb-btn mslb-btn-secondary", "캘린더 추가");
      cal2.href = calUrl(); cal2.target = "_blank"; cal2.rel = "noopener";
      ctas.appendChild(cal2);
    }

    if (!textArea.firstChild) textArea.appendChild(title);
    var close = el("button", "mslb-close", "\\u00d7");
    close.type = "button"; close.setAttribute("aria-label", "배너 닫기");
    close.addEventListener("click", function(){
      try { sessionStorage.setItem(dismissKey(), "1"); } catch(e){}
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      banner = null;
    });
    inner.appendChild(textArea);
    inner.appendChild(ctas);
    inner.appendChild(close);
    banner.appendChild(inner);
    document.body.appendChild(banner);
  }

  /* ── 상태 fetch + 폴링 ── */
  function fetchState(){
    fetch(INFO_URL, { cache: "no-store" }).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
      if (!d || !d.webinar) return;
      STATE = {
        status: d.status, entryOpen: d.entryOpen, canRegister: d.canRegister,
        name: d.webinar.name, liveStartAt: d.webinar.liveStartAt, liveEndAt: d.webinar.liveEndAt,
        components: d.webinar.components || {}, theme: d.webinar.theme || {},
        endedMode: ((d.webinar.components || {}).endedMode) || "survey"
      };
      renderBanner();
    }).catch(function(){});
  }

  function start(){
    mountFrame();
    fetchState();
    setInterval(fetchState, ${POLL_MS});
    document.addEventListener("visibilitychange", function(){
      if (document.visibilityState !== "visible") return;
      var now = Date.now();
      if (now - lastVis < ${VIS_THROTTLE_MS}) return;
      lastVis = now;
      fetchState();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();`;
}
