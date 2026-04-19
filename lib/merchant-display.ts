/**
 * Collapses raw bank-statement / UPI merchant strings into something a person
 * would actually read. Keeps the raw `merchant` column intact in the DB for
 * parsing & matching — this is display-only.
 *
 * Order of operations:
 *   1. Known-brand lookup (Netflix, Apple, Hostinger, rent, ...) — matches
 *      against a lowercase substring search. Catches most subscription UPI
 *      narrations that would otherwise bleed account handles into the label.
 *   2. Structured-narration parsers for UPI- / NEFT / IMPS / ME DC SI / POS.
 *   3. Fall back to the raw string with obvious noise stripped.
 */

const BRAND_DISPLAY: Array<[RegExp | string, string]> = [
  // Subscriptions
  ["netflix", "Netflix"],
  ["apple media services", "Apple Services"],
  ["apple com bill", "Apple"],
  ["apple services", "Apple Services"],
  ["appleservices", "Apple Services"],
  ["google playstore", "Google Play"],
  ["google play", "Google Play"],
  ["hostinger", "Hostinger"],
  ["bigrock", "BigRock"],
  ["directi", "Directi"],
  ["sonyliv", "SonyLIV"],
  ["hotstar", "Hotstar"],
  ["youtube premium", "YouTube Premium"],
  ["prime video", "Prime Video"],
  ["jiocinema", "JioCinema"],
  ["claude ai", "Claude.ai"],
  ["claude.ai", "Claude.ai"],
  ["anthropic", "Anthropic"],
  ["openai", "OpenAI"],
  ["chatgpt", "ChatGPT"],
  ["spotify", "Spotify"],
  ["emudhracom", "eMudhra"],
  ["emudhra", "eMudhra"],
  ["gamma app", "Gamma"],
  ["supabase", "Supabase"],
  ["wordpress", "WordPress"],
  ["wpem", "WordPress (WPEM)"],
  ["odoo", "Odoo"],
  ["paypal", "PayPal"],
  ["payu", "PayU"],
  ["fiverr", "Fiverr"],
  ["figma", "Figma"],
  ["github", "GitHub"],
  ["vercel", "Vercel"],
  ["notion", "Notion"],
  ["linear app", "Linear"],
  ["posthog", "PostHog"],
  ["stripe", "Stripe"],
  ["cursor", "Cursor"],
  ["replit", "Replit"],
  ["godaddy", "GoDaddy"],
  ["go daddy", "GoDaddy"],
  ["canva pro", "Canva Pro"],
  ["canvapro", "Canva Pro"],
  ["udemy", "Udemy"],
  ["coursera", "Coursera"],
  ["byjus", "BYJU'S"],
  ["unacademy", "Unacademy"],
  ["usm certifications", "USM Certifications"],
  ["gumroad", "Gumroad"],
  ["skool com", "Skool"],
  ["p skool", "Skool"],
  ["delhivery", "Delhivery"],
  ["payoneer", "Payoneer"],
  ["thrivecart", "ThriveCart"],
  ["runway pro", "Runway Pro"],
  ["ownthestage", "OwnTheStage"],
  ["elegantthemes", "Elegant Themes"],
  // Bills / utilities
  ["airtel", "Airtel"],
  ["jio ", "Jio"],
  ["vodafone", "Vodafone"],
  ["bsnl", "BSNL"],
  ["act fibernet", "ACT Fibernet"],
  ["tata power", "Tata Power"],
  ["adani electricity", "Adani Electricity"],
  ["bescom", "BESCOM"],
  ["department of power", "Department of Power"],
  // Transport / travel
  ["uber", "Uber"],
  ["ola", "Ola"],
  ["rapido", "Rapido"],
  ["irctc", "IRCTC"],
  ["indigo", "IndiGo"],
  ["air india", "Air India"],
  ["makemytrip", "MakeMyTrip"],
  ["goibibo", "Goibibo"],
  ["oyo", "OYO"],
  ["airbnb", "Airbnb"],
  // Food / groceries
  ["swiggy", "Swiggy"],
  ["zomato", "Zomato"],
  ["blinkit", "Blinkit"],
  ["zepto", "Zepto"],
  ["bigbasket", "BigBasket"],
  ["dmart", "DMart"],
  // Shopping
  ["amazon", "Amazon"],
  ["flipkart", "Flipkart"],
  ["myntra", "Myntra"],
  ["ajio", "Ajio"],
  ["nykaa", "Nykaa"],
  ["meesho", "Meesho"],
  // Personal (user-specific)
  ["suprabha langthasa", "Suprabha Langthasa"],
  // Staff payments
  ["codemarks", "CodeMarks"],
  ["lham tashi", "Lham Tashi"],
];

const NOISE_SUFFIX_TOKENS = new Set([
  "oksbi", "okhdfcbank", "okicici", "okaxis", "paytm", "ybl", "ibl",
  "yespay", "yesb", "sbin", "hdfc", "icic", "kotak", "axis",
  "utib", "mandate", "mandateexecute", "upiintent",
  "payment", "from", "phone", "send", "money",
  "pte", "ltd",
]);

function isNoiseToken(t: string): boolean {
  const lower = t.toLowerCase();
  if (/^\d+$/.test(t)) return true; // pure digits
  if (/^[a-z]*\d+/.test(lower)) return true; // alphanumeric starting alpha w/ digits (card masks, IFSC)
  return NOISE_SUFFIX_TOKENS.has(lower);
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (w.length <= 3 && w === w.toUpperCase()) return w; // keep short all-caps (EMI, NEFT)
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

export function displayMerchant(raw: string): string {
  if (!raw) return raw;
  // Normalize separators before brand matching so "UPI-GOOGLE-PLAYSTORE@..."
  // matches the "google playstore" keyword (otherwise only "google" matches via
  // the fallback UPI parser, losing the "Play" part).
  const lower = raw.toLowerCase().replace(/[-_]+/g, " ");

  // 1. Known-brand lookup
  for (const [needle, label] of BRAND_DISPLAY) {
    const hit = typeof needle === "string" ? lower.includes(needle) : needle.test(raw);
    if (hit) return label;
  }

  // 2. Structured narration parsers
  // UPI-NAME-HANDLE@BANK-IFSC-REF-DESC  OR  UPI NAME HANDLE@...
  const upiMatch = raw.match(/^UPI[-\s]+([^-@\n]+)/i);
  if (upiMatch) {
    const name = titleCase(upiMatch[1].replace(/[_.]/g, " ").trim());
    if (name && name.length <= 40) return name;
  }

  // NEFT DR-<IFSC>-<NAME>-<REF...>  OR  NEFT-<something>-<NAME>
  const neftMatch = raw.match(/^NEFT[\s-]*(?:DR|CR)?[-\s]+[A-Z0-9]+[-\s]+([^-\n]+?)(?=-|$)/i);
  if (neftMatch) {
    return titleCase(neftMatch[1].trim());
  }

  // IMPS-<REF>-<NAME>-<BANK?>  OR  IMPS <REF> <NAME>
  const impsMatch = raw.match(/^IMPS[-\s]+\d+[-\s]+([^-\n]+?)(?=-|$)/i);
  if (impsMatch) {
    return titleCase(impsMatch[1].trim());
  }

  // ME DC SI  <MASK>  <MERCHANT...>  (standing-instruction card debit)
  // POS       <MASK>  <REF?> <DATE?> <MERCHANT...>
  if (/^(ME DC SI|POS|ATW|TPT)\b/i.test(raw)) {
    const tokens = raw
      .split(/\s+/)
      .slice(1) // drop the prefix word (ME, POS, etc.)
      .filter((t) => !/^\d/.test(t) && !/^\d.*\d$/.test(t) && t.length > 1 && !isNoiseToken(t))
      .slice(0, 5);
    if (tokens.length > 0) {
      // Drop trailing acronyms like "SI" if they slipped through
      while (tokens.length && tokens[0].length <= 2) tokens.shift();
      if (tokens.length > 0) return titleCase(tokens.join(" "));
    }
    return "Card payment";
  }

  // EMI narration
  if (/^EMI\b/i.test(raw)) {
    return "EMI";
  }

  // 3. Fallback: title-case the raw string, trimmed to 40 chars
  const trimmed = raw.length > 40 ? raw.slice(0, 37) + "…" : raw;
  return titleCase(trimmed);
}
