import { visitorBadgePalette } from "@/lib/collect-badge";
import { localize, type CollectFormConfig } from "@/lib/collect-form-config";
import { buildTicketView } from "@/lib/collect-lookup";

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const lines = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br>");

function eventRows(config: CollectFormConfig, locale: string) {
  if (!config.confirmationEmail.includeEventInfo) return [];
  const rows: Array<[string, string]> = [];
  if (config.eventInfo.eventDates.length) rows.push(["Date", config.eventInfo.eventDates.join(" · ")]);
  const venue = localize(config.eventInfo.venue, locale);
  if (venue) rows.push(["Venue", venue]);
  if (config.eventInfo.openingHours.length) {
    rows.push(["Opening hours", config.eventInfo.openingHours.map((item) => {
      const hours = [item.open, item.close].filter(Boolean).join(" – ");
      const last = item.lastEntrance ? ` (Last entrance ${item.lastEntrance})` : "";
      return `${item.date}${hours ? ` ${hours}` : ""}${last}`;
    }).join("\n")]);
  }
  for (const row of config.eventInfo.extraRows) {
    const label = localize(row.label, locale);
    const value = localize(row.value, locale);
    if (label && value) rows.push([label, value]);
  }
  return rows;
}

export function buildCollectConfirmationEmail({
  config,
  sourceName,
  locale,
  registrationNo,
  data,
}: {
  config: CollectFormConfig;
  sourceName: string;
  locale: string;
  registrationNo: string;
  data: unknown;
}) {
  const email = config.confirmationEmail;
  const eventName = config.legal.eventName || sourceName;
  const ticket = buildTicketView(config, { registrationNo, data });
  const subject = localize(email.subject, locale) || `Registration confirmed — ${eventName}`;
  const heading = localize(email.heading, locale) || "You're registered";
  const body = localize(email.body, locale)
    || "Your pre-registration is complete. Please show this QR code at the venue.";
  const accent = config.theme.accentColor || "#F28C18";
  const qrContentId = "registration-qr";
  const details = eventRows(config, locale);
  const emailNotices = config.notices.filter((notice) => notice.enabled && notice.placement === "email");

  const detailHtml = details.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border-collapse:collapse;">${details.map(([label, value]) => `
      <tr>
        <td style="width:118px;padding:10px 0;border-bottom:1px solid #e8e8e8;color:#777;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e8e8e8;color:#222;font-size:13px;font-weight:600;line-height:1.55;">${lines(value)}</td>
      </tr>`).join("")}</table>`
    : "";

  // Phone/E-mail 과 운영자가 showOnTicket 을 켠 항목(예: 동반 인원 수)을 같은 줄 목록으로 이어 붙인다
  // — 티켓 화면·완료 화면과 같은 규칙(collect-lookup.buildTicketView 의 extras).
  const contactRows: Array<[string, string]> = [];
  if (ticket?.maskedPhone) contactRows.push(["Phone", ticket.maskedPhone]);
  if (ticket?.maskedEmail) contactRows.push(["E-mail", ticket.maskedEmail]);
  if (ticket) for (const extra of ticket.extras) contactRows.push([extra.label, extra.value]);

  const contactHtml = contactRows.length
    ? `<div style="margin:18px auto 0;max-width:320px;padding:12px 16px;border-radius:12px;background:#ffffff;text-align:left;font-size:12px;line-height:1.8;color:#555;">
        ${contactRows.map(([label, value]) => `<div><strong style="display:inline-block;min-width:80px;color:#333;">${escapeHtml(label)}</strong>${escapeHtml(value)}</div>`).join("")}
      </div>`
    : "";

  const noticesHtml = emailNotices.map((notice) => {
    const title = localize(notice.title, locale);
    const noticeBody = localize(notice.body, locale);
    if (!title && !noticeBody) return "";
    return `<div style="margin-top:16px;padding:14px 16px;border-radius:12px;background:#f7f7f7;color:#555;font-size:12px;line-height:1.65;">
      ${title ? `<strong style="display:block;margin-bottom:4px;color:#222;">${escapeHtml(title)}</strong>` : ""}
      ${noticeBody ? lines(noticeBody) : ""}
    </div>`;
  }).join("");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;"><tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;">
        <tr><td style="height:8px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:34px 34px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#171717;">
          <div style="font-size:13px;font-weight:700;color:${accent};letter-spacing:.04em;">${escapeHtml(eventName)}</div>
          <h1 style="margin:10px 0 12px;font-size:26px;line-height:1.25;">${escapeHtml(heading)}</h1>
          <p style="margin:0;color:#555;font-size:14px;line-height:1.75;">${lines(body)}</p>
          ${detailHtml}
        </td></tr>
        <tr><td style="padding:6px 24px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
          <div style="padding:26px 18px;border-radius:16px;background:#f4f5f7;text-align:center;">
            ${ticket?.visitorType ? `<span style="display:inline-block;padding:7px 14px;border-radius:999px;background:${visitorBadgePalette(ticket.visitorType).background};color:${visitorBadgePalette(ticket.visitorType).foreground};font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">${escapeHtml(ticket.visitorType)}</span>` : ""}
            ${ticket?.name ? `<div style="margin-top:12px;font-size:18px;font-weight:800;color:#171717;">${escapeHtml(ticket.name)}</div>` : ""}
            ${email.showQr ? `<img src="cid:${qrContentId}" width="220" height="220" alt="Registration QR code" style="display:block;width:220px;height:220px;margin:18px auto 12px;border-radius:14px;background:#fff;" />` : ""}
            ${contactHtml}
            <div style="margin-top:18px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:17px;font-weight:800;letter-spacing:.18em;color:#171717;">${escapeHtml(registrationNo)}</div>
            <div style="margin-top:6px;color:#777;font-size:11px;">Show this at the venue</div>
          </div>
          ${noticesHtml}
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;

  return { subject, html, qrContentId };
}
