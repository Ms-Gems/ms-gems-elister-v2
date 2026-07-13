import { describe, expect, test } from "vitest";
import { applyBrandMpnFallback, isBrandMpnError } from "@/lib/ebay/publish";
import type { ListingResult } from "@/lib/types";

const ebayResp = (text: string) => ({ ok: false, status: 400, json: null, text });

describe("isBrandMpnError", () => {
  test("matches eBay's <BrandMPN> publish rejection", () => {
    expect(
      isBrandMpnError(
        ebayResp(
          '{"errors":[{"errorId":25002,"message":"A user error has occurred. Input data for tag <BrandMPN> is invalid or missing. Please check API documentation."}]}'
        )
      )
    ).toBe(true);
  });

  test("ignores unrelated 25002 errors", () => {
    expect(
      isBrandMpnError(ebayResp('{"errors":[{"errorId":25002,"message":"The ISBN field is missing."}]}'))
    ).toBe(false);
  });
});

describe("applyBrandMpnFallback", () => {
  const listing: ListingResult = { title: "t", description: "d", brand: "Carhartt" };

  test("drops the product-level pair and fills the aspect conventions", () => {
    const aspects: Record<string, string[]> = {};
    const item = { product: { brand: "Carhartt", mpn: "K87-BLK", aspects } };
    applyBrandMpnFallback(item, aspects, listing, "TEST-A");
    expect(item.product.brand).toBeUndefined();
    expect(item.product.mpn).toBeUndefined();
    expect(aspects.Brand).toEqual(["Carhartt"]);
    expect(aspects.MPN).toEqual(["Does Not Apply"]);
    expect(item.product.aspects).toBe(aspects);
  });

  test("never overwrites existing Brand/MPN aspects", () => {
    const aspects: Record<string, string[]> = { Brand: ["Levi's"], MPN: ["501-0193"] };
    const item = { product: { mpn: "501-0193", aspects } };
    applyBrandMpnFallback(item, aspects, listing, "TEST-B");
    expect(aspects.Brand).toEqual(["Levi's"]);
    expect(aspects.MPN).toEqual(["501-0193"]);
  });

  test("falls back to Unbranded when the listing has no usable brand", () => {
    const aspects: Record<string, string[]> = {};
    const item = { product: { aspects } };
    applyBrandMpnFallback(item, aspects, { title: "t", description: "d" }, "TEST-C");
    expect(aspects.Brand).toEqual(["Unbranded"]);
  });
});
