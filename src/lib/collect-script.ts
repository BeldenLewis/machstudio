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
  /**
   * 이 필드를 DOM 에서 찾는 방법 — `"id"` | `"name"`. 없으면 **위치 인덱스**(오늘의 방식).
   *
   * 아임웹은 `.form-group` 을 만들어 주므로 자사 전시는 위치로 충분했다. 대행전시는
   * 플랫폼이 제각각이라 그 클래스가 없다 — 그런 소스만 앵커로 지목한다.
   */
  matchBy?: "id" | "name" | null;
  matchValue?: string | null;
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
    .map((f) => {
      // 앵커가 없는 매핑(= 기존 아임웹 소스 전부)은 mb/mv 키 자체가 실리지 않는다.
      // 그래야 생성물이 오늘과 같은 모양이고, 런타임도 같은 분기를 탄다.
      const anchor =
        f.matchBy && f.matchValue
          ? `, mb: ${JSON.stringify(f.matchBy)}, mv: ${JSON.stringify(f.matchValue)}`
          : "";
      return `    { index: ${f.index}, key: ${JSON.stringify(f.key)}, label: ${JSON.stringify(f.label)}${anchor} }`;
    })
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

  // 앵커로 지목된 요소에서 입력들을 꺼낸다. 앵커가 없으면 null 을 돌려 위치 경로로 보낸다.
  //
  // 이 함수는 **앵커가 있는 매핑에서만 호출된다**(아래 collectData 참고). 아임웹 소스는
  // mb 가 없으므로 여기 진입 자체를 안 한다 — 회귀가 "테스트로 막혀서" 가 아니라
  // "같은 식이 평가돼서" 없다.
  function anchoredEls(field) {
    if (field.mb === "id") {
      var el = document.getElementById(field.mv);
      if (!el) return null;
      var inner = el.querySelectorAll("input, select, textarea");
      if (inner && inner.length) return inner;
      // 앵커가 입력 그 자체인 경우(라벨 없이 input 에 id 만 있는 폼).
      var tag = (el.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return [el];
      return null;
    }
    if (field.mb === "name") {
      // querySelector 에 값을 끼워 넣지 않는다 — name 에 따옴표·대괄호가 들어오면 셀렉터가 깨진다.
      var all = document.getElementsByName(field.mv);
      return all && all.length ? all : null;
    }
    return null;
  }

  function collectData() {
    var groups = getGroups();
    var data = {};
    var anchored = 0, resolved = 0;
    FIELD_MAP.forEach(function(field) {
      var els;
      if (field.mb) {
        anchored++;
        els = anchoredEls(field);
        if (els) resolved++;
      } else {
        var group = groups[field.index];
        if (!group) return;
        els = group.querySelectorAll("input, select, textarea");
      }
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
        } else if (field.mb && el.tagName === "SELECT") {
          /**
           * **앵커 소스만** select 는 선택된 option 의 화면 글자를 쓴다(에듀테크 실측).
           *
           * el.value 는 <option value="in14">Elementary School</option> 처럼 내부 코드다 —
           * 체크박스·라디오는 이미 위에서 label 텍스트를 쓰는데 select 만 코드를 그대로
           * 내보내고 있었다("소속분류"에 "in14" 같은 값이 쌓이던 원인). 앵커 없는 기존
           * 소스(아임웹 등)는 이 분기 자체에 안 들어온다 — el.value 그대로 쓰는 아래 분기와
           * 문자 그대로 같은 소스가 이월된다.
           */
          var opt = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
          var sv = (opt ? (opt.textContent || opt.value || "") : (el.value || "")).trim();
          if (sv) textValues.push(sv);
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
    /**
     * **앵커 소스 정족수.** 지목한 요소의 절반도 못 찾았다면 이 페이지는 우리 폼이 아니다
     * (에듀테크는 같은 URL 에 동의 화면과 등록 폼이 순서대로 나온다 — 동의 화면에서
     *  한두 개가 우연히 걸려 1필드짜리 레코드가 쌓이는 것을 막는다).
     * 앵커가 없는 기존 소스는 anchored 가 0이라 이 줄이 아무 일도 하지 않는다.
     */
    if (anchored > 0 && resolved * 2 < anchored) return {};
    /**
     * **값 정족수(모든 소스 공통).** 지도상 anchored 정족수는 "요소를 찾았는가"만 본다 —
     * 위치 인덱스 소스는 이 신호 자체가 없고, 앵커 소스도 폼이 아닌 페이지에서 요소만
     * 우연히 몇 개 걸리고 값은 안 채워진 경우를 못 잡는다. 무관한 버튼 클릭 하나로
     * capture() 가 그 순간의 DOM 을 캡처하면(§) 실제 신청서는 아직 한 글자도 안 썼는데
     * "요소는 있으니" 레코드가 만들어진다 — 실제로 이렇게 쌓인 게 있다(에듀테크 실측:
     * 진짜 등록 2,297건에 반해 이런 반쪽 레코드가 섞여 총합이 부풀었다).
     * 매핑된 필드의 **과반수가 실제 값**을 가져야만 진짜 제출로 본다. select 의 미선택
     * placeholder("==선택==" 등)도 빈 값이 아닌 문자열이라 이 계산에 몇 개는 끼어들 수
     * 있지만, 실제 신청서는 필드 수가 많아(수십 개) 그 정도로는 과반을 못 넘는다.
     */
    var mapped = FIELD_MAP.length;
    if (mapped > 0) {
      var filled = 0;
      FIELD_MAP.forEach(function(field) {
        if (data[field.key] && String(data[field.key]).trim() !== "") filled++;
      });
      if (filled * 2 < mapped) return {};
    }
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
    // 이 소스가 앵커 방식인가 — 생성 시점에 정해지므로 한 번만 본다.
    var HAS_ANCHORS = FIELD_MAP.some(function(f) { return !!f.mb; });
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
      var payload = pendingData || collectData();
      /**
       * **빈 payload 는 보내지 않는다(모든 소스 공통).**
       * 성공 문구가 폼이 아닌 페이지에서 잡히면 collectData 가 {} 를 내는데, {} 는 truthy 라
       * 그대로 빈 레코드가 저장된다 — 실제로 그렇게 쌓인 게 있었다. collectData 자체에
       * 값 정족수 가드가 생겼지만(위 §), pendingData 는 그 가드 이전 시점(capture() 호출
       * 당시)의 캡처값이라 여기서 한 번 더 본다.
       */
      var any = false;
      for (var k in payload) { if (payload[k] && String(payload[k]).trim() !== "") { any = true; break; } }
      if (!any) { triggered = false; return; }
      doSend(payload);
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
    /**
     * **앵커 소스만** body 존재를 확인하고 없으면 기다린다(에듀테크 실측).
     *
     * 이 스크립트는 <head>에 async로 설치된다 — 캐시가 워밍업되면 <body>가 파싱되기
     * 전에 실행될 수 있다. document.body 가 null 인 채로 observe() 를 부르면 그 자리에서
     * 던져서, 같은 함수 안에서 이 줄 뒤에 오는 alert 가로채기·pagehide 폴백(바로 아래)까지
     * 전부 등록이 안 된다 — 대행 사이트는 그 폴백이 유일한 전송 경로라 조용히 0건이 된다.
     * 앵커 없는 기존 소스(아임웹 등)는 이 레이스를 실제로 겪은 적이 없으므로(레코드
     * 52,000건이 그 증거다) 오늘과 문자 그대로 같은 줄을 그대로 둔다 — 새 분기를 안 타게 해서.
     */
    if (HAS_ANCHORS && !document.body) {
      document.addEventListener("DOMContentLoaded", function() {
        observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
      });
    } else {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    }

    // 일부 사이트는 성공 메시지를 페이지 텍스트가 아니라 네이티브 alert() 팝업으로 띄운다
    // (마이스허브 등) — alert() 은 DOM 밖에 뜨는 별도 레이어라 위 MutationObserver 로는
    // 절대 못 잡는다. alert 자체를 가로채서, 뜬 메시지가 성공 트리거 문구를 포함할 때만
    // 전송한다 — "폼 제출을 곧바로 전송으로 본다"가 아니라, 검증 실패 알림(예: "이메일을
    // 입력해주세요")도 흔히 같은 alert() 을 쓰기 때문에 문구 매칭은 그대로 유지해야 오탐이
    // 안 생긴다.
    var originalAlert = window.alert;
    if (typeof originalAlert === "function") {
      window.alert = function(message) {
        try {
          if (!triggered && SUCCESS_TRIGGER && String(message == null ? "" : message).indexOf(SUCCESS_TRIGGER) !== -1) {
            fire();
          }
        } catch (e) {}
        return originalAlert.apply(window, arguments);
      };
    }

    // 페이지 이탈 fallback — 제출 데이터는 캡처됐는데 아직 전송 안 됐고,
    // 캡처된지 60초 이내면 (= 방금 제출하고 thank-you로 넘어가는 중) sendBeacon으로 전송.
    function flushOnLeave() {
      /**
       * **앵커 소스는 이탈 시점에 직접 읽는다.**
       *
       * 캡처는 "제출처럼 보이는 클릭" 에 의존한다 — 버튼 텍스트를 정규식으로 맞춰 보는 방식이다.
       * 아임웹은 submit 타입 버튼이라 텍스트와 무관하게 잡히지만, 대행 사이트는 a 태그에
       * javascript: 핸들러를 거는 곳이 있고 **영문 화면에서는 그 글자가 "OK" 라
       * 정규식에 안 걸린다**(에듀테크 실측).
       * 게다가 그런 폼은 form.submit() 을 직접 부르므로 submit 이벤트도 안 뜬다 — 두 경로가
       * 동시에 비는 구간이 생긴다.
       *
       * pagehide 시점에는 DOM 이 아직 그대로라 지금 읽으면 된다. 정족수 가드가 폼이 아닌
       * 페이지를 걸러 주므로 이 시점 수집이 쓰레기를 만들지 않는다.
       * 기존(앵커 없는) 소스는 아래의 pendingData 없으면 반환하는 줄이 그대로 적용된다.
       */
      if (!pendingData && HAS_ANCHORS) {
        var late = collectData();
        for (var lk in late) {
          if (late[lk] && String(late[lk]).trim() !== "") { pendingData = late; pendingAt = Date.now(); break; }
        }
      }
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
