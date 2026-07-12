import { describe, expect, test } from "vitest";
import { validListingPrice } from "@/lib/ebay/publish";
import { prioritizeAspects } from "@/lib/ebay/aspectFill";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

describe("validListingPrice", () => {
  test("passes real prices through unchanged — no 18% markup", () => {
    expect(validListingPrice(20)).toBe(20);
    expect(validListingPrice("49.99")).toBe(49.99);
    expect(validListingPrice(100)).toBe(100);
  });

  test("rounds to cents", () => {
    expect(validListingPrice(19.999)).toBe(20);
  });

  test("missing/invalid prices block publish instead of becoming $35.39", () => {
    expect(validListingPrice(undefined)).toBeNull();
    expect(validListingPrice(0)).toBeNull();
    expect(validListingPrice(-5)).toBeNull();
    expect(validListingPrice("")).toBeNull();
    expect(validListingPrice("abc")).toBeNull();
  });
});

describe("prioritizeAspects", () => {
  const meta = (name: string, usage: AspectMeta["usage"]): AspectMeta => ({
    name,
    required: usage === "REQUIRED",
    usage,
    mode: "FREE_TEXT",
    cardinality: "SINGLE",
    values: [],
  });

  test("required aspects come first, then recommended, then optional", () => {
    const sorted = prioritizeAspects([
      meta("Opt1", "OPTIONAL"),
      meta("Rec1", "RECOMMENDED"),
      meta("Req1", "REQUIRED"),
      meta("Opt2", "OPTIONAL"),
      meta("Rec2", "RECOMMENDED"),
    ]);
    expect(sorted.map((a) => a.usage)).toEqual([
      "REQUIRED",
      "RECOMMENDED",
      "RECOMMENDED",
      "OPTIONAL",
      "OPTIONAL",
    ]);
    // Stable within a tier.
    expect(sorted.map((a) => a.name)).toEqual(["Req1", "Rec1", "Rec2", "Opt1", "Opt2"]);
  });
});
