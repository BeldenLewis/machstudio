/**
 * 국가 다이얼코드 — 공개 등록 폼의 국가 선택(설계 §6.3 `[🇺🇸 United States +1 ▾]`).
 *
 * **생성 파일이다. 손으로 고치지 마라** — `node scripts/build-country-table.mjs`.
 *
 * 왜 libphonenumber 를 안 부르나: 이 모듈은 임베드 번들에 들어가고, 거기서 그 라이브러리를
 * 부르면 국가 메타데이터가 통째로 따라와 번들이 수백 KB 커진다. 화면에 필요한 것은
 * **이름과 번호뿐**이라 그 둘만 뽑아 둔다. 실제 번호 파싱·유효성은 서버가 한다.
 *
 * 국기는 데이터가 아니라 ISO 두 글자에서 계산한다(지역 표시 기호) — 표에 넣을 이유가 없다.
 */

/** `{ISO2}{dial}:{영문 국가명}` 을 `|` 로 이은 것. 영문 이름 오름차순. */
const PACKED =
  "AF93:Afghanistan|AX358:Åland Islands|AL355:Albania|DZ213:Algeria|AS1:American Samoa|AD376:Andorra|AO244:Angola|AI1:Anguilla|AG1:Antigua & Barbuda|AR54:Argentina|AM374:Armenia|AW297:Aruba|AC247:Ascension Island|AU61:Australia|AT43:Austria|AZ994:Azerbaijan|BS1:Bahamas|BH973:Bahrain|BD880:Bangladesh|BB1:Barbados|BY375:Belarus|BE32:Belgium|BZ501:Belize|BJ229:Benin|BM1:Bermuda|BT975:Bhutan|BO591:Bolivia|BA387:Bosnia & Herzegovina|BW267:Botswana|BR55:Brazil|IO246:British Indian Ocean Territory|VG1:British Virgin Islands|BN673:Brunei|BG359:Bulgaria|BF226:Burkina Faso|BI257:Burundi|KH855:Cambodia|CM237:Cameroon|CA1:Canada|CV238:Cape Verde|BQ599:Caribbean Netherlands|KY1:Cayman Islands|CF236:Central African Republic|TD235:Chad|CL56:Chile|CN86:China|CX61:Christmas Island|CC61:Cocos (Keeling) Islands|CO57:Colombia|KM269:Comoros|CG242:Congo - Brazzaville|CD243:Congo - Kinshasa|CK682:Cook Islands|CR506:Costa Rica|CI225:Côte d’Ivoire|HR385:Croatia|CU53:Cuba|CW599:Curaçao|CY357:Cyprus|CZ420:Czechia|DK45:Denmark|DJ253:Djibouti|DM1:Dominica|DO1:Dominican Republic|EC593:Ecuador|EG20:Egypt|SV503:El Salvador|GQ240:Equatorial Guinea|ER291:Eritrea|EE372:Estonia|SZ268:Eswatini|ET251:Ethiopia|FK500:Falkland Islands|FO298:Faroe Islands|FJ679:Fiji|FI358:Finland|FR33:France|GF594:French Guiana|PF689:French Polynesia|GA241:Gabon|GM220:Gambia|GE995:Georgia|DE49:Germany|GH233:Ghana|GI350:Gibraltar|GR30:Greece|GL299:Greenland|GD1:Grenada|GP590:Guadeloupe|GU1:Guam|GT502:Guatemala|GG44:Guernsey|GN224:Guinea|GW245:Guinea-Bissau|GY592:Guyana|HT509:Haiti|HN504:Honduras|HK852:Hong Kong SAR China|HU36:Hungary|IS354:Iceland|IN91:India|ID62:Indonesia|IR98:Iran|IQ964:Iraq|IE353:Ireland|IM44:Isle of Man|IL972:Israel|IT39:Italy|JM1:Jamaica|JP81:Japan|JE44:Jersey|JO962:Jordan|KZ7:Kazakhstan|KE254:Kenya|KI686:Kiribati|XK383:Kosovo|KW965:Kuwait|KG996:Kyrgyzstan|LA856:Laos|LV371:Latvia|LB961:Lebanon|LS266:Lesotho|LR231:Liberia|LY218:Libya|LI423:Liechtenstein|LT370:Lithuania|LU352:Luxembourg|MO853:Macao SAR China|MG261:Madagascar|MW265:Malawi|MY60:Malaysia|MV960:Maldives|ML223:Mali|MT356:Malta|MH692:Marshall Islands|MQ596:Martinique|MR222:Mauritania|MU230:Mauritius|YT262:Mayotte|MX52:Mexico|FM691:Micronesia|MD373:Moldova|MC377:Monaco|MN976:Mongolia|ME382:Montenegro|MS1:Montserrat|MA212:Morocco|MZ258:Mozambique|MM95:Myanmar (Burma)|NA264:Namibia|NR674:Nauru|NP977:Nepal|NL31:Netherlands|NC687:New Caledonia|NZ64:New Zealand|NI505:Nicaragua|NE227:Niger|NG234:Nigeria|NU683:Niue|NF672:Norfolk Island|KP850:North Korea|MK389:North Macedonia|MP1:Northern Mariana Islands|NO47:Norway|OM968:Oman|PK92:Pakistan|PW680:Palau|PS970:Palestinian Territories|PA507:Panama|PG675:Papua New Guinea|PY595:Paraguay|PE51:Peru|PH63:Philippines|PL48:Poland|PT351:Portugal|PR1:Puerto Rico|QA974:Qatar|RE262:Réunion|RO40:Romania|RU7:Russia|RW250:Rwanda|WS685:Samoa|SM378:San Marino|ST239:São Tomé & Príncipe|SA966:Saudi Arabia|SN221:Senegal|RS381:Serbia|SC248:Seychelles|SL232:Sierra Leone|SG65:Singapore|SX1:Sint Maarten|SK421:Slovakia|SI386:Slovenia|SB677:Solomon Islands|SO252:Somalia|ZA27:South Africa|KR82:South Korea|SS211:South Sudan|ES34:Spain|LK94:Sri Lanka|BL590:St. Barthélemy|SH290:St. Helena|KN1:St. Kitts & Nevis|LC1:St. Lucia|MF590:St. Martin|PM508:St. Pierre & Miquelon|VC1:St. Vincent & Grenadines|SD249:Sudan|SR597:Suriname|SJ47:Svalbard & Jan Mayen|SE46:Sweden|CH41:Switzerland|SY963:Syria|TW886:Taiwan|TJ992:Tajikistan|TZ255:Tanzania|TH66:Thailand|TL670:Timor-Leste|TG228:Togo|TK690:Tokelau|TO676:Tonga|TT1:Trinidad & Tobago|TA290:Tristan da Cunha|TN216:Tunisia|TR90:Türkiye|TM993:Turkmenistan|TC1:Turks & Caicos Islands|TV688:Tuvalu|VI1:U.S. Virgin Islands|UG256:Uganda|UA380:Ukraine|AE971:United Arab Emirates|GB44:United Kingdom|US1:United States|UY598:Uruguay|UZ998:Uzbekistan|VU678:Vanuatu|VA39:Vatican City|VE58:Venezuela|VN84:Vietnam|WF681:Wallis & Futuna|EH212:Western Sahara|YE967:Yemen|ZM260:Zambia|ZW263:Zimbabwe";

export interface CountryDial {
  /** ISO 3166-1 alpha-2 */
  code: string;
  /** 국가번호 — `+` 없이 숫자만 */
  dial: string;
  name: string;
}

/** 선택 목록. 이름 오름차순이라 그대로 `<option>` 으로 쓴다. */
export const COUNTRY_DIALS: readonly CountryDial[] = PACKED.split("|").map((row) => {
  const colon = row.indexOf(":");
  return { code: row.slice(0, 2), dial: row.slice(2, colon), name: row.slice(colon + 1) };
});

const BY_CODE = new Map(COUNTRY_DIALS.map((c) => [c.code, c]));

/** 아는 국가 코드인가 — 제출로 들어온 값을 그대로 믿지 않기 위한 판정. */
export function isKnownCountry(code: unknown): boolean {
  return typeof code === "string" && BY_CODE.has(code.toUpperCase());
}

export function dialFor(code: string): string | null {
  return BY_CODE.get(code.toUpperCase())?.dial ?? null;
}

/**
 * 국기 이모지 — ISO 두 글자를 지역 표시 기호로 옮긴다.
 * 이모지를 못 그리는 환경에서는 두 글자가 그대로 보이므로 정보가 사라지지 않는다.
 */
export function flagEmoji(code: string): string {
  const c = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
