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

test("pipeline uses direct non-agent path at 0 percent", async () => {
  const result = await runPipeline({
    prompt: "Explain this function and suggest a tiny fix. Also check for token logging risk.",
    actor: "test-user",
    confidenceMode: "assist",
    confidencePercent: 0,
    projectFiles: {
      "src/example.ts": "export function square(x:number){ return x * 2; }\nconsole.log(headers.authorization);",
    },
  });

  assert.ok(result.runId);
  assert.equal(result.blocked, false);
  assert.ok(Array.isArray(result.proofs));
  assert.equal(result.proofs.length, 1);
  assert.equal(result.proofs[0].proof.agentRole, "DEVELOPER");
  assert.equal(result.gate.reasonCodes[0], "DIRECT_MODEL_NO_AGENT");
  assert.ok(typeof result.gate.riskScore === "number");
  assert.ok(Array.isArray(result.findings));
  assert.ok(result.artifacts?.diff?.contentFlags !== undefined);
});

test("pipeline uses direct non-agent path at 50 percent", async () => {
  const result = await runPipeline({
    prompt: "Propose a patch to fix this bug safely",
    actor: "test-user",
    confidenceMode: "pair",
    confidencePercent: 50,
    projectFiles: {
      "src/math.ts": "export function cube(x:number){ return x * 3; }",
    },
  });

  assert.ok(result.runId);
  assert.equal(result.blocked, false);
  assert.ok(Array.isArray(result.timeline));
  assert.equal(result.timeline.length, 1);
  assert.equal(result.gate.reasonCodes[0], "DIRECT_MODEL_NO_AGENT");
  assert.ok(typeof result.gate.riskScore === "number");
});

test("pair direct mode returns scoped fix artifact for selected function correction", async () => {
  const scopedPrompt = [
    "Execution mode: Pair (50%)",
    "Selected file: src/math.py",
    "Selected text scope:",
    "```",
    "def square(x):",
    "  return x * 2",
    "```",
    "",
    "User request: generate corrected version of this function",
  ].join("\n");

  const result = await runPipeline({
    prompt: scopedPrompt,
    actor: "test-user",
    confidenceMode: "pair",
    confidencePercent: 50,
    projectFiles: {
      "src/math.py": "def square(x):\n  return x * 2\nprint(square(3))",
    },
  });

  const files = result.artifacts?.diff?.generatedFiles || {};
  assert.ok(Object.keys(files).length >= 1);
  assert.ok(String(files["src/math.py"] || "").includes("** 2"));
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
