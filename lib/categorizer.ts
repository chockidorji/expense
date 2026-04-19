import { forUser } from "./db";

/**
 * Order matters: the first category whose keyword matches wins. Put more
 * specific / less ambiguous patterns first. `merchantNormalized` is already
 * lowercase + special-chars-stripped + single-spaced.
 *
 * Categories include a few India-specific additions:
 *   transfer — self-transfers (UPI Lite top-ups, wallet loads)
 *   personal — person-to-person UPI transfers (not a merchant)
 *   subscriptions — recurring services (apple/google mandates, hosting, SaaS)
 *   fees — bank/card fees, SMS alert charges, interest levies
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // Match first — self-transfers and fees are misleading if they fall to a
  // broader category like "shopping" or "bills" via substring.
  transfer: ["upi lite", "add money", "wallet load", "self transfer"],
  fees: [
    "instaalert", "sms charg", "annual fee", "card annual", "dc intl pos",
    "pos txn dcc", "pos txn markup", "markup st",
    "interest paid", "interest charged", "over limit", "late fee",
  ],
  subscriptions: [
    "apple media services", "apple com bill", "google playstore", "google play",
    "hostinger", "bigrock", "directi", "endurance internatio",
    "netflix", "spotify", "prime video", "hotstar", "youtube premium",
    "jiocinema", "sonyliv", "claude ai", "anthropic", "openai",
    "odoo", "paypal", "fiverr", "figma", "github",
  ],
  entertainment: [
    "bookmyshow", "cinemas", "tnz cinemas", "pvr", "inox",
    "playstation", "steam", "nintendo",
  ],
  groceries: [
    "bigbasket", "blinkit", "zepto", "dmart", "grofers", "reliance fresh",
    "more supermarket", "vishal mega mart", "vishal megamart", "spencers",
    "natures basket",
  ],
  food: [
    "swiggy", "zomato", "dominos", "mcdonalds", "starbucks", "restaurant",
    "cafe", "bakery", "kfc", "burger king", "pizza hut", "barbeque",
    "kitchen", "cakery", "food", "dhaba", "biryani",
  ],
  transport: [
    "uber", "ola", "rapido", "irctc", "petrol", "hpcl", "iocl",
    "indian oil", "bpcl", "metro", "parking", "toll", "fastag",
    "service station", "filling station", "filling s", "aastro filling",
    "highways management", "nhai",
  ],
  shopping: [
    "amazon", "flipkart", "myntra", "ajio", "meesho", "decathlon",
    "nykaa", "croma", "reliance digital", "zara", "h and m", " h m ",
    "stationery", "paul stationer",
  ],
  bills: [
    "airtel", "jio ", "vodafone", "vi ", "bescom", "electricity",
    "water board", "broadband", "act fibernet", "tata power",
    "adani electricity", "bsnl", "department of power",
    "power distribution", "gas bill", "dth",
    "emi ", "loan emi", "chq s1", // HDFC EMI narration pattern
  ],
  rent: ["rent", "housing", "landlord", "nobroker"],
  health: [
    "apollo", "pharmeasy", "1mg", "practo", "hospital", "clinic",
    "diagnostic", "medplus", "netmeds", "salon", "spa", "saloon",
    "dry clean", "laundry",
  ],
  education: [
    "udemy", "coursera", "byjus", "unacademy", "school", "college",
    "tuition", "canvapro",
  ],
  travel: [
    "indigo", "air india", "vistara", "makemytrip", "goibibo", "cleartrip",
    "oyo", "airbnb", "booking com", "hotel", "resort", "homestay",
  ],
  // Person-to-person: looks for "UPI-MR/MS/MRS <name>". Put last so a merchant
  // containing "mr" in its narration still gets matched earlier if possible.
  personal: [
    "upi mr ", "upi ms ", "upi mrs ", "upi dr ",
    "payment from phone", // broad safety net — UPI-*-PAYMENT FROM PHONE pattern
  ],
};

export function categorizeByKeywords(merchantNormalized: string): string {
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => merchantNormalized.includes(kw))) return category;
  }
  return "uncategorized";
}

/**
 * First check user's override, fall back to keywords.
 * Called from insert paths (manual, CSV, Gmail).
 */
export async function categorize(userId: string, merchantNormalized: string): Promise<string> {
  const override = await forUser(userId).categoryOverride.findMany({ where: { merchantNormalized } });
  if (override.length > 0) return override[0].category;
  return categorizeByKeywords(merchantNormalized);
}

export const ALL_CATEGORIES = [...Object.keys(CATEGORY_KEYWORDS), "uncategorized"] as const;
