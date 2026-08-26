const WatchlistReason = Object.freeze({
  LOW_EVIDENCE: "LOW_EVIDENCE",
  WEAK_SIGNAL: "WEAK_SIGNAL",
  DECLINING: "DECLINING",
  INSUFFICIENT_RECENT_SIGNAL: "INSUFFICIENT_RECENT_SIGNAL"
});

function assessPublishability(concept, config) {
  const minEvidence = Number(config.publishable?.minEvidence ?? 50);
  const evidence = Number(concept.evidence_strength || 0);
  const rejectionReasons = [];
  if (concept.weak_signal) rejectionReasons.push("weak_signal is true");
  if (evidence < minEvidence) rejectionReasons.push(`evidence_strength ${evidence} < ${minEvidence}`);

  const publishable = rejectionReasons.length === 0;
  const watchlistReasons = [];
  if (concept.weak_signal) watchlistReasons.push(WatchlistReason.WEAK_SIGNAL);
  if (evidence < minEvidence) watchlistReasons.push(WatchlistReason.LOW_EVIDENCE);
  if (concept.trend_momentum === "declining") watchlistReasons.push(WatchlistReason.DECLINING);
  if (Number(concept.recent_source_count_7d || 0) < Number(config.evidence?.minimum?.recentSourceCount7d ?? 2)) {
    watchlistReasons.push(WatchlistReason.INSUFFICIENT_RECENT_SIGNAL);
  }
  const watchlist = !publishable
    && evidence >= Number(config.watchlist?.minEvidence ?? 20)
    && Number(concept.total_score || 0) >= Number(config.watchlist?.minTotalScore ?? 40);

  let publishableReason = "";
  if (!publishable) {
    const weak = Boolean(concept.weak_signal);
    const lowEvidence = evidence < minEvidence;
    publishableReason = weak && lowEvidence
      ? "Weak signal and evidence below publishable threshold"
      : weak
        ? "Weak signal is not publishable"
        : "Evidence below publishable threshold";
  }

  return {
    publishable,
    publishable_reason: publishableReason,
    publishable_rejection_reasons: rejectionReasons,
    watchlist,
    watchlist_reasons: watchlistReasons
  };
}

export { WatchlistReason, assessPublishability };
