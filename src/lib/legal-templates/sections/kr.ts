/**
 * 대한민국(KR) 문서 섹션.
 *
 * 개인정보 보호법(PIPA)이 요구하는 고지 항목을 빠짐없이 담는 데 집중했다 — 특히
 * ① 수집·이용 목적, ② 보유·이용기간, ③ 동의 거부 권리 및 불이익, ④(제3자 제공 시) 제공받는 자·
 * 제공 항목·제공 목적·보유기간은 형식이 정해져 있어 빠지면 안 된다. 실제 배포 전 법무 검토가 필요하다.
 */
import type { CountrySections, GenerateInput, Section } from "../types";
import {
  blankKo,
  categoryLabelKo,
  contactEmailKo,
  formatDateRangeKo,
  orgLineKo,
} from "./copy";

function eventName(ctx: GenerateInput): string {
  return blankKo(ctx.event.eventName, "[행사명 미입력]");
}

function venue(ctx: GenerateInput): string {
  return blankKo(ctx.event.venue, "[장소 미입력]");
}

function effectiveDate(ctx: GenerateInput): string {
  return blankKo(ctx.event.effectiveDate, "[시행일 미입력]");
}

function purposeVerb(ctx: GenerateInput): string {
  return ctx.purpose === "competition-entry" ? "참가 신청" : "사전등록";
}

/* ── 개인정보처리방침 ─────────────────────────────────────────────── */

const PRIVACY_SECTIONS: Section[] = [
  {
    id: "intro",
    purposes: "any",
    render: (ctx) =>
      `## 개인정보처리방침\n\n` +
      `**시행일:** ${effectiveDate(ctx)}\n\n` +
      `${orgLineKo(ctx.org)}(이하 "회사")는 「개인정보 보호법」에 따라 이용자의 개인정보를 보호하고 ` +
      `이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보처리방침을 수립·공개합니다. ` +
      `본 방침은 **${eventName(ctx)}**(${formatDateRangeKo(ctx.event.eventDates)}, ${venue(ctx)}) ` +
      `${purposeVerb(ctx)} 과정에서 수집하는 개인정보에 적용됩니다.`,
  },
  {
    id: "collected-items",
    purposes: "any",
    render: (ctx) => {
      const items = ctx.collectedCategories.map((c) => `- ${categoryLabelKo(c)}`);
      const list = items.length > 0 ? items.join("\n") : "- 신청 폼에 입력하신 정보";
      return (
        `## 1. 수집하는 개인정보 항목\n\n` +
        `회사는 다음과 같은 개인정보를 수집합니다.\n\n${list}\n\n` +
        `또한 서비스 이용 과정에서 IP 주소, 브라우저 종류, 기기 정보, 방문 일시 등이 자동으로 생성되어 ` +
        `수집될 수 있습니다.`
      );
    },
  },
  {
    id: "purpose-registration",
    purposes: ["pre-registration"],
    render: (ctx) =>
      `## 2. 개인정보의 수집 및 이용 목적\n\n` +
      `회사는 수집한 개인정보를 다음의 목적을 위해 이용합니다.\n\n` +
      `- ${eventName(ctx)} 사전등록 처리 및 참가 확인;\n` +
      `- 출입증(배지) 발급 및 현장 입장 관리;\n` +
      `- 행사 일정 변경, 장소 안내 등 필수 공지사항 전달;\n` +
      `- 통계 작성을 위한 참관객 현황의 비식별 가공(공동주최·후원기관 보고용);\n` +
      `- 향후 행사 운영 개선.`,
  },
  {
    id: "purpose-competition",
    purposes: ["competition-entry"],
    render: (ctx) =>
      `## 2. 개인정보의 수집 및 이용 목적\n\n` +
      `회사는 수집한 개인정보를 다음의 목적을 위해 이용합니다.\n\n` +
      `- ${eventName(ctx)} 참가 신청 접수 및 신청자와의 연락;\n` +
      `- 대중 투표 및(또는) 심사위원 평가 진행;\n` +
      `- 결과·순위·수상 내역 결정 및 발표;\n` +
      `- 행사 당일 참가자 현장 운영.`,
  },
  {
    id: "use-marketing-note",
    purposes: "any",
    when: (ctx) => ctx.marketingOffered,
    render: () =>
      `별도로 마케팅 정보 수신에 동의하신 경우, 이메일을 통해 향후 행사·프로모션 안내를 보내드리는 데 ` +
      `이용합니다. 이 동의는 아래 "마케팅 정보 수신 동의"에서 별도로 이루어지며 언제든 철회할 수 있습니다.`,
  },
  {
    id: "retention",
    purposes: "any",
    render: (ctx) => {
      const note = blankKo(
        ctx.event.dataRetentionNote,
        "행사 종료 후 정산·보고 등 목적 달성에 필요한 합리적인 기간(원칙적으로 24개월 이내) 동안 " +
          "보유하며, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다",
      );
      return `## 3. 개인정보의 보유 및 이용기간\n\n회사는 ${note}. 이용자는 보유기간 이전이라도 삭제를 요청할 수 있습니다("정보주체의 권리" 참고).`;
    },
  },
  {
    id: "provision-third-party",
    purposes: "any",
    render: (ctx) => {
      if (ctx.event.thirdParties.length > 0) {
        return (
          `## 4. 개인정보의 제3자 제공\n\n` +
          `회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 이용자가 별도로 동의한 ` +
          `경우에 한해 아래 대상에게 제공할 수 있으며, 구체적인 제공 항목·목적·보유기간은 ` +
          `"개인정보 제3자 제공 동의"에서 별도로 안내합니다.\n\n` +
          ctx.event.thirdParties
            .map((tp) => `- ${blankKo(tp.name, "[제공받는 자 미입력]")} — ${blankKo(tp.purpose, "[제공 목적 미입력]")}`)
            .join("\n")
        );
      }
      return (
        `## 4. 개인정보의 제3자 제공\n\n` +
        `회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.`
      );
    },
  },
  {
    id: "outsourcing",
    purposes: "any",
    render: () =>
      `## 5. 개인정보 처리업무의 위탁\n\n` +
      `회사는 등록 시스템 운영, 이메일 발송, 배지 인쇄 등 원활한 행사 운영을 위해 필요한 범위 내에서 ` +
      `개인정보 처리업무를 외부 업체에 위탁할 수 있습니다. 위탁 시 관계 법령에 따라 수탁자가 개인정보를 ` +
      `안전하게 처리하도록 필요한 사항을 규정하고 관리·감독합니다.`,
  },
  {
    id: "cross-border",
    purposes: "any",
    render: (ctx) =>
      `## 6. 개인정보의 국외 이전\n\n` +
      `${orgLineKo(ctx.org)}가 운영하는 등록 시스템의 특성상 이용자의 개인정보가 대한민국 내 서버 또는 ` +
      `해외 서버에 저장·처리될 수 있습니다. 회사는 국외 이전이 발생하는 경우 관계 법령이 정한 절차와 ` +
      `보호조치를 따릅니다. *[운영 참고: 실제 인프라 소재지를 개발팀에 확인한 뒤 정확한 국가명으로 ` +
      `채워 넣으세요.]*`,
  },
  {
    id: "photography-registration",
    purposes: ["pre-registration"],
    when: (ctx) => ctx.event.onSitePhotography,
    render: (ctx) =>
      `## 7. 사진·영상 촬영 안내\n\n` +
      `${eventName(ctx)} 행사 기간 중 ${venue(ctx)}에서 사진·영상 촬영이 진행될 수 있습니다. 행사에 ` +
      `참석하시면 향후 행사 홍보·보도 목적으로 귀하의 초상이 포함된 사진·영상이 사용될 수 있음에 ` +
      `동의하시는 것으로 안내드립니다. 본인의 이미지 삭제를 원하시면 "문의처"로 연락해 주세요.`,
  },
  {
    id: "photography-competition",
    purposes: ["competition-entry"],
    render: (ctx) =>
      `## 7. 제출 자료·현장 촬영 영상의 이용\n\n` +
      `참가 신청 시 제출하신 사진·영상과 ${eventName(ctx)} 현장 무대 공연 촬영 영상은 심사, 투표 화면 ` +
      `공개, 결과 발표에 이용됩니다. 참가 신청 시 위 촬영 영상이 행사 생중계 또는 다시보기, 향후 행사 ` +
      `홍보 자료에 이용될 수 있음에도 동의하시는 것으로 안내드립니다.`,
  },
  {
    id: "children",
    purposes: "any",
    render: () =>
      `## 8. 아동의 개인정보 보호\n\n` +
      `만 14세 미만 아동의 개인정보를 수집하는 경우 법정대리인의 동의를 받습니다. 만 14세 미만 아동이 ` +
      `법정대리인의 동의 없이 개인정보를 제공한 사실을 알게 되신 경우 "문의처"로 연락해 주시면 지체 없이 ` +
      `삭제 조치하겠습니다.`,
  },
  {
    id: "rights",
    purposes: "any",
    render: () =>
      `## 9. 정보주체의 권리·의무 및 행사방법\n\n` +
      `이용자는 개인정보와 관련하여 다음의 권리를 언제든지 행사할 수 있습니다.\n\n` +
      `- 개인정보 열람 요구;\n` +
      `- 오류 등이 있을 경우 정정 요구;\n` +
      `- 삭제 요구;\n` +
      `- 처리정지 요구.\n\n` +
      `위 권리 행사는 "문의처"의 연락처를 통해 서면, 이메일 등으로 하실 수 있으며, 회사는 지체 없이 조치합니다. ` +
      `동의를 거부하실 권리가 있으며, 필수 항목에 대한 동의를 거부하실 경우 서비스(사전등록·참가 신청) 이용이 ` +
      `제한될 수 있습니다.`,
  },
  {
    id: "security",
    purposes: "any",
    render: () =>
      `## 10. 개인정보의 안전성 확보조치\n\n` +
      `회사는 개인정보의 안전성 확보를 위해 접근권한 관리, 암호화, 접속기록 보관 등 관리적·기술적 조치를 ` +
      `취하고 있습니다.`,
  },
  {
    id: "dpo",
    purposes: "any",
    render: (ctx) =>
      `## 11. 개인정보 보호책임자\n\n` +
      `회사는 개인정보 처리에 관한 업무를 총괄하고 이용자의 불만처리 및 피해구제를 위해 아래와 같이 ` +
      `개인정보 보호책임자를 지정하고 있습니다.\n\n` +
      `- **연락처:** ${ctx.org.dpoContactEmail?.trim() || contactEmailKo(ctx.org, ctx.event)}\n` +
      `- **주소:** ${blankKo(ctx.org.address, "[사업장 주소 미입력]")}`,
  },
  {
    id: "changes",
    purposes: "any",
    render: () =>
      `## 12. 고지의 의무\n\n` +
      `본 개인정보처리방침은 법령·정책 또는 서비스의 변경에 따라 내용이 추가·삭제 및 수정될 수 있으며, ` +
      `변경 시 시행일을 상단에 표시합니다.`,
  },
];

/* ── 마케팅(광고성 정보) 수신 동의 ───────────────────────────────── */

const MARKETING_SECTIONS: Section[] = [
  {
    id: "marketing-scope",
    purposes: "any",
    render: (ctx) =>
      `회사는 이용자에게 **${eventName(ctx)}** 관련 소식 및 향후 행사 안내, 프로모션 정보를 이메일로 ` +
      `발송하고자 합니다. 수신 매체는 이메일이며, 문자메시지 등 다른 매체로는 발송하지 않습니다.`,
  },
  {
    id: "marketing-retention",
    purposes: "any",
    render: () =>
      `수집된 정보는 동의 철회 시 또는 목적 달성 시까지 보유하며, 관계 법령에 따라 보존이 필요한 경우 ` +
      `해당 기간 동안 보관합니다.`,
  },
  {
    id: "marketing-optional",
    purposes: "any",
    render: () =>
      `본 동의는 선택 사항입니다. 동의하지 않으셔도 사전등록·참가 신청 등 서비스 이용에는 제한이 없으며, ` +
      `행사 운영에 필요한 필수 안내(확정 메일, 일정 변경 등)는 마케팅 정보가 아니므로 별도로 발송됩니다.`,
  },
  {
    id: "marketing-withdraw",
    purposes: "any",
    render: (ctx) =>
      `수신에 동의하신 후에도 이메일 하단의 수신거부 링크를 이용하거나 ${contactEmailKo(ctx.org, ctx.event)}로 ` +
      `연락하시면 언제든지 동의를 철회하실 수 있습니다.`,
  },
];

/* ── 개인정보 제3자 제공 동의 ────────────────────────────────────── */

const THIRD_PARTY_SECTIONS: Section[] = [
  {
    id: "thirdparty-intro",
    purposes: "any",
    render: (ctx) => `회사는 ${eventName(ctx)}와 관련하여 아래와 같이 개인정보를 제3자에게 제공하고자 합니다.`,
  },
  {
    id: "thirdparty-table",
    purposes: "any",
    render: (ctx) =>
      ctx.event.thirdParties
        .map((tp) => {
          const items =
            ctx.collectedCategories.length > 0
              ? ctx.collectedCategories.map((c) => categoryLabelKo(c)).join(", ")
              : "신청 폼에 입력하신 정보";
          const retention = blankKo(ctx.event.dataRetentionNote, "제공 목적 달성 시까지");
          return (
            `**${blankKo(tp.name, "[제공받는 자 미입력]")}**\n` +
            `- 제공받는 자의 이용 목적: ${blankKo(tp.purpose, "[제공 목적 미입력]")}\n` +
            `- 제공하는 개인정보 항목: ${items}\n` +
            `- 제공받는 자의 보유·이용기간: ${retention}`
          );
        })
        .join("\n\n"),
  },
  {
    id: "thirdparty-refusal",
    purposes: "any",
    render: () =>
      `본 동의는 선택 사항이며, 동의하지 않으실 권리가 있습니다. 동의하지 않으셔도 사전등록·참가 신청 등 ` +
      `서비스 이용에는 제한이 없으며, 다만 위 대상에게는 귀하의 정보가 제공되지 않습니다.`,
  },
  {
    id: "thirdparty-withdraw",
    purposes: "any",
    render: (ctx) =>
      `동의하신 후에도 ${contactEmailKo(ctx.org, ctx.event)}로 연락하시면 언제든지 동의를 철회하실 수 있으며, ` +
      `철회 이전에 이루어진 제공에는 영향을 미치지 않습니다.`,
  },
];

export const KR_SECTIONS: CountrySections = {
  privacy: PRIVACY_SECTIONS,
  marketing: MARKETING_SECTIONS,
  thirdParty: THIRD_PARTY_SECTIONS,
  labels: {
    privacy: () => "[필수] 개인정보 수집 및 이용에 동의합니다",
    marketing: () => "[선택] 마케팅 정보 수신에 동의합니다",
    thirdParty: () => "[선택] 개인정보 제3자 제공에 동의합니다",
  },
};
