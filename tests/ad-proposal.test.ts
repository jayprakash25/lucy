import assert from "node:assert/strict";
import test from "node:test";

import {
  AdProposalContentSchema,
  assertSpendWithinLimits,
  CampaignSettingsSchema,
  formatProposalPreview,
} from "@/domain/ad-proposal";

const campaign = CampaignSettingsSchema.parse({
  countryCode: "IN",
  currency: "INR",
  timeZone: "Asia/Kolkata",
  dailyBudgetMinor: 100_000,
  durationDays: 7,
  startAt: "2026-08-30T10:00:00.000Z",
  endAt: "2026-09-06T10:00:00.000Z",
  destination: "WHATSAPP",
  objective: "OUTCOME_ENGAGEMENT",
});

test("accepts a campaign inside both spend ceilings", () => {
  assert.doesNotThrow(() => assertSpendWithinLimits(campaign, 200_000, 1_000_000));
});

test("rejects daily and aggregate overspend independently", () => {
  assert.throws(() => assertSpendWithinLimits(campaign, 99_999, 1_000_000), /Daily budget/);
  assert.throws(() => assertSpendWithinLimits(campaign, 200_000, 699_999), /Total campaign budget/);
});

test("approval preview contains the exact outbound copy and fits WhatsApp", () => {
  const content = AdProposalContentSchema.parse({
    property: {
      projectName: "Lake View",
      locality: "Whitefield",
      city: "Bengaluru",
      price: "From INR 1.2 crore",
      configuration: "3 BHK",
      area: "1,650 sq ft",
      possession: "December 2027",
      registrationId: "PRM/KA/RERA/1251",
      amenities: ["Pool"],
    },
    copy: {
      primaryText: "Verified primary copy for the property.",
      headline: "Verified headline",
      description: "Verified description",
    },
    evidence: [
      { field: "projectName", quote: "Lake View" },
      { field: "locality", quote: "Whitefield" },
      { field: "city", quote: "Bengaluru" },
      { field: "price", quote: "INR 1.2 crore" },
      { field: "configuration", quote: "3 BHK" },
    ],
    campaign,
    mediaAssetIds: ["5a7497d2-65c4-4b2e-a29f-d9f7bc47aade"],
  });

  const preview = formatProposalPreview(content, 2);

  assert.match(preview, /Headline: Verified headline/);
  assert.match(preview, /Primary text: Verified primary copy for the property\./);
  assert.match(preview, /Description: Verified description/);
  assert.ok(preview.length <= 1_024);
});
