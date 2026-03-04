const { callCodex } = require("../lib/codex-client");
const { toStringArray } = require("../lib/normalize");

const OPERATOR_RESPONSE_SCHEMA = {
  name: "operator_artifact",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      deployPlan: { type: "array", items: { type: "string" } },
      rolloutSteps: { type: "array", items: { type: "string" } },
      rollbackPlan: { type: "array", items: { type: "string" } },
      readinessChecks: { type: "array", items: { type: "string" } },
    },
    required: ["deployPlan", "rolloutSteps", "rollbackPlan", "readinessChecks"],
  },
};

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

async function runOperatorAgent({ userRequest, diffArtifact }) {
  const systemPrompt = [
    "You are OPERATOR in a governed SDLC pipeline.",
    "Output rollout/rollback and operational readiness only.",
    "Return strict JSON only with keys: deployPlan, rolloutSteps, rollbackPlan, readinessChecks.",
    "Always include staging-first rollout and an explicit rollback path.",
  ].join(" ");
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
    responseSchema: OPERATOR_RESPONSE_SCHEMA,
    timeoutMsOverride: parsePositiveInt(process.env.OPERATOR_MODEL_TIMEOUT_MS, 10000),
    maxAttemptsOverride: parsePositiveInt(process.env.OPERATOR_MODEL_MAX_ATTEMPTS, 1),
  });
  if (!codex.parsed || typeof codex.parsed !== "object") {
    throw new Error("OPERATOR returned invalid structured output.");
  }

  return {
    artifact: {
      deployPlan: toStringArray(codex.parsed.deployPlan, []),
      rolloutSteps: toStringArray(codex.parsed.rolloutSteps, []),
      rollbackPlan: toStringArray(codex.parsed.rollbackPlan, []),
      readinessChecks: toStringArray(codex.parsed.readinessChecks, []),
    },
    proof: codex.proof,
    modelText: codex.text,
  };
}

module.exports = {
  runOperatorAgent,
};
