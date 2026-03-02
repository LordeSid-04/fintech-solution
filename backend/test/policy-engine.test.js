const test = require("node:test");
const assert = require("node:assert/strict");
const { decideGate } = require("../src/lib/policy-engine");

const noFindings = [];

test("assist mode requires approval even for low risk", () => {
  const withoutApproval = decideGate({
    confidenceMode: "assist",
    riskScore: 10,
    findings: noFindings,
    approvals: [],
  });
  assert.equal(withoutApproval.gateDecision, "NEEDS_APPROVAL");

  const withApproval = decideGate({
    confidenceMode: "assist",
    riskScore: 10,
    findings: noFindings,
    approvals: [{ approverId: "human-a", approvedAt: new Date().toISOString() }],
  });
  assert.equal(withApproval.gateDecision, "ALLOWED");
});

test("pair mode allows low, gates medium, blocks high", () => {
  const low = decideGate({
    confidenceMode: "pair",
    riskScore: 20,
    findings: noFindings,
    approvals: [],
  });
  assert.equal(low.gateDecision, "ALLOWED");

  const medium = decideGate({
    confidenceMode: "pair",
    riskScore: 50,
    findings: [{ severity: "MED" }],
    approvals: [],
  });
  assert.equal(medium.gateDecision, "NEEDS_APPROVAL");

  const high = decideGate({
    confidenceMode: "pair",
    riskScore: 80,
    findings: [{ severity: "HIGH" }],
    approvals: [{ approverId: "human-a", approvedAt: new Date().toISOString() }],
  });
  assert.equal(high.gateDecision, "BLOCKED");
});

test("autopilot mode gates high and blocks critical without break-glass", () => {
  const high = decideGate({
    confidenceMode: "autopilot",
    riskScore: 82,
    findings: [{ severity: "HIGH" }],
    approvals: [],
  });
  assert.equal(high.gateDecision, "NEEDS_APPROVAL");

  const criticalBlocked = decideGate({
    confidenceMode: "autopilot",
    riskScore: 95,
    findings: [{ severity: "CRITICAL" }],
    approvals: [{ approverId: "human-a", approvedAt: new Date().toISOString() }],
  });
  assert.equal(criticalBlocked.gateDecision, "BLOCKED");

  const criticalOverridden = decideGate({
    confidenceMode: "autopilot",
    riskScore: 95,
    findings: [{ severity: "CRITICAL" }],
    approvals: [
      { approverId: "human-a", approvedAt: new Date().toISOString() },
      { approverId: "human-b", approvedAt: new Date().toISOString() },
    ],
    breakGlass: {
      reason: "Emergency patch required",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      postActionReviewRequired: true,
    },
  });
  assert.equal(criticalOverridden.gateDecision, "ALLOWED");
});

test("autopilot high risk enforces two distinct approvers", () => {
  const oneApprover = decideGate({
    confidenceMode: "autopilot",
    artifactType: "deploy",
    riskScore: 75,
    findings: [{ severity: "HIGH" }],
    approvals: [{ approverId: "human-a", approvedAt: new Date().toISOString() }],
  });
  assert.equal(oneApprover.gateDecision, "NEEDS_APPROVAL");
  assert.ok(oneApprover.reasonCodes.includes("TWO_PERSON_RULE_REQUIRED"));
});

test("break-glass is blocked when expiry is in past", () => {
  const decision = decideGate({
    confidenceMode: "autopilot",
    riskScore: 95,
    findings: [{ severity: "CRITICAL" }],
    approvals: [
      { approverId: "human-a", approvedAt: new Date().toISOString() },
      { approverId: "human-b", approvedAt: new Date().toISOString() },
    ],
    breakGlass: {
      reason: "Urgent incident response",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      postActionReviewRequired: true,
    },
  });
  assert.equal(decision.gateDecision, "BLOCKED");
  assert.ok(decision.reasonCodes.includes("BREAK_GLASS_INVALID"));
});
