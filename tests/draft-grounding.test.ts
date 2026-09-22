import assert from "node:assert/strict";
import test from "node:test";

import type { AdDraftInput } from "@/domain/ad-proposal";
import { assertGroundedDraft } from "@/domain/draft-grounding";

const sourceId = "5a7497d2-65c4-4b2e-a29f-d9f7bc47aade";
const mediaId = "df00408c-83b5-4500-bddb-b800638d7e49";
const draft: AdDraftInput = {
  property: {
    projectName: "Lake View",
    locality: "Whitefield",
    city: "Bengaluru",
    price: "INR 1.2 crore",
    configuration: "3 BHK",
    area: null,
    possession: null,
    registrationId: null,
    amenities: [],
  },
  evidence: ["projectName", "locality", "city", "price", "configuration"].map((field) => ({
    field: field as AdDraftInput["evidence"][number]["field"],
    quote: {
      projectName: "Lake View",
      locality: "Whitefield",
      city: "Bengaluru",
      price: "INR 1.2 crore",
      configuration: "3 BHK",
    }[field]!,
    sourceType: "message" as const,
    sourceId,
  })),
  mediaAssetIds: [mediaId],
  creativeMediaAssetId: mediaId,
};
const messages = [{
  id: sourceId,
  direction: "inbound",
  text: "Lake View Whitefield Bengaluru INR 1.2 crore 3 BHK",
}];

test("accepts source-bound property facts", () => {
  assert.doesNotThrow(() => assertGroundedDraft(draft, messages));
});

test("rejects hallucinated, duplicate, and missing evidence", () => {
  assert.throws(
    () => assertGroundedDraft({ ...draft, evidence: draft.evidence.map((item, index) => index === 0 ? { ...item, quote: "Ocean Towers" } : item) }, messages),
    /does not support/,
  );
  assert.throws(
    () => assertGroundedDraft({ ...draft, evidence: [...draft.evidence, draft.evidence[0]!] }, messages),
    /Duplicate evidence/,
  );
  assert.throws(
    () => assertGroundedDraft({ ...draft, evidence: draft.evidence.slice(1) }, messages),
    /Missing evidence/,
  );
});
