/**
 * 랜딩 임베드와 자체 입장 화면이 함께 쓰는 공개 등록 폼 클래스 계약.
 *
 * 색은 호출부가 저장된 웨비나 테마로 설정하는 --mw-* 토큰에서만 꺼낸다.
 * 외부 호스트 페이지의 전역 input/button 규칙이 흘러들어와도 같은 폼 위계를 유지하도록
 * 필드·동의·제출·피드백을 이 스코프에서 완결한다.
 */
export const PUBLIC_REGISTRATION_FORM_CSS = `
.mw-form-card { width:100%; max-width:520px; padding:28px 24px; border:0; border-radius:calc(var(--mw-radius, 12px) * 1.34); background:var(--mw-surface); color:var(--mw-text); box-shadow:0 24px 64px rgba(0,0,0,.24); font-size:14px; }
.mw-form-card, .mw-form-card * { -webkit-text-fill-color:initial; }
.mw-form-title { margin-bottom:18px; font-size:18px; font-weight:800; color:var(--mw-text); }
.mw-modal-card .mw-form-title { padding-right:44px; }
.mw-field { margin-bottom:14px; }
.mw-label { display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--mw-text); white-space:pre-wrap; overflow-wrap:anywhere; }
.mw-req { margin-left:2px; color:var(--mw-accent); }
.mw-input,.mw-select { width:100%; min-height:44px; padding:11px 13px; border:1px solid color-mix(in srgb,var(--mw-text) 24%,transparent); border-radius:9px; background:var(--mw-surface); color:var(--mw-text); font:inherit; font-size:14px; outline:0; }
.mw-input:focus,.mw-select:focus { border-color:var(--mw-accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--mw-accent) 16%,transparent); outline:0; }
.mw-check { display:flex; align-items:flex-start; gap:9px; min-height:20px; margin-bottom:10px; color:color-mix(in srgb,var(--mw-text) 68%,transparent); font-size:13px; line-height:20px; cursor:pointer; }
.mw-check span,.mw-check button { white-space:pre-wrap; overflow-wrap:anywhere; }
.mw-check input { width:18px; height:18px; flex:none; margin:1px 0 0; accent-color:var(--mw-accent); }
.mw-check input:disabled { cursor:not-allowed; }
.mw-check:has(input:disabled) { opacity:.45; cursor:not-allowed; }
.mw-multi { display:flex; flex-direction:column; gap:2px; }
.mw-multi .mw-check { margin-bottom:0; min-height:44px; align-items:flex-start; gap:10px; padding:12px 0; line-height:20px; }
.mw-multi .mw-check input { margin-top:1px; }
.mw-multi .mw-input { margin-top:4px; }
.mw-hint { margin-top:4px; color:color-mix(in srgb,var(--mw-text) 52%,transparent); font-size:11px; }
.mw-submit { display:inline-flex; width:100%; min-height:46px; align-items:center; justify-content:center; margin-top:8px; padding:12px 18px; border:0; border-radius:9px; background:var(--mw-accent); color:var(--mw-on-accent); font:inherit; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 16px color-mix(in srgb,var(--mw-accent) 28%,transparent); transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease; }
.mw-submit:hover { transform:translateY(-1px); opacity:.92; }
.mw-submit:active { transform:translateY(0) scale(.98); }
.mw-submit:focus-visible { outline:0; box-shadow:0 0 0 3px color-mix(in srgb,var(--mw-accent) 20%,transparent),0 4px 16px color-mix(in srgb,var(--mw-accent) 28%,transparent); }
.mw-submit:disabled { cursor:not-allowed; opacity:.45; transform:none; }
.mw-msg { display:none; margin-top:14px; padding:12px 14px; border-radius:9px; font-size:13px; line-height:1.55; }
.mw-msg-error { display:block; background:color-mix(in srgb,var(--mw-accent) 12%,var(--mw-surface)); color:color-mix(in srgb,var(--mw-text) 76%,var(--mw-accent)); box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mw-accent) 28%,transparent); }
.mw-msg-success { display:block; background:color-mix(in srgb,var(--mw-accent) 7%,var(--mw-surface)); color:color-mix(in srgb,var(--mw-text) 88%,var(--mw-accent)); box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mw-accent) 18%,transparent); }
@media (prefers-reduced-motion:reduce) { .mw-submit { transition:none; } }
`;
