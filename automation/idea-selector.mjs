import { noveltyAgainstHistory } from "./trend-radar/dedupe.mjs";
import { prepareResultForAccount, runTrendRadar } from "./trend-radar/index.mjs";

const SUPPORTED_SELECTION_ACCOUNTS = new Set(["kongi"]);

function booleanValue(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectionConfigFromEnv(env = process.env) {
  const accounts = String(env.TREND_RADAR_SELECTION_ACCOUNTS || "kongi")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return {
    enabled: booleanValue(env.TREND_RADAR_ENABLE_SELECTION, false),
    accounts,
    minEvidence: finiteNumber(env.TREND_RADAR_MIN_EVIDENCE, 50),
    allowDeclining: booleanValue(env.TREND_RADAR_ALLOW_DECLINING, false),
    duplicateThreshold: finiteNumber(env.TREND_RADAR_DUPLICATE_THRESHOLD, 0.72)
  };
}

function fallbackSelection(accountName, config, reason, details = {}) {
  return {
    idea_source: "fallback_generator",
    account: accountName,
    selection_enabled: config.enabled,
    fallback_used: true,
    fallback_reason: reason,
    selected_idea: null,
    trend_concept_id: null,
    trend_concept_title: null,
    trend_total_score: null,
    trend_evidence_strength: null,
    trend_momentum: null,
    trend_publishable: false,
    instagram_posting_attempted: false,
    skipped_candidates: details.skipped_candidates || [],
    radar_error: details.radar_error || null
  };
}

function selectionTextConcept(concept) {
  return {
    ...concept,
    adaptation: [concept.pet_adaptation, concept.dog_adaptation, concept.cat_adaptation, concept.hamster_adaptation]
      .filter(Boolean)
      .join(" "),
    description: [concept.description, concept.original_trend].filter(Boolean).join(" ")
  };
}

function assessSelectionCandidate(concept, recentPosts, config) {
  const reasons = [];
  if (concept.publishable !== true) reasons.push("NOT_PUBLISHABLE");
  if (Number(concept.evidence_strength || 0) < config.minEvidence) reasons.push("EVIDENCE_BELOW_SELECTION_THRESHOLD");
  if (!config.allowDeclining && concept.trend_momentum === "declining") reasons.push("DECLINING_NOT_ALLOWED");
  const novelty = noveltyAgainstHistory(selectionTextConcept(concept), recentPosts);
  if (novelty.maxSimilarity >= config.duplicateThreshold) reasons.push("RECENTLY_SIMILAR");
  return {
    eligible: reasons.length === 0,
    reasons,
    duplicate_similarity: Number(novelty.maxSimilarity.toFixed(3))
  };
}

async function defaultTrendProvider(accountName, { radarOptions = {} } = {}) {
  const raw = await runTrendRadar({ accountName, ...radarOptions });
  return prepareResultForAccount(raw, accountName, radarOptions.config);
}

function fallbackReasonForAssessments(concepts, assessments) {
  if (!concepts.some(concept => concept.publishable === true)) return "no_publishable_concept";
  if (assessments.every(item => item.assessment.reasons.includes("EVIDENCE_BELOW_SELECTION_THRESHOLD"))) return "evidence_below_selection_threshold";
  const policyEligible = assessments.filter(item => !item.assessment.reasons.some(reason => [
    "NOT_PUBLISHABLE",
    "EVIDENCE_BELOW_SELECTION_THRESHOLD",
    "DECLINING_NOT_ALLOWED"
  ].includes(reason)));
  if (policyEligible.length && policyEligible.every(item => item.assessment.reasons.includes("RECENTLY_SIMILAR"))) {
    return "all_candidates_recently_similar";
  }
  if (assessments.some(item => item.assessment.reasons.includes("DECLINING_NOT_ALLOWED"))) return "declining_not_allowed";
  return "no_eligible_trend_concept";
}

async function selectIdeaSource({
  accountName,
  recentPosts = [],
  config = selectionConfigFromEnv(),
  trendProvider = defaultTrendProvider,
  radarOptions = {}
} = {}) {
  const account = String(accountName || "").toLowerCase();
  if (!config.enabled) return fallbackSelection(account, config, "feature_flag_disabled");
  if (!SUPPORTED_SELECTION_ACCOUNTS.has(account)) return fallbackSelection(account, config, "account_not_supported");
  if (!config.accounts.includes(account)) return fallbackSelection(account, config, "account_not_enabled");

  let result;
  try {
    result = await trendProvider(account, { radarOptions });
  } catch (error) {
    return fallbackSelection(account, config, "trend_radar_error", { radar_error: error.message });
  }
  const concepts = (Array.isArray(result) ? result : result?.concepts || [])
    .slice()
    .sort((left, right) => Number(right.total_score || 0) - Number(left.total_score || 0));
  const assessments = concepts.map(concept => ({
    concept,
    assessment: assessSelectionCandidate(concept, recentPosts, config)
  }));
  const selectedIndex = assessments.findIndex(item => item.assessment.eligible);
  const selected = selectedIndex >= 0 ? assessments[selectedIndex] : null;
  const evaluatedBeforeSelection = selected ? assessments.slice(0, selectedIndex) : assessments;
  const skippedCandidates = evaluatedBeforeSelection
    .map(item => ({
      concept_id: item.concept.concept_id,
      title: item.concept.title,
      reasons: item.assessment.reasons,
      duplicate_similarity: item.assessment.duplicate_similarity
    }));
  if (!selected) {
    return fallbackSelection(account, config, fallbackReasonForAssessments(concepts, assessments), {
      skipped_candidates: skippedCandidates
    });
  }
  const concept = selected.concept;
  return {
    idea_source: "trend_radar",
    account,
    selection_enabled: true,
    fallback_used: false,
    fallback_reason: null,
    selected_idea: concept,
    trend_concept_id: concept.concept_id,
    trend_concept_title: concept.title,
    trend_total_score: concept.total_score,
    trend_evidence_strength: concept.evidence_strength,
    trend_momentum: concept.trend_momentum,
    trend_publishable: concept.publishable,
    duplicate_similarity: selected.assessment.duplicate_similarity,
    instagram_posting_attempted: false,
    skipped_candidates: skippedCandidates,
    radar_error: null
  };
}

function ideaGuidanceForSelection(selection, fallbackGuidance = []) {
  if (selection.idea_source !== "trend_radar" || !selection.selected_idea) return fallbackGuidance;
  const concept = selection.selected_idea;
  return [
    `이번 게시의 아이디어 출처는 Trend Radar이며 '${concept.title}' 컨셉을 사용한다.`,
    `검증된 원본 트렌드: ${concept.original_trend}`,
    `콩이 적용 방향: ${concept.dog_adaptation || concept.pet_adaptation || concept.description}`,
    `Evidence ${concept.evidence_strength}, Total ${concept.total_score}, Momentum ${concept.trend_momentum}.`,
    "이 컨셉의 장면과 시각적 핵심을 유지하면서 기존 prompt·validation·caption 규칙에 맞게 draft를 작성한다."
  ];
}

function selectionLogDetails(selection) {
  return {
    idea_source: selection.idea_source,
    account: selection.account,
    selected_concept: selection.trend_concept_title,
    trend_concept_id: selection.trend_concept_id,
    total: selection.trend_total_score,
    evidence: selection.trend_evidence_strength,
    momentum: selection.trend_momentum,
    fallback_used: selection.fallback_used,
    fallback_reason: selection.fallback_reason,
    selection_enabled: selection.selection_enabled,
    skipped_candidates: selection.skipped_candidates,
    radar_error: selection.radar_error
  };
}

export {
  SUPPORTED_SELECTION_ACCOUNTS,
  assessSelectionCandidate,
  defaultTrendProvider,
  ideaGuidanceForSelection,
  selectIdeaSource,
  selectionConfigFromEnv,
  selectionLogDetails
};
