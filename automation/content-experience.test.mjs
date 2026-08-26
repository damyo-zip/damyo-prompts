import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGenerationPlan,
  experienceConfigFromEnv,
  generationReferences,
  normalizeConceptExperience,
  resolveConceptExperience,
  validateDraftExperience,
  validateReviewPackage
} from "./content-experience.mjs";
import { buildInstagramCarouselPlan } from "./kongi.mjs";

const enabledConfig = {
  ownerRequiredEnabled: true,
  carouselIdeasEnabled: true,
  ownerOptionalPolicy: "omit"
};

function concept(overrides = {}) {
  return {
    title: "Test concept",
    dog_adaptation: "같은 강아지가 하나의 연속된 장면을 보여주는 컨셉",
    owner_mode: "none",
    post_format: "single",
    preferred_slide_count: 1,
    carousel_fit_score: 0,
    ...overrides
  };
}

function carouselDraft(overrides = {}) {
  const ownerMode = overrides.owner_mode || "none";
  const ownerAssetUsed = overrides.owner_asset_used === true;
  return {
    run_id: "run-1",
    account_key: "kongi",
    owner_mode: ownerMode,
    owner_asset_used: ownerAssetUsed,
    post_format: "carousel",
    preferred_slide_count: 4,
    slides: ["hook", "setup", "development", "reveal"].map((role, index) => ({
      slide: index + 1,
      role,
      scene: `${role} scene`,
      owner_present: ownerMode === "required" && index !== 2
    })),
    ...overrides
  };
}

function reviewsFor(draft, overrides = {}) {
  const count = draft.post_format === "carousel" ? draft.slides.length : 1;
  return Array.from({ length: count }, (_, index) => ({
    run_id: draft.run_id,
    account_key: "kongi",
    ...(draft.post_format === "carousel" ? { slide: index + 1, carousel_consistency_score: 90 } : {}),
    ...(draft.owner_asset_used && (draft.post_format === "single" || draft.slides[index].owner_present) ? { owner_identity_score: 90 } : {}),
    attempt: 1,
    identity_score: 90,
    visual_quality_score: 90,
    concept_score: 90,
    fatal_issue: false,
    notes: "passed",
    ...(overrides[index] || {})
  }));
}

test("legacy concept metadata defaults to owner none and single", () => {
  assert.deepEqual(normalizeConceptExperience({}), {
    owner_mode: "none",
    owner_requirement_reason: "",
    post_format: "single",
    carousel_fit_score: 0,
    preferred_slide_count: 1,
    carousel_reason: "",
    carousel_storyboard_type: "progression"
  });
});

test("environment feature flags default off", () => {
  assert.deepEqual(experienceConfigFromEnv({}), {
    ownerRequiredEnabled: false,
    carouselIdeasEnabled: false,
    ownerOptionalPolicy: "omit"
  });
});

test("none mode references only Kongi", () => {
  const experience = resolveConceptExperience({ concept: concept(), config: enabledConfig, ownerAssetAvailable: true });
  assert.deepEqual(generationReferences({ petReference: "kongi.png", ownerReference: "owner.png", experience }), ["kongi.png"]);
});

test("optional mode references only Kongi even when owner is available", () => {
  const experience = resolveConceptExperience({ concept: concept({ owner_mode: "optional" }), config: enabledConfig, ownerAssetAvailable: true });
  assert.equal(experience.owner_asset_used, false);
  assert.deepEqual(generationReferences({ petReference: "kongi.png", ownerReference: "owner.png", experience }), ["kongi.png"]);
});

test("required mode references Kongi and owner", () => {
  const experience = resolveConceptExperience({ concept: concept({ owner_mode: "required" }), config: enabledConfig, ownerAssetAvailable: true });
  assert.deepEqual(generationReferences({ petReference: "kongi.png", ownerReference: "owner.png", experience }), ["kongi.png", "owner.png"]);
});

test("carousel storyboard uses four ordered roles by default", () => {
  const plan = buildGenerationPlan({
    concept: concept({ post_format: "carousel", preferred_slide_count: 4 }),
    config: enabledConfig,
    petReference: "kongi.png"
  });
  assert.deepEqual(plan.slides.map(slide => slide.role), ["hook", "setup", "development", "reveal"]);
  assert.deepEqual(plan.slides.map(slide => slide.slide), [1, 2, 3, 4]);
});

test("owner optional carousel omits owner from every slide", () => {
  const plan = buildGenerationPlan({
    concept: concept({ owner_mode: "optional", post_format: "carousel", preferred_slide_count: 4 }),
    config: enabledConfig,
    ownerAssetAvailable: true,
    petReference: "kongi.png",
    ownerReference: "owner.png"
  });
  assert.equal(plan.slides.some(slide => slide.owner_present), false);
  assert.deepEqual(plan.reference_images, ["kongi.png"]);
});

test("owner required carousel includes owner where storyboard needs it but not every slide", () => {
  const plan = buildGenerationPlan({
    concept: concept({ owner_mode: "required", post_format: "carousel", preferred_slide_count: 4 }),
    config: enabledConfig,
    ownerAssetAvailable: true,
    petReference: "kongi.png",
    ownerReference: "owner.png"
  });
  assert.equal(plan.slides.some(slide => slide.owner_present), true);
  assert.equal(plan.slides.every(slide => slide.owner_present), false);
});

test("legacy single draft remains valid without new metadata", () => {
  assert.deepEqual(validateDraftExperience({}, { accountName: "kongi" }), {
    owner_mode: "none",
    owner_asset_used: false,
    post_format: "single",
    preferred_slide_count: 1,
    slides: []
  });
});

test("carousel draft requires ordered 3 to 5 slide storyboard", () => {
  const valid = validateDraftExperience(carouselDraft(), { accountName: "kongi" });
  assert.equal(valid.slides.length, 4);
  assert.throws(() => validateDraftExperience(carouselDraft({ slides: [] }), { accountName: "kongi" }), /3~5/);
});

test("Hamnimi cannot enable owner or carousel draft metadata", () => {
  assert.throws(() => validateDraftExperience(carouselDraft(), { accountName: "hamnimi" }), /kongi/);
});

test("single review keeps the existing validation thresholds", () => {
  const draft = { run_id: "run-1", owner_mode: "none", owner_asset_used: false, post_format: "single" };
  const result = validateReviewPackage(draft, reviewsFor(draft), { accountName: "kongi", accountKey: "kongi" });
  assert.equal(result.passed, true);
});

test("carousel validation identifies only the failed slide for retry", () => {
  const draft = carouselDraft();
  const result = validateReviewPackage(draft, reviewsFor(draft, { 1: { visual_quality_score: 79 } }), { accountName: "kongi", accountKey: "kongi" });
  assert.equal(result.passed, false);
  assert.deepEqual(result.failed_slides, [2]);
  assert.deepEqual(result.passed_slides, [1, 3, 4]);
  assert.equal(result.terminal_failure, false);
});

test("third failed attempt becomes a terminal slide failure", () => {
  const draft = carouselDraft();
  const result = validateReviewPackage(draft, reviewsFor(draft, { 3: { concept_score: 79, attempt: 3 } }), { accountName: "kongi", accountKey: "kongi" });
  assert.deepEqual(result.failed_slides, [4]);
  assert.equal(result.terminal_failure, true);
});

test("carousel consistency below 80 fails without lowering existing thresholds", () => {
  const draft = carouselDraft();
  const result = validateReviewPackage(draft, reviewsFor(draft, { 0: { carousel_consistency_score: 79 } }), { accountName: "kongi", accountKey: "kongi" });
  assert.deepEqual(result.results[0].reasons, ["CAROUSEL_CONSISTENCY_BELOW_THRESHOLD"]);
});

test("owner identity score is required only on slides where owner appears", () => {
  const draft = carouselDraft({ owner_mode: "required", owner_asset_used: true });
  const reviews = reviewsFor(draft);
  delete reviews[0].owner_identity_score;
  assert.throws(() => validateReviewPackage(draft, reviews, { accountName: "kongi", accountKey: "kongi" }), /owner_identity_score/);
  assert.equal(Object.hasOwn(reviews[2], "owner_identity_score"), false);
});

test("CTA remains the final child after four content slides", () => {
  const plan = buildInstagramCarouselPlan({
    contentImageUrls: [1, 2, 3, 4].map(index => `https://example.test/content-${index}.jpg`),
    ctaImageUrl: "https://example.test/cta.jpg",
    caption: "caption",
    altText: "alt"
  });
  assert.deepEqual(plan.child_order, ["content_1", "content_2", "content_3", "content_4", "cta_kongi"]);
  assert.equal(plan.final_slide, "cta_kongi");
});

test("Safe Case A is pet-only single and never posts", () => {
  const plan = buildGenerationPlan({ concept: concept(), config: enabledConfig, ownerAssetAvailable: true, petReference: "kongi.png", ownerReference: "owner.png" });
  assert.deepEqual({ used: plan.owner_asset_used, format: plan.post_format, slides: plan.content_slide_count, posting: plan.instagram_posting_attempted }, { used: false, format: "single", slides: 1, posting: false });
});

test("Safe Case B is optional-owner carousel without owner references", () => {
  const plan = buildGenerationPlan({ concept: concept({ owner_mode: "optional", post_format: "carousel", preferred_slide_count: 4 }), config: enabledConfig, ownerAssetAvailable: true, petReference: "kongi.png", ownerReference: "owner.png" });
  assert.deepEqual({ used: plan.owner_asset_used, format: plan.post_format, slides: plan.content_slide_count, references: plan.reference_images, posting: plan.instagram_posting_attempted }, { used: false, format: "carousel", slides: 4, references: ["kongi.png"], posting: false });
});

test("Safe Case C is required-owner single with both references", () => {
  const plan = buildGenerationPlan({ concept: concept({ owner_mode: "required" }), config: enabledConfig, ownerAssetAvailable: true, petReference: "kongi.png", ownerReference: "owner.png" });
  assert.deepEqual({ used: plan.owner_asset_used, format: plan.post_format, references: plan.reference_images, posting: plan.instagram_posting_attempted }, { used: true, format: "single", references: ["kongi.png", "owner.png"], posting: false });
});

test("Safe Case D is required-owner four-slide carousel with no posting", () => {
  const plan = buildGenerationPlan({ concept: concept({ owner_mode: "required", post_format: "carousel", preferred_slide_count: 4 }), config: enabledConfig, ownerAssetAvailable: true, petReference: "kongi.png", ownerReference: "owner.png" });
  assert.equal(plan.owner_asset_used, true);
  assert.equal(plan.slides.length, 4);
  assert.equal(plan.instagram_posting_attempted, false);
});
