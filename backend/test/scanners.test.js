const test = require("node:test");
const assert = require("node:assert/strict");
const {
  scanUnifiedDiff,
  scanTextForSecrets,
  scanIntentDrift,
  scanTrustBoundaries,
  scanPolicyDrift,
} = require("../src/lib/scanners");

test("scanUnifiedDiff flags dangerous SQL and logging patterns", () => {
  const diff = [
    "--- a/src/api/run.js",
    "+++ b/src/api/run.js",
    "@@",
    "+DELETE FROM users",
    "+logger.debug('headers', headers)",
  ].join("\n");

  const findings = scanUnifiedDiff(diff);
  assert.equal(findings.length, 2);
  assert.ok(findings.some((f) => f.ruleName === "DIFF-SQL-002"));
  assert.ok(findings.some((f) => f.ruleName === "DIFF-LOG-005"));
});

test("scanTextForSecrets flags key-like patterns", () => {
  const content = "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456";
  const findings = scanTextForSecrets(content, ".env");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleName, "SECRET-OPENAI-001");
});

test("scanIntentDrift flags low-risk intent touching high-risk paths", () => {
  const findings = scanIntentDrift({
    declaredIntent: "update UI text on workspace page",
    filesTouched: ["backend/src/auth/middleware.js"],
    diffText: "",
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleName, "INTENT-DRIFT-001");
});

test("scanTrustBoundaries flags dynamic execution additions", () => {
  const diff = [
    "--- a/src/tasks/run.js",
    "+++ b/src/tasks/run.js",
    "@@",
    "+const { exec } = require('node:child_process')",
    "+exec(userInput)",
  ].join("\n");
  const findings = scanTrustBoundaries({ diffText: diff });
  assert.ok(findings.some((item) => item.ruleName === "BOUNDARY-EXEC-001"));
});

test("scanPolicyDrift flags removed approval checks", () => {
  const diff = [
    "--- a/src/lib/policy-engine.js",
    "+++ b/src/lib/policy-engine.js",
    "@@",
    "-  approvalsNeeded: ['human-review']",
  ].join("\n");
  const findings = scanPolicyDrift(diff);
  assert.ok(findings.some((item) => item.ruleName === "POLICY-APPROVAL-001"));
});
