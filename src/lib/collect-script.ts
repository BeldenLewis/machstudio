/**
 * Collect 스크립트 생성 로직.
 * 두 가지 형태를 만든다:
 *  - utmScript: 사이트 공통 헤더/푸터용 UTM 보존 라이브러리 (form 페이지가 아닌 곳에도 설치).
 *  - script:   form 페이지에 설치되는 실제 수집 스크립트. (utm 보존 로직 + form 수집 + 전송)
 *
 * GTM 스타일 short loader (`/s/{id}`)와 inline copy 양쪽에서 동일한 본문을 사용한다.
 */
import { ATTRIBUTION_CORE_JS } from "./attribution-core";
import { safeRedirectTarget } from "./collect-redirect";

export type CollectFieldMapping = {
  index: number;
  key: string;
  label: string;
};

export type CollectScriptSource = {
  id: string;
  apiKey: string;
  successTrigger: string;
  redirectUrl: string | null;
  // 폼 감지가 활성화되는 페이지 경로 패턴 (glob, `*`는 어떤 문자열에도 매칭).
  // 빈 배열이면 모든 페이지에서 활성화 (기존 동작 유지).
  formPagePatterns?: string[];
  /**
   * 필드 하나를 묶어서 보는 CSS 선택자. 기본 ".form-group" 은 아임웹 폼 빌더 전용 관례라
   * 직접 만든 신청서(표 형태 등)에는 안 먹는다 — 그런 사이트는 운영자가 "필드 자동 감지"
   * 스니퍼로 찾은 선택자를 여기 넣는다(collect-sources/[id]/page.tsx).
   */
  fieldGroupSelector?: string;
};

export type BuildCollectScriptsInput = {
  source: CollectScriptSource;
  fieldMappings: CollectFieldMapping[];
  baseUrl: string;
};

export type BuildCollectScriptsOutput = {
  script: string;
  utmScript: string;
};

export function buildCollectScripts({
  source,
  fieldMappings,
  baseUrl,
}: BuildCollectScriptsInput): BuildCollectScriptsOutput {
  const collectUrl = `${baseUrl}/api/collect`;

  const fieldMap = fieldMappings
    .map(
      (f) =>
        `    { index: ${f.index}, key: ${JSON.stringify(f.key)}, label: ${JSON.stringify(f.label)} }`,
    )
    .join(",\n");

  // ── 공통 UTM/어트리뷰션 라이브러리 본문 ─────────────────────────
  // utmScript / script 양쪽에 동일하게 주입.
  // iOS Safari ITP: localStorage가 7일 후 만료될 수 있음. 서버측 first-party cookie 도입 시까지 제약.
  const utmCore = ATTRIBUTION_CORE_JS;

  const utmScript = `(function() {
${utmCore}
  migrateLegacyUtm();
  captureUtm();

  // 주의: 페이지 내부 링크에 UTM을 자동으로 덧붙이는 동작은 제거했어요.
  // 저장된 UTM은 form submission 시 localStorage에서 읽어 attribution에만 사용.

  window.MachUtm = window.MachUtm || {};
  window.MachUtm.capture = captureUtm;
  window.MachUtm.get = function() {
    return {
      last: storageGet(UTM_LAST_KEY) || emptyUtm(),
      first: storageGet(UTM_FIRST_KEY) || emptyUtm(),
      journey: storageGet(JOURNEY_KEY) || []
    };
  };
})();`;

  /**
   * 완료 후 이동 주소를 **스크립트를 굽기 전에 한 번 거른다**(collect-redirect).
   *
   * 이 값은 인증된 운영자가 넣지만 방문자 브라우저의 location 에 그대로 들어간다.
   * 연동형 저장 경로에는 스킴 검사가 없어서, javascript: 스킴이면 파트너 오리진에서
   * 임의 JS 가 돌고 프로토콜 상대 주소면 오픈 리다이렉트가 된다.
   * 상대경로(슬래시로 시작)는 살아 있는 소스에 실제로 저장돼 있으므로 통과시킨다 —
   * 절대 URL 만 허용하면 그 소스들의 이동이 조용히 끊긴다.
   */
  const redirectUrl = safeRedirectTarget(source.redirectUrl ?? "") ?? "";

  const script = `(function() {
  var COLLECT_URL = ${JSON.stringify(collectUrl)};
  var API_KEY = ${JSON.stringify(source.apiKey)};
  var SUCCESS_TRIGGER = ${JSON.stringify(source.successTrigger)};
  // 이동 주소는 아래 script 를 만들기 전에 safeRedirectTarget 으로 이미 걸렀다.
  var REDIRECT_URL = ${JSON.stringify(redirectUrl)};
  // 폼 감지가 활성화될 페이지 경로 패턴 (glob). 빈 배열 = 모든 페이지.
  var FORM_PAGE_PATTERNS = ${JSON.stringify(source.formPagePatterns ?? [])};
  // 필드 하나를 묶어서 보는 선택자 — 기본은 아임웹 관례(.form-group), 그 외 사이트는
  // 운영자가 "필드 자동 감지" 스니퍼로 찾은 값으로 바꿔 둔다.
  var GROUP_SELECTOR = ${JSON.stringify(source.fieldGroupSelector || ".form-group")};

  var FIELD_MAP = [
${fieldMap}
  ];

  // glob 매칭: \`*\` 는 어떤 문자열에도 매칭. 정규식 메타문자는 이스케이프.
  // 대소문자 무시 + 끝 슬래시 관용 (URL 경로는 흔히 대소문자/슬래시가 섞임).
  function normPath(p) {
    p = (p || "/").toLowerCase();
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return p;
  }
  function pathMatchesPattern(pathname, pattern) {
    var pat = normPath(pattern);
    var path = normPath(pathname);
    var escaped = pat.replace(/[.+?^\${}()|[\\]\\\\]/g, "\\\\$&").replace(/\\*/g, ".*");
    try {
      return new RegExp("^" + escaped + "$").test(path);
    } catch (e) { return false; }
  }

  function isFormPage() {
    // 빈 배열 = 모든 페이지에서 폼 감지 활성화 (기존 동작 유지).
    if (!FORM_PAGE_PATTERNS || FORM_PAGE_PATTERNS.length === 0) return true;
    var path = window.location.pathname || "/";
    for (var i = 0; i < FORM_PAGE_PATTERNS.length; i++) {
      if (pathMatchesPattern(path, FORM_PAGE_PATTERNS[i])) return true;
    }
    return false;
  }

  // ── UTM 어트리뷰션 (first-touch + last-touch + multi-touch journey) ──
${utmCore}

  migrateLegacyUtm();
  captureUtm();

  function getUtmContext() {
    var last = storageGet(UTM_LAST_KEY) || emptyUtm();
    var first = storageGet(UTM_FIRST_KEY) || last;
    if (!last.utmSource && !first.utmSource) {
      var refUtm = inferFromReferrer();
      if (refUtm) { last = refUtm; first = refUtm; }
    }
    var journey = storageGet(JOURNEY_KEY) || [];
    if (!Array.isArray(journey)) journey = [];
    return { last: last, first: first, journey: journey };
  }

  // "필드 자동 감지" 스니퍼(collect/[id]/page.tsx)는 GROUP_SELECTOR 로 찾은 요소 중
  // input/select/textarea 가 있는 것만 골라서 순서를 매긴다(섹션 제목·안내문 등도
  // 같은 클래스를 쓰는 사이트가 있어서다 — 예: 마이스허브). 여기서 거르지 않고 그대로
  // querySelectorAll 순서를 쓰면, 입력이 없는 요소가 하나라도 앞에 끼는 순간 스니퍼가
  // 찍은 index 와 실제 DOM 위치가 어긋나 그 뒤 모든 필드가 엉뚱한 값을 모은다 — 스니퍼와
  // 반드시 같은 필터를 써야 index 가 서로 맞는다.
  function getGroups() {
    var all = document.querySelectorAll(GROUP_SELECTOR);
    return Array.prototype.filter.call(all, function(g) {
      return g.querySelector("input, select, textarea");
    });
  }

  function getFieldMeta() {
    var groups = getGroups();
    return Array.from(groups).map(function(group, i) {
      // 체크박스·라디오 "옵션"의 label(입력을 바로 감싸는 것)과 필드 "제목"을 구분해야 한다 —
      // 일부 플랫폼(예: 마이스허브)은 옵션 텍스트가 label>input 구조라, 구분 없이 label 을
      // 그냥 집으면 "관람 예정 일자" 대신 "9월 17일(목)" 같은 옵션 텍스트가 잡힌다. 입력을
      // 감싸는 컨테이너(.input-area 등)가 아닌 형제 요소를 먼저 본다 — 그런 래퍼가 없는
      // 사이트(아임웹 등)는 label 자신이 그 자리에서 바로 걸려 기존 동작과 같다.
      // th — 표 형태 신청서(<tr><th>라벨</th><td><input></td></tr>)는 label 태그가 없다.
      var titleEl = group.querySelector(":scope > *:not(.input-area)");
      var labelEl = (titleEl && titleEl.textContent.trim()) ? titleEl : group.querySelector("label, th");
      var input = group.querySelector("input, select, textarea");
      var labelText = (labelEl ? labelEl.textContent.trim() : "") ||
        (input ? (input.placeholder || input.getAttribute("name") || "") : "");
      var type = "text";
      if (input) {
        if (input.tagName === "SELECT") type = "select";
        else if (input.type === "checkbox") type = "checkbox";
        else if (input.type === "radio") type = "radio";
      }
      return { index: i, label: labelText, type: type };
    });
  }

  function collectData() {
    var groups = getGroups();
    var data = {};
    FIELD_MAP.forEach(function(field) {
      var group = groups[field.index];
      if (!group) return;
      var els = group.querySelectorAll("input, select, textarea");
      if (!els || els.length === 0) return;

      var checked = [];
      var hasChoice = false;
      var textValues = [];
      Array.prototype.forEach.call(els, function(el) {
        var t = (el.type || "").toLowerCase();
        if (t === "checkbox" || t === "radio") {
          hasChoice = true;
          if (el.checked) {
            var label = el.closest ? el.closest("label") : null;
            var txt = label ? (label.textContent || "").trim() : "";
            checked.push(txt || el.value || "");
          }
        } else {
          var v = (el.value || "").trim();
          if (v) textValues.push(v);
        }
      });

      if (hasChoice) {
        data[field.key] = checked.join(", ");
      } else if (textValues.length === 0) {
        data[field.key] = "";
      } else if (textValues.length === 1) {
        data[field.key] = textValues[0];
      } else {
        var allNumeric = textValues.every(function(v) { return /^\\d+$/.test(v); });
        data[field.key] = textValues.join(allNumeric ? "" : " ");
      }
    });
    return data;
  }

  function sendData(formData) {
    var ctx = getUtmContext();
    var last = ctx.last;
    var first = ctx.first;
    fetch(COLLECT_URL, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        data: formData,
        _fieldMeta: getFieldMeta(),
        utmSource:   last.utmSource,
        utmMedium:   last.utmMedium,
        utmCampaign: last.utmCampaign,
        utmTerm:     last.utmTerm,
        utmContent:  last.utmContent,
        utmId:       last.utmId || "",
        firstUtmSource:   first.utmSource,
        firstUtmMedium:   first.utmMedium,
        firstUtmCampaign: first.utmCampaign,
        firstUtmTerm:     first.utmTerm,
        firstUtmContent:  first.utmContent,
        firstUtmId:       first.utmId || "",
        firstReferrer:    first.referrer || "",
        firstSeenAt:      first.seenAt   || "",
        journey:   ctx.journey,
        referrer:  document.referrer,
        userAgent: navigator.userAgent
      })
    }).catch(function() {});
  }

  // ── 폼 감지 — 패턴에 매칭된 페이지에서만 활성화. UTM 캡처는 위에서 이미 모든 페이지에 대해 실행됨.
  if (isFormPage()) {
    var triggered = false;
    var pendingData = null;
    var pendingAt = 0;
    var sentFingerprints = {};

    // 같은 데이터 중복 전송 방지용 지문 (5초 윈도우)
    function fingerprint(data) {
      try { return JSON.stringify(data); } catch (e) { return String(Date.now()); }
    }

    function capture() {
      var d = collectData();
      // 의미있는 값이 하나라도 있으면 캡처
      var hasValue = false;
      for (var k in d) { if (d[k] && String(d[k]).trim() !== "") { hasValue = true; break; } }
      if (hasValue) {
        pendingData = d;
        pendingAt = Date.now();
      }
      return hasValue;
    }

    function doSend(data, opts) {
      if (!data) return;
      var fp = fingerprint(data);
      var now = Date.now();
      // 5초 내 같은 지문은 중복으로 간주, skip
      if (sentFingerprints[fp] && (now - sentFingerprints[fp]) < 5000) return;
      sentFingerprints[fp] = now;
      sendData(data);
    }

    // 제출 버튼 클릭 → 데이터 캡처
    document.addEventListener("click", function(e) {
      var target = e.target;
      var btn = target.closest
        ? target.closest("button, input[type='submit'], a")
        : null;
      if (!btn) return;
      var text = (btn.innerText || btn.value || "").trim();
      var isSubmit = btn.type === "submit"
        || /확인|접수|제출|신청|등록|보내기|완료|submit|apply|register|send/i.test(text);
      if (isSubmit) capture();
    }, true);

    // native form submit 이벤트 → 데이터 캡처 (버튼 텍스트 매칭 실패 대비)
    document.addEventListener("submit", function() { capture(); }, true);

    // 성공 트리거 텍스트 감지 → 전송 (primary)
    var fire = function() {
      if (triggered) return;
      triggered = true;
      doSend(pendingData || collectData());
      // 재무장 — 같은 페이지에서 추가 제출 가능하도록 3초 후 리셋
      setTimeout(function() { triggered = false; pendingData = null; }, 3000);
      if (REDIRECT_URL) {
        setTimeout(function() { window.location.href = REDIRECT_URL; }, 1000);
      }
    };

    var observer = new MutationObserver(function() {
      if (triggered) return;
      var bodyText = document.body.innerText || document.body.textContent || "";
      if (SUCCESS_TRIGGER && bodyText.indexOf(SUCCESS_TRIGGER) !== -1) {
        fire();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });

    // 페이지 이탈 fallback — 제출 데이터는 캡처됐는데 아직 전송 안 됐고,
    // 캡처된지 60초 이내면 (= 방금 제출하고 thank-you로 넘어가는 중) sendBeacon으로 전송.
    function flushOnLeave() {
      if (!pendingData) return;
      if (Date.now() - pendingAt > 60000) return; // 오래된 캡처는 무시
      var fp = fingerprint(pendingData);
      if (sentFingerprints[fp] && (Date.now() - sentFingerprints[fp]) < 5000) return;
      sentFingerprints[fp] = Date.now();
      try {
        var ctx = getUtmContext();
        var last = ctx.last, first = ctx.first;
        var payload = JSON.stringify({
          data: pendingData,
          _fieldMeta: getFieldMeta(),
          utmSource: last.utmSource, utmMedium: last.utmMedium, utmCampaign: last.utmCampaign,
          utmTerm: last.utmTerm, utmContent: last.utmContent, utmId: last.utmId || "",
          firstUtmSource: first.utmSource, firstUtmMedium: first.utmMedium, firstUtmCampaign: first.utmCampaign,
          firstUtmTerm: first.utmTerm, firstUtmContent: first.utmContent, firstUtmId: first.utmId || "",
          firstReferrer: first.referrer || "", firstSeenAt: first.seenAt || "",
          journey: ctx.journey, referrer: document.referrer, userAgent: navigator.userAgent
        });
        // sendBeacon은 헤더 커스텀 불가 → x-api-key 못 보냄. URL 쿼리로 키 전달.
        var beaconUrl = COLLECT_URL + (COLLECT_URL.indexOf("?") === -1 ? "?" : "&") + "k=" + encodeURIComponent(API_KEY);
        var blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(beaconUrl, blob);
        } else {
          fetch(beaconUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(function(){});
        }
      } catch (e) {}
    }
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "hidden") flushOnLeave();
    }, true);
    window.addEventListener("pagehide", flushOnLeave, true);
  }
})();`;

  return { script, utmScript };
}
