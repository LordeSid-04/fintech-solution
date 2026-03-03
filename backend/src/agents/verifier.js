const { callCodex } = require("../lib/codex-client");
const { toStringArray } = require("../lib/normalize");

const VERIFIER_RESPONSE_SCHEMA = {
  name: "verifier_artifact",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      testsToAdd: { type: "array", items: { type: "string" } },
      commands: { type: "array", items: { type: "string" } },
      dryRunResults: { type: "array", items: { type: "string" } },
    },
    required: ["testsToAdd", "commands", "dryRunResults"],
  },
};

async function runVerifierAgent({ userRequest, diffArtifact }) {
  const systemPrompt = [
    "You are VERIFIER in a governed SDLC pipeline.",
    "Output tests and execution evidence only.",
    "Return strict JSON only with keys: testsToAdd, commands, dryRunResults.",
    "Include at least one unit test and at least one runnable verification command.",
  ].join(" ");
  const userPrompt = `Task:\n${userRequest}\n\nDiff artifact:\n${JSON.stringify(diffArtifact, null, 2)}\n\nGenerate test artifact.`;
  const codex = await callCodex({
    agentRole: "VERIFIER",
    systemPrompt,
    userPrompt,
    responseSchema: VERIFIER_RESPONSE_SCHEMA,
  });

  const fallback = {
    testsToAdd: [
      "orchestrator pipeline order test",
      "governor scanner gate decision test",
      "ledger append-only audit test",
    ],
    commands: ["npm test", "npm run lint"],
    dryRunResults: ["lint: skipped in demo backend", "unit: pending run by user/CI"],
  };

  return {
    artifact: {
      testsToAdd: toStringArray((codex.parsed || fallback).testsToAdd, fallback.testsToAdd),
      commands: toStringArray((codex.parsed || fallback).commands, fallback.commands),
      dryRunResults: toStringArray((codex.parsed || fallback).dryRunResults, fallback.dryRunResults),
    },
    proof: codex.proof,
    modelText: codex.text,
  };
}

module.exports = {
  runVerifierAgent,
};
