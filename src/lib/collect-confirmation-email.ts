import { visitorBadgePalette } from "@/lib/collect-badge";
import { localize, type CollectFormConfig } from "@/lib/collect-form-config";
import { buildTicketView } from "@/lib/collect-lookup";
import { qrPngBuffer } from "@/lib/collect-qr";
import sharp from "sharp";

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const lines = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br>");

function readableForeground(background: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(background);
  if (!match) return "#ffffff";
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return luminance > 0.62 ? "#161616" : "#ffffff";
}

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

const escapeXml = (value: string) => escapeHtml(value).replace(/\r?\n/g, " ");

/**
 * 이메일에서 보이는 회색 티켓 카드 전체를 한 장의 PNG로 만든다.
 * 외부 이미지 URL 없이 CID 첨부로 표시·저장할 수 있게 서버에서 렌더링한다.
 */
export async function renderCollectTicketPng({
  config,
  registrationNo,
  data,
}: {
  config: CollectFormConfig;
  registrationNo: string;
  data: unknown;
}): Promise<Buffer> {
  const ticket = buildTicketView(config, { registrationNo, data });
  const accent = config.theme.accentColor || "#F28C18";
  const badge = ticket?.visitorType ? visitorBadgePalette(ticket.visitorType) : null;
  const qr = (await qrPngBuffer(registrationNo, 420)).toString("base64");
  const name = ticket?.name || "Registered guest";
  const badgeText = ticket?.visitorType || "REGISTERED";
  const phone = ticket?.maskedPhone || "—";
  const email = ticket?.maskedEmail || "—";
  const spacedRegistrationNo = registrationNo.split("").join(" ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900">
    <rect width="720" height="900" rx="28" fill="#f4f5f7"/>
    <rect x="250" y="54" width="220" height="54" rx="27" fill="${badge?.background || accent}"/>
    <text x="360" y="88" text-anchor="middle" fill="${badge?.foreground || readableForeground(accent)}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="2">${escapeXml(badgeText.toUpperCase())}</text>
    <text x="360" y="158" text-anchor="middle" fill="#171717" font-family="Arial, sans-serif" font-size="30" font-weight="700">${escapeXml(name.slice(0, 34))}</text>
    <rect x="145" y="196" width="430" height="430" rx="24" fill="#ffffff"/>
    <image x="170" y="221" width="380" height="380" href="data:image/png;base64,${qr}"/>
    <rect x="100" y="662" width="520" height="104" rx="20" fill="#ffffff"/>
    <text x="132" y="704" fill="#555555" font-family="Arial, sans-serif" font-size="19" font-weight="700">Phone</text>
    <text x="588" y="704" text-anchor="end" fill="#222222" font-family="Arial, sans-serif" font-size="19" font-weight="700">${escapeXml(phone)}</text>
    <text x="132" y="742" fill="#555555" font-family="Arial, sans-serif" font-size="19" font-weight="700">E-mail</text>
    <text x="588" y="742" text-anchor="end" fill="#222222" font-family="Arial, sans-serif" font-size="19" font-weight="700">${escapeXml(email.slice(0, 34))}</text>
    <text x="360" y="820" text-anchor="middle" fill="#171717" font-family="Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="1">${escapeXml(spacedRegistrationNo)}</text>
    <text x="360" y="854" text-anchor="middle" fill="#777777" font-family="Arial, sans-serif" font-size="16">Show this at the venue</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
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
  const ticketContentId = "registration-ticket";
  const details = eventRows(config, locale);
  const emailNotices = config.notices.filter((notice) => notice.enabled && notice.placement === "email");

  const detailHtml = details.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border-collapse:collapse;">${details.map(([label, value]) => `
      <tr>
        <td style="width:118px;padding:10px 0;border-bottom:1px solid #e8e8e8;color:#777;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e8e8e8;color:#222;font-size:13px;font-weight:600;line-height:1.55;">${lines(value)}</td>
      </tr>`).join("")}</table>`
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
          ${email.showQr ? `<img src="cid:${ticketContentId}" width="100%" alt="Registration ticket${ticket?.name ? ` for ${escapeHtml(ticket.name)}` : ""}${ticket?.visitorType ? ` (${escapeHtml(ticket.visitorType)})` : ""} with QR code" style="display:block;width:100%;max-width:552px;height:auto;margin:0 auto;border-radius:16px;" />` : ""}
          ${email.showQr ? `<div style="margin-top:16px;padding:13px 16px;border-radius:12px;background:${accent};color:${readableForeground(accent)};font-size:13px;font-weight:800;text-align:center;">Save the attached ticket image to your phone before arriving.</div>` : ""}
          ${noticesHtml}
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;

  return { subject, html, ticketContentId };
}
