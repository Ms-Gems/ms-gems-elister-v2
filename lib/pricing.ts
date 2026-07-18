// Optional storewide price markup (PRICE_MARKUP_PERCENT env var).
//
// For sellers who run a permanent store-level sale: the sale discounts every
// listing, so auto-suggested prices need to be inflated up front to land where
// they should after the discount. The markup is applied wherever a price is
// SUGGESTED (analysis result, comps median) — never silently at publish time,
// so the price the seller reviews on the card is exactly the price that
// publishes (the same principle that removed the old hidden 18% markup).
//
// Unset/invalid → 0, so deployments without the env var behave exactly as
// before. Note the arithmetic: +40% then a 40%-off sale nets 84% of the
// original (1.4 × 0.6). To have the discounted price land back on the
// suggested price under an X%-off sale, set 100·X/(100−X) — e.g. ~66.7 for a
// 40%-off sale.

import type { ListingResult } from "@/lib/types";

// Parse the configured markup percent. Exposed with an injectable raw value so
// tests don't have to mutate process.env.
export function priceMarkupPercent(
  raw: string | undefined = process.env.PRICE_MARKUP_PERCENT
): number {
  if (raw === undefined || raw.trim() === "") return 0;
  const pct = Number(raw);
  if (!Number.isFinite(pct) || pct < 0) {
    console.warn(`[pricing] ignoring invalid PRICE_MARKUP_PERCENT=${JSON.stringify(raw)}`);
    return 0;
  }
  return pct;
}

// Apply a percent markup to a suggested price, rounded to cents. Missing,
// unparseable, and ≤0 prices pass through untouched — 0 is the model's
// explicit "couldn't identify it, seller prices manually" signal and must
// stay 0 so the UI keeps flagging it.
export function applyPriceMarkup(price: number, percent: number): number;
export function applyPriceMarkup(
  price: ListingResult["suggested_price"],
  percent: number
): ListingResult["suggested_price"];
export function applyPriceMarkup(
  price: ListingResult["suggested_price"],
  percent: number
): ListingResult["suggested_price"] {
  if (percent <= 0) return price;
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (n === undefined || !Number.isFinite(n) || n <= 0) return price;
  return Math.round(n * (1 + percent / 100) * 100) / 100;
}
