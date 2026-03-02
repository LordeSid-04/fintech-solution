function hasTwoDistinctApprovals(approvals = []) {
  return new Set(approvals.map((item) => item.approverId)).size >= 2;
}

function hasAtLeastOneApproval(approvals = []) {
  return Array.isArray(approvals) && approvals.length > 0;
}

function validateBreakGlass(breakGlass) {
  if (!breakGlass) {
    return { ok: true, reason: "" };
  }
  if (!breakGlass.reason || !breakGlass.expiresAt || breakGlass.postActionReviewRequired !== true) {
    return { ok: false, reason: "Break-glass requires reason, expiry, and post-action-review flag." };
  }
  const expiresMs = Date.parse(breakGlass.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    return { ok: false, reason: "Break-glass expiry must be a valid future timestamp." };
  }
  return { ok: true, reason: "" };
}

function getHighestSeverity(findings = []) {
  if (findings.some((f) => f.severity === "CRITICAL")) return "CRITICAL";
  if (findings.some((f) => f.severity === "HIGH")) return "HIGH";
  if (findings.some((f) => f.severity === "MED")) return "MED";
  return "LOW";
}

function getRiskTier({ riskScore, findings = [] }) {
  const severity = getHighestSeverity(findings);
  if (severity === "CRITICAL") return "CRITICAL";
  if (severity === "HIGH" || riskScore >= 65) return "HIGH";
  if (severity === "MED" || riskScore >= 35) return "MED";
  return "LOW";
}

function makeDecision({ gateDecision, blockReasons = [], approvalsNeeded = [], reasonCodes = [] }) {
  return {
    gateDecision,
    blockReasons,
    approvalsNeeded,
    reasonCodes,
  };
}

function decideGate({ confidenceMode = "pair", artifactType, riskScore, findings, approvals, breakGlass }) {
  const breakGlassValidation = validateBreakGlass(breakGlass);
  if (!breakGlassValidation.ok) {
    return makeDecision({
      gateDecision: "BLOCKED",
      blockReasons: [breakGlassValidation.reason],
      approvalsNeeded: [],
      reasonCodes: ["BREAK_GLASS_INVALID"],
    });
  }

  const riskTier = getRiskTier({ riskScore, findings });
  const twoApprovers = hasTwoDistinctApprovals(approvals);
  const oneApprover = hasAtLeastOneApproval(approvals);
  const needsTwoKey = confidenceMode === "autopilot" && artifactType === "deploy";

  if (riskTier === "CRITICAL" && confidenceMode !== "autopilot") {
    return makeDecision({
      gateDecision: "BLOCKED",
      blockReasons: ["Critical scanner finding(s) detected."],
      approvalsNeeded: ["security-review", "platform-review"],
      reasonCodes: ["CRITICAL_FINDINGS_BLOCKED"],
    });
  }

  if (riskTier === "CRITICAL" && confidenceMode === "autopilot") {
    if (!breakGlass) {
      return makeDecision({
        gateDecision: "BLOCKED",
        blockReasons: ["Critical risk is blocked in autopilot unless break-glass override is provided."],
        approvalsNeeded: ["security-review", "platform-review"],
        reasonCodes: ["CRITICAL_REQUIRES_BREAK_GLASS"],
      });
    }
    if (!twoApprovers) {
      return makeDecision({
        gateDecision: "NEEDS_APPROVAL",
        blockReasons: [],
        approvalsNeeded: ["approver-a", "approver-b"],
        reasonCodes: ["TWO_PERSON_RULE_REQUIRED"],
      });
    }
    return makeDecision({ gateDecision: "ALLOWED" });
  }

  if (confidenceMode === "assist") {
    if (!oneApprover) {
      return makeDecision({
        gateDecision: "NEEDS_APPROVAL",
        approvalsNeeded: ["human-review"],
        reasonCodes: ["HUMAN_REVIEW_REQUIRED"],
      });
    }
    return makeDecision({ gateDecision: "ALLOWED" });
  }

  if (confidenceMode === "pair") {
    if (riskTier === "HIGH") {
      return makeDecision({
        gateDecision: "BLOCKED",
        blockReasons: ["Pair mode blocks high-risk and critical changes."],
        approvalsNeeded: ["security-review", "platform-review"],
        reasonCodes: ["PAIR_MODE_BLOCK_HIGH_RISK", ...(twoApprovers ? [] : ["TWO_PERSON_RULE_REQUIRED"])],
      });
    }
    if (riskTier === "MED") {
      return makeDecision({
        gateDecision: oneApprover ? "ALLOWED" : "NEEDS_APPROVAL",
        approvalsNeeded: oneApprover ? [] : ["human-review"],
        reasonCodes: oneApprover ? [] : ["HUMAN_REVIEW_REQUIRED"],
      });
    }
    return makeDecision({ gateDecision: "ALLOWED" });
  }

  if (riskTier === "HIGH" || riskTier === "CRITICAL") {
    if (needsTwoKey && !twoApprovers) {
      return makeDecision({
        gateDecision: "NEEDS_APPROVAL",
        approvalsNeeded: ["approver-a", "approver-b"],
        reasonCodes: ["TWO_PERSON_RULE_REQUIRED"],
      });
    }
    if (!twoApprovers) {
      return makeDecision({
        gateDecision: "NEEDS_APPROVAL",
        approvalsNeeded: ["security-review", "platform-review"],
        reasonCodes: ["TWO_PERSON_RULE_REQUIRED"],
      });
    }
    return makeDecision({ gateDecision: "ALLOWED" });
  }

  return makeDecision({ gateDecision: "ALLOWED" });
}

module.exports = {
  hasTwoDistinctApprovals,
  getRiskTier,
  decideGate,
};
