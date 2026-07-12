// Deterministic eBay-title cleanup, applied right after analysis so the title
// the seller reviews IS the title that publishes (no silent rewriting later).
//
// Conservative on purpose: it never reorders or drops the model's words except
// exact duplicates, and only appends high-value identifiers (brand, size,
// color) the model left out when there's room under eBay's 80-character cap.

import type { ListingResult } from "@/lib/types";
import { APPAREL_CATEGORIES } from "@/lib/categories";

export const EBAY_TITLE_LIMIT = 80;

// Words whose duplication is meaningful ("2 x 4", "Size 8 Wide 8.5").
const DUP_EXEMPT_RE = /^\d|^(x|xs|s|m|l|xl|xxl)$/i;

function dedupeWords(title: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of title.split(/\s+/)) {
    const key = word.toLowerCase().replace(/[^\w'&.-]/g, "");
    if (key && !DUP_EXEMPT_RE.test(key)) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(word);
  }
  return out.join(" ");
}

function clipAtWord(title: string, limit: number): string {
  if (title.length <= limit) return title;
  const cut = title.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

function containsToken(title: string, token: string): boolean {
  return title.toLowerCase().includes(token.toLowerCase());
}

// Candidate identifiers buyers search by, in append-priority order.
function missingTokens(listing: ListingResult, title: string): string[] {
  const tokens: string[] = [];
  const brand = String(listing.brand || "").trim();
  if (brand && !/^(no\s?brand|unbranded|unknown)$/i.test(brand) && !containsToken(title, brand)) {
    tokens.push(brand);
  }
  const size = String(listing.size || "").trim();
  const isApparel = APPAREL_CATEGORIES.has(String(listing.category || ""));
  if (size && isApparel && !containsToken(title, size)) {
    // "Sz M" reads naturally in eBay titles and disambiguates from bare letters.
    tokens.push(size.length <= 4 ? `Sz ${size}` : size);
  }
  const color = Array.isArray(listing.color) ? listing.color[0] : listing.color;
  const colorStr = String(color || "").trim();
  if (colorStr && !containsToken(title, colorStr)) tokens.push(colorStr);
  return tokens;
}

export function optimizeTitle(listing: ListingResult): string {
  let title = dedupeWords(String(listing.title || "").replace(/\s+/g, " ").trim());
  for (const token of missingTokens(listing, title)) {
    if (title.length + 1 + token.length > EBAY_TITLE_LIMIT) continue;
    title = `${title} ${token}`;
  }
  return clipAtWord(title, EBAY_TITLE_LIMIT);
}
