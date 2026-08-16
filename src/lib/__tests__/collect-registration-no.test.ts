import { describe, expect, it } from "vitest";
import {
  REGISTRATION_NO_LENGTH,
  extractRegistrationNo,
  generateRegistrationNo,
  isValidRegistrationNo,
  luhnCheckDigit,
} from "@/lib/collect-registration-no";

/**
 * 등록번호는 현장 입장의 열쇠다(설계 §9.1·§12). 여기서 지키는 것은 세 가지다:
 * 추측할 수 없을 것, 손으로 친 오타가 **남의 번호가 되지 않을** 것, 스캐너가 뱉는 잡음에서
 * 번호를 뽑아낼 것.
 */
describe("등록번호", () => {
  it("13자리 숫자이고 자기 자신을 검증한다", () => {
    for (let i = 0; i < 200; i++) {
      const no = generateRegistrationNo();
      expect(no).toHaveLength(REGISTRATION_NO_LENGTH);
      expect(no).toMatch(/^\d{13}$/);
      expect(isValidRegistrationNo(no)).toBe(true);
    }
  });

  /** 순차면 등록 규모가 노출되고 남의 번호를 추측할 수 있다 — 그래서 난수여야 한다. */
  it("연달아 뽑아도 겹치지 않고, 앞자리가 한 값으로 몰리지 않는다", () => {
    const seen = new Set<string>();
    const firstDigits = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const no = generateRegistrationNo();
      seen.add(no);
      firstDigits.add(no[0]);
    }
    expect(seen.size).toBe(500);
    // 난수라면 첫 자리 10가지가 500번 안에 대부분 나온다. 순차·시각 기반이면 1~2가지만 나온다.
    expect(firstDigits.size).toBeGreaterThan(5);
  });

  /**
   * **이게 체크digit 을 넣은 이유다.** 현장에서 QR 이 안 읽히면 스태프가 손으로 친다.
   * 한 자리 오타가 그냥 통과하면 화면에 **다른 사람 이름**이 뜬다.
   */
  it("한 자리 오타를 잡는다", () => {
    const no = generateRegistrationNo();
    let caught = 0;
    let tried = 0;
    for (let i = 0; i < no.length; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === no[i]) continue;
        tried++;
        const typo = no.slice(0, i) + d + no.slice(i + 1);
        if (!isValidRegistrationNo(typo)) caught++;
      }
    }
    expect(caught).toBe(tried); // Luhn 은 한 자리 오타를 100% 잡는다
  });

  /** 두 번째로 흔한 오타 — 인접 자리 뒤바뀜. */
  it("인접 두 자리가 뒤바뀐 것을 (같은 숫자가 아닌 한) 잡는다", () => {
    const no = generateRegistrationNo();
    for (let i = 0; i < no.length - 1; i++) {
      if (no[i] === no[i + 1]) continue;
      // Luhn 은 09↔90 만 못 잡는다 — 알려진 한계이고, 그 조합은 제외한다.
      const pair = no[i] + no[i + 1];
      if (pair === "09" || pair === "90") continue;
      const swapped = no.slice(0, i) + no[i + 1] + no[i] + no.slice(i + 2);
      expect(isValidRegistrationNo(swapped)).toBe(false);
    }
  });

  it("길이·자료형이 어긋나면 던지지 않고 false 를 준다", () => {
    for (const bad of ["", "123", "abcdefghijklm", null, undefined, 1234567890123, {}, []]) {
      expect(isValidRegistrationNo(bad)).toBe(false);
    }
  });

  it("luhnCheckDigit 은 숫자 아닌 payload 를 거부한다", () => {
    expect(() => luhnCheckDigit("12a4")).toThrow();
  });
});

describe("스캐너 입력에서 번호 뽑기", () => {
  const no = generateRegistrationNo();

  it("번호 그대로", () => {
    expect(extractRegistrationNo(no)).toBe(no);
    expect(extractRegistrationNo(`  ${no}  `)).toBe(no);
  });

  /** HID 스캐너가 URL QR 을 읽으면 주소가 통째로 입력칸에 박힌다(§9.2). */
  it("URL 이 통째로 들어와도 번호만 뽑는다", () => {
    expect(extractRegistrationNo(`https://machstudio.vercel.app/t/${no}`)).toBe(no);
    expect(extractRegistrationNo(`https://x.io/t/${no}?utm_source=qr`)).toBe(no);
  });

  /**
   * **13자리 숫자면 다 받으면 안 된다.** 밀리초 타임스탬프가 정확히 13자리라
   * 스캐너·클립보드에서 섞여 들어온다. 체크digit 이 그걸 걸러낸다.
   */
  it("13자리라도 체크digit 이 안 맞으면 거부한다 — 밀리초 타임스탬프가 딱 13자리다", () => {
    const ts = "1755300000000";
    expect(ts).toHaveLength(13);
    if (!isValidRegistrationNo(ts)) expect(extractRegistrationNo(ts)).toBeNull();
    expect(extractRegistrationNo("아무 글자")).toBeNull();
    expect(extractRegistrationNo("")).toBeNull();
    expect(extractRegistrationNo(null)).toBeNull();
  });

  it("여러 숫자 덩어리 중 유효한 것을 고른다", () => {
    expect(extractRegistrationNo(`1755300000000 ${no}`)).toBe(no);
  });
});
