const { callCodex } = require("../lib/codex-client");
const { toStringArray } = require("../lib/normalize");

async function runVerifierAgent({ userRequest, diffArtifact }) {
  const systemPrompt =
    "You are VERIFIER. Return strict JSON only with keys: testsToAdd, commands, dryRunResults. Include unit/lint checks.";
  const userPrompt = `Task:\n${userRequest}\n\nDiff artifact:\n${JSON.stringify(diffArtifact, null, 2)}\n\nGenerate test artifact.`;
  const codex = await callCodex({
    agentRole: "VERIFIER",
    systemPrompt,
    userPrompt,
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
