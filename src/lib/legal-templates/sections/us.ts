/**
 * 미국(US) 문서 섹션.
 *
 * CCPA/CPRA(캘리포니아 소비자 프라이버시법), CAN-SPAM(이메일 마케팅), TCPA(문자 마케팅),
 * COPPA(아동 개인정보)를 표준 관행 수준으로 반영했다. 실제 배포 전 법무 검토가 필요하다 —
 * 특히 TCPA는 건당 $500~1,500 법정손해배상에 집단소송이 잦다(설계 문서 §7). 그래서 이 템플릿은
 * SMS 마케팅을 다루지 않는다 — 사전 동의 없는 문자 발송은 절대 하지 않는다는 전제로 썼다.
 */
import type { CountrySections, GenerateInput, Section } from "../types";
import { ORG_TOKEN } from "../tokens";
import {
  blankEn,
  categoryLabelEn,
  contactEmailEn,
  formatDateRangeEn,
  orgLineEn,
} from "./copy";

function eventName(ctx: GenerateInput): string {
  return blankEn(ctx.event.eventName, "[Event Name]");
}

function venue(ctx: GenerateInput): string {
  return blankEn(ctx.event.venue, "[Venue Name and Address]");
}

function effectiveDate(ctx: GenerateInput): string {
  return blankEn(ctx.event.effectiveDate, "[Effective Date]");
}

function purposeVerb(ctx: GenerateInput): string {
  return ctx.purpose === "competition-entry" ? "enter" : "pre-register for";
}

/* ── 개인정보처리방침 ─────────────────────────────────────────────── */

const PRIVACY_SECTIONS: Section[] = [
  {
    id: "intro",
    purposes: "any",
    render: (ctx) =>
      `## Privacy Policy\n\n` +
      `**Effective Date:** ${effectiveDate(ctx)}\n\n` +
      `This Privacy Policy explains how ${orgLineEn()} ("we," "us," or "our") collects, uses, ` +
      `and protects personal information when you ${purposeVerb(ctx)} **${eventName(ctx)}** ` +
      `(${formatDateRangeEn(ctx.event.eventDates)}, ${venue(ctx)}). By submitting this form, you ` +
      `acknowledge that you have read this Privacy Policy.`,
  },
  {
    id: "data-collected",
    purposes: "any",
    render: (ctx) => {
      const items = ctx.collectedCategories.map((c) => `- ${categoryLabelEn(c)}`);
      const list = items.length > 0 ? items.join("\n") : "- the information you enter in the registration form";
      return (
        `## Information We Collect\n\n` +
        `When you register, we collect the information you provide directly:\n\n${list}\n\n` +
        `We also automatically collect limited technical information when you visit our registration site, ` +
        `such as your IP address, browser type, device information, and general interaction data with the page. ` +
        `This technical data is not linked to your identity beyond what is necessary to operate and secure the site.`
      );
    },
  },
  {
    id: "use-purpose-registration",
    purposes: ["pre-registration"],
    render: (ctx) =>
      `## How We Use Your Information\n\n` +
      `We use the information above to:\n\n` +
      `- Process your registration and confirm your attendance at ${eventName(ctx)};\n` +
      `- Issue your entry pass/badge and manage attendance capacity;\n` +
      `- Send you event updates, schedule changes, and venue guidelines;\n` +
      `- Compile aggregated, non-identifying attendance statistics for reporting to co-organizers and sponsors;\n` +
      `- Improve our future events.`,
  },
  {
    id: "use-purpose-competition",
    purposes: ["competition-entry"],
    render: (ctx) =>
      `## How We Use Your Information\n\n` +
      `We use the information above to:\n\n` +
      `- Process your entry into ${eventName(ctx)} and communicate with you about your application;\n` +
      `- Enable public voting and/or judge scoring of your entry;\n` +
      `- Determine and announce results, rankings, and awards;\n` +
      `- Coordinate your participation on the day of the event.`,
  },
  {
    id: "use-marketing-note",
    purposes: "any",
    when: (ctx) => ctx.marketingOffered,
    render: () =>
      `If you separately opt in to receive marketing communications, we also use your email address to send ` +
      `you newsletters, promotions, and information about future events. You may opt out at any time (see ` +
      `"Marketing Communications" below).`,
  },
  {
    id: "retention",
    purposes: "any",
    render: (ctx) => {
      const note = blankEn(
        ctx.event.dataRetentionNote,
        "for the duration of the event plus a reasonable period afterward for reporting, accounting, and " +
          "legal-compliance purposes (typically no longer than 24 months), unless a longer period is required by law",
      );
      return `## Data Retention\n\nWe retain your information ${note}. You may request earlier deletion — see "Your Privacy Rights" below.`;
    },
  },
  {
    id: "sharing",
    purposes: "any",
    render: (ctx) => {
      const base =
        `## Disclosure of Information\n\n` +
        `**Service providers.** We may share your information with third-party service providers strictly ` +
        `necessary to operate the event, such as registration/ticketing platforms, email delivery services, and ` +
        `badge-printing vendors, who are contractually restricted from using your information for their own purposes.\n\n`;
      if (ctx.event.thirdParties.length > 0) {
        const list = ctx.event.thirdParties.map((tp) => `- **${blankEn(tp.name, "[recipient]")}** — ${blankEn(tp.purpose, "[purpose]")}`).join("\n");
        return (
          base +
          `**Event partners.** With your separate consent (see "Third-Party Sharing" below), we may also share ` +
          `your information with:\n\n${list}`
        );
      }
      return base + `We do not otherwise share your personal information with third parties for their own purposes.`;
    },
  },
  {
    id: "no-sale",
    purposes: "any",
    render: () =>
      `**No sale or sharing of personal information.** We do not sell your personal information, and we do not ` +
      `share it for cross-context behavioral advertising, as those terms are defined under the California ` +
      `Consumer Privacy Act (CCPA/CPRA).`,
  },
  {
    id: "cross-border",
    purposes: "any",
    render: () =>
      `## International Data Transfer\n\n` +
      `${orgLineEn()} is affiliated with an organization based in the Republic of Korea, and the systems ` +
      `we use to process registrations may store or process your information on servers located in ` +
      `${ORG_TOKEN.hostingRegion}. We take reasonable measures to protect your information consistent with ` +
      `this Privacy Policy regardless of where it is processed.`,
  },
  {
    id: "photography-registration",
    purposes: ["pre-registration"],
    when: (ctx) => ctx.event.onSitePhotography,
    render: (ctx) =>
      `## Photography and Videography\n\n` +
      `Please be advised that photography and video recording will take place at ${venue(ctx)} during ` +
      `${eventName(ctx)}. By attending the event, you consent to the use of your image or likeness in ` +
      `photographs or videos used for reporting on and promoting future events. If you would like an image ` +
      `removed, contact us using the information in "Contact Us" below.`,
  },
  {
    id: "photography-competition",
    purposes: ["competition-entry"],
    render: (ctx) =>
      `## Use of Submitted Media and Event Recording\n\n` +
      `Photos or videos you submit with your entry, along with recordings of your on-stage performance at ` +
      `${eventName(ctx)}, will be used for judging your entry, determining and displaying rankings during ` +
      `public voting, and announcing results. By entering, you also consent to these recordings being used ` +
      `for a live broadcast or stream of the event and for promotional materials for future events.`,
  },
  {
    id: "children",
    purposes: "any",
    render: () =>
      `## Children's Privacy\n\n` +
      `This registration is not directed at children under the age of 13, and we do not knowingly collect ` +
      `personal information from children under 13. If you believe a child has provided us with personal ` +
      `information, please contact us so we can delete it.`,
  },
  {
    id: "rights",
    purposes: "any",
    render: () =>
      `## Your California Privacy Rights (CCPA/CPRA)\n\n` +
      `If you are a California resident, you have the right to:\n\n` +
      `- **Know and access** the specific pieces and categories of personal information we have collected about you;\n` +
      `- **Delete** your personal information, subject to certain legal exceptions;\n` +
      `- **Correct** inaccurate personal information;\n` +
      `- **Limit the use** of sensitive personal information;\n` +
      `- **Opt out of sale or sharing** of personal information (we do not currently sell or share your ` +
      `information — see "Disclosure of Information" above);\n` +
      `- **Non-discrimination** for exercising any of these rights.\n\n` +
      `To exercise these rights, contact us using the information in "Contact Us" below.`,
  },
  {
    id: "security",
    purposes: "any",
    render: () =>
      `## Security\n\n` +
      `We use reasonable administrative, technical, and physical safeguards designed to protect your ` +
      `information. No method of transmission or storage is completely secure, and we cannot guarantee ` +
      `absolute security.`,
  },
  {
    id: "changes",
    purposes: "any",
    render: () =>
      `## Changes to This Policy\n\n` +
      `We may update this Privacy Policy from time to time. The effective date at the top of this page ` +
      `indicates when it was last revised.`,
  },
  {
    id: "contact",
    purposes: "any",
    render: (ctx) =>
      `## Contact Us\n\n` +
      `To exercise your privacy rights or if you have questions about this Privacy Policy, contact us at:\n\n` +
      `- **Email:** ${contactEmailEn(ctx.event)}\n` +
      `- **Mailing Address:** ${ORG_TOKEN.address}`,
  },
];

/* ── 마케팅 수신 동의 ─────────────────────────────────────────────── */

const MARKETING_SECTIONS: Section[] = [
  {
    id: "marketing-scope",
    purposes: "any",
    render: (ctx) =>
      `We would like to send you occasional email updates about **${eventName(ctx)}** and future events — ` +
      `newsletters, early-registration invitations, and promotional offers. We only use your email address ` +
      `for this purpose; we do not send marketing text messages unless you separately opt in to that elsewhere.`,
  },
  {
    id: "marketing-optional",
    purposes: "any",
    render: () =>
      `This consent is entirely optional. Declining it will not affect your registration or entry — you will ` +
      `still receive operational messages about the event itself (confirmations, schedule changes, etc.), which ` +
      `are not marketing communications.`,
  },
  {
    id: "marketing-withdraw",
    purposes: "any",
    render: (ctx) =>
      `You can unsubscribe at any time using the link included in every marketing email, or by contacting us ` +
      `at ${contactEmailEn(ctx.event)}.`,
  },
];

/* ── 제3자 제공 동의 ──────────────────────────────────────────────── */

const THIRD_PARTY_SECTIONS: Section[] = [
  {
    id: "thirdparty-intro",
    purposes: "any",
    render: (ctx) =>
      `With your consent, we would like to share your registration information with the following event ` +
      `partners for ${eventName(ctx)}:`,
  },
  {
    id: "thirdparty-list",
    purposes: "any",
    render: (ctx) =>
      ctx.event.thirdParties
        .map((tp) => `- **${blankEn(tp.name, "[recipient]")}** — ${blankEn(tp.purpose, "[purpose]")}`)
        .join("\n"),
  },
  {
    id: "thirdparty-voluntary",
    purposes: "any",
    render: () =>
      `This consent is entirely optional. Declining it will not affect your ability to register or participate ` +
      `— the partners listed above simply will not receive your information.`,
  },
  {
    id: "thirdparty-withdraw",
    purposes: "any",
    render: (ctx) =>
      `You can withdraw this consent at any time by contacting us at ${contactEmailEn(ctx.event)}. ` +
      `Withdrawal does not affect sharing that already took place before your request.`,
  },
];

export const US_SECTIONS: CountrySections = {
  privacy: PRIVACY_SECTIONS,
  marketing: MARKETING_SECTIONS,
  thirdParty: THIRD_PARTY_SECTIONS,
  labels: {
    privacy: () => "[Required] I have read and agree to the Privacy Policy",
    marketing: () => "[Optional] I would like to receive marketing emails about future events",
    thirdParty: () => "[Optional] I agree to share my information with the event partners listed above",
  },
};
