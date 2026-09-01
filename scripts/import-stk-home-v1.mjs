#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PRESET_PATH = path.resolve(SCRIPT_DIR, "../src/lib/expo/presets/stk-home-v1.json");
const SECTION_TYPES = [
  "campaign-hero", "exhibition-grid", "audience-links", "speaker-carousel", "sponsor-marquee", "cta-band",
];
const EXHIBITION_ORDER = [
  "AI & Data Center Show", "Robot Tech & Physical AI Show", "AI Factory Show",
  "Secu Tech Show", "Retail & Logis Tech Show", "Smart Tech Show",
];
const SCHEDULE_KEYS = ["campaign.exhibitor-recruitment", "campaign.visitor-registration", "event"];
const EXHIBITION_IDS = [
  "ai-data-center-show", "robot-tech-physical-ai-show", "ai-factory-show",
  "secu-tech-show", "retail-logis-tech-show", "smart-tech-show",
];
const AUDIENCE_IDS = [
  "booth-participation-guide", "booth-inquiry-link", "brochure-link", "previous-results-link",
  "visitor-registration-guide", "venue-location-link", "directions-link", "parking-guide-link",
];
const CATEGORY_IDS = ["robotics", "ai", "autonomous-manufacturing"];
const SPEAKER_IDS = [
  "henry-jiang", "changquk-myung", "jeremy-lee", "jonghyun-choi", "kuk-won-ko", "philippe-beaulieu",
  "jacob-jang", "aoi-fukawa", "edward-liu", "yoshua-bengio", "remi-quirion", "damien-pereira",
  "sarath-chandar", "bang-liu", "jungjin-choi", "tei-kim", "sangwon-hong", "kagemu-so", "amy-kim",
  "keuntae-park", "tino-hildebrand", "jong-seok-lee", "seokju-cho", "yao-qiyuan", "chen-xianyong",
  "jung-hoon-jang", "jun-hee-park", "daekeun-lim",
];
const SPONSOR_GROUP_IDS = ["nation-of-honor", "sponsors", "supporters", "official-ai-translation-partner"];
const HERO_CTA_IDS = ["exhibition-guide", "visitor-preregister"];
const FINAL_CTA_IDS = ["brochure-download", "booth-inquiry"];
const DESTINATION_IDS = [
  "booth-inquiry", "booth-participation-guide", "brochure-download", "directions",
  "exhibition-ai-data-center", "exhibition-ai-factory", "exhibition-overview", "exhibition-retail-logis",
  "exhibition-robot-tech", "exhibition-secu-tech", "exhibition-smart-tech", "parking-guide",
  "previous-event-results", "venue-location", "visitor-registration", "visitor-registration-guide",
];
const CAMPAIGN_IDS = ["exhibitor-recruitment", "visitor-registration"];

const clone = (value) => structuredClone(value);
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const localizedText = (value) => Object.values(record(value)).find((entry) => typeof entry === "string") ?? "";
const sorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

function ipv4Parts(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null;
}

function isPrivateIpv4(parts) {
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c <= 2)
    || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113) || a >= 224;
}

function ipv6Words(host) {
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half) => {
    if (!half) return [];
    const tokens = half.split(":");
    const words = [];
    for (const [index, token] of tokens.entries()) {
      if (token.includes(".")) {
        if (index !== tokens.length - 1) return null;
        const parts = ipv4Parts(token);
        if (!parts) return null;
        words.push((parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(token)) return null;
        words.push(Number.parseInt(token, 16));
      }
    }
    return words;
  };
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  if (left.length + right.length >= 8) return null;
  return [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || ["localhost", "ip6-localhost", "ip6-loopback"].includes(host)
    || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return true;
  const ipv4 = ipv4Parts(host);
  if (ipv4) return isPrivateIpv4(ipv4);
  if (host.includes(":")) {
    const words = ipv6Words(host);
    if (!words) return true;
    const [first, second] = words;
    if (words.every((word) => word === 0) || words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true;
    if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0
      || (first & 0xff00) === 0xff00 || (first === 0x2001 && second === 0x0db8)) return true;
    if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
      return isPrivateIpv4([words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff]);
    }
  }
  return false;
}

const safeHttps = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && url.username === "" && url.password === ""
      && !isPrivateHostname(url.hostname);
  } catch {
    return false;
  }
};
const safeId = (value) => typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const safeIso = (value) => typeof value === "string" && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

function section(config, type) {
  return config.sections.find((candidate) => candidate.type === type);
}

function assetRequirements(config) {
  const requirements = [{ key: "hero.video", kind: "video", label: "STK campaign hero" }];
  const exhibition = section(config, "exhibition-grid");
  for (const item of exhibition.content.items) {
    requirements.push({ key: `exhibition.${item.id}.symbol`, kind: "image", label: localizedText(item.title) });
  }
  const audience = section(config, "audience-links");
  for (const group of audience.content.groups) for (const item of group.items) {
    requirements.push({ key: `audience.${item.id}.icon`, kind: "image", label: localizedText(item.label) });
  }
  const speakers = section(config, "speaker-carousel");
  for (const speaker of speakers.content.speakers) {
    requirements.push({ key: `speaker.${speaker.id}.image`, kind: "image", label: localizedText(speaker.name) });
  }
  return requirements;
}

function referenceInventory(config) {
  const destinations = new Set();
  const campaigns = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    if (typeof value.destinationId === "string" && value.destinationId) destinations.add(value.destinationId);
    if (Array.isArray(value.campaignIds)) value.campaignIds.forEach((id) => campaigns.add(id));
    Object.values(value).forEach(visit);
  };
  visit(config.sections);
  return { destinations: sorted(destinations), campaigns: sorted(campaigns) };
}

function auditSource(document) {
  const errors = [];
  const config = record(document.config);
  const sections = Array.isArray(config.sections) ? config.sections : [];
  if (config.schemaVersion !== 2) errors.push("unexpected schemaVersion");
  if (config.preset !== "stk-home-v1") errors.push("unexpected preset id");
  if (JSON.stringify(document).includes("e6b9523e-f66c-469f-b897-ff18c252a413")) errors.push("newsletter source must remain excluded");
  if (sections.map((item) => item.type).join("|") !== SECTION_TYPES.join("|")) errors.push("unexpected section order");

  const exhibition = section(config, "exhibition-grid");
  const audience = section(config, "audience-links");
  const speakers = section(config, "speaker-carousel");
  const sponsors = section(config, "sponsor-marquee");
  const cta = section(config, "cta-band");
  if (exhibition?.content?.items?.length !== 6) errors.push("unexpected exhibition count");
  if ((exhibition?.content?.items ?? []).map((item) => localizedText(item.title)).join("|") !== EXHIBITION_ORDER.join("|")) errors.push("unexpected exhibition order");
  const audienceCount = (audience?.content?.groups ?? []).reduce((sum, group) => sum + (group.items?.length ?? 0), 0);
  if (audienceCount !== 8) errors.push("unexpected audience count");
  if (speakers?.content?.categories?.length !== 3 || speakers?.content?.speakers?.length !== 28) errors.push("unexpected speaker count");
  const speakerCounts = Object.fromEntries((speakers?.content?.categories ?? []).map(({ id }) => [id, (speakers.content.speakers ?? []).filter((speaker) => speaker.categoryId === id).length]));
  if (JSON.stringify(speakerCounts) !== JSON.stringify({ robotics: 9, ai: 11, "autonomous-manufacturing": 8 })) errors.push("unexpected speaker category counts");
  if (sponsors?.content?.groups?.length !== 4 || sponsors?.content?.sponsors?.length !== 0) errors.push("unexpected sponsor inventory");
  if (cta?.content?.ctas?.length !== 2) errors.push("unexpected final CTA count");
  if (speakers?.design?.bg !== "dark") errors.push("speaker background must be dark");
  const same = (actual, expected) => actual.length === expected.length && actual.every((value, index) => value === expected[index]);
  if (!same((exhibition?.content?.items ?? []).map((item) => item.id), EXHIBITION_IDS)) errors.push("unexpected exhibition ids");
  if (!same((audience?.content?.groups ?? []).flatMap((group) => group.items ?? []).map((item) => item.id), AUDIENCE_IDS)) errors.push("unexpected audience ids");
  if (!same((speakers?.content?.categories ?? []).map((item) => item.id), CATEGORY_IDS)) errors.push("unexpected category ids");
  if (!same((speakers?.content?.speakers ?? []).map((item) => item.id), SPEAKER_IDS)) errors.push("unexpected speaker ids");
  if (!same((sponsors?.content?.groups ?? []).map((item) => item.id), SPONSOR_GROUP_IDS)) errors.push("unexpected sponsor group ids");
  const hero = section(config, "campaign-hero");
  if (!same((hero?.content?.ctas ?? []).map((item) => item.id), HERO_CTA_IDS)) errors.push("unexpected hero CTA ids");
  if (!same((cta?.content?.ctas ?? []).map((item) => item.id), FINAL_CTA_IDS)) errors.push("unexpected final CTA ids");

  const idsByKind = new Map();
  const categories = new Set((speakers?.content?.categories ?? []).map((item) => item.id));
  const sponsorGroups = new Set((sponsors?.content?.groups ?? []).map((item) => item.id));
  const semanticKind = (value) => {
    if ("badgeToken" in value) return "speaker-category";
    if ("categoryId" in value) return "speaker";
    if ("accentToken" in value) return "exhibition-item";
    if ("durationSeconds" in value) return "sponsor-group";
    if ("groupId" in value) return "sponsor";
    if ("action" in value) return "destination";
    if ("startsAt" in value) return "campaign";
    if ("fallback" in value) return "cta";
    if ("campaignIds" in value) return "audience-link";
    return "other";
  };
  const visit = (value, key = "") => {
    if (Array.isArray(value)) { value.forEach((item) => visit(item, key)); return; }
    if (!value || typeof value !== "object") return;
    for (const [childKey, child] of Object.entries(value)) {
      if (childKey === "id" && typeof child === "string") {
        if (!safeId(child)) errors.push(`invalid semantic id: ${child}`);
        else {
          const kind = semanticKind(value);
          const ids = idsByKind.get(kind) ?? new Set();
          if (ids.has(child)) errors.push(`duplicate semantic id: ${kind}.${child}`);
          ids.add(child);
          idsByKind.set(kind, ids);
        }
      }
      if (["url", "originalUrl", "href", "profileUrl", "homepageUrl"].includes(childKey) && typeof child === "string") {
        if (child === "#") errors.push(`placeholder href at ${key}.${childKey}`);
        if (/^(?:file:|\/Users\/|[A-Za-z]:[\\/])/.test(child)) errors.push(`absolute local path at ${key}.${childKey}`);
        if (child && !safeHttps(child)) errors.push(`relative or unsafe media/destination at ${key}.${childKey}`);
      }
      visit(child, key ? `${key}.${childKey}` : childKey);
    }
  };
  visit(config);

  for (const speaker of speakers?.content?.speakers ?? []) {
    if (!categories.has(speaker.categoryId)) errors.push(`broken category reference: ${speaker.id}`);
  }
  for (const sponsor of sponsors?.content?.sponsors ?? []) {
    if (!sponsorGroups.has(sponsor.groupId)) errors.push(`broken sponsor group reference: ${sponsor.id}`);
  }
  const refs = referenceInventory(config);
  if (!same(refs.destinations, DESTINATION_IDS)) errors.push("unexpected destination references");
  if (!same(refs.campaigns, CAMPAIGN_IDS)) errors.push("unexpected campaign references");
  if (config.settings !== undefined) {
    const settings = record(config.settings);
    const destinationIds = Array.isArray(settings.destinations) ? settings.destinations.map((item) => item?.id) : [];
    const campaignIds = Array.isArray(settings.campaigns) ? settings.campaigns.map((item) => item?.id) : [];
    if (!same(destinationIds, DESTINATION_IDS)) errors.push("unexpected settings destination ids");
    if (!same(campaignIds, CAMPAIGN_IDS)) errors.push("unexpected settings campaign ids");
    const destinationSet = new Set(destinationIds);
    const campaignSet = new Set(campaignIds);
    for (const id of refs.destinations) if (!destinationSet.has(id)) errors.push(`broken destination reference: ${id}`);
    for (const id of refs.campaigns) if (!campaignSet.has(id)) errors.push(`broken campaign reference: ${id}`);
  }
  return sorted(errors);
}

export function auditStkHomeV1Source(document) {
  return auditSource(document);
}

function parseArgs(argv) {
  const options = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") { options.dryRun = true; continue; }
    const match = /^--(asset-map|destination-map|schedule-map|output)=(.+)$/.exec(arg);
    if (!match) throw new Error(`unsupported argument: ${arg}`);
    const key = { "asset-map": "assetMap", "destination-map": "destinationMap", "schedule-map": "scheduleMap", output: "output" }[match[1]];
    if (options[key]) throw new Error(`duplicate argument: --${match[1]}`);
    if (!path.isAbsolute(match[2])) throw new Error(`unsafe relative path: --${match[1]}`);
    options[key] = match[2];
  }
  if (options.output && options.dryRun) throw new Error("--dry-run and --output are mutually exclusive");
  if (!options.output) options.dryRun = true;
  return options;
}

function readMap(filename, label) {
  if (!filename) return {};
  let parsed;
  try { parsed = JSON.parse(readFileSync(filename, "utf8")); }
  catch { throw new Error(`cannot read ${label}`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
}

function imageValue(value, requirement) {
  const candidate = typeof value === "string" ? { url: value, originalUrl: value } : record(value);
  if (!safeHttps(candidate.url) || (candidate.originalUrl !== undefined && !safeHttps(candidate.originalUrl))) {
    throw new Error(`unsafe asset value: ${requirement.key}`);
  }
  const extension = new URL(candidate.url).pathname.split(".").pop()?.toLowerCase();
  const mimeType = candidate.mimeType ?? ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[extension]);
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error(`unsafe asset mime type: ${requirement.key}`);
  return {
    kind: "image", url: candidate.url, originalUrl: candidate.originalUrl ?? candidate.url,
    mimeType, alt: typeof candidate.alt === "string" && candidate.alt.trim() ? candidate.alt.trim() : requirement.label,
    decorative: false,
  };
}

function videoValue(value, requirement) {
  const candidate = record(value);
  if (!safeHttps(candidate.url) || !safeHttps(candidate.originalUrl)
    || candidate.mimeType !== "video/mp4" || candidate.rightsStatus !== "confirmed") {
    throw new Error(`unsafe or unconfirmed asset value: ${requirement.key}`);
  }
  const poster = candidate.poster === undefined ? undefined : imageValue(candidate.poster, { key: `${requirement.key}.poster`, kind: "image", label: requirement.label });
  return { kind: "video", url: candidate.url, originalUrl: candidate.originalUrl, mimeType: "video/mp4", rightsStatus: "confirmed", ...(poster ? { poster } : {}) };
}

function destinationAction(value, id) {
  if (typeof value === "string") {
    if (!safeHttps(value)) throw new Error(`unsafe destination value: ${id}`);
    return id === "brochure-download" ? { type: "download", href: value } : { type: "url", href: value };
  }
  const action = record(value);
  if ((action.type === "url" || action.type === "download") && safeHttps(action.href)) return clone(action);
  if (action.type === "anchor" && typeof action.target === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(action.target)) return clone(action);
  if (action.type === "imweb-modal" && typeof action.modalId === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(action.modalId)
    && (action.fallbackHref === undefined || safeHttps(action.fallbackHref))) return clone(action);
  throw new Error(`unsafe destination value: ${id}`);
}

function scheduleValue(value, key) {
  const candidate = record(value);
  if (!safeIso(candidate.startsAt) || !safeIso(candidate.endsAt) || Date.parse(candidate.endsAt) <= Date.parse(candidate.startsAt)) {
    throw new Error(`unsafe schedule value: ${key}`);
  }
  if (key === "event") {
    if (candidate.edition !== 2027) throw new Error("unsafe schedule value: event.edition");
    let facts;
    if (candidate.facts !== undefined) {
      if (!candidate.facts || typeof candidate.facts !== "object" || Array.isArray(candidate.facts)) {
        throw new Error("unsafe event facts");
      }
      const source = candidate.facts;
      const allowed = ["companies", "sessions", "booths"];
      if (Object.keys(source).some((fact) => !allowed.includes(fact))) throw new Error("unsafe unknown event fact");
      facts = Object.fromEntries(allowed
        .filter((fact) => source[fact] !== undefined)
        .map((fact) => {
          if (!Number.isInteger(source[fact]) || source[fact] < 0) throw new Error(`unsafe event fact: ${fact}`);
          return [fact, source[fact]];
        }));
    }
    return {
      edition: candidate.edition,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      ...(facts && Object.keys(facts).length ? { facts } : {}),
    };
  }
  return { startsAt: candidate.startsAt, endsAt: candidate.endsAt };
}

export function materializeStkHomeV1(document, maps) {
  const output = clone(document);
  const config = output.config;
  const assets = assetRequirements(config);
  for (const requirement of assets) {
    const value = maps.assets[requirement.key];
    if (requirement.key === "hero.video") section(config, "campaign-hero").content.video = videoValue(value, requirement);
    else if (requirement.key.startsWith("exhibition.")) {
      const id = requirement.key.split(".")[1];
      section(config, "exhibition-grid").content.items.find((item) => item.id === id).symbol = imageValue(value, requirement);
    } else if (requirement.key.startsWith("audience.")) {
      const id = requirement.key.split(".")[1];
      const items = section(config, "audience-links").content.groups.flatMap((group) => group.items);
      items.find((item) => item.id === id).icon = imageValue(value, requirement);
    } else {
      const id = requirement.key.split(".")[1];
      section(config, "speaker-carousel").content.speakers.find((speaker) => speaker.id === id).image = imageValue(value, requirement);
    }
  }

  const destinations = DESTINATION_IDS.map((id) => ({ id, label: id, action: destinationAction(maps.destinations[id], id), enabled: true }));
  const event = scheduleValue(maps.schedules.event, "event");
  const campaigns = [
    { id: "exhibitor-recruitment", label: "참가기업 모집", ...scheduleValue(maps.schedules["campaign.exhibitor-recruitment"], "campaign.exhibitor-recruitment"), override: "auto", enabled: true },
    { id: "visitor-registration", label: "참관객 사전등록", ...scheduleValue(maps.schedules["campaign.visitor-registration"], "campaign.visitor-registration"), override: "auto", enabled: true },
  ];
  config.settings = { event, campaigns, destinations };
  return output;
}

export function importStkHomeV1(argv) {
  const options = parseArgs(argv);
  const document = JSON.parse(readFileSync(PRESET_PATH, "utf8"));
  const auditErrors = auditSource(document);
  if (auditErrors.length) return { status: 1, stderr: { errors: auditErrors } };

  const assets = readMap(options.assetMap, "asset map");
  const destinations = readMap(options.destinationMap, "destination map");
  const schedules = readMap(options.scheduleMap, "schedule map");
  const requiredAssets = assetRequirements(document.config).map(({ key }) => key);
  const requiredDestinations = DESTINATION_IDS;
  for (const key of Object.keys(assets)) if (!requiredAssets.includes(key)) throw new Error(`unexpected asset map key: ${key}`);
  for (const key of Object.keys(destinations)) if (!requiredDestinations.includes(key)) throw new Error(`unexpected destination map key: ${key}`);
  for (const key of Object.keys(schedules)) if (!SCHEDULE_KEYS.includes(key)) throw new Error(`unexpected schedule map key: ${key}`);
  const missing = {
    missingAssets: sorted(requiredAssets.filter((key) => assets[key] === undefined)),
    missingDestinations: sorted(requiredDestinations.filter((key) => destinations[key] === undefined)),
    missingSchedules: sorted(SCHEDULE_KEYS.filter((key) => schedules[key] === undefined)),
  };

  // 제공된 값은 일부 map이라도 즉시 검사한다. 누락은 exit 2, 위험은 exit 1이다.
  for (const requirement of assetRequirements(document.config)) {
    if (assets[requirement.key] !== undefined) {
      if (requirement.kind === "video") videoValue(assets[requirement.key], requirement);
      else imageValue(assets[requirement.key], requirement);
    }
  }
  for (const id of requiredDestinations) if (destinations[id] !== undefined) destinationAction(destinations[id], id);
  for (const key of SCHEDULE_KEYS) if (schedules[key] !== undefined) scheduleValue(schedules[key], key);
  if (Object.values(missing).some((values) => values.length > 0)) return { status: 2, stdout: missing };

  const materialized = materializeStkHomeV1(document, { assets, destinations, schedules });
  const finalAudit = auditSource(materialized);
  if (finalAudit.length) return { status: 1, stderr: { errors: finalAudit } };
  if (options.dryRun) return { status: 0, stdout: { ...missing, materialized: true, written: false } };
  writeFileSync(options.output, `${JSON.stringify(materialized, null, 2)}\n`, { encoding: "utf8" });
  return { status: 0, stdout: { output: options.output, written: true } };
}

function main() {
  try {
    const result = importStkHomeV1(process.argv.slice(2));
    if (result.stdout) process.stdout.write(`${JSON.stringify(result.stdout)}\n`);
    if (result.stderr) process.stderr.write(`${JSON.stringify(result.stderr)}\n`);
    process.exitCode = result.status;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ errors: [error instanceof Error ? error.message : String(error)] })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
