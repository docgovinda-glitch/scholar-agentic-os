/**
 * Shared country / dial-code list and E.164 helpers — the other half of the
 * Single Source of Truth for the phone field (see accountSchema.ts's header
 * comment for why a "one shared definition" file exists at all). Both
 * Create Account and Account Settings render their country selector from
 * COUNTRIES and normalise/validate through normalizeE164/e164Problem here,
 * so there is exactly one place that knows what a valid Scholar phone
 * number looks like.
 *
 * Deliberately not exhaustive: this covers the ~120 countries/territories
 * most likely to sign up, sourced from ITU-T E.164 assignments, rather than
 * guessing dial codes for the full ISO-3166 list from memory. Add entries
 * here — never in a component — if a missing country comes up.
 */

export interface Country {
  iso2: string;
  name: string;
  dialCode: string;
  flag: string;
}

export const COUNTRIES: readonly Country[] = [
  { iso2: "NP", name: "Nepal", dialCode: "+977", flag: "🇳🇵" },
  { iso2: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  { iso2: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { iso2: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { iso2: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  { iso2: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  { iso2: "NZ", name: "New Zealand", dialCode: "+64", flag: "🇳🇿" },
  { iso2: "IE", name: "Ireland", dialCode: "+353", flag: "🇮🇪" },
  { iso2: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  { iso2: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  { iso2: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" },
  { iso2: "PT", name: "Portugal", dialCode: "+351", flag: "🇵🇹" },
  { iso2: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹" },
  { iso2: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" },
  { iso2: "BE", name: "Belgium", dialCode: "+32", flag: "🇧🇪" },
  { iso2: "CH", name: "Switzerland", dialCode: "+41", flag: "🇨🇭" },
  { iso2: "AT", name: "Austria", dialCode: "+43", flag: "🇦🇹" },
  { iso2: "SE", name: "Sweden", dialCode: "+46", flag: "🇸🇪" },
  { iso2: "NO", name: "Norway", dialCode: "+47", flag: "🇳🇴" },
  { iso2: "DK", name: "Denmark", dialCode: "+45", flag: "🇩🇰" },
  { iso2: "FI", name: "Finland", dialCode: "+358", flag: "🇫🇮" },
  { iso2: "IS", name: "Iceland", dialCode: "+354", flag: "🇮🇸" },
  { iso2: "PL", name: "Poland", dialCode: "+48", flag: "🇵🇱" },
  { iso2: "CZ", name: "Czechia", dialCode: "+420", flag: "🇨🇿" },
  { iso2: "SK", name: "Slovakia", dialCode: "+421", flag: "🇸🇰" },
  { iso2: "HU", name: "Hungary", dialCode: "+36", flag: "🇭🇺" },
  { iso2: "RO", name: "Romania", dialCode: "+40", flag: "🇷🇴" },
  { iso2: "BG", name: "Bulgaria", dialCode: "+359", flag: "🇧🇬" },
  { iso2: "GR", name: "Greece", dialCode: "+30", flag: "🇬🇷" },
  { iso2: "HR", name: "Croatia", dialCode: "+385", flag: "🇭🇷" },
  { iso2: "SI", name: "Slovenia", dialCode: "+386", flag: "🇸🇮" },
  { iso2: "RS", name: "Serbia", dialCode: "+381", flag: "🇷🇸" },
  { iso2: "UA", name: "Ukraine", dialCode: "+380", flag: "🇺🇦" },
  { iso2: "RU", name: "Russia", dialCode: "+7", flag: "🇷🇺" },
  { iso2: "TR", name: "Turkey", dialCode: "+90", flag: "🇹🇷" },
  { iso2: "IL", name: "Israel", dialCode: "+972", flag: "🇮🇱" },
  { iso2: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" },
  { iso2: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦" },
  { iso2: "QA", name: "Qatar", dialCode: "+974", flag: "🇶🇦" },
  { iso2: "KW", name: "Kuwait", dialCode: "+965", flag: "🇰🇼" },
  { iso2: "BH", name: "Bahrain", dialCode: "+973", flag: "🇧🇭" },
  { iso2: "OM", name: "Oman", dialCode: "+968", flag: "🇴🇲" },
  { iso2: "JO", name: "Jordan", dialCode: "+962", flag: "🇯🇴" },
  { iso2: "LB", name: "Lebanon", dialCode: "+961", flag: "🇱🇧" },
  { iso2: "EG", name: "Egypt", dialCode: "+20", flag: "🇪🇬" },
  { iso2: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦" },
  { iso2: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬" },
  { iso2: "KE", name: "Kenya", dialCode: "+254", flag: "🇰🇪" },
  { iso2: "GH", name: "Ghana", dialCode: "+233", flag: "🇬🇭" },
  { iso2: "ET", name: "Ethiopia", dialCode: "+251", flag: "🇪🇹" },
  { iso2: "TZ", name: "Tanzania", dialCode: "+255", flag: "🇹🇿" },
  { iso2: "UG", name: "Uganda", dialCode: "+256", flag: "🇺🇬" },
  { iso2: "RW", name: "Rwanda", dialCode: "+250", flag: "🇷🇼" },
  { iso2: "MA", name: "Morocco", dialCode: "+212", flag: "🇲🇦" },
  { iso2: "DZ", name: "Algeria", dialCode: "+213", flag: "🇩🇿" },
  { iso2: "TN", name: "Tunisia", dialCode: "+216", flag: "🇹🇳" },
  { iso2: "PK", name: "Pakistan", dialCode: "+92", flag: "🇵🇰" },
  { iso2: "BD", name: "Bangladesh", dialCode: "+880", flag: "🇧🇩" },
  { iso2: "LK", name: "Sri Lanka", dialCode: "+94", flag: "🇱🇰" },
  { iso2: "BT", name: "Bhutan", dialCode: "+975", flag: "🇧🇹" },
  { iso2: "MV", name: "Maldives", dialCode: "+960", flag: "🇲🇻" },
  { iso2: "AF", name: "Afghanistan", dialCode: "+93", flag: "🇦🇫" },
  { iso2: "CN", name: "China", dialCode: "+86", flag: "🇨🇳" },
  { iso2: "HK", name: "Hong Kong", dialCode: "+852", flag: "🇭🇰" },
  { iso2: "MO", name: "Macao", dialCode: "+853", flag: "🇲🇴" },
  { iso2: "TW", name: "Taiwan", dialCode: "+886", flag: "🇹🇼" },
  { iso2: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵" },
  { iso2: "KR", name: "South Korea", dialCode: "+82", flag: "🇰🇷" },
  { iso2: "MN", name: "Mongolia", dialCode: "+976", flag: "🇲🇳" },
  { iso2: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
  { iso2: "MY", name: "Malaysia", dialCode: "+60", flag: "🇲🇾" },
  { iso2: "ID", name: "Indonesia", dialCode: "+62", flag: "🇮🇩" },
  { iso2: "PH", name: "Philippines", dialCode: "+63", flag: "🇵🇭" },
  { iso2: "TH", name: "Thailand", dialCode: "+66", flag: "🇹🇭" },
  { iso2: "VN", name: "Vietnam", dialCode: "+84", flag: "🇻🇳" },
  { iso2: "KH", name: "Cambodia", dialCode: "+855", flag: "🇰🇭" },
  { iso2: "LA", name: "Laos", dialCode: "+856", flag: "🇱🇦" },
  { iso2: "MM", name: "Myanmar", dialCode: "+95", flag: "🇲🇲" },
  { iso2: "BN", name: "Brunei", dialCode: "+673", flag: "🇧🇳" },
  { iso2: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
  { iso2: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷" },
  { iso2: "AR", name: "Argentina", dialCode: "+54", flag: "🇦🇷" },
  { iso2: "CL", name: "Chile", dialCode: "+56", flag: "🇨🇱" },
  { iso2: "CO", name: "Colombia", dialCode: "+57", flag: "🇨🇴" },
  { iso2: "PE", name: "Peru", dialCode: "+51", flag: "🇵🇪" },
  { iso2: "VE", name: "Venezuela", dialCode: "+58", flag: "🇻🇪" },
  { iso2: "EC", name: "Ecuador", dialCode: "+593", flag: "🇪🇨" },
  { iso2: "UY", name: "Uruguay", dialCode: "+598", flag: "🇺🇾" },
  { iso2: "PY", name: "Paraguay", dialCode: "+595", flag: "🇵🇾" },
  { iso2: "BO", name: "Bolivia", dialCode: "+591", flag: "🇧🇴" },
  { iso2: "CR", name: "Costa Rica", dialCode: "+506", flag: "🇨🇷" },
  { iso2: "PA", name: "Panama", dialCode: "+507", flag: "🇵🇦" },
  { iso2: "GT", name: "Guatemala", dialCode: "+502", flag: "🇬🇹" },
  { iso2: "DO", name: "Dominican Republic", dialCode: "+1", flag: "🇩🇴" },
  { iso2: "JM", name: "Jamaica", dialCode: "+1", flag: "🇯🇲" },
  { iso2: "TT", name: "Trinidad and Tobago", dialCode: "+1", flag: "🇹🇹" },
  { iso2: "CU", name: "Cuba", dialCode: "+53", flag: "🇨🇺" },
  { iso2: "PR", name: "Puerto Rico", dialCode: "+1", flag: "🇵🇷" },
  { iso2: "KZ", name: "Kazakhstan", dialCode: "+7", flag: "🇰🇿" },
  { iso2: "UZ", name: "Uzbekistan", dialCode: "+998", flag: "🇺🇿" },
  { iso2: "GE", name: "Georgia", dialCode: "+995", flag: "🇬🇪" },
  { iso2: "AM", name: "Armenia", dialCode: "+374", flag: "🇦🇲" },
  { iso2: "AZ", name: "Azerbaijan", dialCode: "+994", flag: "🇦🇿" },
  { iso2: "IR", name: "Iran", dialCode: "+98", flag: "🇮🇷" },
  { iso2: "IQ", name: "Iraq", dialCode: "+964", flag: "🇮🇶" },
  { iso2: "SY", name: "Syria", dialCode: "+963", flag: "🇸🇾" },
  { iso2: "YE", name: "Yemen", dialCode: "+967", flag: "🇾🇪" },
  { iso2: "PS", name: "Palestine", dialCode: "+970", flag: "🇵🇸" },
  { iso2: "CY", name: "Cyprus", dialCode: "+357", flag: "🇨🇾" },
  { iso2: "MT", name: "Malta", dialCode: "+356", flag: "🇲🇹" },
  { iso2: "LU", name: "Luxembourg", dialCode: "+352", flag: "🇱🇺" },
  { iso2: "LT", name: "Lithuania", dialCode: "+370", flag: "🇱🇹" },
  { iso2: "LV", name: "Latvia", dialCode: "+371", flag: "🇱🇻" },
  { iso2: "EE", name: "Estonia", dialCode: "+372", flag: "🇪🇪" },
  { iso2: "BY", name: "Belarus", dialCode: "+375", flag: "🇧🇾" },
  { iso2: "MD", name: "Moldova", dialCode: "+373", flag: "🇲🇩" },
  { iso2: "AL", name: "Albania", dialCode: "+355", flag: "🇦🇱" },
  { iso2: "MK", name: "North Macedonia", dialCode: "+389", flag: "🇲🇰" },
  { iso2: "BA", name: "Bosnia and Herzegovina", dialCode: "+387", flag: "🇧🇦" },
  { iso2: "ME", name: "Montenegro", dialCode: "+382", flag: "🇲🇪" },
  { iso2: "XK", name: "Kosovo", dialCode: "+383", flag: "🇽🇰" },
  { iso2: "FJ", name: "Fiji", dialCode: "+679", flag: "🇫🇯" },
  { iso2: "PG", name: "Papua New Guinea", dialCode: "+675", flag: "🇵🇬" },
] as const;

export const DEFAULT_COUNTRY_ISO2 = "NP";

export function findCountry(iso2: string): Country | undefined {
  return COUNTRIES.find((c) => c.iso2 === iso2);
}

/** Digits only, no leading zero — the local part of an E.164 number. */
function localDigits(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * Combines a dial code and a local number into E.164 (`+<country><number>`,
 * max 15 digits total per the ITU-T standard). Returns null when there are
 * no local digits at all, so callers can distinguish "nothing typed yet"
 * from "typed something invalid" (see e164Problem).
 */
export function normalizeE164(dialCode: string, phoneNumber: string): string | null {
  const digits = localDigits(phoneNumber);
  if (!digits) return null;
  return `${dialCode}${digits}`;
}

const E164_RE = /^\+[1-9]\d{4,14}$/;

export function isValidE164(e164: string): boolean {
  return E164_RE.test(e164);
}

export function e164Problem(dialCode: string, phoneNumber: string): string | null {
  const digits = localDigits(phoneNumber);
  if (!digits) return "Phone number is required.";
  const e164 = `${dialCode}${digits}`;
  if (!isValidE164(e164)) return "Enter a valid phone number for the selected country.";
  return null;
}
