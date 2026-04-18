import { forUser } from "./db";

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: ["swiggy", "zomato", "dominos", "mcdonalds", "starbucks", "restaurant", "cafe", "bakery", "kfc", "burger king", "pizza hut", "barbeque"],
  transport: ["uber", "ola", "rapido", "irctc", "petrol", "hpcl", "iocl", "indian oil", "bpcl", "metro", "parking", "toll"],
  shopping: ["amazon", "flipkart", "myntra", "ajio", "meesho", "decathlon", "nykaa", "croma", "reliance digital"],
  bills: ["airtel", "jio", "vodafone", "vi ", "bescom", "electricity", "water board", "broadband", "act fibernet", "tata power", "adani electricity"],
  rent: ["rent", "housing", "landlord", "nobroker"],
  groceries: ["bigbasket", "blinkit", "zepto", "dmart", "grofers", "reliance fresh", "more supermarket"],
  entertainment: ["netflix", "prime video", "hotstar", "spotify", "bookmyshow", "jiocinema", "sonyliv", "youtube premium"],
  health: ["apollo", "pharmeasy", "1mg", "practo", "hospital", "clinic", "diagnostic", "medplus", "netmeds"],
  education: ["udemy", "coursera", "byjus", "unacademy", "school", "college", "tuition"],
  travel: ["indigo", "air india", "vistara", "makemytrip", "goibibo", "cleartrip", "oyo", "airbnb", "booking.com"],
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
