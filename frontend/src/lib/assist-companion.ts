import { clampPercent } from "@/lib/governance";

const COMPANION_PROMPT_PREFIX = [
  "You are an in-editor AI companion.",
  "Respond quickly and helpfully for a stuck developer.",
  "Focus only on the quoted code section when one is provided.",
  "AI can generate plans, diffs, and suggestions only.",
  "AI cannot apply changes, open PRs, merge, or deploy.",
  "All actions require manual human execution.",
  "Gate policy: all changes require approval regardless of risk.",
  "",
  "Agentic permissions in this mode:",
  "- DEVELOPER: suggestions + unified diff preview only; cannot apply patch, commit, or open PR.",
  "- VERIFIER: suggest tests/commands only; cannot execute tests or auto-edit test files.",
  "- OPERATOR: deployment plan only; cannot deploy, change infra, or modify env config.",
  "- GOVERNOR: run risk/security analysis + risk score; cannot auto-approve or override gates.",
].join("\n");

export type ScopedAssistContext = {
  question: string;
  selectedFile?: string;
  selectedCode?: string;
};

export type ScopedExecutionContext = {
  question: string;
  selectedFile?: string;
  selectedCode?: string;
  mode: "pair" | "autopilot";
};

export type QuickAssistContext = {
  question: string;
  selectedFile?: string;
  selectedCode?: string;
  fileContent?: string;
};

export type QuickAssistResponse = {
  assistantReply: string;
  rationale: string;
  highlightedSnippet: string;
  matchedTerms: string[];
};

export function isCompanionOnlyConfidence(percent: number): boolean {
  return clampPercent(percent) === 0;
}

export function buildAssistCompanionPrompt({
  question,
  selectedFile,
  selectedCode,
}: ScopedAssistContext): string {
  const trimmedQuestion = question.trim();
  const trimmedSelection = selectedCode?.trim() ?? "";
  const hasSelection = Boolean(trimmedSelection);
  const fileLine = selectedFile ? `File: ${selectedFile}` : "File: current editor buffer";

  if (!trimmedQuestion && !hasSelection) {
    return "";
  }

  if (!hasSelection) {
    return [
      COMPANION_PROMPT_PREFIX,
      "",
      `Developer request: ${trimmedQuestion || "Give practical next steps for the current issue."}`,
      "",
      "Return format:",
      "1) Fast diagnosis",
      "2) Suggested fix",
      "3) Optional unified diff preview",
      "4) Suggested tests/commands (do not execute)",
    ].join("\n");
  }

  return [
    COMPANION_PROMPT_PREFIX,
    "",
    fileLine,
    "Quoted section:",
    "```",
    trimmedSelection,
    "```",
    "",
    `Developer request: ${trimmedQuestion || "Help improve only the quoted section."}`,
    "",
    "Important: scope your help ONLY to the quoted section.",
    "Return format:",
    "1) What is wrong or risky in this section",
    "2) Improved snippet for this section only",
    "3) Optional unified diff preview (for this file section only)",
    "4) Suggested tests/commands (do not execute)",
  ].join("\n");
}

export function buildScopedExecutionPrompt({
  question,
  selectedFile,
  selectedCode,
  mode,
}: ScopedExecutionContext): string {
  const trimmedQuestion = String(question || "").trim();
  const trimmedSelection = String(selectedCode || "").trim();
  if (!trimmedQuestion && !trimmedSelection) {
    return "";
  }
  if (!trimmedSelection) {
    return trimmedQuestion;
  }

  const fileLine = selectedFile ? `Selected file: ${selectedFile}` : "Selected file: current editor buffer";
  const modeLine = mode === "autopilot" ? "Autopilot (100%)" : "Pair (50%)";
  return [
    `Execution mode: ${modeLine}`,
    fileLine,
    "Selected text scope:",
    "```",
    trimmedSelection,
    "```",
    "",
    `User request: ${trimmedQuestion || "Improve the selected text safely."}`,
    "",
    "Scope rule (hard requirement): only operate on the selected text when selection is provided.",
    "If broader changes are required, explain why and stop at a proposal instead of editing outside scope.",
  ].join("\n");
}

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "just",
  "what",
  "when",
  "where",
  "which",
  "about",
  "help",
  "please",
  "mode",
  "code",
  "file",
]);

function extractTerms(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 3 && !stopWords.has(word))
    )
  ).slice(0, 6);
}

function scoreLine(line: string, terms: string[]): number {
  const lower = line.toLowerCase();
  return terms.reduce((score, term) => (lower.includes(term) ? score + 1 : score), 0);
}

function extractCodeSnippetFromQuestion(question: string): string {
  const fenced = question.match(/```(?:python|py)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }
  const lines = question.split("\n").filter((line) => line.trim().length > 0);
  const codeLike = lines.filter((line) =>
    /^(def\s+\w+\(|return\b|print\(|\s{2,}|\t|[a-zA-Z_]\w*\s*=)/.test(line.trimStart())
  );
  if (codeLike.length >= 2) {
    return codeLike.join("\n").trim();
  }
  return "";
}

function detectCommonLogicalMismatch(source: string, question: string): QuickAssistResponse | null {
  const combined = `${question}\n${source}`;
  const evenMismatch = source.match(/return\s+([a-zA-Z_][\w]*)\s*%\s*2\s*==\s*1/);
  if (evenMismatch && /(even|is_even|iseven)/i.test(combined)) {
    const variable = evenMismatch[1];
    return {
      assistantReply: [
        "Your even-check condition is inverted.",
        `Change \`${evenMismatch[0]}\` to \`return ${variable} % 2 == 0\`.`,
        "That makes even inputs return `True` correctly.",
      ].join(" "),
      rationale: "`% 2 == 1` checks odd numbers; even checks should use `% 2 == 0`.",
      highlightedSnippet: evenMismatch[0],
      matchedTerms: ["even", "modulo"],
    };
  }

  const oddMismatch = source.match(/return\s+([a-zA-Z_][\w]*)\s*%\s*2\s*==\s*0/);
  if (oddMismatch && /(odd|is_odd|isodd)/i.test(combined)) {
    const variable = oddMismatch[1];
    return {
      assistantReply: [
        "Your odd-check condition is inverted.",
        `Change \`${oddMismatch[0]}\` to \`return ${variable} % 2 == 1\`.`,
        "That makes odd inputs return `True` correctly.",
      ].join(" "),
      rationale: "`% 2 == 0` checks even numbers; odd checks should use `% 2 == 1`.",
      highlightedSnippet: oddMismatch[0],
      matchedTerms: ["odd", "modulo"],
    };
  }

  const cubeMismatch = source.match(/return\s+([a-zA-Z_][\w]*)\s*\*\s*3/);
  if (cubeMismatch && /(cube|cubed)/i.test(combined)) {
    const variable = cubeMismatch[1];
    return {
      assistantReply: [
        "The function is tripling the value, not cubing it.",
        `Change \`${cubeMismatch[0]}\` to \`return ${variable} ** 3\`.`,
        "Then re-run with input 3; cube should be 27.",
      ].join(" "),
      rationale: "Cubing requires exponentiation (`** 3`), not multiplication by 3.",
      highlightedSnippet: cubeMismatch[0],
      matchedTerms: ["cube", "exponentiation"],
    };
  }

  const avgMismatch = source.match(/return\s+([a-zA-Z_][\w]*)\s*\+\s*([a-zA-Z_][\w]*)\s*$/m);
  if (avgMismatch && /(average|mean)/i.test(question)) {
    const left = avgMismatch[1];
    const right = avgMismatch[2];
    return {
      assistantReply: [
        "Your average/mean logic is incomplete.",
        `Change \`${avgMismatch[0]}\` to \`return (${left} + ${right}) / 2\` for two inputs.`,
        "If you have more values, divide by the total count.",
      ].join(" "),
      rationale: "A mean is sum divided by number of terms; returning only sum is incorrect.",
      highlightedSnippet: avgMismatch[0],
      matchedTerms: ["average", "mean"],
    };
  }

  return null;
}

export function buildQuickAssistResponse({
  question,
  selectedFile,
  selectedCode,
  fileContent,
}: QuickAssistContext): QuickAssistResponse {
  const safeQuestion = question.trim();
  const terms = extractTerms(safeQuestion);
  const questionSnippet = extractCodeSnippetFromQuestion(safeQuestion);
  const source = (selectedCode?.trim() || fileContent || questionSnippet || "").trim();
  const squareMismatch = source.match(/return\s+([a-zA-Z_][\w]*)\s*\*\s*2/);
  const mentionsSquare = safeQuestion.toLowerCase().includes("square") || source.toLowerCase().includes("square(");
  if (squareMismatch && mentionsSquare) {
    const variableName = squareMismatch[1];
    return {
      assistantReply: [
        "Your function is doubling the value, not squaring it.",
        `Change \`${squareMismatch[0]}\` to \`return ${variableName} ** 2\`.`,
        "Then run again; `square(3)` should return 9.",
      ].join(" "),
      rationale:
        "Multiplying by 2 returns 6 for input 3. Squaring requires exponentiation (`** 2`).",
      highlightedSnippet: squareMismatch[0],
      matchedTerms: ["square", "return"],
    };
  }
  const logicalMismatch = detectCommonLogicalMismatch(source, safeQuestion);
  if (logicalMismatch) {
    return logicalMismatch;
  }
  const lines = source.split("\n").filter((line) => line.trim().length > 0);
  const rankedLines = lines
    .map((line) => ({ line, score: scoreLine(line, terms) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.line);
  const highlightedSnippet =
    rankedLines.join("\n") ||
    selectedCode?.trim() ||
    fileContent?.split("\n").slice(0, 2).join("\n") ||
    "No code snippet selected yet.";
  const target = selectedCode?.trim() ? "selected section" : selectedFile ? `\`${selectedFile}\`` : "your file";

  return {
    assistantReply: [
      `Quick take: focus on ${target}.`,
      safeQuestion
        ? `For "${safeQuestion}", start with the smallest safe change and test it immediately.`
        : "Start with the smallest safe change and test it immediately.",
      "I can suggest a focused diff next if you want.",
    ].join(" "),
    rationale: [
      "Most relevant code appears below.",
      "I prioritized lines matching your prompt keywords and kept this scoped for fast iteration.",
    ].join(" "),
    highlightedSnippet,
    matchedTerms: terms,
  };
}
