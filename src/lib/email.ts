// 이메일 발송 추상화 — Resend HTTP API(의존성 없이 fetch).
// RESEND_API_KEY 가 없으면 안전하게 skip 한다(개발/미설정 환경에서 오류 없이 no-op).
// 실제 발송하려면: Resend 계정 → 발송 도메인 인증 → RESEND_API_KEY(+선택 EMAIL_FROM) 환경변수 설정.

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export type SendResult = { sent: boolean; skipped?: boolean; error?: string };

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail({ to, subject, html, from }: SendArgs): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, skipped: true };

  const sender = from || process.env.EMAIL_FROM || "webinar@mach.studio";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender, to: [to], subject, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, error: `resend ${res.status} ${detail.slice(0, 120)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

// 간단한 알림 이메일 HTML — 제목/본문/버튼(선택).
export function reminderEmailHtml(opts: { title: string; body: string; url?: string; buttonLabel?: string }): string {
  const { title, body, url, buttonLabel } = opts;
  // 속성 컨텍스트까지 안전하게 — 따옴표도 이스케이프
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  // http(s) 링크만 허용 (javascript:/data: 등 차단)
  const safeUrl = url && /^https?:\/\//i.test(url.trim()) ? url.trim() : "";
  const button = safeUrl
    ? `<a href="${esc(safeUrl)}" style="display:inline-block;margin-top:20px;padding:12px 22px;border-radius:10px;background:#5b5bd6;color:#fff;text-decoration:none;font-weight:700;font-size:14px;">${esc(buttonLabel || "바로가기")}</a>`
    : "";
  return `<div style="font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#16161a;">
    <h1 style="font-size:20px;font-weight:800;margin:0 0 12px;">${esc(title)}</h1>
    <p style="font-size:15px;line-height:1.7;color:#44454f;white-space:pre-wrap;margin:0;">${esc(body)}</p>
    ${button}
  </div>`;
}
