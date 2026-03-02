const { runArchitectAgent } = require("./agents/architect");
const { runDeveloperAgent } = require("./agents/developer");
const { runVerifierAgent } = require("./agents/verifier");
const { runOperatorAgent } = require("./agents/operator");
const { runGovernorAgent } = require("./agents/governor");
const { appendLedgerEvent, buildLedgerEvent } = require("./lib/evidence-ledger");

function toTitleRole(role) {
  return role[0] + role.slice(1).toLowerCase();
}

function toTimelineArtifactType(stage) {
  if (stage === "plan") return "plan";
  if (stage === "diff") return "diff";
  if (stage === "test") return "test";
  return "securityReport";
}

function buildUnifiedDiffFromGeneratedFiles(generatedFiles) {
  if (!generatedFiles || typeof generatedFiles !== "object") {
    return "";
  }
  const entries = Object.entries(generatedFiles);
  if (!entries.length) {
    return "";
  }

  const chunks = [];
  const maxFiles = 8;
  const maxLinesPerFile = 120;

  for (const [filePath, content] of entries.slice(0, maxFiles)) {
    const lines = String(content || "").split("\n");
    const limited = lines.slice(0, maxLinesPerFile);
    chunks.push(`diff --git a/${filePath} b/${filePath}`);
    chunks.push("new file mode 100644");
    chunks.push("--- /dev/null");
    chunks.push(`+++ b/${filePath}`);
    chunks.push(`@@ -0,0 +1,${limited.length} @@`);
    for (const line of limited) {
      chunks.push(`+${line}`);
    }
    if (lines.length > limited.length) {
      chunks.push(`+// ... truncated ${lines.length - limited.length} additional line(s)`);
    }
    chunks.push("");
  }

  return chunks.join("\n").trim();
}

function ensureUnifiedDiff(artifact) {
  const provided = String(artifact?.unifiedDiff || "").trim();
  if (provided) {
    return provided;
  }
  return buildUnifiedDiffFromGeneratedFiles(artifact?.generatedFiles);
}

function buildDiffLines(unifiedDiff, findings) {
  const normalizedDiff = String(unifiedDiff || "").trim();
  if (!normalizedDiff) {
    return [];
  }
  const findingMap = new Map(findings.map((item) => [item.lineNumber, item.id]));
  return normalizedDiff
    .split("\n")
    .map((line, idx) => {
      let kind = "context";
      if (line.startsWith("+")) kind = "add";
      if (line.startsWith("-")) kind = "remove";
      const findingId = findingMap.get(idx + 1);
      return {
        lineNumber: idx + 1,
        kind,
        content: line,
        findingIds: findingId ? [findingId] : [],
      };
    });
}

function truncateForLog(value, limit = 1800) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...truncated...`;
}

function summarizeIntent(prompt) {
  const text = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!text) return "No declared intent";
  return text.slice(0, 180);
}

function toEventEmitter(emitEvent) {
  return typeof emitEvent === "function" ? emitEvent : () => {};
}

function mapFindings(findings) {
  return findings.map((item) => ({
    id: item.id,
    severity: item.severity,
    title: item.title,
    ruleName: item.ruleName,
    category: item.category,
    confidence: item.confidence,
    lineNumber: item.lineNumber,
    evidence: item.evidence,
    suggestedFixSnippet: item.suggestedFixSnippet,
  }));
}

function summarizeArchitectArtifact(artifact) {
  const components = (artifact.systemComponents || []).slice(0, 3).join(", ");
  const fileCount = Array.isArray(artifact.filesToTouch) ? artifact.filesToTouch.length : 0;
  return [
    "Draft plan ready.",
    components ? `Focus areas: ${components}.` : "",
    `Planned file targets: ${fileCount}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function summarizeDeveloperArtifact(artifact) {
  const files = artifact.generatedFiles && typeof artifact.generatedFiles === "object"
    ? Object.keys(artifact.generatedFiles)
    : [];
  const topFiles = files.slice(0, 5).join(", ");
  return [
    "Implementation draft generated.",
    files.length ? `Created/updated ${files.length} file(s).` : "Prepared a patch proposal.",
    topFiles ? `Top files: ${topFiles}.` : "",
    artifact.assistantReply ? `Assistant: ${artifact.assistantReply}` : "",
    artifact.rationale ? `Why: ${artifact.rationale}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function summarizeVerifierArtifact(artifact) {
  const commands = (artifact.commands || []).slice(0, 3).join(", ");
  return [
    "Validation plan prepared.",
    commands ? `Checks: ${commands}.` : "",
    artifact.dryRunResults?.length ? `Latest status: ${artifact.dryRunResults[0]}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function summarizeOperatorArtifact(artifact) {
  return [
    "Rollout plan drafted.",
    artifact.deployPlan?.[0] ? `Next step: ${artifact.deployPlan[0]}` : "",
    artifact.rollbackPlan?.[0] ? `Rollback: ${artifact.rollbackPlan[0]}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function summarizeGovernorArtifact(artifact) {
  const reasons = artifact.blockReasons?.length ? `Reason: ${artifact.blockReasons[0]}` : "";
  const controls = artifact.riskCard?.requiredControls?.length
    ? `Controls: ${artifact.riskCard.requiredControls.join(", ")}.`
    : "";
  return [
    `Safety gate: ${artifact.gateDecision}.`,
    `Risk score: ${artifact.riskScore} (${artifact.riskTier || "N/A"}).`,
    reasons,
    controls,
  ]
    .filter(Boolean)
    .join(" ");
}

function emitControlRequirements(emit, artifact) {
  const required = new Set([...(artifact.approvalsNeeded || []), ...(artifact.riskCard?.requiredControls || [])]);
  if (!required.size) return;
  emit({
    type: "control_required",
    controls: Array.from(required),
    gateDecision: artifact.gateDecision,
    riskScore: artifact.riskScore,
  });
}

async function executePipeline({
  prompt,
  actor = "demo-user",
  approvals = [],
  breakGlass,
  confidenceMode = "pair",
  confidencePercent,
  projectFiles = {},
  emitEvent,
}) {
  const emit = toEventEmitter(emitEvent);
  const timeline = [];
  const proofs = [];
  const artifacts = {};
  const runStartedAt = Date.now();
  const runId = `run-${runStartedAt}`;

  emit({
    type: "run_started",
    runId,
    timestamp: new Date().toISOString(),
    confidenceMode,
    confidencePercent,
  });
  emit({
    type: "stage_started",
    agentRole: "ARCHITECT",
    stage: "plan",
    message: "Planning the architecture and file strategy...",
  });

  const architect = await runArchitectAgent({ userRequest: prompt, currentFiles: projectFiles });
  artifacts.plan = architect.artifact;
  proofs.push({ step: "architect", proof: architect.proof });
  emit({
    type: "agent_output",
    agentRole: "ARCHITECT",
    stage: "plan",
    content: truncateForLog(summarizeArchitectArtifact(architect.artifact)),
    proof: architect.proof,
  });

  emit({
    type: "stage_started",
    agentRole: "GOVERNOR",
    stage: "after-plan",
    message: "Running policy and risk checks on the plan...",
  });
  const govAfterPlan = await runGovernorAgent({
    stageName: "after-plan",
    actor,
    confidenceMode,
    artifactType: "plan",
    diffText: "",
    filesTouched: architect.artifact.filesToTouch || [],
    approvals,
    breakGlass,
    declaredIntent: summarizeIntent(prompt),
    confidencePercent,
    testSignals: { hasVerifierEvidence: false, testCount: 0 },
  });
  proofs.push({ step: "governor-after-plan", proof: govAfterPlan.proof });
  timeline.push({
    id: "step-plan",
    agentRole: toTitleRole("ARCHITECT"),
    artifactType: toTimelineArtifactType("plan"),
    riskScore: govAfterPlan.artifact.riskScore,
    gateDecision: govAfterPlan.artifact.gateDecision,
    timestamp: new Date().toISOString(),
    linkedFindingIds: govAfterPlan.artifact.findings.map((item) => item.id),
  });
  emit({
    type: "timeline_step",
    step: timeline[timeline.length - 1],
  });
  emit({
    type: "agent_output",
    agentRole: "GOVERNOR",
    stage: "after-plan",
    content: truncateForLog(summarizeGovernorArtifact(govAfterPlan.artifact)),
    proof: govAfterPlan.proof,
  });
  emitControlRequirements(emit, govAfterPlan.artifact);

  emit({
    type: "stage_started",
    agentRole: "DEVELOPER",
    stage: "diff",
    message: "Generating implementation patch and starter files...",
  });
  let developer = await runDeveloperAgent({
    userRequest: prompt,
    planArtifact: architect.artifact,
    currentFiles: projectFiles,
    confidenceMode,
  });
  const isBuildPrompt = /(build|create|website|web app|application|portfolio|landing page|frontend)/i.test(
    String(prompt || "")
  );
  let generatedFilesCount =
    developer.artifact.generatedFiles && typeof developer.artifact.generatedFiles === "object"
      ? Object.keys(developer.artifact.generatedFiles).length
      : 0;
  if (isBuildPrompt && generatedFilesCount < 5) {
    const continuation = await runDeveloperAgent({
      userRequest: `${prompt}\n\nContinue implementation to fully satisfy this request. Add missing files and complete project structure.`,
      planArtifact: architect.artifact,
      currentFiles: {
        ...(projectFiles || {}),
        ...(developer.artifact.generatedFiles || {}),
      },
      confidenceMode,
    });
    developer = {
      ...continuation,
      artifact: {
        ...continuation.artifact,
        generatedFiles: {
          ...(developer.artifact.generatedFiles || {}),
          ...(continuation.artifact.generatedFiles || {}),
        },
      },
    };
    generatedFilesCount = Object.keys(developer.artifact.generatedFiles || {}).length;
    emit({
      type: "agent_output",
      agentRole: "DEVELOPER",
      stage: "diff-continuation",
      content: `Continuation pass complete. Total generated files: ${generatedFilesCount}.`,
      proof: continuation.proof,
    });
  }
  artifacts.diff = developer.artifact;
  const effectiveUnifiedDiff = ensureUnifiedDiff(developer.artifact);
  developer.artifact.unifiedDiff = effectiveUnifiedDiff;
  proofs.push({ step: "developer", proof: developer.proof });
  emit({
    type: "agent_output",
    agentRole: "DEVELOPER",
    stage: "diff",
    content: truncateForLog(summarizeDeveloperArtifact(developer.artifact)),
    proof: developer.proof,
  });
  if (developer.artifact.generatedFiles && typeof developer.artifact.generatedFiles === "object") {
    emit({
      type: "generated_files",
      files: developer.artifact.generatedFiles,
    });
  }
  if (developer.artifact.previewHtml) {
    emit({
      type: "generated_preview",
      html: developer.artifact.previewHtml,
    });
  }

  emit({
    type: "stage_started",
    agentRole: "GOVERNOR",
    stage: "after-diff",
    message: "Scanning generated changes for safety issues...",
  });
  const govAfterDiff = await runGovernorAgent({
    stageName: "after-diff",
    actor,
    confidenceMode,
    artifactType: "diff",
    diffText: effectiveUnifiedDiff,
    filesTouched: developer.artifact.filesTouched || [],
    approvals,
    breakGlass,
    declaredIntent: summarizeIntent(prompt),
    confidencePercent,
    testSignals: { hasVerifierEvidence: false, testCount: 0 },
  });
  proofs.push({ step: "governor-after-diff", proof: govAfterDiff.proof });
  timeline.push({
    id: "step-diff",
    agentRole: toTitleRole("DEVELOPER"),
    artifactType: toTimelineArtifactType("diff"),
    riskScore: govAfterDiff.artifact.riskScore,
    gateDecision: govAfterDiff.artifact.gateDecision,
    timestamp: new Date().toISOString(),
    linkedFindingIds: govAfterDiff.artifact.findings.map((item) => item.id),
  });
  emit({
    type: "timeline_step",
    step: timeline[timeline.length - 1],
  });
  emit({
    type: "agent_output",
    agentRole: "GOVERNOR",
    stage: "after-diff",
    content: truncateForLog(summarizeGovernorArtifact(govAfterDiff.artifact)),
    proof: govAfterDiff.proof,
  });
  emitControlRequirements(emit, govAfterDiff.artifact);

  if (govAfterDiff.artifact.gateDecision === "BLOCKED") {
    const blockedLedgerEvent = buildLedgerEvent({
      actor,
      agentRole: "GOVERNOR",
      actionType: "pipeline-blocked-after-diff",
      resourcesTouched: developer.artifact.filesTouched || [],
      diffText: effectiveUnifiedDiff,
      testOutputs: [],
      approvals,
      breakGlass,
      scannerSummary: govAfterDiff.artifact.findingsByCategory,
      riskCard: govAfterDiff.artifact.riskCard,
    });
    appendLedgerEvent(blockedLedgerEvent);
    const blockedResult = {
      runId,
      timeline,
      diffLines: buildDiffLines(effectiveUnifiedDiff, govAfterDiff.artifact.findings),
      findings: mapFindings(govAfterDiff.artifact.findings),
      proofs,
      artifacts,
      gate: govAfterDiff.artifact,
      blocked: true,
    };
    emit({
      type: "run_completed",
      result: blockedResult,
    });
    return blockedResult;
  }

  const verifier = await runVerifierAgent({
    userRequest: prompt,
    diffArtifact: developer.artifact,
  });
  artifacts.test = verifier.artifact;
  proofs.push({ step: "verifier", proof: verifier.proof });
  emit({
    type: "stage_started",
    agentRole: "VERIFIER",
    stage: "test",
    message: "Preparing tests and validation checks...",
  });
  emit({
    type: "agent_output",
    agentRole: "VERIFIER",
    stage: "test",
    content: truncateForLog(summarizeVerifierArtifact(verifier.artifact)),
    proof: verifier.proof,
  });

  emit({
    type: "stage_started",
    agentRole: "GOVERNOR",
    stage: "after-test",
    message: "Evaluating test stage risk posture...",
  });
  const govAfterTest = await runGovernorAgent({
    stageName: "after-test",
    actor,
    confidenceMode,
    artifactType: "test",
    diffText: effectiveUnifiedDiff,
    filesTouched: developer.artifact.filesTouched || [],
    approvals,
    breakGlass,
    declaredIntent: summarizeIntent(prompt),
    confidencePercent,
    testSignals: {
      hasVerifierEvidence: true,
      testCount: Array.isArray(verifier.artifact?.testsToAdd) ? verifier.artifact.testsToAdd.length : 0,
    },
  });
  proofs.push({ step: "governor-after-test", proof: govAfterTest.proof });
  timeline.push({
    id: "step-test",
    agentRole: toTitleRole("VERIFIER"),
    artifactType: toTimelineArtifactType("test"),
    riskScore: govAfterTest.artifact.riskScore,
    gateDecision: govAfterTest.artifact.gateDecision,
    timestamp: new Date().toISOString(),
    linkedFindingIds: govAfterTest.artifact.findings.map((item) => item.id),
  });
  emit({
    type: "timeline_step",
    step: timeline[timeline.length - 1],
  });
  emit({
    type: "agent_output",
    agentRole: "GOVERNOR",
    stage: "after-test",
    content: truncateForLog(summarizeGovernorArtifact(govAfterTest.artifact)),
    proof: govAfterTest.proof,
  });
  emitControlRequirements(emit, govAfterTest.artifact);

  const operator = await runOperatorAgent({
    userRequest: prompt,
    diffArtifact: developer.artifact,
  });
  artifacts.ops = operator.artifact;
  proofs.push({ step: "operator", proof: operator.proof });
  emit({
    type: "stage_started",
    agentRole: "OPERATOR",
    stage: "ops",
    message: "Drafting rollout and rollback plan...",
  });
  emit({
    type: "agent_output",
    agentRole: "OPERATOR",
    stage: "ops",
    content: truncateForLog(summarizeOperatorArtifact(operator.artifact)),
    proof: operator.proof,
  });

  emit({
    type: "stage_started",
    agentRole: "GOVERNOR",
    stage: "final-governor-gate",
    message: "Applying final governance gate...",
  });
  const finalGov = await runGovernorAgent({
    stageName: "final-governor-gate",
    actor,
    confidenceMode,
    artifactType: "diff",
    diffText: effectiveUnifiedDiff,
    filesTouched: developer.artifact.filesTouched || [],
    approvals,
    breakGlass,
    declaredIntent: summarizeIntent(prompt),
    confidencePercent,
    testSignals: {
      hasVerifierEvidence: true,
      testCount: Array.isArray(verifier.artifact?.testsToAdd) ? verifier.artifact.testsToAdd.length : 0,
    },
  });
  proofs.push({ step: "governor-final", proof: finalGov.proof });
  timeline.push({
    id: "step-ops",
    agentRole: toTitleRole("OPERATOR"),
    artifactType: "securityReport",
    riskScore: finalGov.artifact.riskScore,
    gateDecision: finalGov.artifact.gateDecision,
    timestamp: new Date().toISOString(),
    linkedFindingIds: finalGov.artifact.findings.map((item) => item.id),
  });
  timeline.push({
    id: "step-gate",
    agentRole: toTitleRole("GOVERNOR"),
    artifactType: "securityReport",
    riskScore: finalGov.artifact.riskScore,
    gateDecision: finalGov.artifact.gateDecision,
    timestamp: new Date().toISOString(),
    linkedFindingIds: finalGov.artifact.findings.map((item) => item.id),
  });
  emit({
    type: "timeline_step",
    step: timeline[timeline.length - 2],
  });
  emit({
    type: "timeline_step",
    step: timeline[timeline.length - 1],
  });
  emit({
    type: "agent_output",
    agentRole: "GOVERNOR",
    stage: "final-governor-gate",
    content: truncateForLog(summarizeGovernorArtifact(finalGov.artifact)),
    proof: finalGov.proof,
  });
  emitControlRequirements(emit, finalGov.artifact);

  const ledgerEvent = buildLedgerEvent({
    actor,
    agentRole: "GOVERNOR",
    actionType: `pipeline-run-completed:${confidenceMode}`,
    resourcesTouched: developer.artifact.filesTouched || [],
    diffText: effectiveUnifiedDiff,
    testOutputs: verifier.artifact.dryRunResults || [],
    approvals,
    breakGlass,
    scannerSummary: finalGov.artifact.findingsByCategory,
    riskCard: finalGov.artifact.riskCard,
  });
  appendLedgerEvent(ledgerEvent);

  const result = {
    runId,
    timeline,
    diffLines: buildDiffLines(effectiveUnifiedDiff, finalGov.artifact.findings),
    findings: mapFindings(finalGov.artifact.findings),
    proofs,
    artifacts,
    gate: finalGov.artifact,
    blocked: finalGov.artifact.gateDecision === "BLOCKED",
  };
  emit({
    type: "run_completed",
    result,
  });
  return result;
}

async function runPipeline({
  prompt,
  actor = "demo-user",
  approvals = [],
  breakGlass,
  confidenceMode = "pair",
  confidencePercent,
  projectFiles = {},
}) {
  return executePipeline({
    prompt,
    actor,
    approvals,
    breakGlass,
    confidenceMode,
    confidencePercent,
    projectFiles,
  });
}

async function streamPipeline({
  prompt,
  actor = "demo-user",
  approvals = [],
  breakGlass,
  confidenceMode = "pair",
  confidencePercent,
  projectFiles = {},
  emitEvent,
}) {
  return executePipeline({
    prompt,
    actor,
    approvals,
    breakGlass,
    confidenceMode,
    confidencePercent,
    projectFiles,
    emitEvent,
  });
}

module.exports = {
  runPipeline,
  streamPipeline,
};
