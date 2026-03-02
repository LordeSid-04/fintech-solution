const SECRET_PATTERNS = [
  { ruleName: "SECRET-OPENAI-001", regex: /sk-[a-zA-Z0-9]{20,}/g, title: "Potential OpenAI key exposed" },
  { ruleName: "SECRET-AWS-002", regex: /AKIA[0-9A-Z]{16}/g, title: "Potential AWS access key exposed" },
  { ruleName: "SECRET-GITHUB-003", regex: /ghp_[a-zA-Z0-9]{20,}/g, title: "Potential GitHub token exposed" },
];

const DANGEROUS_DIFF_RULES = [
  {
    ruleName: "DIFF-SQL-001",
    regex: /\bDROP\s+TABLE\b/i,
    title: "DROP TABLE detected",
    severity: "CRITICAL",
  },
  {
    ruleName: "DIFF-SQL-002",
    regex: /\bDELETE\s+FROM\b(?![\s\S]{0,120}\bWHERE\b)/i,
    title: "DELETE FROM without WHERE detected",
    severity: "CRITICAL",
  },
  {
    ruleName: "DIFF-AUTH-003",
    regex: /\b(auth|authorization)\b[\s\S]{0,40}\b(disabled|skip|bypass)\b/i,
    title: "Auth middleware bypass pattern detected",
    severity: "HIGH",
  },
  {
    ruleName: "DIFF-IAM-004",
    regex: /"Action"\s*:\s*"\*"\s*,\s*"Resource"\s*:\s*"\*"/i,
    title: "IAM wildcard permissions detected",
    severity: "HIGH",
  },
  {
    ruleName: "DIFF-LOG-005",
    regex: /(console\.log|logger\.(info|debug|warn))[\s\S]{0,120}\b(headers?|cookies?|token)\b/i,
    title: "Sensitive header/cookie/token logging pattern detected",
    severity: "HIGH",
  },
];

const HIGH_SENSITIVITY_TOUCHED_PATHS = [
  "auth",
  "authorization",
  "payment",
  "migration",
  "data",
  "db",
  "secret",
  "infra",
  "deploy",
  ".github",
  "ci",
];

const TRUST_BOUNDARY_RULES = [
  {
    ruleName: "BOUNDARY-EXEC-001",
    regex: /\b(exec|spawn|execSync|spawnSync)\s*\(/i,
    title: "Direct process execution introduced",
    severity: "HIGH",
  },
  {
    ruleName: "BOUNDARY-NET-002",
    regex: /\b(fetch|axios|http\.request|https\.request)\s*\(/i,
    title: "Network egress call introduced",
    severity: "MED",
  },
  {
    ruleName: "BOUNDARY-EVAL-003",
    regex: /\b(eval|new Function)\s*\(/i,
    title: "Dynamic code execution pattern introduced",
    severity: "CRITICAL",
  },
];

const POLICY_DRIFT_RULES = [
  {
    ruleName: "POLICY-APPROVAL-001",
    regex: /-\s*.*(approvalsNeeded|hasTwoDistinctApprovals|human-review)/i,
    title: "Approval-related policy appears to be removed",
    severity: "HIGH",
  },
  {
    ruleName: "POLICY-BREAKGLASS-002",
    regex: /-\s*.*(breakGlass|postActionReviewRequired|expiresAt)/i,
    title: "Break-glass safeguard appears to be removed",
    severity: "HIGH",
  },
];

function createFinding({
  id,
  severity,
  title,
  ruleName,
  filePath,
  lineNumber,
  evidence,
  category = "dangerous-diff",
  confidence = "MEDIUM",
  riskContribution = 10,
}) {
  return {
    id,
    severity,
    title,
    ruleName,
    filePath,
    lineNumber,
    evidence,
    category,
    confidence,
    riskContribution,
    suggestedFixSnippet: "// remove sensitive content and add scoped, redacted logging",
  };
}

function scanTextForSecrets(content, filePath = "inline-content") {
  const lines = String(content || "").split("\n");
  const findings = [];
  let counter = 0;

  lines.forEach((line, idx) => {
    SECRET_PATTERNS.forEach((pattern) => {
      if (pattern.regex.test(line)) {
        counter += 1;
        findings.push(
          createFinding({
            id: `finding-secret-${counter}`,
            severity: "CRITICAL",
            title: pattern.title,
            ruleName: pattern.ruleName,
            filePath,
            lineNumber: idx + 1,
            evidence: line.trim(),
            category: "secret",
            confidence: "HIGH",
            riskContribution: 35,
          })
        );
      }
      pattern.regex.lastIndex = 0;
    });
  });

  return findings;
}

function scanUnifiedDiff(diffText) {
  const lines = String(diffText || "").split("\n");
  const findings = [];
  let counter = 0;

  lines.forEach((line, idx) => {
    if (!line.startsWith("+") || line.startsWith("+++")) {
      return;
    }

    DANGEROUS_DIFF_RULES.forEach((rule) => {
      if (rule.regex.test(line)) {
        counter += 1;
        findings.push(
          createFinding({
            id: `finding-diff-${counter}`,
            severity: rule.severity,
            title: rule.title,
            ruleName: rule.ruleName,
            filePath: extractPathFromDiffContext(lines, idx) || "unknown",
            lineNumber: idx + 1,
            evidence: line,
            category: "dangerous-diff",
            confidence: "HIGH",
            riskContribution: rule.severity === "CRITICAL" ? 30 : 20,
          })
        );
      }
      rule.regex.lastIndex = 0;
    });
  });

  return findings;
}

function scanIntentDrift({ declaredIntent = "", filesTouched = [], diffText = "" }) {
  const normalizedIntent = String(declaredIntent || "").toLowerCase();
  const intentLooksLowRisk =
    /(ui|text|copy|docs?|readme|refactor comments?)/i.test(normalizedIntent) &&
    !/(auth|payment|migration|data|deploy|infra|secret)/i.test(normalizedIntent);

  if (!intentLooksLowRisk) {
    return [];
  }

  const touched = Array.isArray(filesTouched) ? filesTouched : [];
  const highRiskTouched = touched.find((filePath) => {
    const normalized = String(filePath || "").toLowerCase();
    return HIGH_SENSITIVITY_TOUCHED_PATHS.some((token) => normalized.includes(token));
  });

  if (!highRiskTouched) {
    return [];
  }

  return [
    createFinding({
      id: "finding-intent-1",
      severity: "HIGH",
      title: "Declared low-risk intent does not match high-risk file changes",
      ruleName: "INTENT-DRIFT-001",
      filePath: highRiskTouched,
      lineNumber: 1,
      evidence: `Intent="${declaredIntent}" while touching "${highRiskTouched}"`,
      category: "intent-drift",
      confidence: "MEDIUM",
      riskContribution: 22,
    }),
  ];
}

function scanTrustBoundaries({ diffText = "" }) {
  const lines = String(diffText || "").split("\n");
  const findings = [];
  let counter = 0;

  lines.forEach((line, idx) => {
    if (!line.startsWith("+") || line.startsWith("+++")) return;
    TRUST_BOUNDARY_RULES.forEach((rule) => {
      if (rule.regex.test(line)) {
        counter += 1;
        findings.push(
          createFinding({
            id: `finding-boundary-${counter}`,
            severity: rule.severity,
            title: rule.title,
            ruleName: rule.ruleName,
            filePath: extractPathFromDiffContext(lines, idx) || "unknown",
            lineNumber: idx + 1,
            evidence: line,
            category: "trust-boundary",
            confidence: "MEDIUM",
            riskContribution: rule.severity === "CRITICAL" ? 30 : 14,
          })
        );
      }
      rule.regex.lastIndex = 0;
    });
  });

  return findings;
}

function scanPolicyDrift(diffText) {
  const lines = String(diffText || "").split("\n");
  const findings = [];
  let counter = 0;

  lines.forEach((line, idx) => {
    POLICY_DRIFT_RULES.forEach((rule) => {
      if (rule.regex.test(line)) {
        counter += 1;
        findings.push(
          createFinding({
            id: `finding-policy-${counter}`,
            severity: rule.severity,
            title: rule.title,
            ruleName: rule.ruleName,
            filePath: extractPathFromDiffContext(lines, idx) || "unknown",
            lineNumber: idx + 1,
            evidence: line,
            category: "policy-drift",
            confidence: "MEDIUM",
            riskContribution: 18,
          })
        );
      }
      rule.regex.lastIndex = 0;
    });
  });

  return findings;
}

function runSafetyScanners({ diffText = "", filesTouched = [], declaredIntent = "" }) {
  const dangerousFindings = scanUnifiedDiff(diffText);
  const trustBoundaryFindings = scanTrustBoundaries({ diffText });
  const policyDriftFindings = scanPolicyDrift(diffText);
  const intentDriftFindings = scanIntentDrift({ declaredIntent, filesTouched, diffText });

  return [
    ...dangerousFindings,
    ...trustBoundaryFindings,
    ...policyDriftFindings,
    ...intentDriftFindings,
  ];
}

function extractPathFromDiffContext(lines, currentIdx) {
  for (let i = currentIdx; i >= 0; i -= 1) {
    if (lines[i].startsWith("+++ b/")) {
      return lines[i].replace("+++ b/", "").trim();
    }
  }
  return "";
}

module.exports = {
  scanTextForSecrets,
  scanUnifiedDiff,
  scanIntentDrift,
  scanTrustBoundaries,
  scanPolicyDrift,
  runSafetyScanners,
};
