const { callCodex } = require("../lib/codex-client");
const { toStringArray } = require("../lib/normalize");

const ARCHITECT_RESPONSE_SCHEMA = {
  name: "architect_artifact",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      systemComponents: { type: "array", items: { type: "string" } },
      filesToTouch: { type: "array", items: { type: "string" } },
      constraints: { type: "array", items: { type: "string" } },
      riskForecast: {
        type: "object",
        additionalProperties: false,
        properties: {
          pii: { type: "boolean" },
          auth: { type: "boolean" },
          destructiveOps: { type: "boolean" },
          notes: { type: "array", items: { type: "string" } },
        },
        required: ["pii", "auth", "destructiveOps", "notes"],
      },
    },
    required: ["systemComponents", "filesToTouch", "constraints", "riskForecast"],
  },
};

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeArchitectArtifact(raw) {
  const riskForecast = raw?.riskForecast && typeof raw.riskForecast === "object"
    ? raw.riskForecast
    : { pii: false, auth: false, destructiveOps: false, notes: [] };

  return {
    systemComponents: toStringArray(raw?.systemComponents, []),
    filesToTouch: toStringArray(raw?.filesToTouch, []),
    constraints: toStringArray(raw?.constraints, []),
    riskForecast: {
      pii: Boolean(riskForecast.pii),
      auth: Boolean(riskForecast.auth),
      destructiveOps: Boolean(riskForecast.destructiveOps),
      notes: toStringArray(riskForecast.notes, []),
    },
  };
}

async function runArchitectAgent({ userRequest, currentFiles = {}, confidenceMode = "pair" }) {
  const systemPrompt = [
    "You are ARCHITECT in a governed SDLC pipeline.",
    "Focus only on architecture plan and threat/risk considerations.",
    "Do not output code.",
    "Return strict JSON only with keys: systemComponents, filesToTouch, constraints, riskForecast.",
  ].join(" ");
  const knownFiles = Object.keys(currentFiles).slice(0, 80);
  const userPrompt = `User request:\n${userRequest}\n\nCurrent project files:\n${JSON.stringify(
    knownFiles,
    null,
    2
  )}\n\nProduce a plan artifact for a governed SDLC multi-agent pipeline.`;
  const codex = await callCodex({
    agentRole: "ARCHITECT",
    systemPrompt,
    userPrompt,
    responseSchema: ARCHITECT_RESPONSE_SCHEMA,
    timeoutMsOverride:
      confidenceMode === "autopilot"
        ? 0
        : parseNonNegativeInt(process.env.ARCHITECT_MODEL_TIMEOUT_MS, 12000),
    maxAttemptsOverride: parsePositiveInt(process.env.ARCHITECT_MODEL_MAX_ATTEMPTS, 1),
  });
  if (!codex.parsed || typeof codex.parsed !== "object") {
    throw new Error("ARCHITECT returned invalid structured output.");
  }

  return {
    artifact: normalizeArchitectArtifact(codex.parsed),
    proof: codex.proof,
    modelText: codex.text,
  };
}

module.exports = {
  runArchitectAgent,
};
