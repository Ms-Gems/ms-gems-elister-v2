// Deterministic eBay-title cleanup, applied right after analysis so the title
// the seller reviews IS the title that publishes (no silent rewriting later).
//
// Conservative on purpose: it NEVER removes or reorders the model's words —
// word-dedupe was tried and corrupted real names ("BOSS Hugo Boss",
// "Johnson & Johnson", "Duran Duran"). It only appends high-value identifiers
// (brand, size, color) the model left out when there's room under eBay's
// 80-character cap, then clips at a word boundary.

import type { ListingResult } from "@/lib/types";
import { APPAREL_CATEGORIES } from "@/lib/categories";

export const EBAY_TITLE_LIMIT = 80;

function clipAtWord(title: string, limit: number): string {
  if (title.length <= limit) return title;
  const cut = title.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word containment — a bare substring check made every one-letter size a
// false positive ("L" is inside almost any word) and missed short colors
// hiding inside longer words ("Tan" in "Titanium").
function containsToken(title: string, token: string): boolean {
  return new RegExp(`(^|[^\\w])${escapeRe(token)}([^\\w]|$)`, "i").test(title);
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
  let title = String(listing.title || "").replace(/\s+/g, " ").trim();
  for (const token of missingTokens(listing, title)) {
    const candidate = title ? `${title} ${token}` : token;
    if (candidate.length > EBAY_TITLE_LIMIT) continue;
    title = candidate;
  }
  return clipAtWord(title, EBAY_TITLE_LIMIT);
}
