const { runSafetyScanners } = require("../lib/scanners");
const { computeRiskAssessment } = require("../lib/risk-engine");
const { decideGate } = require("../lib/policy-engine");
const { callCodex } = require("../lib/codex-client");

const GOVERNOR_SUMMARY_SCHEMA = {
  name: "governor_summary",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      stageName: { type: "string" },
      riskScore: { type: "number" },
      gateDecision: { type: "string" },
      summary: { type: "string" },
    },
    required: ["summary"],
  },
};

function buildDeterministicSummary({ gateDecision, riskTier, riskScore, findings }) {
  const topFinding = findings[0];
  if (!topFinding) {
    return `Gate ${gateDecision} at ${riskTier} risk (${riskScore}/100). No scanner findings detected.`;
  }
  return `Gate ${gateDecision} at ${riskTier} risk (${riskScore}/100). Top finding: ${topFinding.title}.`;
}

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

  const useModelSummary = String(process.env.GOVERNOR_USE_MODEL_SUMMARY || "").toLowerCase() === "true";
  const codex = useModelSummary
    ? await callCodex({
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
        responseSchema: GOVERNOR_SUMMARY_SCHEMA,
      })
    : {
        parsed: {
          summary: buildDeterministicSummary({
            gateDecision: gate.gateDecision,
            riskTier: assessment.riskTier,
            riskScore,
            findings,
          }),
        },
        text: "",
        proof: {
          provider: "policy-engine",
          model: "policy-engine-summary",
          responseId: `governor-${stageName}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          agentRole: "GOVERNOR",
        },
      };

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
