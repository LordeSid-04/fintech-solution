const { callCodex } = require("../lib/codex-client");
const { toStringArray } = require("../lib/normalize");

async function runOperatorAgent({ userRequest, diffArtifact }) {
  const systemPrompt =
    "You are OPERATOR. Return strict JSON only with keys: deployPlan, rolloutSteps, rollbackPlan, readinessChecks.";
  const userPrompt = `Task:\n${userRequest}\n\nDiff summary:\n${JSON.stringify(
    {
      filesTouched: diffArtifact.filesTouched,
      rationale: diffArtifact.rationale,
    },
    null,
    2
  )}\n\nProduce staging-first rollout and rollback artifact.`;
  const codex = await callCodex({
    agentRole: "OPERATOR",
    systemPrompt,
    userPrompt,
  });

  const fallback = {
    deployPlan: ["Deploy to staging", "Run smoke checks", "Gate on governor approval before production"],
    rolloutSteps: ["10% canary", "50% rollout", "100% rollout with monitoring"],
    rollbackPlan: ["Revert deployment artifact", "Replay last known-good config", "validate health + audit"],
    readinessChecks: ["All tests green", "No blocked scanner findings", "Two-person approval present for high risk"],
  };

  return {
    artifact: {
      deployPlan: toStringArray((codex.parsed || fallback).deployPlan, fallback.deployPlan),
      rolloutSteps: toStringArray((codex.parsed || fallback).rolloutSteps, fallback.rolloutSteps),
      rollbackPlan: toStringArray((codex.parsed || fallback).rollbackPlan, fallback.rollbackPlan),
      readinessChecks: toStringArray((codex.parsed || fallback).readinessChecks, fallback.readinessChecks),
    },
    proof: codex.proof,
    modelText: codex.text,
  };
}

module.exports = {
  runOperatorAgent,
};
