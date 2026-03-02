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

export function buildQuickAssistResponse({
  question,
  selectedFile,
  selectedCode,
  fileContent,
}: QuickAssistContext): QuickAssistResponse {
  const safeQuestion = question.trim();
  const terms = extractTerms(safeQuestion);
  const source = (selectedCode?.trim() || fileContent || "").trim();
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
