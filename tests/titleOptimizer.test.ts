import { describe, expect, test } from "vitest";
import { optimizeTitle, EBAY_TITLE_LIMIT } from "@/lib/titleOptimizer";
import type { ListingResult } from "@/lib/types";

const base: ListingResult = { title: "", description: "" };

describe("optimizeTitle", () => {
  test("removes exact duplicate words", () => {
    expect(optimizeTitle({ ...base, title: "Nike Nike Dri-Fit Running Running Top" })).toBe(
      "Nike Dri-Fit Running Top"
    );
  });

  test("appends a missing brand when there's room", () => {
    const t = optimizeTitle({ ...base, title: "Blue Wool Sweater", brand: "Pendleton" });
    expect(t).toContain("Pendleton");
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
