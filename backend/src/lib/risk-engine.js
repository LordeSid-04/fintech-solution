const HIGH_RISK_PATH_MARKERS = [
  "auth",
  "payment",
  "infra",
  ".github",
  "ci",
  "deploy",
  "k8s",
  "terraform",
  "migration",
  "data",
  "logging",
  "secret",
];

const MEDIUM_RISK_PATH_MARKERS = ["api", "job", "worker", "package.json", "package-lock.json"];

function scoreSeverity(severity) {
  switch (severity) {
    case "CRITICAL":
      return 35;
    case "HIGH":
      return 22;
    case "MED":
      return 12;
    default:
      return 6;
  }
}

function classifyPathRisk(filePath) {
  const normalized = String(filePath || "").toLowerCase();
  if (HIGH_RISK_PATH_MARKERS.some((marker) => normalized.includes(marker))) return "HIGH";
  if (MEDIUM_RISK_PATH_MARKERS.some((marker) => normalized.includes(marker))) return "MED";
  return "LOW";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getRiskTierFromScore(score) {
  if (score >= 85) return "CRITICAL";
  if (score >= 65) return "HIGH";
  if (score >= 35) return "MED";
  return "LOW";
}

function computeImpact(filesTouched = [], findings = []) {
  let impact = 0;
  for (const filePath of filesTouched) {
    const pathRisk = classifyPathRisk(filePath);
    if (pathRisk === "HIGH") impact += 8;
    else if (pathRisk === "MED") impact += 5;
    else impact += 2;
  }
  if (findings.some((item) => item.ruleName === "DIFF-SQL-001" || item.ruleName === "DIFF-SQL-002")) {
    impact += 12;
  }
  return clamp(impact, 0, 35);
}

function computeExploitability(findings = []) {
  let exploitability = 0;
  findings.forEach((finding) => {
    exploitability += scoreSeverity(finding.severity);
  });
  return clamp(Math.round(exploitability / 2), 0, 30);
}

function computeUncertainty({
  confidencePercent,
  findings = [],
  testSignals = {},
}) {
  let uncertainty = 0;
  const normalizedConfidence =
    typeof confidencePercent === "number" && Number.isFinite(confidencePercent)
      ? clamp(confidencePercent, 0, 100)
      : 65;

  if (normalizedConfidence >= 90 && findings.length > 0) {
    // High confidence with findings deserves extra scrutiny.
    uncertainty += 8;
  } else if (normalizedConfidence <= 40) {
    uncertainty += 6;
  }

  if (testSignals.hasVerifierEvidence === false) {
    uncertainty += 8;
  }
  if (testSignals.testCount === 0) {
    uncertainty += 4;
  }
  return clamp(uncertainty, 0, 20);
}

function countDistinctApprovers(approvals = []) {
  return new Set((approvals || []).map((item) => item.approverId)).size;
}

function computeGovernanceGap({ approvals = [], includesBreakGlass, breakGlass, findings = [] }) {
  let governanceGap = 0;
  const approverCount = countDistinctApprovers(approvals);
  const hasHighRiskSignals = findings.some((item) => item.severity === "HIGH" || item.severity === "CRITICAL");

  if (hasHighRiskSignals && approverCount < 2) {
    governanceGap += 8;
  } else if (approverCount < 1) {
    governanceGap += 4;
  }

  if (includesBreakGlass) {
    if (!breakGlass?.reason || !breakGlass?.expiresAt || breakGlass?.postActionReviewRequired !== true) {
      governanceGap += 7;
    } else {
      governanceGap += 3;
    }
  }

  return clamp(governanceGap, 0, 15);
}

function buildRiskCard({ score, findings = [], factors = {}, approvals = [] }) {
  const sorted = [...findings].sort((a, b) => scoreSeverity(b.severity) - scoreSeverity(a.severity));
  const topDrivers = sorted.slice(0, 3).map((item) => `${item.ruleName}:${item.severity}`);
  const requiredControls = [];
  if (score >= 65) requiredControls.push("two-human-approvals");
  if (score >= 85) requiredControls.push("break-glass-with-expiry");
  if (countDistinctApprovers(approvals) === 0) requiredControls.push("human-review-required");
  return {
    topDrivers,
    requiredControls,
    rationale: `Impact ${factors.impact}, exploitability ${factors.exploitability}, uncertainty ${factors.uncertainty}, governance gap ${factors.governanceGap}.`,
  };
}

function computeRiskAssessment({
  findings = [],
  filesTouched = [],
  includesBreakGlass = false,
  breakGlass,
  approvals = [],
  confidencePercent,
  testSignals = {},
}) {
  const factors = {
    impact: computeImpact(filesTouched, findings),
    exploitability: computeExploitability(findings),
    uncertainty: computeUncertainty({ confidencePercent, findings, testSignals }),
    governanceGap: computeGovernanceGap({ approvals, includesBreakGlass, breakGlass, findings }),
  };
  const riskScore = clamp(
    factors.impact + factors.exploitability + factors.uncertainty + factors.governanceGap,
    0,
    100
  );
  return {
    riskScore,
    riskTier: getRiskTierFromScore(riskScore),
    factors,
    riskCard: buildRiskCard({ score: riskScore, findings, factors, approvals }),
  };
}

function computeRiskScore({ findings, filesTouched, includesBreakGlass }) {
  return computeRiskAssessment({
    findings,
    filesTouched,
    includesBreakGlass,
  }).riskScore;
}

module.exports = {
  classifyPathRisk,
  computeRiskScore,
  computeRiskAssessment,
  getRiskTierFromScore,
};
