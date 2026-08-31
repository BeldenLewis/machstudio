import { visitorBadgePalette } from "@/lib/collect-badge";

export interface TicketImageInput {
  eventName: string;
  registrationNo: string;
  qrUrl: string;
  name: string;
  visitorType: string;
  maskedEmail: string;
  maskedPhone: string;
  accentColor?: string;
  /** 운영자가 항목별로 showOnTicket 을 켠 값(예: 동반 인원 수) — 값이 있는 것만 넘어온다. */
  extras?: Array<{ label: string; value: string }>;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, minSize: number, weight = 700) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return;
    size -= 2;
  } while (size >= minSize);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("ticket image load failed"));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("ticket image export failed")), "image/png");
  });
}

/** 현장 확인용 정보와 행사 브랜딩을 포함한 티켓 한 장을 사진으로 저장한다. */
export async function downloadTicketImage(input: TicketImageInput): Promise<void> {
  const qr = await loadImage(input.qrUrl);

  /**
   * 정보 줄 — Phone/E-mail 은 값이 없어도 "—"로 항상 두 줄(기존 화면 그대로), 운영자가
   * showOnTicket 을 켠 항목(예: 동반 인원 수)은 값이 있는 것만 뒤에 이어 붙인다
   * (collect-lookup.buildTicketView 의 extras 와 같은 규칙 — 티켓 화면·완료 화면·확인
   * 이메일과 여기 이미지가 서로 다른 정보를 보여주면 "QR 은 찍었는데 이미지엔 없다"가 생긴다).
   */
  const infoRows: Array<[string, string]> = [
    ["Phone", input.maskedPhone || "—"],
    ["E-mail", input.maskedEmail || "—"],
    ...(input.extras ?? []).map((e): [string, string] => [e.label, e.value]),
  ];

  // 정보 박스 높이·그 아래 등록번호·안내 문구 위치는 줄 수에 맞춰 늘어난다 — 2줄일 때
  // 아래 상수들이 기존 고정 레이아웃(박스 126px, 등록번호 y=1201, 안내문 y=1244)과 같다.
  const ROW_GAP = 44;
  const infoBoxTop = 1010;
  const infoBoxHeight = 82 + (infoRows.length - 1) * ROW_GAP;
  const infoBoxBottom = infoBoxTop + infoBoxHeight;
  const regNoY = infoBoxBottom + 65;
  const footerY = regNoY + 43;
  const canvasHeight = footerY + 52 + 54; // 안내문 아래 카드 여백(52) + 카드 바깥 여백(54, 위쪽과 대칭)

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas is not available");

  const eventName = input.eventName.trim() || "Event Registration";
  const accent = /^#[0-9a-f]{6}$/i.test(input.accentColor || "") ? input.accentColor! : "#F28C18";
  const badge = input.visitorType ? visitorBadgePalette(input.visitorType) : { background: accent, foreground: "#FFFFFF" };

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  fillRoundedRect(ctx, 54, 54, 972, canvasHeight - 108, 42, "#F4F5F7");
  fillRoundedRect(ctx, 54, 54, 972, 18, 9, accent);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = accent;
  fitText(ctx, eventName, 840, 58, 34, 800);
  ctx.fillText(eventName, 540, 145);
  ctx.fillStyle = "#737373";
  ctx.font = "700 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
  ctx.fillText("OFFICIAL REGISTRATION PASS", 540, 202);

  const badgeText = (input.visitorType || "REGISTERED").toUpperCase();
  fitText(ctx, badgeText, 300, 28, 20, 800);
  const badgeWidth = Math.max(220, Math.min(360, ctx.measureText(badgeText).width + 80));
  fillRoundedRect(ctx, 540 - badgeWidth / 2, 242, badgeWidth, 66, 33, badge.background);
  ctx.fillStyle = badge.foreground;
  ctx.fillText(badgeText, 540, 275);

  ctx.fillStyle = "#171717";
  fitText(ctx, input.name || "Registered guest", 820, 42, 28, 800);
  ctx.fillText(input.name || "Registered guest", 540, 353);

  fillRoundedRect(ctx, 260, 410, 560, 560, 32, "#FFFFFF");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, 300, 450, 480, 480);
  ctx.imageSmoothingEnabled = true;

  fillRoundedRect(ctx, 170, infoBoxTop, 740, infoBoxHeight, 26, "#FFFFFF");
  infoRows.forEach(([label, value], i) => {
    const y = infoBoxTop + 42 + i * ROW_GAP;
    ctx.textAlign = "left";
    ctx.fillStyle = "#666666";
    ctx.font = "700 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
    ctx.fillText(label, 210, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#222222";
    fitText(ctx, value, 500, 24, 18, 700);
    ctx.fillText(value, 870, y);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#171717";
  ctx.font = "800 32px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText(input.registrationNo.split("").join(" "), 540, regNoY);
  ctx.fillStyle = "#777777";
  ctx.font = "500 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
  ctx.fillText("Show this at the venue", 540, footerY);

  const blob = await canvasBlob(canvas);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${eventName.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "event"}-ticket-${input.registrationNo}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
