/**
 * 웨비나 일정을 캘린더 앱이 읽는 .ics 로 만든다.
 *
 * 원래 `api/webinar-embed/[siteId]/config/route.ts` 안에 있던 것을 끌어올렸다 —
 * 임베드 배너(로더)와 자체 대기 화면이 **같은 파일을 내려받아야** 한다. 한쪽만 고치면
 * 같은 웨비나가 경로에 따라 다른 일정으로 담긴다.
 *
 * 캘린더 링크를 운영자가 붙여 넣던 설정(config.calendarUrl)은 없앴다. 그 값은 링크 하나라
 * 시각을 고쳐도 따라오지 않았고, 안 채우면 버튼이 조용히 사라졌다 — 일정은 웨비나가 이미
 * 들고 있으므로 파생시키는 게 맞다.
 *
 * Node(서버)와 브라우저 양쪽에서 돈다 → Buffer 대신 TextEncoder 를 쓴다.
 */

/** DTSTAMP 등 UTC 고정 필드용. */
export function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/**
 * 한국시간(Asia/Seoul) 벽시계 표기 — TZID 와 함께 쓴다.
 * KST 는 1988년 이후 서머타임이 없어 UTC+9 고정이라 오프셋 가산으로 충분하다.
 */
export function toIcsKst(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace(/[-:]/g, "")
    .split(".")[0];
}

/** RFC 5545 TEXT 이스케이프 — 안 하면 설명의 쉼표·세미콜론에서 파싱이 깨진다. */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/[\r\n]+/g, "\\n");
}

/**
 * RFC 5545 줄 접기(75 옥텟). 한국어 설명은 쉽게 넘어가고, 안 접으면 가져오기에 실패하는 앱이 있다.
 * 글자 수가 아니라 **바이트**로 센다 — 한글은 UTF-8 에서 3바이트다.
 */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let take = Math.min(limit, bytes.length - start);
    // 멀티바이트 문자를 자르지 않도록 경계까지 뒤로 물린다
    while (take > 0 && (bytes[start + take] & 0xc0) === 0x80) take--;
    out.push(dec.decode(bytes.subarray(start, start + take)));
    start += take;
    limit = 74; // 이어지는 줄은 선행 공백 1옥텟을 쓴다
  }
  return out.join("\r\n ");
}

export interface IcsWebinar {
  name: string;
  description: string | null;
  liveStartAt: Date;
  liveEndAt: Date;
  slug: string;
}

/**
 * 캘린더 앱에 넘길 .ics 본문.
 *
 * @param now DTSTAMP 에 쓸 시각. 테스트가 값을 고정할 수 있게 인자로 받는다.
 */
export function buildIcs(webinar: IcsWebinar, now: Date = new Date()): string {
  const name = icsText(webinar.name);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mach studio//Webinar//KR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // 한국시간 기준을 명시한다. TZID 없이 UTC 로만 주면 절대시각은 맞지만
    // 캘린더 앱이 기기 시간대로만 보여줘 "한국시간 몇 시인지"가 드러나지 않는다.
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Seoul",
    "BEGIN:STANDARD",
    "DTSTART:19881009T030000",
    "TZOFFSETFROM:+1000",
    "TZOFFSETTO:+0900",
    "TZNAME:KST",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    // 웨비나당 고정 — 두 번 담아도 캘린더가 새 일정이 아니라 갱신으로 처리한다.
    `UID:mach-webinar-${webinar.slug}@machstudio`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART;TZID=Asia/Seoul:${toIcsKst(webinar.liveStartAt)}`,
    `DTEND;TZID=Asia/Seoul:${toIcsKst(webinar.liveEndAt)}`,
    `SUMMARY:${name}`,
    `DESCRIPTION:${icsText(webinar.description ?? "")}`,
    "LOCATION:Online",
    // 알림 2회 — 1시간 전, 10분 전
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${name} 1시간 전입니다!`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${name} 10분 뒤 시작합니다!`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    // 접기는 마지막에 전 줄에 한 번 — 줄마다 부르면 빠뜨리기 쉽다.
    .map(foldIcsLine)
    .join("\r\n");
}

/** 파일명 — 캘린더 앱이 첨부 이름으로 쓴다. 경로 구분자·제어문자를 남기면 저장이 막힌다. */
export function icsFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 60) || "webinar";
  return `${safe}.ics`;
}
