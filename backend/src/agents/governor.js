const { runSafetyScanners } = require("../lib/scanners");
const { computeRiskAssessment } = require("../lib/risk-engine");
const { decideGate } = require("../lib/policy-engine");
const { callCodex } = require("../lib/codex-client");

async function runGovernorAgent({
  stageName,
  actor,
  confidenceMode = "pair",
  artifactType,
  diffText,
  filesTouched,
  approvals,
  breakGlass,
  declaredIntent,
  confidencePercent,
  testSignals,
}) {
  const findings =
    artifactType === "diff" || artifactType === "test"
      ? runSafetyScanners({ diffText, filesTouched, declaredIntent })
      : [];
  const assessment = computeRiskAssessment({
    findings,
    filesTouched,
    includesBreakGlass: Boolean(breakGlass),
    breakGlass,
    approvals,
    confidencePercent,
    testSignals,
  });
  const riskScore = assessment.riskScore;
  const gate = decideGate({
    confidenceMode,
    artifactType,
    riskScore,
    findings,
    approvals,
    breakGlass,
  });

  const codex = await callCodex({
    agentRole: "GOVERNOR",
    systemPrompt:
      "You are GOVERNOR. Return strict JSON with fields: stageName, riskScore, gateDecision, summary.",
    userPrompt: `Stage: ${stageName}\nActor: ${actor}\nRisk score: ${riskScore}\nRisk tier: ${
      assessment.riskTier
    }\nGate: ${gate.gateDecision}\nFindings: ${JSON.stringify(
      findings,
      null,
      2
    )}\nConfidence mode: ${confidenceMode}`,
  });

  return {
    artifact: {
      stageName,
      riskScore,
      gateDecision: gate.gateDecision,
      findings,
      blockReasons: gate.blockReasons,
      approvalsNeeded: gate.approvalsNeeded,
      reasonCodes: gate.reasonCodes || [],
      confidenceMode,
      riskTier: assessment.riskTier,
      riskFactors: assessment.factors,
      riskCard: assessment.riskCard,
      findingsByCategory: findings.reduce((acc, item) => {
        const category = item.category || "uncategorized";
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {}),
      summary: codex.parsed?.summary || "Governor policy evaluation complete.",
    },
    proof: codex.proof,
    modelText: codex.text,
  };
}

module.exports = {
  runGovernorAgent,
};
