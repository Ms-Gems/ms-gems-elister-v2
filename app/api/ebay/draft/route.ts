import { NextRequest, NextResponse } from "next/server";
import { EBAY_COOKIE, accessTokenFromCookie } from "@/lib/ebay/session";
import { guardApiRequest } from "@/lib/api-guard";
import {
  sanitizeEbayImageUrls,
  uploadPhotos,
  buildAspects,
  conditionIdsForGrade,
  fetchAccountSetup,
  type PublishInput,
} from "@/lib/ebay/publish";
import {
  suggestLeafCategories,
  acceptedConditionIds,
} from "@/lib/ebay/taxonomy";

export const maxDuration = 300;

const FEED_BASE = "https://api.ebay.com/sell/feed/v1";

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function buildDraftCsv(args: {
  sku: string;
  categoryId: string;
  title: string;
  price: string;
  imageUrls: string[];
  description: string;
  conditionId: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  aspects: Record<string, string[]>;
}): string {
  const header =
    "Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)";

  // eBay bulk-upload item-specific columns use the C: prefix.
  // buildAspects() already gives us the important fields such as
  // Brand, Size, Color, Material, Type, Department, Features, etc.
  const aspectEntries = Object.entries(args.aspects)
    .filter(([name, values]) => {
      return (
        name &&
        !name.startsWith("---") &&
        Array.isArray(values) &&
        values.some((v) => String(v || "").trim())
      );
    })
    .slice(0, 45);

  const aspectHeaders = aspectEntries.map(([name]) => `C:${name}`);
  const aspectValues = aspectEntries.map(([, values]) =>
    values
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join("|")
  );

  const columnHeaders = [
    header,
    "Custom label (SKU)",
    "Category ID",
    "Title",
    "UPC",
    "Price",
    "Quantity",
    "Item photo URL",
    "Condition ID",
    "Description",
    "Format",
    ...aspectHeaders,
  ];

  const dataRow = [
    "Draft",
    args.sku,
    args.categoryId,
    args.title,
    "",
    args.price,
    "1",
    args.imageUrls.join("|"),
    args.conditionId,
    args.description,
    "FixedPrice",
    ...aspectValues,
  ];

  const blankInfoTail = new Array(
    Math.max(0, columnHeaders.length - 1)
  ).fill("");

  const rows = [
    [
      "#INFO",
      "Version=0.0.2",
      "Template= eBay-draft-listings-template_US",
      ...new Array(Math.max(0, columnHeaders.length - 3)).fill(""),
    ],
    [
      "#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html",
      ...blankInfoTail,
    ],
    [
      "#INFO After you've successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts",
      ...blankInfoTail,
    ],
    ["#INFO", ...blankInfoTail],
    columnHeaders,
    dataRow,
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
async function ebayError(resp: Response): Promise<string> {
  const text = await resp.text();

  try {
    const json = JSON.parse(text);
    const err = json?.errors?.[0];
    return String(
      err?.longMessage ||
        err?.message ||
        text ||
        `eBay returned HTTP ${resp.status}`
    );
  } catch {
    return text || `eBay returned HTTP ${resp.status}`;
  }
}

export async function POST(req: NextRequest) {
  const denied = guardApiRequest(req);
  if (denied) return denied;

  let body: PublishInput;

  try {
    body = (await req.json()) as PublishInput;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request." },
      { status: 400 }
    );
  }

  if (!body?.sku || !body?.listing) {
    return NextResponse.json(
      { success: false, error: "Missing SKU or listing." },
      { status: 400 }
    );
  }

  let accessToken: string | null;

  try {
    accessToken = await accessTokenFromCookie(
      req.cookies.get(EBAY_COOKIE)?.value
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    );
  }

  if (!accessToken) {
    return NextResponse.json(
      {
        success: false,
        error: "eBay isn't connected. Connect your account and try again.",
      },
      { status: 401 }
    );
  }

  const setup = await fetchAccountSetup(accessToken);
  
  try {
    const listing = body.listing;

    // Use already-uploaded eBay photos when available.
    let imageUrls = sanitizeEbayImageUrls(body.imageUrls);

    // Also support the older single-request photo flow.
    if (!imageUrls.length && Array.isArray(body.images) && body.images.length) {
      imageUrls = await uploadPhotos(
        accessToken,
        body.images,
        body.sku
      );
    }

    // Use the category already selected by the analyzer when it has one.
    // Otherwise ask eBay Taxonomy for the best matching leaf category.
    let categoryId = String(listing.category_id || "").trim();

    if (!categoryId) {
      const suggestions = await suggestLeafCategories(
        `${listing.category_hint || ""} ${listing.title || ""}`,
        1
      );
      categoryId = String(suggestions[0]?.id || "");
    }

    if (!categoryId) {
      return NextResponse.json(
        {
          success: false,
          sku: body.sku,
          error: "Couldn't determine an eBay category for this draft.",
        },
        { status: 422 }
      );
    }

    const priceNumber =
      typeof listing.suggested_price === "string"
        ? Number.parseFloat(listing.suggested_price)
        : Number(listing.suggested_price);

    const price =
      Number.isFinite(priceNumber) && priceNumber > 0
        ? priceNumber.toFixed(2)
        : "";

    const title = String(listing.title || "").trim().slice(0, 80);

    const description = String(
      listing.description ||
        listing.condition_notes ||
        ""
    ).trim();

   // Build the same core item specifics used by the live publisher.
const catKey = String(listing.category || "other");
const aspects = buildAspects(listing, catKey);

// Determine a category-valid numeric eBay Condition ID.
let conditionId = "";

try {
  const acceptedConds = await acceptedConditionIds(
    categoryId,
    accessToken
  );

  const conditionIds = conditionIdsForGrade(
    listing.condition || "GOOD",
    acceptedConds,
    catKey
  );

  if (conditionIds.length) {
    conditionId = String(conditionIds[0]);
  }
} catch (e) {
  console.warn(
    `[ebay/draft] couldn't determine condition for sku=${body.sku}:`,
    e
  );
}

const csv = buildDraftCsv({
  sku: body.sku,
  categoryId,
  title,
  price,
  imageUrls,
  description,
  conditionId,
  fulfillmentPolicyId: setup.fulfillmentPolicyId,
  paymentPolicyId: setup.paymentPolicyId,
  returnPolicyId: setup.returnPolicyId,
  aspects,
});

    // Step 1: create the Seller Hub FX_DRAFT upload task.
    const taskResp = await fetch(`${FEED_BASE}/task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Language": "en-US",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
      body: JSON.stringify({
        feedType: "FX_DRAFT",
        schemaVersion: "1.0",
      }),
    });

    if (!taskResp.ok) {
      const error = await ebayError(taskResp);
      console.error(
        `[ebay/draft] createTask failed sku=${body.sku} http=${taskResp.status} ${error}`
      );

      return NextResponse.json(
        { success: false, sku: body.sku, error },
        { status: 422 }
      );
    }

    const location = taskResp.headers.get("location") || "";
    const taskId = location.split("/").filter(Boolean).pop();

    if (!taskId) {
      return NextResponse.json(
        {
          success: false,
          sku: body.sku,
          error: "eBay created the feed task but did not return a task ID.",
        },
        { status: 500 }
      );
    }

    // Step 2: upload the Create-new-drafts CSV.
    const form = new FormData();
    const fileName = `ebay-draft-${body.sku}.csv`;

    form.append(
      "file",
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      fileName
    );

    const uploadResp = await fetch(
      `${FEED_BASE}/task/${encodeURIComponent(taskId)}/upload_file`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      }
    );

    if (!uploadResp.ok) {
      const error = await ebayError(uploadResp);

      console.error(
        `[ebay/draft] uploadFile failed sku=${body.sku} task=${taskId} http=${uploadResp.status} ${error}`
      );

      return NextResponse.json(
        {
          success: false,
          sku: body.sku,
          taskId,
          error,
        },
        { status: 422 }
      );
    }

      // Step 3: wait for eBay to actually process the uploaded draft.
    let taskStatus = "";
    let taskData: any = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const statusResp = await fetch(
        `${FEED_BASE}/task/${encodeURIComponent(taskId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        }
      );

      if (!statusResp.ok) {
        const error = await ebayError(statusResp);
        return NextResponse.json(
          {
            success: false,
            sku: body.sku,
            taskId,
            error: `Could not check eBay draft status: ${error}`,
          },
          { status: 422 }
        );
      }

      taskData = await statusResp.json();
      taskStatus = String(taskData?.status || "");

      if (
        taskStatus === "COMPLETED" ||
        taskStatus === "COMPLETED_WITH_ERROR"
      ) {
        break;
      }
    }

    const successCount = Number(taskData?.uploadSummary?.successCount || 0);
    const failureCount = Number(taskData?.uploadSummary?.failureCount || 0);

    if (taskStatus !== "COMPLETED") {
      return NextResponse.json(
        {
          success: false,
          sku: body.sku,
          taskId,
          taskStatus,
          successCount,
          failureCount,
          error:
            taskStatus === "COMPLETED_WITH_ERROR"
              ? "eBay processed the draft but reported an error."
              : `eBay draft processing did not complete. Status: ${
                  taskStatus || "unknown"
                }`,
        },
        { status: 422 }
      );
    }

    if (successCount < 1 || failureCount > 0) {
      return NextResponse.json(
        {
          success: false,
          sku: body.sku,
          taskId,
          taskStatus,
          successCount,
          failureCount,
          error: "eBay finished processing, but did not confirm a successful draft.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      sku: body.sku,
      taskId,
      taskStatus,
      successCount,
      failureCount,
      message: "Draft successfully processed by eBay.",
    });

  } catch (e) {
    console.error(`[ebay/draft] unhandled error sku=${body.sku}:`, e);

    return NextResponse.json(
      {
        success: false,
        sku: body.sku,
        error: (e as Error).message,
      },
      { status: 500 }
    );
  }
}
