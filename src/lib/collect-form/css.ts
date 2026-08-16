/**
 * 등록 폼 스타일 — 파트너 사이트(아임웹 등) 문서에 **그대로 주입된다**.
 *
 * 그래서 두 가지가 절대 규칙이다:
 *  1. 모든 선택자가 `.msf` 아래에 있다. 전역 태그 선택자(`input {}`)를 하나라도 쓰면
 *     호스트 페이지의 다른 폼까지 우리 스타일이 먹는다 — 남의 사이트를 망가뜨린다.
 *  2. 호스트에서 물려받는 것을 전부 되돌린다. 아임웹 테마가 `input { border-radius: 0 }`
 *     같은 걸 걸어 두면 우리 폼만 각지게 나온다. 상속되는 속성은 `.msf` 에서 다시 못 박는다.
 *
 * 색은 `.msf` 의 커스텀 프로퍼티로만 쓴다 — 전시별 테마(§11 이후)가 붙을 때 이 변수만
 * 덮으면 되게 한다. 리터럴 색을 규칙 안에 박으면 그때 전부 다시 찾아야 한다.
 *
 * ── !important 를 쓰는 곳과 이유 ──────────────────────────────────────
 * 클래스 선택자는 호스트의 태그 선택자(`input {}`)를 이미 이긴다. 문제는 **호스트가
 * `!important` 를 거는 경우**다 — 아임웹 테마의 `input,button { border-radius:0 !important }`
 * 같은 규칙은 특이도와 무관하게 우리를 누른다(임베드 하니스에서 실측: 모서리가 각져 나왔다).
 * 그래서 **폼이 폼으로 보이는 데 필요한 최소한의 속성에만** 맞불을 놓는다. 전부 !important 로
 * 도배하면 정작 우리가 나중에 테마를 얹을 때 우리 자신이 못 덮는다.
 */
export const COLLECT_FORM_CSS = `
.msf{
  --msf-fg:#101418; --msf-muted:#5b6672; --msf-line:#dfe3e8;
  --msf-bg:#ffffff; --msf-soft:#f4f6f8;
  --msf-accent:#1f3a5f; --msf-accent-fg:#ffffff;
  --msf-warn:#b45309; --msf-ok:#047857;
  --msf-radius:12px;
  /* 호스트 상속 차단 — 상속되는 속성만 모아 다시 못 박는다 */
  all:initial;
  display:block; box-sizing:border-box;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  font-size:15px; line-height:1.5; color:var(--msf-fg);
  text-align:left; letter-spacing:normal; word-break:break-word;
  max-width:520px; margin:0 auto;
}
.msf *,.msf *::before,.msf *::after{box-sizing:border-box}
/* 리셋은 :where() 로 특이도를 0으로 낮춰서 건다.
   ".msf span"(0,1,1)은 ".msf-tel-cc"(0,1,0)보다 특이도가 높아 순서와 무관하게 컴포넌트 규칙을
   이긴다 — 실측으로 국가코드 칸의 padding 이 0 이 돼 "US" 가 눌려 나왔다.
   :where() 안의 선택자는 특이도에 0을 기여하므로 아래 컴포넌트 규칙이 정상적으로 이긴다. */
.msf :where(p,div,label,span,h2,h3,ul,li){margin:0;padding:0;font-weight:inherit;font-size:inherit;list-style:none}

.msf-stack{display:flex;flex-direction:column;gap:14px;line-height:1.5 !important}

/* ── 행사 개요 ─────────────────────────────── */
.msf-info{background:var(--msf-soft);border-radius:var(--msf-radius);padding:12px 14px;font-size:13px}
.msf-info-date{font-weight:700}
.msf-info-row{color:var(--msf-muted);margin-top:2px}
.msf-info-row b{font-weight:600;color:var(--msf-fg)}

/* ── 항목 ──────────────────────────────────── */
.msf-field{display:flex;flex-direction:column;gap:6px}
.msf-label{font-size:13px;font-weight:600;display:block !important;color:var(--msf-fg) !important;line-height:1.5 !important;text-transform:none !important}
.msf-req{color:var(--msf-warn);margin-left:2px}
.msf-input,.msf-select{
  width:100%;font:inherit;font-size:15px;color:var(--msf-fg);
  background:var(--msf-bg);
  outline:none;appearance:none;-webkit-appearance:none;
  transition:border-color .15s ease, box-shadow .15s ease;
  /* 호스트 !important 와 맞붙는 최소 집합 */
  border:1px solid var(--msf-line) !important;
  border-radius:var(--msf-radius) !important;
  padding:11px 12px !important;
  text-transform:none !important;
  letter-spacing:normal !important;
}
.msf-select{background-image:none;padding-right:12px}
.msf-input:focus,.msf-select:focus{border-color:var(--msf-accent);box-shadow:0 0 0 3px rgba(31,58,95,.14)}
/* 호스트 테마가 outline:none 을 전역으로 거는 일이 잦다 — 키보드 사용자가 위치를 잃는다. */
.msf :where(input,select,button,a):focus-visible{outline:2px solid var(--msf-accent) !important;outline-offset:2px !important}
.msf-input[aria-invalid="true"],.msf-select[aria-invalid="true"]{border-color:var(--msf-warn)}
.msf-input::placeholder{color:#9aa4af;opacity:1}

/* 전화 — 국가코드 칸 + 번호 칸 */
.msf-tel{display:flex;gap:8px;align-items:stretch}
.msf-tel-cc{flex:0 0 auto;display:flex;align-items:center;padding:0 12px;font-size:14px;font-weight:600;
  background:var(--msf-soft);border:1px solid var(--msf-line);border-radius:var(--msf-radius);color:var(--msf-muted);white-space:nowrap}
.msf-tel .msf-input{flex:1 1 auto;min-width:0}

/* 선택지 — 칩 */
.msf-chips{display:flex;flex-wrap:wrap;gap:8px}
.msf-chip{
  display:inline-flex;align-items:center;font-size:14px;cursor:pointer;
  background:var(--msf-bg);
  transition:background .15s ease,border-color .15s ease,color .15s ease;
  /* 44px 터치 타깃 — 현장에서 휴대폰으로 채우는 폼이다 */
  min-height:44px;
  padding:9px 14px !important;
  border-radius:999px !important;
  border:1px solid var(--msf-line) !important;
  text-transform:none !important;
  letter-spacing:normal !important;
}
.msf-chip:hover{border-color:var(--msf-accent)}
.msf-chip[data-on="1"]{background:var(--msf-accent);border-color:var(--msf-accent);color:var(--msf-accent-fg)}
.msf-chip[data-disabled="1"]{opacity:.45;cursor:not-allowed}
/* 체크박스를 화면에서만 숨긴다 — display:none 이면 **탭 순서에서도 빠져** 키보드로 못 고른다.
   칩 자체에 포커스 표시를 옮겨 준다(:has 미지원 브라우저를 위해 .is-focus 도 함께 건다). */
.msf-chip input{position:absolute;width:1px;height:1px;opacity:0;margin:0}
.msf-chip:has(input:focus-visible),.msf-chip.is-focus{outline:2px solid var(--msf-accent);outline-offset:2px}

/* 체크박스 한 줄 */
.msf-check{display:flex;align-items:flex-start;gap:9px;font-size:13px;cursor:pointer;min-height:24px}
.msf-check input{width:18px;height:18px;margin:2px 0 0;flex:0 0 auto;accent-color:var(--msf-accent);cursor:pointer}

/* ── 안내 블록 ─────────────────────────────── */
.msf-notice{background:var(--msf-soft);border-radius:var(--msf-radius);padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.msf-notice-title{font-size:13px;font-weight:700}
.msf-notice-body{font-size:12px;line-height:1.65;color:var(--msf-muted);white-space:pre-wrap}
.msf-more{align-self:flex-start;font:inherit;font-size:12px;font-weight:600;color:var(--msf-accent);
  background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}

/* ── 오류·안내 ─────────────────────────────── */
.msf-err{font-size:12px;color:var(--msf-warn)}
.msf-hint{font-size:11px;color:var(--msf-muted)}
.msf-banner{font-size:13px;border-radius:var(--msf-radius);padding:11px 13px}
.msf-banner[data-tone="warn"]{background:#fff7ed;color:var(--msf-warn)}
.msf-banner[data-tone="ok"]{background:#ecfdf5;color:var(--msf-ok)}

/* ── 제출 ──────────────────────────────────── */
.msf-submit{
  width:100%;font:inherit;font-size:15px;font-weight:700;cursor:pointer;
  min-height:52px;transition:opacity .15s ease,transform .06s ease;
  /* 제출 버튼은 이 폼에서 가장 중요한 컨트롤이다 — 호스트 테마에 색을 뺏기면 안 된다 */
  color:var(--msf-accent-fg) !important;
  background:var(--msf-accent) !important;
  border:0 !important;
  border-radius:var(--msf-radius) !important;
  padding:14px 16px !important;
  text-transform:none !important;
  letter-spacing:normal !important;
}
.msf-submit:hover{opacity:.92}
.msf-submit:active{transform:translateY(1px)}
.msf-submit[disabled]{opacity:.5;cursor:not-allowed;transform:none}

/* ── 상태 화면(접수 전·마감) / 완료 ──────────── */
.msf-state{text-align:center;background:var(--msf-soft);border-radius:var(--msf-radius);padding:28px 20px}
.msf-state-title{font-size:16px;font-weight:700}
.msf-state-body{font-size:13px;color:var(--msf-muted);margin-top:6px}

.msf-done{text-align:center;background:var(--msf-soft);border-radius:var(--msf-radius);padding:26px 20px}
.msf-done-title{font-size:17px;font-weight:700}
/**
 * 등록번호는 **현장에서 눈으로 읽고 손으로 친다**(설계 §9.1·§12).
 * 등폭 글꼴 + 넓은 자간이라야 0/O, 1/l 을 헷갈리지 않는다.
 */
.msf-regno{
  margin-top:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:19px;font-weight:700;letter-spacing:.14em;
}
.msf-regno-label{font-size:11px;color:var(--msf-muted);margin-top:4px;letter-spacing:normal}

/* ── 미리보기 배너 ─────────────────────────── */
/* 없으면 담당자가 미리보기에서 등록하고 "왜 명단에 없냐"고 묻는다(설계 §16.1). */
.msf-preview-flag{
  display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;
  background:#eef2f7;color:var(--msf-accent);border-radius:999px;padding:8px 14px;align-self:flex-start;
}

/* iOS 는 16px 미만 입력에 포커스하면 화면을 확대하고, 그 확대는 **파트너 페이지 전체**에
   걸린다(그리고 되돌아오지 않는다). 브레이크포인트로 나누면 최신 대화면 아이폰(430px)이
   조건 밖으로 빠지므로 입력은 항상 16px 로 둔다. */
.msf-input,.msf-select{font-size:16px}

@media (prefers-reduced-motion:reduce){
  .msf *{transition:none !important;animation:none !important}
}
`;
