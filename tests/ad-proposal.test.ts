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
      { field: "projectName", quote: "Lake View", sourceType: "message", sourceId: "5a7497d2-65c4-4b2e-a29f-d9f7bc47aade" },
      { field: "locality", quote: "Whitefield", sourceType: "message", sourceId: "5a7497d2-65c4-4b2e-a29f-d9f7bc47aade" },
      { field: "city", quote: "Bengaluru", sourceType: "message", sourceId: "5a7497d2-65c4-4b2e-a29f-d9f7bc47aade" },
      { field: "price", quote: "INR 1.2 crore", sourceType: "message", sourceId: "5a7497d2-65c4-4b2e-a29f-d9f7bc47aade" },
      { field: "configuration", quote: "3 BHK", sourceType: "message", sourceId: "5a7497d2-65c4-4b2e-a29f-d9f7bc47aade" },
    ],
    campaign,
    mediaAssetIds: ["5a7497d2-65c4-4b2e-a29f-d9f7bc47aade"],
    creativeMediaAssetId: "5a7497d2-65c4-4b2e-a29f-d9f7bc47aade",
  });

  const preview = formatProposalPreview(content, 2);

  assert.match(preview, /Headline: Verified headline/);
  assert.match(preview, /Primary text: Verified primary copy for the property\./);
  assert.match(preview, /Description: Verified description/);
  assert.ok(preview.length <= 1_024);
});

test("requires the approved creative to be one of the selected media assets", () => {
  assert.throws(
    () => AdProposalContentSchema.parse({
      property: {
        projectName: "Lake View", locality: "Whitefield", city: "Bengaluru",
        price: "INR 1.2 crore", configuration: "3 BHK", area: null,
        possession: null, registrationId: null, amenities: [],
      },
      copy: { primaryText: "Copy", headline: "Headline", description: "Description" },
      evidence: Array.from({ length: 5 }, (_, index) => ({
        field: ["projectName", "locality", "city", "price", "configuration"][index],
        quote: "Evidence", sourceType: "message",
        sourceId: "5a7497d2-65c4-4b2e-a29f-d9f7bc47aade",
      })),
      campaign,
      mediaAssetIds: ["5a7497d2-65c4-4b2e-a29f-d9f7bc47aade"],
      creativeMediaAssetId: "df00408c-83b5-4500-bddb-b800638d7e49",
    }),
    /Creative media/,
  );
});
