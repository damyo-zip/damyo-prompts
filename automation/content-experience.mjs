const OWNER_MODES = new Set(["none", "optional", "required"]);
const POST_FORMATS = new Set(["single", "carousel"]);
const DEFAULT_CAROUSEL_SLIDES = 4;
const MIN_CAROUSEL_SLIDES = 3;
const MAX_CAROUSEL_SLIDES = 5;
const REVIEW_THRESHOLDS = {
  identity_score: 75,
  owner_identity_score: 75,
  visual_quality_score: 80,
  concept_score: 80,
  carousel_consistency_score: 80,
  fatal_issue: false
};

function booleanValue(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedSlideCount(value, fallback = DEFAULT_CAROUSEL_SLIDES) {
  const parsed = Math.round(finiteNumber(value, fallback));
  return Math.max(MIN_CAROUSEL_SLIDES, Math.min(MAX_CAROUSEL_SLIDES, parsed));
}

function experienceConfigFromEnv(env = process.env) {
  return {
    ownerRequiredEnabled: booleanValue(env.KONGI_OWNER_REQUIRED_ENABLED, false),
    carouselIdeasEnabled: booleanValue(env.KONGI_CAROUSEL_IDEAS_ENABLED, false),
    ownerOptionalPolicy: "omit"
  };
}

function normalizeConceptExperience(concept = {}) {
  const ownerMode = OWNER_MODES.has(concept.owner_mode) ? concept.owner_mode : "none";
  const postFormat = POST_FORMATS.has(concept.post_format) ? concept.post_format : "single";
  return {
    owner_mode: ownerMode,
    owner_requirement_reason: typeof concept.owner_requirement_reason === "string" ? concept.owner_requirement_reason : "",
    post_format: postFormat,
    carousel_fit_score: Math.max(0, Math.min(100, finiteNumber(concept.carousel_fit_score, postFormat === "carousel" ? 80 : 0))),
    preferred_slide_count: postFormat === "carousel" ? boundedSlideCount(concept.preferred_slide_count) : 1,
    carousel_reason: typeof concept.carousel_reason === "string" ? concept.carousel_reason : "",
    carousel_storyboard_type: typeof concept.carousel_storyboard_type === "string" ? concept.carousel_storyboard_type : "progression"
  };
}

function resolveConceptExperience({
  concept = {},
  accountName = "kongi",
  config = experienceConfigFromEnv(),
  ownerAssetAvailable = false
} = {}) {
  const declared = normalizeConceptExperience(concept);
  const supportedAccount = String(accountName).toLowerCase() === "kongi";
  const ownerMode = supportedAccount && config.ownerRequiredEnabled ? declared.owner_mode : "none";
  const postFormat = supportedAccount && config.carouselIdeasEnabled ? declared.post_format : "single";
  const ownerAssetUsed = ownerMode === "required" && Boolean(ownerAssetAvailable);
  return {
    declared_owner_mode: declared.owner_mode,
    owner_mode: ownerMode,
    owner_requirement_reason: ownerMode === "required" ? declared.owner_requirement_reason : "",
    owner_asset_available: Boolean(ownerAssetAvailable),
    owner_asset_used: ownerAssetUsed,
    owner_requirement_satisfied: ownerMode !== "required" || ownerAssetUsed,
    declared_post_format: declared.post_format,
    post_format: postFormat,
    carousel_fit_score: postFormat === "carousel" ? declared.carousel_fit_score : 0,
    preferred_slide_count: postFormat === "carousel" ? declared.preferred_slide_count : 1,
    carousel_reason: postFormat === "carousel" ? declared.carousel_reason : "",
    carousel_storyboard_type: postFormat === "carousel" ? declared.carousel_storyboard_type : "single",
    owner_optional_policy: "omit",
    feature_flags: {
      owner_required_enabled: supportedAccount && Boolean(config.ownerRequiredEnabled),
      carousel_ideas_enabled: supportedAccount && Boolean(config.carouselIdeasEnabled)
    }
  };
}

function storyboardRoles(count) {
  if (count === 3) return ["hook", "development", "reveal"];
  if (count === 5) return ["hook", "setup", "development", "variation", "reveal"];
  return ["hook", "setup", "development", "reveal"];
}

function sceneForRole(role, baseScene, storyboardType) {
  const sceneByType = {
    photo_dump: {
      hook: `${baseScene}의 시선을 끄는 대표 직광 스냅`,
      setup: `${baseScene}의 장소와 상황을 넓게 보여주는 두 번째 순간`,
      development: `${baseScene}을 다른 거리와 표정으로 변주한 생활 스냅`,
      variation: `${baseScene}의 소품과 카메라 각도를 바꾼 추가 변주`,
      reveal: `${baseScene}의 가장 엉뚱하고 기억에 남는 마지막 컷`
    },
    then_now: {
      hook: `${baseScene}의 시간 비교를 예고하는 대표 장면`,
      setup: `${baseScene}의 과거 시점을 같은 구도로 보여주는 장면`,
      development: `${baseScene}의 시간 변화를 연결하는 중간 장면`,
      variation: `${baseScene}의 같은 자세와 장소를 강조하는 비교 장면`,
      reveal: `${baseScene}의 현재 시점을 같은 구도로 완성하는 장면`
    },
    scrapbook: {
      hook: `${baseScene}을 한눈에 소개하는 미니 매거진 표지`,
      setup: `${baseScene}의 배경과 소품을 보여주는 저널 장면`,
      development: `${baseScene}의 작은 디테일을 확대해 보여주는 장면`,
      variation: `${baseScene}의 다른 순간을 같은 시각 언어로 기록한 장면`,
      reveal: `${baseScene}을 완결하는 가장 사랑스러운 마지막 페이지`
    },
    reveal: {
      hook: `${baseScene}을 평범해 보이게 시작하는 첫 장`,
      setup: `${baseScene}에서 작은 이상 징후를 발견하는 장면`,
      development: `${baseScene}의 이상한 요소가 더 분명해지는 장면`,
      variation: `${baseScene}의 반전을 다른 구도로 강화하는 장면`,
      reveal: `${baseScene}의 핵심 반전을 완전히 드러내는 마지막 장`
    },
    progression: {
      hook: `${baseScene}의 핵심을 즉시 보여주는 첫 장`,
      setup: `${baseScene}의 배경과 상황을 확장하는 장면`,
      development: `${baseScene}의 행동이나 변화를 이어가는 장면`,
      variation: `${baseScene}을 같은 스타일의 다른 구도로 변주한 장면`,
      reveal: `${baseScene}을 명확하게 마무리하는 마지막 장`
    }
  };
  return (sceneByType[storyboardType] || sceneByType.progression)[role];
}

function buildCarouselStoryboard(concept, experience) {
  if (experience.post_format !== "carousel") return [];
  const count = boundedSlideCount(experience.preferred_slide_count);
  const roles = storyboardRoles(count);
  const baseScene = concept.dog_adaptation || concept.pet_adaptation || concept.adaptation || concept.description || concept.title || "반려동물 컨셉";
  return roles.map((role, index) => ({
    slide: index + 1,
    role,
    scene: sceneForRole(role, baseScene, experience.carousel_storyboard_type),
    owner_present: experience.owner_asset_used && role !== "development"
  }));
}

function generationReferences({ petReference, ownerReference = null, experience }) {
  const references = [petReference].filter(Boolean);
  if (experience.owner_asset_used && ownerReference) references.push(ownerReference);
  return references;
}

function buildGenerationPlan({ concept = {}, accountName = "kongi", config, ownerAssetAvailable = false, petReference, ownerReference = null } = {}) {
  const experience = resolveConceptExperience({ concept, accountName, config, ownerAssetAvailable });
  const slides = buildCarouselStoryboard(concept, experience);
  return {
    ...experience,
    content_slide_count: experience.post_format === "carousel" ? slides.length : 1,
    slides,
    reference_images: generationReferences({ petReference, ownerReference, experience }),
    instagram_posting_attempted: false
  };
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 값이 비어 있습니다.`);
}

function validateDraftExperience(draft, { accountName = "kongi" } = {}) {
  const ownerMode = draft.owner_mode == null ? "none" : draft.owner_mode;
  const postFormat = draft.post_format == null ? "single" : draft.post_format;
  if (!OWNER_MODES.has(ownerMode)) throw new Error("draft.owner_mode는 none, optional, required 중 하나여야 합니다.");
  if (!POST_FORMATS.has(postFormat)) throw new Error("draft.post_format은 single 또는 carousel이어야 합니다.");
  if (String(accountName).toLowerCase() !== "kongi" && (ownerMode !== "none" || postFormat !== "single")) {
    throw new Error("owner/carousel 아이디어 확장은 현재 kongi에만 지원됩니다.");
  }
  const ownerAssetUsed = draft.owner_asset_used === true;
  if (ownerMode !== "required" && ownerAssetUsed) throw new Error("owner asset은 owner_mode=required일 때만 사용할 수 있습니다.");
  if (ownerMode === "required" && !ownerAssetUsed) throw new Error("owner_mode=required draft는 owner asset을 사용해야 합니다.");

  if (postFormat === "single") {
    if (Array.isArray(draft.slides) && draft.slides.length) throw new Error("single draft에는 carousel slides를 넣을 수 없습니다.");
    return { owner_mode: ownerMode, owner_asset_used: ownerAssetUsed, post_format: "single", preferred_slide_count: 1, slides: [] };
  }

  if (!Array.isArray(draft.slides) || draft.slides.length < MIN_CAROUSEL_SLIDES || draft.slides.length > MAX_CAROUSEL_SLIDES) {
    throw new Error(`carousel draft.slides는 ${MIN_CAROUSEL_SLIDES}~${MAX_CAROUSEL_SLIDES}개여야 합니다.`);
  }
  draft.slides.forEach((slide, index) => {
    if (slide.slide !== index + 1) throw new Error("carousel slide 번호는 1부터 순서대로여야 합니다.");
    assertString(slide.role, `draft.slides[${index}].role`);
    assertString(slide.scene, `draft.slides[${index}].scene`);
    if (slide.owner_present != null && typeof slide.owner_present !== "boolean") {
      throw new Error(`draft.slides[${index}].owner_present는 boolean이어야 합니다.`);
    }
    if (ownerMode !== "required" && slide.owner_present === true) {
      throw new Error("owner_mode가 required가 아닌 carousel에는 보호자가 등장할 수 없습니다.");
    }
  });
  if (ownerMode === "required" && !draft.slides.some(slide => slide.owner_present === true)) {
    throw new Error("owner-required carousel에는 보호자가 등장하는 slide가 하나 이상 필요합니다.");
  }
  const preferredSlideCount = draft.preferred_slide_count == null ? draft.slides.length : Number(draft.preferred_slide_count);
  if (preferredSlideCount !== draft.slides.length) throw new Error("preferred_slide_count와 slides 개수가 다릅니다.");
  return { owner_mode: ownerMode, owner_asset_used: ownerAssetUsed, post_format: "carousel", preferred_slide_count: draft.slides.length, slides: draft.slides };
}

function validateScore(value, label) {
  if (typeof value !== "number" || value < 0 || value > 100) throw new Error(`${label}는 0~100 숫자여야 합니다.`);
}

function validateReviewScores(review, {
  runId,
  accountKey,
  maxAttempts = 3,
  expectedSlide = null,
  ownerIdentityRequired = false,
  consistencyRequired = false
} = {}) {
  if (review.run_id !== runId) throw new Error("review.run_id가 draft.run_id와 다릅니다.");
  if (review.account_key && accountKey && review.account_key !== accountKey) throw new Error("review.account_key가 현재 계정과 다릅니다.");
  if (!Number.isInteger(review.attempt) || review.attempt < 1 || review.attempt > maxAttempts) {
    throw new Error(`review.attempt는 1~${maxAttempts} 정수여야 합니다.`);
  }
  if (expectedSlide != null && review.slide !== expectedSlide) throw new Error(`review.slide는 ${expectedSlide}이어야 합니다.`);
  for (const key of ["identity_score", "visual_quality_score", "concept_score"]) validateScore(review[key], `review.${key}`);
  if (ownerIdentityRequired) validateScore(review.owner_identity_score, "review.owner_identity_score");
  if (consistencyRequired) validateScore(review.carousel_consistency_score, "review.carousel_consistency_score");
  if (typeof review.fatal_issue !== "boolean") throw new Error("review.fatal_issue는 boolean이어야 합니다.");
  assertString(review.notes, "review.notes");
  const reasons = [];
  if (review.identity_score < REVIEW_THRESHOLDS.identity_score) reasons.push("IDENTITY_BELOW_THRESHOLD");
  if (review.visual_quality_score < REVIEW_THRESHOLDS.visual_quality_score) reasons.push("VISUAL_QUALITY_BELOW_THRESHOLD");
  if (review.concept_score < REVIEW_THRESHOLDS.concept_score) reasons.push("CONCEPT_BELOW_THRESHOLD");
  if (ownerIdentityRequired && review.owner_identity_score < REVIEW_THRESHOLDS.owner_identity_score) reasons.push("OWNER_IDENTITY_BELOW_THRESHOLD");
  if (consistencyRequired && review.carousel_consistency_score < REVIEW_THRESHOLDS.carousel_consistency_score) reasons.push("CAROUSEL_CONSISTENCY_BELOW_THRESHOLD");
  if (review.fatal_issue) reasons.push("FATAL_ISSUE");
  return { passed: reasons.length === 0, reasons, attempt: review.attempt, thresholds: REVIEW_THRESHOLDS };
}

function validateReviewPackage(draft, reviews, { accountName = "kongi", accountKey = accountName, maxAttempts = 3 } = {}) {
  const experience = validateDraftExperience(draft, { accountName });
  const expectedCount = experience.post_format === "carousel" ? experience.slides.length : 1;
  if (!Array.isArray(reviews) || reviews.length !== expectedCount) {
    throw new Error(`${experience.post_format} review 개수는 ${expectedCount}개여야 합니다.`);
  }
  const results = reviews.map((review, index) => {
    const slide = experience.post_format === "carousel" ? experience.slides[index] : null;
    return {
      slide: index + 1,
      review,
      ...validateReviewScores(review, {
        runId: draft.run_id,
        accountKey,
        maxAttempts,
        expectedSlide: slide ? index + 1 : null,
        ownerIdentityRequired: experience.owner_asset_used && (experience.post_format === "single" || slide.owner_present === true),
        consistencyRequired: experience.post_format === "carousel"
      })
    };
  });
  const failed = results.filter(result => !result.passed);
  return {
    passed: failed.length === 0,
    experience,
    results,
    failed_slides: failed.map(result => result.slide),
    passed_slides: results.filter(result => result.passed).map(result => result.slide),
    terminal_failure: failed.some(result => result.attempt >= maxAttempts),
    thresholds: REVIEW_THRESHOLDS
  };
}

export {
  DEFAULT_CAROUSEL_SLIDES,
  MAX_CAROUSEL_SLIDES,
  MIN_CAROUSEL_SLIDES,
  OWNER_MODES,
  POST_FORMATS,
  REVIEW_THRESHOLDS,
  buildCarouselStoryboard,
  buildGenerationPlan,
  experienceConfigFromEnv,
  generationReferences,
  normalizeConceptExperience,
  resolveConceptExperience,
  validateDraftExperience,
  validateReviewPackage,
  validateReviewScores
};
