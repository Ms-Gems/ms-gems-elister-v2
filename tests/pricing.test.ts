import { describe, expect, it } from "vitest";
import { applyPriceMarkup, priceMarkupPercent } from "@/lib/pricing";

describe("priceMarkupPercent", () => {
  it("parses a configured percent", () => {
    expect(priceMarkupPercent("40")).toBe(40);
    expect(priceMarkupPercent("12.5")).toBe(12.5);
    expect(priceMarkupPercent("0")).toBe(0);
  });

  it("returns 0 when unset or blank", () => {
    expect(priceMarkupPercent(undefined)).toBe(0);
    expect(priceMarkupPercent("")).toBe(0);
    expect(priceMarkupPercent("  ")).toBe(0);
  });

  it("returns 0 for invalid values instead of corrupting prices", () => {
    expect(priceMarkupPercent("forty")).toBe(0);
    expect(priceMarkupPercent("-10")).toBe(0);
    expect(priceMarkupPercent("Infinity")).toBe(0);
    expect(priceMarkupPercent("NaN")).toBe(0);
  });
});

describe("applyPriceMarkup", () => {
  it("inflates a numeric price, rounded to cents", () => {
    expect(applyPriceMarkup(10, 40)).toBe(14);
    expect(applyPriceMarkup(34.99, 40)).toBe(48.99);
    expect(applyPriceMarkup(49.99, 40)).toBe(69.99);
  });

  it("parses string prices from the model", () => {
    expect(applyPriceMarkup("49.99", 40)).toBe(69.99);
  });

  it("is a no-op at 0 percent", () => {
    expect(applyPriceMarkup(25, 0)).toBe(25);
    expect(applyPriceMarkup("25", 0)).toBe("25");
  });

  it("leaves the model's 'price manually' zero alone", () => {
    // 0 drives the UI's needs-a-price flag — it must survive markup untouched.
    expect(applyPriceMarkup(0, 40)).toBe(0);
  });

  it("passes through missing or unparseable prices", () => {
    expect(applyPriceMarkup(undefined, 40)).toBeUndefined();
    expect(applyPriceMarkup("", 40)).toBe("");
    expect(applyPriceMarkup("abc", 40)).toBe("abc");
    expect(applyPriceMarkup(-5, 40)).toBe(-5);
  });
});
