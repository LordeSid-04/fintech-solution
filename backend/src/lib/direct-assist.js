const { sha256 } = require("./hashing");
const { appendLedgerEvent, buildLedgerEvent } = require("./evidence-ledger");
const { runSafetyScanners, scanTextForSecrets } = require("./scanners");
const { computeRiskAssessment } = require("./risk-engine");
const { decideGate } = require("./policy-engine");

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function toEventEmitter(emitEvent) {
  return typeof emitEvent === "function" ? emitEvent : () => {};
}

function normalizeConfidenceLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded === 0) return 0;
  if (rounded === 50) return 50;
  if (rounded === 100) return 100;
  return null;
}

function shouldUseDirectModelPath(confidencePercent, confidenceMode) {
  if (confidenceMode === "assist" || confidenceMode === "pair") {
    return true;
  }
  const level = normalizeConfidenceLevel(confidencePercent);
  return level === 0 || level === 50;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter((token) => token.length >= 3);
}

function buildProjectContext(prompt, projectFiles) {
  if (!projectFiles || typeof projectFiles !== "object") {
    return { contextText: "No project files were provided.", touchedFiles: [] };
  }
  const entries = Object.entries(projectFiles);
  if (!entries.length) {
    return { contextText: "No project files were provided.", touchedFiles: [] };
  }

  const promptTokens = new Set(tokenize(prompt));
  const ranked = entries
    .map(([path, content]) => {
      const normalizedContent = String(content || "");
      const tokens = new Set(tokenize(`${path} ${normalizedContent.slice(0, 1600)}`));
      let score = 0;
      for (const token of promptTokens) {
        if (tokens.has(token)) score += 1;
      }
      return { path, content: normalizedContent, score };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 4);

  const touchedFiles = ranked.map((item) => item.path);
  const contextParts = ranked.map((item) => {
    const lines = item.content.split("\n").slice(0, 140).join("\n");
    return [`FILE: ${item.path}`, "```", lines || "(empty file)", "```"].join("\n");
  });
  const contextText = contextParts.length
    ? contextParts.join("\n\n")
    : "No relevant project context could be retrieved.";
  return { contextText, touchedFiles };
}

function buildSystemPrompt(level) {
  if (level === 0) {
    return [
      "You are an elite direct-assist AI companion.",
      "This is confidence level 0%: strictly no autonomous actions and no agent orchestration.",
      "Prioritize fast, highly relevant, trustworthy guidance.",
      "Use project context to ground every recommendation.",
      "If uncertain, clearly state uncertainty and how to verify.",
      "Never claim actions were performed.",
      "Return strict JSON only with keys:",
      "assistantReply (string), rationale (string), unifiedDiff (string), generatedFiles (object), citations (array of short strings).",
      "Use empty string/object/array when not applicable.",
      "Do not include markdown code fences around JSON.",
    ].join(" ");
  }
  return [
    "You are an elite pair-programming AI for direct model mode.",
    "This is confidence level 50%: provide high-quality implementation guidance without using agents.",
    "Generate practical, reviewable output grounded in project context.",
    "When possible include a safe unified diff preview and file updates in generatedFiles.",
    "Never apply changes or claim execution.",
    "Respect security constraints and avoid destructive suggestions without scope safeguards.",
    "Return strict JSON only with keys:",
    "assistantReply (string), rationale (string), unifiedDiff (string), generatedFiles (object), citations (array of short strings).",
    "Do not include markdown code fences around JSON.",
  ].join(" ");
}

function buildUserPrompt({ prompt, contextText, level }) {
  return JSON.stringify(
    {
      confidenceLevel: level,
      userRequest: prompt,
      requirements: [
        "Be concrete and context-grounded.",
        "Give short, actionable steps first.",
        "For code edits, include a concise unified diff preview when possible.",
        "Include 1-3 citation bullets describing which files/context informed the answer.",
      ],
      retrievedProjectContext: contextText,
    },
    null,
    2
  );
}

async function callOpenAI({ model, systemPrompt, userPrompt, timeoutMs, key }) {
  const now = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_output_tokens: 1500,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: systemPrompt }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: userPrompt }],
            },
          ],
        }),
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error(
          `Direct model request timed out after ${timeoutMs}ms. Increase DIRECT_MODEL_TIMEOUT_MS and retry.`
        );
        timeoutError.code = "TIMEOUT";
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    }
    if (!response.ok) {
      const providerError = new Error(`OpenAI API error ${response.status}`);
      providerError.status = response.status;
      providerError.code = response.status === 401 ? "INVALID_API_KEY" : "OPENAI_API_ERROR";
      throw providerError;
    }
    const payload = await response.json();
    const text =
      payload.output_text ||
      payload.output
        ?.flatMap((item) => item.content || [])
        ?.map((part) => part.text || "")
        ?.join("\n") ||
      "";
    return {
      text,
      proof: {
        provider: "openai-api",
        model,
        responseId: payload.id || `openai-${sha256(text).slice(0, 12)}`,
        timestamp: now,
        agentRole: "DEVELOPER",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini({ model, systemPrompt, userPrompt, timeoutMs, key }) {
  const now = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Gemini API error ${response.status}`);
    }
    const payload = await response.json();
    const text =
      payload.candidates
        ?.flatMap((candidate) => candidate.content?.parts || [])
        ?.map((part) => part.text || "")
        ?.join("\n") || "";
    const responseId =
      payload.responseId || payload.id || `gemini-${sha256(`${model}:${text}`).slice(0, 12)}`;
    return {
      text,
      proof: {
        provider: "google-gemini",
        model,
        responseId,
        timestamp: now,
        agentRole: "DEVELOPER",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackDirectResponse({ prompt, touchedFiles, level, reason }) {
  return {
    parsed: {
      assistantReply: level === 0
        ? "Here is a focused next step: share expected vs actual behavior and the smallest failing snippet so I can give a precise fix."
        : "Here is a reviewable approach: I can draft a minimal patch once you confirm target file and expected behavior.",
      rationale: `Direct model fallback used (${reason}).`,
      unifiedDiff: "",
      generatedFiles: {},
      citations: touchedFiles.slice(0, 3).map((path) => `Context file: ${path}`),
    },
    proof: {
      provider: "codex-harness",
      model: "direct-fallback",
      responseId: `direct-${sha256(`${level}:${prompt}:${Date.now()}`).slice(0, 12)}`,
      timestamp: new Date().toISOString(),
      agentRole: "DEVELOPER",
    },
  };
}

function normalizeDirectPayload(parsed, touchedFiles) {
  const assistantReply = typeof parsed?.assistantReply === "string" ? parsed.assistantReply.trim() : "";
  const rationale = typeof parsed?.rationale === "string" ? parsed.rationale.trim() : "";
  const unifiedDiff = typeof parsed?.unifiedDiff === "string" ? parsed.unifiedDiff : "";
  const generatedFiles =
    parsed?.generatedFiles && typeof parsed.generatedFiles === "object" ? parsed.generatedFiles : {};
  const citations = Array.isArray(parsed?.citations)
    ? parsed.citations.filter((item) => typeof item === "string").slice(0, 5)
    : touchedFiles.slice(0, 3).map((path) => `Context file: ${path}`);
  const sanitizedAssistantReply = assistantReply
    .replace(/i generated files[^.]*\./gi, "I prepared a focused recommendation based on your request.")
    .replace(/generated implementation files[^.]*\./gi, "I prepared a focused implementation suggestion.");

  return {
    assistantReply:
      sanitizedAssistantReply || "I need one more concrete detail to produce a high-confidence answer.",
    rationale: rationale || "Response normalized from direct model output.",
    unifiedDiff,
    generatedFiles,
    citations,
  };
}

function buildDiffLines(unifiedDiff, findings = []) {
  const normalized = String(unifiedDiff || "").trim();
  if (!normalized) return [];
  const findingMap = new Map();
  for (const finding of findings) {
    if (!Number.isFinite(finding?.lineNumber)) continue;
    const line = Number(finding.lineNumber);
    const existing = findingMap.get(line) || [];
    existing.push(finding.id);
    findingMap.set(line, existing);
  }
  return normalized.split("\n").map((line, idx) => {
    let kind = "context";
    if (line.startsWith("+")) kind = "add";
    if (line.startsWith("-")) kind = "remove";
    return {
      lineNumber: idx + 1,
      kind,
      content: line,
      findingIds: findingMap.get(idx + 1) || [],
    };
  });
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
  for (const [filePath, content] of entries.slice(0, 8)) {
    const lines = String(content || "").split("\n").slice(0, 120);
    chunks.push(`diff --git a/${filePath} b/${filePath}`);
    chunks.push("new file mode 100644");
    chunks.push("--- /dev/null");
    chunks.push(`+++ b/${filePath}`);
    chunks.push(`@@ -0,0 +1,${lines.length} @@`);
    for (const line of lines) {
      chunks.push(`+${line}`);
    }
    chunks.push("");
  }
  return chunks.join("\n").trim();
}

function asAddedDiffText(text, pseudoPath) {
  const normalized = String(text || "");
  const lines = normalized.split("\n");
  return [
    `diff --git a/${pseudoPath} b/${pseudoPath}`,
    "--- /dev/null",
    `+++ b/${pseudoPath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ].join("\n");
}

function normalizeFindings(findings) {
  return findings.map((item, index) => ({
    ...item,
    id: `${item.id || "finding"}-${index + 1}`,
  }));
}

function mapFindingsByCategory(findings) {
  return findings.reduce((acc, item) => {
    const category = item.category || "uncategorized";
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
}

function buildContentFlags({ assistantReply, rationale, findings }) {
  const segments = [
    { target: "assistantReply", text: String(assistantReply || "") },
    { target: "rationale", text: String(rationale || "") },
  ];
  const flags = [];
  for (const finding of findings) {
    const evidence = String(finding?.evidence || "").trim();
    if (!evidence) continue;
    for (const segment of segments) {
      const idx = segment.text.toLowerCase().indexOf(evidence.toLowerCase());
      if (idx !== -1) {
        flags.push({
          target: segment.target,
          start: idx,
          end: idx + evidence.length,
          severity: finding.severity,
          title: finding.title,
          ruleName: finding.ruleName,
          evidence,
        });
      }
    }
  }
  return flags.slice(0, 25);
}

function extractScopeFromPrompt(prompt) {
  const text = String(prompt || "");
  const selectedFileMatch = text.match(/Selected file:\s*(.+)/i);
  const selectedSnippetMatch = text.match(/Selected text scope:\s*```[\w-]*\n?([\s\S]*?)```/i);
  const requestMatch = text.match(/User request:\s*(.+)/i);
  return {
    selectedFile: selectedFileMatch?.[1]?.trim() || "",
    selectedSnippet: selectedSnippetMatch?.[1]?.trim() || "",
    userRequest: requestMatch?.[1]?.trim() || text.trim(),
  };
}

function isScopedFixIntent(userRequest, selectedSnippet) {
  const request = String(userRequest || "").toLowerCase();
  const snippet = String(selectedSnippet || "").toLowerCase();
  if (!selectedSnippet.trim()) return false;
  if (/(fix|correct|repair|rewrite|update|bug|wrong|issue)/i.test(request)) return true;
  if (/def\s+\w+\(/i.test(snippet) || /function\s+\w+\(/i.test(snippet)) return true;
  return false;
}

function buildHeuristicSelectionFix(selectedSnippet, userRequest) {
  const snippet = String(selectedSnippet || "");
  const request = String(userRequest || "").toLowerCase();
  const squareMatch = snippet.match(/return\s+([a-zA-Z_][\w]*)\s*\*\s*2/);
  if (squareMatch && (request.includes("square") || /square/i.test(snippet))) {
    const variable = squareMatch[1];
    return {
      replacement: snippet.replace(squareMatch[0], `return ${variable} ** 2`),
      note: "Converted doubling logic to squaring (`** 2`).",
    };
  }

  const evenMatch = snippet.match(/return\s+([a-zA-Z_][\w]*)\s*%\s*2\s*==\s*1/);
  if (evenMatch && /(even|is_even|iseven)/i.test(`${request}\n${snippet}`)) {
    const variable = evenMatch[1];
    return {
      replacement: snippet.replace(evenMatch[0], `return ${variable} % 2 == 0`),
      note: "Fixed inverted even-check condition.",
    };
  }

  const oddMatch = snippet.match(/return\s+([a-zA-Z_][\w]*)\s*%\s*2\s*==\s*0/);
  if (oddMatch && /(odd|is_odd|isodd)/i.test(`${request}\n${snippet}`)) {
    const variable = oddMatch[1];
    return {
      replacement: snippet.replace(oddMatch[0], `return ${variable} % 2 == 1`),
      note: "Fixed inverted odd-check condition.",
    };
  }

  const cubeMatch = snippet.match(/return\s+([a-zA-Z_][\w]*)\s*\*\s*3/);
  if (cubeMatch && /(cube|cubed)/i.test(`${request}\n${snippet}`)) {
    const variable = cubeMatch[1];
    return {
      replacement: snippet.replace(cubeMatch[0], `return ${variable} ** 3`),
      note: "Converted tripling logic to cubing (`** 3`).",
    };
  }

  return null;
}

function extractCodeBlock(text) {
  const match = String(text || "").match(/```[\w-]*\n?([\s\S]*?)```/);
  return match?.[1]?.trim() || "";
}

function applyScopedFix({
  normalized,
  projectFiles,
  selectedFile,
  selectedSnippet,
  replacementSnippet,
  note,
}) {
  if (!replacementSnippet.trim()) {
    return normalized;
  }
  const generatedFiles = { ...(normalized.generatedFiles || {}) };
  let applied = false;
  if (selectedFile && typeof projectFiles?.[selectedFile] === "string") {
    const source = String(projectFiles[selectedFile]);
    if (selectedSnippet && source.includes(selectedSnippet)) {
      generatedFiles[selectedFile] = source.replace(selectedSnippet, replacementSnippet);
      applied = true;
    }
  }
  if (!applied) {
    const fallbackPath = selectedFile || "scoped-fix.txt";
    generatedFiles[fallbackPath] = replacementSnippet;
  }
  const assistantReply = [
    "Applied a scoped correction to the selected text.",
    note || "Updated the selected logic with a safer/correct implementation.",
  ].join(" ");
  return {
    ...normalized,
    assistantReply,
    rationale: `${normalized.rationale} Scoped correction was generated from the selected text.`,
    generatedFiles,
  };
}

async function runDirectAssistPath({
  prompt,
  actor = "demo-user",
  confidenceMode = "pair",
  approvals = [],
  breakGlass,
  confidencePercent,
  projectFiles = {},
  emitEvent,
}) {
  const emit = toEventEmitter(emitEvent);
  const normalizedLevel = normalizeConfidenceLevel(confidencePercent);
  const level =
    normalizedLevel === 0 || normalizedLevel === 50
      ? normalizedLevel
      : confidenceMode === "assist"
        ? 0
        : confidenceMode === "pair"
          ? 50
          : normalizedLevel;
  if (level !== 0 && level !== 50) {
    throw new Error("Direct assist path only supports confidence levels 0 and 50.");
  }
  const runId = `run-${Date.now()}`;
  const { contextText, touchedFiles } = buildProjectContext(prompt, projectFiles);
  const systemPrompt = buildSystemPrompt(level);
  const userPrompt = buildUserPrompt({ prompt, contextText, level });

  emit({
    type: "run_started",
    runId,
    timestamp: new Date().toISOString(),
    confidenceMode: level === 0 ? "assist" : "pair",
    confidencePercent: level,
  });
  emit({
    type: "stage_started",
    agentRole: "DEVELOPER",
    stage: "direct-model",
    message: "Running high-quality direct model response path...",
  });

  const openAiKey = process.env.OPENAI_API_KEY;
  const timeoutMs = Number(process.env.DIRECT_MODEL_TIMEOUT_MS || 35000);
  if (!openAiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Configure backend OPENAI_API_KEY to enable companion and pair mode generation."
    );
  }
  const modelResult = await callOpenAI({
    model:
      level === 0
        ? process.env.OPENAI_ASSIST_MODEL || process.env.OPENAI_FAST_MODEL || "gpt-4o-mini"
        : process.env.OPENAI_PAIR_MODEL || process.env.OPENAI_FAST_MODEL || "gpt-4.1-mini",
    systemPrompt,
    userPrompt,
    timeoutMs,
    key: openAiKey,
  });

  const parsed = modelResult.parsed || extractJsonObject(modelResult.text || "");
  let normalized = normalizeDirectPayload(parsed, touchedFiles);
  const scope = extractScopeFromPrompt(prompt);
  if (scope.selectedSnippet && !String(normalized.assistantReply || "").includes(scope.selectedSnippet)) {
    normalized.assistantReply = `${normalized.assistantReply}\n\nScope note: response is constrained to selected text and file context.`;
  }
  const effectiveUnifiedDiff = String(normalized.unifiedDiff || "").trim()
    || buildUnifiedDiffFromGeneratedFiles(normalized.generatedFiles || {});
  const responseTextDiff = asAddedDiffText(
    `${normalized.assistantReply}\n${normalized.rationale}`,
    "ai/assistant-output.txt"
  );
  const retrievedContextDiff = asAddedDiffText(contextText, "ai/retrieved-context.txt");
  const diffLikeFindings = [
    ...runSafetyScanners({
      diffText: effectiveUnifiedDiff,
      filesTouched: touchedFiles,
      declaredIntent: prompt,
    }),
    ...runSafetyScanners({
      diffText: responseTextDiff,
      filesTouched: ["ai/assistant-output.txt"],
      declaredIntent: prompt,
    }),
    ...runSafetyScanners({
      diffText: retrievedContextDiff,
      filesTouched: touchedFiles,
      declaredIntent: prompt,
    }),
  ];
  const secretFindings = [
    ...scanTextForSecrets(normalized.assistantReply, "ai/assistant-output.txt"),
    ...scanTextForSecrets(normalized.rationale, "ai/rationale.txt"),
    ...scanTextForSecrets(contextText, "ai/retrieved-context.txt"),
  ];
  const findings = normalizeFindings([...diffLikeFindings, ...secretFindings]);
  const assessment = computeRiskAssessment({
    findings,
    filesTouched: [...new Set([...touchedFiles, ...Object.keys(normalized.generatedFiles || {})])],
    approvals: [],
    breakGlass: undefined,
    confidencePercent: level,
    testSignals: { hasVerifierEvidence: false, testCount: 0 },
  });
  const contentFlags = buildContentFlags({
    assistantReply: normalized.assistantReply,
    rationale: normalized.rationale,
    findings,
  });
  const resourcesTouched = [
    ...new Set([...touchedFiles, ...Object.keys(normalized.generatedFiles || {})]),
  ];
  const riskScore = assessment.riskScore;
  const riskTier = assessment.riskTier;
  const gateDecision = decideGate({
    confidenceMode,
    artifactType: "diff",
    riskScore,
    findings,
    approvals,
    breakGlass,
  });
  const timeline = [
    {
      id: `step-direct-${level}`,
      agentRole: "Developer",
      artifactType: "diff",
      riskScore,
      gateDecision: gateDecision.gateDecision,
      timestamp: new Date().toISOString(),
      linkedFindingIds: findings.map((item) => item.id),
    },
  ];

  emit({
    type: "agent_output",
    agentRole: "DEVELOPER",
    stage: "direct-model",
    content: normalized.assistantReply,
    proof: modelResult.proof,
  });
  if (normalized.generatedFiles && Object.keys(normalized.generatedFiles).length) {
    emit({
      type: "generated_files",
      files: normalized.generatedFiles,
    });
  }
  emit({
    type: "timeline_step",
    step: timeline[0],
  });

  const ledgerEvent = buildLedgerEvent({
    actor,
    agentRole: "GOVERNOR",
    actionType: `direct-model-run-completed:${level}`,
    resourcesTouched,
    diffText: normalized.unifiedDiff || "",
    testOutputs: [],
    approvals,
    breakGlass,
    scannerSummary: mapFindingsByCategory(findings),
    riskCard: assessment.riskCard,
  });
  appendLedgerEvent(ledgerEvent);

  const result = {
    runId,
    timeline,
    diffLines: buildDiffLines(effectiveUnifiedDiff, findings),
    findings,
    proofs: [{ step: `direct-${level}`, proof: modelResult.proof }],
    artifacts: {
      diff: {
        unifiedDiff: effectiveUnifiedDiff,
        rationale: normalized.rationale,
        generatedFiles: normalized.generatedFiles,
        assistantReply: normalized.assistantReply,
        contentFlags,
      },
      ops: {
        rolloutSteps: [],
        rollbackPlan: [
          "No automatic apply was executed in direct model mode.",
          "Rollback is not required unless user manually applies suggested changes.",
        ],
      },
    },
    gate: {
      gateDecision: gateDecision.gateDecision,
      riskScore,
      riskTier,
      blockReasons: gateDecision.blockReasons,
      approvalsNeeded: gateDecision.approvalsNeeded,
      reasonCodes: gateDecision.reasonCodes,
      findingsByCategory: mapFindingsByCategory(findings),
      riskFactors: assessment.factors,
      riskCard: {
        ...assessment.riskCard,
        topDrivers: [...assessment.riskCard.topDrivers, ...normalized.citations].slice(0, 5),
      },
    },
    blocked: gateDecision.gateDecision === "BLOCKED",
  };
  emit({
    type: "run_completed",
    result,
  });
  return result;
}

module.exports = {
  runDirectAssistPath,
  shouldUseDirectModelPath,
  normalizeConfidenceLevel,
};
