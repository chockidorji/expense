import { parse as parseDate, isValid } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

// Accept: 06-03-26, 13-FEB-2026, 15-04-2026, 15/04/2026, 13-Feb-2026, Apr 15, 2026, 15Apr24
export const DATE_FORMATS: string[] = [
  "dd-MM-yy",
  "dd-MMM-yyyy",
  "dd-MM-yyyy",
  "dd/MM/yyyy",
  "dd-LLL-yyyy",
  "MMM dd, yyyy",
  "ddMMMyy",
];

// Raw regex fragment that matches the broadly-supported date tokens.
// Examples: 06-03-26, 13-FEB-2026, 15-04-2026, 15/04/2026, Apr 15, 2026, 15Apr24
export const DATE_RE = String.raw`(\d{1,2}[-\/][A-Za-z0-9]{2,4}[-\/]\d{2,4}|[A-Za-z]{3}\s+\d{1,2},\s*\d{4}|\d{1,2}[A-Za-z]{3}\d{2,4})`;

export function parseFlexibleDate(raw: string): Date | null {
  const trimmed = raw.trim();
  for (const fmt of DATE_FORMATS) {
    const d = parseDate(trimmed, fmt, new Date(2000, 0, 1));
    if (isValid(d)) {
      d.setHours(0, 0, 0, 0);
      return fromZonedTime(d, "Asia/Kolkata");
    }
  }
  return null;
}

export function num(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

export function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/[.,]+$/, "").trim();
}

// Strip HTML to plain-ish text for regex extraction.
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns plainText if non-empty, otherwise HTML-to-text fallback.
export function preparseBody(plain: string, html: string): string {
  return plain && plain.trim().length > 0 ? plain : htmlToText(html);
}
