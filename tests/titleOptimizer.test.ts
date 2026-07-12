import { describe, expect, test } from "vitest";
import { optimizeTitle, EBAY_TITLE_LIMIT } from "@/lib/titleOptimizer";
import type { ListingResult } from "@/lib/types";

const base: ListingResult = { title: "", description: "" };

describe("optimizeTitle", () => {
  test("NEVER removes words — repeated names are legitimate", () => {
    expect(optimizeTitle({ ...base, title: "BOSS Hugo Boss Wool Blazer" })).toBe(
      "BOSS Hugo Boss Wool Blazer"
    );
    expect(optimizeTitle({ ...base, title: "Duran Duran Rio Vinyl LP" })).toBe(
      "Duran Duran Rio Vinyl LP"
    );
    expect(optimizeTitle({ ...base, title: "Mickey & Minnie Salt & Pepper Shakers" })).toBe(
      "Mickey & Minnie Salt & Pepper Shakers"
    );
  });

  test("appends a missing brand when there's room", () => {
    const t = optimizeTitle({ ...base, title: "Blue Wool Sweater", brand: "Pendleton" });
    expect(t).toContain("Pendleton");
  });

  test("one-letter size appends despite the letter appearing inside words", () => {
    const t = optimizeTitle({
      ...base,
      title: "Blue Wool Sweater", // contains "l" inside words
      category: "womens_sweater",
      size: "L",
    });
    expect(t).toBe("Blue Wool Sweater Sz L");
  });

  test("short color hiding inside a longer word still appends", () => {
    const t = optimizeTitle({ ...base, title: "Titanium Ring", color: ["Tan"] });
    expect(t).toBe("Titanium Ring Tan");
  });

  test("empty model title never yields a leading space", () => {
    expect(optimizeTitle({ ...base, title: "", brand: "Nike" })).toBe("Nike");
  });

  test("appends size for apparel with the Sz prefix", () => {
    const t = optimizeTitle({
      ...base,
      title: "Levi's 501 Jeans",
      category: "mens_jeans",
      size: "32x34",
    });
    expect(t).toContain("32x34");
  });

  test("never exceeds eBay's 80-character cap", () => {
    const t = optimizeTitle({
      ...base,
      title: "Very Detailed Vintage Collectible Item Name That Goes On".repeat(3),
      brand: "SomeBrandName",
    });
    expect(t.length).toBeLessThanOrEqual(EBAY_TITLE_LIMIT);
  });

  test("skips No Brand / duplicate identifiers", () => {
    const t = optimizeTitle({
      ...base,
      title: "Coach Tan Leather Tote",
      brand: "No Brand",
      color: ["Tan"],
    });
    expect(t).toBe("Coach Tan Leather Tote");
  });
});
