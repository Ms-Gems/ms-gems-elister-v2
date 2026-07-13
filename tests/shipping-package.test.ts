import { afterEach, describe, expect, test } from "vitest";
import {
  applyShippingPackageFallback,
  defaultPackageWeightAndSize,
  isShippingPackageError,
  SAFE_PACKAGE_TYPE,
} from "@/lib/ebay/publish";

const ebayResp = (over: Partial<{ status: number; json: unknown; text: string }>) => ({
  ok: false,
  status: 400,
  json: null,
  text: "",
  ...over,
});

// The item classes with distinct package profiles, plus unknown/default.
const CATEGORY_KEYS = [
  "womens_shoes",
  "mens_coat",
  "handbag",
  "electronics",
  "art",
  "glassware",
  "book",
  "vinyl_record",
  "plush",
  "womens_top", // default profile
  "nonexistent_key",
];

describe("defaultPackageWeightAndSize", () => {
  afterEach(() => {
    delete process.env.EBAY_DEFAULT_PACKAGE_WEIGHT_OZ;
  });

  test.each(CATEGORY_KEYS)(
    "%s only ever ships the one package type eBay US accepts",
    (catKey) => {
      // MAILING_BOX et al. exist in the Inventory API schema but eBay US
      // rejects them with 25101 "Invalid <ShippingPackage>".
      expect(defaultPackageWeightAndSize(catKey)).toMatchObject({
        packageType: SAFE_PACKAGE_TYPE,
      });
    }
  );

  test("profiles differ by weight/dimensions, not by type", () => {
    const shoes = defaultPackageWeightAndSize("womens_shoes") as any;
    const dflt = defaultPackageWeightAndSize("womens_top") as any;
    expect(shoes.weight.value).toBeGreaterThan(dflt.weight.value);
    expect(shoes.packageType).toBe(dflt.packageType);
  });

  test("env overrides still win over the profile", () => {
    process.env.EBAY_DEFAULT_PACKAGE_WEIGHT_OZ = "99";
    const pkg = defaultPackageWeightAndSize("womens_shoes") as any;
    expect(pkg.weight.value).toBe(99);
  });
});

describe("isShippingPackageError", () => {
  test("matches errorId 25101", () => {
    expect(
      isShippingPackageError(ebayResp({ json: { errors: [{ errorId: 25101 }] } }))
    ).toBe(true);
  });

  test("matches the message text", () => {
    expect(
      isShippingPackageError(
        ebayResp({ text: '{"errors":[{"message":"Invalid <ShippingPackage>."}]}' })
      )
    ).toBe(true);
  });

  test("ignores unrelated errors", () => {
    expect(
      isShippingPackageError(
        ebayResp({ json: { errors: [{ errorId: 25002 }] }, text: "aspect missing" })
      )
    ).toBe(false);
  });
});

describe("applyShippingPackageFallback", () => {
  test("snaps a rejected type to the safe one", () => {
    const item = {
      packageWeightAndSize: { packageType: "MAILING_BOX", weight: { value: 48 } },
    } as any;
    applyShippingPackageFallback(item, "TEST-A");
    expect(item.packageWeightAndSize.packageType).toBe(SAFE_PACKAGE_TYPE);
    expect(item.packageWeightAndSize.weight.value).toBe(48); // dims/weight kept
  });

  test("drops the package block when the type was already safe", () => {
    const item = {
      packageWeightAndSize: { packageType: SAFE_PACKAGE_TYPE },
    } as any;
    applyShippingPackageFallback(item, "TEST-B");
    expect(item.packageWeightAndSize).toBeUndefined();
  });
});
