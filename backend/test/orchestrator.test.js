const test = require("node:test");
const assert = require("node:assert/strict");
const { runPipeline, streamPipeline } = require("../src/orchestrator");

test("pipeline returns timeline with governor proof metadata", async () => {
  const result = await runPipeline({
    prompt: "Add auth guard and risk checks to API pipeline",
    actor: "test-user",
    approvals: [
      { approverId: "alice", approvedAt: new Date().toISOString() },
      { approverId: "bob", approvedAt: new Date().toISOString() },
    ],
  });

  assert.ok(result.runId);
  assert.ok(Array.isArray(result.timeline));
  assert.ok(result.timeline.length >= 2);
  assert.ok(Array.isArray(result.proofs));
  assert.ok(result.proofs.every((item) => item.proof.provider));
  assert.ok(result.gate.riskCard);
  assert.ok(Array.isArray(result.gate.riskCard.requiredControls));
  assert.ok(result.gate.riskFactors);
  assert.ok(typeof result.gate.findingsByCategory === "object");
});

test("pipeline emits usable diff lines for generated files", async () => {
  const result = await runPipeline({
    prompt: "build an AI chatbot for me please",
    actor: "test-user",
    confidenceMode: "autopilot",
    confidencePercent: 100,
  });

  assert.ok(Array.isArray(result.diffLines));
  assert.ok(result.diffLines.length > 0);
  assert.ok(result.diffLines.some((line) => line.content.trim().length > 0));
  assert.ok(
    result.diffLines.some(
      (line) => line.kind === "add" || line.content.includes("diff --git") || line.content.includes("+++")
    )
  );
});

test("stream pipeline emits human control requirement events", async () => {
  const seenEventTypes = [];
  await streamPipeline({
    prompt: "Change auth middleware and add deployment script",
    actor: "test-user",
    confidenceMode: "assist",
    approvals: [],
    confidencePercent: 70,
    breakGlass: {
      reason: "Emergency mitigation",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      postActionReviewRequired: true,
    },
    projectFiles: {},
    emitEvent: (event) => {
      seenEventTypes.push(event.type);
    },
  });
  assert.ok(seenEventTypes.includes("control_required"));
});
