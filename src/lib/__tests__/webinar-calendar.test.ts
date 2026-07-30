import { describe, expect, it } from "vitest";
import { buildIcs, icsFileName, foldIcsLine, icsText, toIcsKst, toIcsUtc } from "@/lib/webinar-calendar";

/**
 * .ics 는 사람이 안 보는 파일이라 틀려도 화면에서는 멀쩡하다 — 캘린더 앱이 조용히 거부할 뿐이다.
 * 임베드 배너와 자체 대기 화면이 **같은 빌더**를 쓰므로, 여기가 깨지면 두 면이 같이 깨진다.
 */

const base = {
  name: "K-Brand LA Launch Webinar",
  description: "우리 브랜드는 LA에서 통할까?",
  liveStartAt: new Date("2026-08-11T05:00:00.000Z"), // KST 14:00
  liveEndAt: new Date("2026-08-11T07:00:00.000Z"), // KST 16:00
  slug: "--la-",
};
const NOW = new Date("2026-07-29T00:00:00.000Z");

describe("캘린더 앱이 읽는 형식", () => {
  it("줄 구분자가 CRLF 다", () => {
    const ics = buildIcs(base, NOW);
    expect(ics.split("\n").every((l, i, arr) => i === arr.length - 1 || l.endsWith("\r"))).toBe(true);
  });

  it("필수 블록이 있다", () => {
    const ics = buildIcs(base, NOW);
    for (const tag of ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "END:VEVENT", "END:VCALENDAR"]) {
      expect(ics).toContain(tag);
    }
  });

  /**
   * TZID 없이 UTC 로만 주면 절대시각은 맞지만 캘린더 앱이 기기 시간대로만 보여줘
   * "한국시간 몇 시인지"가 드러나지 않는다 — 해외에서 보는 등록자에게 특히 중요하다.
   */
  it("시각을 한국시간 벽시계 + TZID 로 적는다", () => {
    const ics = buildIcs(base, NOW);
    expect(ics).toContain("DTSTART;TZID=Asia/Seoul:20260811T140000");
    expect(ics).toContain("DTEND;TZID=Asia/Seoul:20260811T160000");
    expect(ics).toContain("TZID:Asia/Seoul");
  });

  it("DTSTAMP 만 UTC 다", () => {
    expect(buildIcs(base, NOW)).toContain("DTSTAMP:20260729T000000Z");
  });

  it("같은 웨비나는 같은 UID — 두 번 담아도 새 일정이 아니라 갱신이 된다", () => {
    expect(buildIcs(base, NOW)).toContain("UID:mach-webinar---la-@machstudio");
    expect(buildIcs({ ...base, name: "제목만 바뀜" }, NOW)).toContain("UID:mach-webinar---la-@machstudio");
  });

  it("알림 2회 — 1시간 전과 10분 전", () => {
    const ics = buildIcs(base, NOW);
    expect(ics).toContain("TRIGGER:-PT1H");
    expect(ics).toContain("TRIGGER:-PT10M");
  });
});

describe("KST 변환", () => {
  it("UTC 05:00 은 KST 14:00", () => {
    expect(toIcsKst(new Date("2026-08-11T05:00:00.000Z"))).toBe("20260811T140000");
  });

  it("자정을 넘기면 날짜도 넘어간다", () => {
    expect(toIcsKst(new Date("2026-08-11T16:00:00.000Z"))).toBe("20260812T010000");
  });

  it("UTC 표기는 Z 로 끝난다", () => {
    expect(toIcsUtc(new Date("2026-07-29T00:00:00.000Z"))).toBe("20260729T000000Z");
  });
});

describe("특수문자를 이스케이프한다", () => {
  /** 쉼표·세미콜론은 .ics 에서 값 구분자다 — 그대로 두면 제목이 잘려 들어간다. */
  it("쉼표·세미콜론·백슬래시", () => {
    expect(icsText("A,B;C\\D")).toBe("A\\\\,B\\;C\\\\D".replace("\\\\,", "\\,"));
    expect(buildIcs({ ...base, name: "A,B;C" }, NOW)).toContain("SUMMARY:A\\,B\\;C");
  });

  it("백슬래시를 먼저 바꾼다 — 나중이면 앞서 넣은 이스케이프를 다시 먹는다", () => {
    expect(icsText("\\,")).toBe("\\\\\\,");
  });

  it("줄바꿈은 리터럴 \\n 두 글자로 — 진짜 개행은 속성의 끝을 뜻한다", () => {
    expect(icsText("첫 줄\n둘째 줄")).toBe("첫 줄\\n둘째 줄");
    expect(buildIcs({ ...base, description: "첫 줄\n둘째 줄" }, NOW)).not.toMatch(/DESCRIPTION:첫 줄\r\n둘째/);
  });

  it("설명이 없어도 깨지지 않는다", () => {
    expect(buildIcs({ ...base, description: null }, NOW)).toContain("DESCRIPTION:");
  });
});

describe("긴 줄을 75옥텟으로 접는다", () => {
  /** 한글은 UTF-8 3바이트다 — 글자 수로 세면 한도를 넘겨 엄격한 파서가 파일을 거부한다. */
  it("한글 긴 설명도 모든 줄이 75바이트 이하", () => {
    const ics = buildIcs({ ...base, description: "미국 시장 진출 전 반드시 점검해야 할 핵심 포인트".repeat(6) }, NOW);
    const enc = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("멀티바이트 문자를 중간에서 자르지 않는다", () => {
    const folded = foldIcsLine("가".repeat(40));
    // 깨진 문자(U+FFFD)가 생기면 경계에서 잘린 것이다
    expect(folded).not.toContain("�");
    expect(folded.replace(/\r\n /g, "")).toBe("가".repeat(40));
  });

  it("접힌 줄은 공백 한 칸으로 이어진다", () => {
    expect(foldIcsLine("a".repeat(200))).toMatch(/\r\n /);
  });

  it("짧은 줄은 접지 않는다", () => {
    expect(foldIcsLine("SUMMARY:짧은 제목")).toBe("SUMMARY:짧은 제목");
  });
});

describe("파일명", () => {
  it("경로 구분자를 남기지 않는다", () => {
    expect(icsFileName("a/b\\c:d")).toBe("abcd.ics");
  });

  it("비면 폴백", () => {
    expect(icsFileName("///")).toBe("webinar.ics");
  });
});
