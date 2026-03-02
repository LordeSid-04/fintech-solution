const { callCodex } = require("../lib/codex-client");
const { toStringArray } = require("../lib/normalize");

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

async function runArchitectAgent({ userRequest, currentFiles = {} }) {
  const systemPrompt =
    "You are ARCHITECT. Return strict JSON only with keys: systemComponents, filesToTouch, constraints, riskForecast.";
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
  });

  const fallback = {
    systemComponents: ["orchestrator", "agent adapters", "risk engine", "policy gate", "audit ledger"],
    filesToTouch: ["backend/src/orchestrator.js", "backend/src/agents/*.js", "backend/src/lib/*.js"],
    constraints: [
      "Generate unified diff artifacts, not direct write actions",
      "Capture Codex proof metadata on every model call",
      "Use append-only evidence ledger events",
    ],
    riskForecast: {
      pii: false,
      auth: true,
      destructiveOps: false,
      notes: ["Security scanner and risk scoring required before merge/deploy gates."],
    },
  };

  return {
    artifact: normalizeArchitectArtifact(codex.parsed || fallback),
    proof: codex.proof,
    modelText: codex.text,
  };
}

module.exports = {
  runArchitectAgent,
};
