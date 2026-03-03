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

const RELEVANCE_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "you",
  "are",
  "is",
  "was",
  "were",
  "can",
  "could",
  "would",
  "should",
  "what",
  "when",
  "where",
  "which",
  "why",
  "how",
  "about",
  "into",
  "over",
  "under",
  "then",
  "than",
  "just",
  "have",
  "has",
  "had",
  "any",
  "all",
  "not",
  "but",
  "our",
  "their",
  "they",
  "them",
  "its",
  "it's",
  "it's",
  "please",
  "help",
  "explain",
  "fix",
  "code",
  "function",
  "issue",
  "error",
  "problem",
]);

function tokenizeForRelevance(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3 && !RELEVANCE_STOPWORDS.has(token));
}

function hasRelevanceOverlap(question, suggestion, rationale) {
  const qTokens = Array.from(new Set(tokenizeForRelevance(question)));
  if (!qTokens.length) return true;
  const answerText = `${suggestion || ""}\n${rationale || ""}`.toLowerCase();
  const overlap = qTokens.filter((token) => answerText.includes(token));
  const minOverlap = qTokens.length >= 5 ? 2 : 1;
  return overlap.length >= minOverlap;
}

function isHighStakesQuestion(question) {
  return /(medical|health|treatment|diagnosis|dosage|legal|law|contract|tax|finance|investment|security|safety)/i.test(
    String(question || "")
  );
}

function hasVerificationCue(text) {
  return /(verify|double-check|trusted source|official|guideline|consult|professional|jurisdiction|policy)/i.test(
    String(text || "")
  );
}

function ensureVerificationGuidance(question, suggestion) {
  const cleanSuggestion = String(suggestion || "").trim();
  if (!cleanSuggestion || hasVerificationCue(cleanSuggestion)) {
    return cleanSuggestion;
  }
  if (isHighStakesQuestion(question)) {
    return `${cleanSuggestion}\n\nVerification: For high-stakes decisions, confirm this against authoritative guidance or a qualified professional.`;
  }
  return `${cleanSuggestion}\n\nVerification: Cross-check this with a trusted source or example relevant to your context.`;
}

function buildClarifyingFallback(payload) {
  const question = String(payload.question || "").trim();
  const snippet = buildSnippet(payload) || "No relevant code snippet found.";
  return {
    suggestion: [
      "I want to keep this accurate, but I need one more detail before giving a definitive answer.",
      "Share the specific expected result, actual result, and context (topic/system/input).",
      "Then I can give a targeted, high-confidence fix or explanation.",
    ].join(" "),
    rationale: question
      ? `The current prompt is broad, so a precise correction needs concrete context.`
      : "No concrete question text was provided.",
    relevantSnippet: snippet,
  };
}

function buildSnippet(payload) {
  const selected = (payload.selectedCode || "").trim();
  const content = (payload.fileContent || "").trim();
  if (selected || content) {
    return selected || content;
  }
  const question = String(payload.question || "");
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

function detectSquareMismatch(payload, snippet) {
  const question = (payload.question || "").toLowerCase();
  const lowerSnippet = snippet.toLowerCase();
  const returnMultiplyMatch = snippet.match(/return\s+([a-zA-Z_][\w]*)\s*\*\s*2/);
  const mentionsSquare = question.includes("square") || lowerSnippet.includes("def square");
  if (!mentionsSquare || !returnMultiplyMatch) {
    return null;
  }
  const variableName = returnMultiplyMatch[1];
  const fixedLine = `return ${variableName} ** 2`;
  return {
    suggestion: [
      "You're very close: the function is doubling the value, not squaring it.",
      `Replace \`${returnMultiplyMatch[0]}\` with \`${fixedLine}\`.`,
      "After that, re-run and you should get 9 for input 3.",
    ].join(" "),
    rationale:
      "Current logic multiplies by 2, so `square(3)` returns 6. Squaring needs exponentiation (`** 2`).",
    relevantSnippet: returnMultiplyMatch[0],
  };
}

function detectCommonLogicalMismatch(payload, snippet) {
  const question = String(payload.question || "").toLowerCase();
  const normalized = String(snippet || "");
  if (!normalized.trim()) return null;

  const evenMismatch = normalized.match(/return\s+([a-zA-Z_][\w]*)\s*%\s*2\s*==\s*1/);
  if (evenMismatch && /(even|is_even|iseven)/i.test(`${question}\n${normalized}`)) {
    const variable = evenMismatch[1];
    return {
      suggestion: [
        "Your even-check condition is inverted.",
        `Use \`return ${variable} % 2 == 0\` for an even check.`,
        "With this fix, even numbers return `True` and odd numbers return `False`.",
      ].join(" "),
      rationale:
        "`% 2 == 1` checks odd numbers. For even checks, the remainder should be 0.",
      relevantSnippet: evenMismatch[0],
    };
  }

  const oddMismatch = normalized.match(/return\s+([a-zA-Z_][\w]*)\s*%\s*2\s*==\s*0/);
  if (oddMismatch && /(odd|is_odd|isodd)/i.test(`${question}\n${normalized}`)) {
    const variable = oddMismatch[1];
    return {
      suggestion: [
        "Your odd-check condition is inverted.",
        `Use \`return ${variable} % 2 == 1\` for an odd check.`,
        "With this fix, odd numbers return `True` and even numbers return `False`.",
      ].join(" "),
      rationale:
        "`% 2 == 0` checks even numbers. For odd checks, the remainder should be 1.",
      relevantSnippet: oddMismatch[0],
    };
  }

  const cubeMismatch = normalized.match(/return\s+([a-zA-Z_][\w]*)\s*\*\s*3/);
  if (cubeMismatch && /(cube|cubed)/i.test(`${question}\n${normalized}`)) {
    const variable = cubeMismatch[1];
    return {
      suggestion: [
        "The function is tripling the value, not cubing it.",
        `Replace \`${cubeMismatch[0]}\` with \`return ${variable} ** 3\`.`,
        "Then test with input 3; a cube should be 27.",
      ].join(" "),
      rationale:
        "Multiplying by 3 scales linearly. Cubing requires exponentiation (`** 3`).",
      relevantSnippet: cubeMismatch[0],
    };
  }

  const avgMismatch = normalized.match(/return\s+([a-zA-Z_][\w]*)\s*\+\s*([a-zA-Z_][\w]*)\s*$/m);
  if (avgMismatch && /(average|mean)/i.test(question)) {
    const left = avgMismatch[1];
    const right = avgMismatch[2];
    return {
      suggestion: [
        "Your average/mean logic is incomplete.",
        `Use \`return (${left} + ${right}) / 2\` to compute the mean of two values.`,
        "If there are more values, divide by the correct count.",
      ].join(" "),
      rationale:
        "Returning only a sum does not compute an average; mean requires dividing by the number of terms.",
      relevantSnippet: avgMismatch[0],
    };
  }

  return null;
}

function buildHeuristicSuggestion(payload) {
  const snippet = buildSnippet(payload);
  if (!snippet) {
    return null;
  }
  const squareMismatch = detectSquareMismatch(payload, snippet);
  if (squareMismatch) {
    return squareMismatch;
  }
  const logicalMismatch = detectCommonLogicalMismatch(payload, snippet);
  if (logicalMismatch) {
    return logicalMismatch;
  }
  return null;
}

function fallbackSuggestion(payload) {
  const snippet = buildSnippet(payload) || "No relevant code snippet found.";
  return {
    suggestion: [
      "Start by writing down expected behavior for one concrete input/output example.",
      "Then compare each step of your current logic against that expected flow.",
      "Share the expected vs actual output and I can provide a precise code-level fix.",
    ].join(" "),
    rationale:
      "Quick fallback was used because model response was unavailable. This keeps guidance fast and actionable.",
    relevantSnippet: snippet,
  };
}

function normalizeModelSuggestion(parsed, payload) {
  const fallback = fallbackSuggestion(payload);
  const suggestion = typeof parsed?.suggestion === "string" ? parsed.suggestion.trim() : "";
  const rationale = typeof parsed?.rationale === "string" ? parsed.rationale.trim() : "";
  const relevantSnippet =
    typeof parsed?.relevantSnippet === "string" && parsed.relevantSnippet.trim()
      ? parsed.relevantSnippet.trim()
      : fallback.relevantSnippet;

  if (!suggestion) {
    return fallback;
  }
  if (!hasRelevanceOverlap(payload.question || "", suggestion, rationale)) {
    return buildClarifyingFallback(payload);
  }
  const enrichedSuggestion = ensureVerificationGuidance(payload.question || "", suggestion);
  return {
    suggestion: enrichedSuggestion,
    rationale: rationale || fallback.rationale,
    relevantSnippet,
  };
}

const QUICK_ASSIST_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestion: { type: "string" },
    rationale: { type: "string" },
    relevantSnippet: { type: "string" },
  },
  required: ["suggestion", "rationale", "relevantSnippet"],
};

function toPartText(part) {
  if (!part || typeof part !== "object") return "";
  if (typeof part.text === "string") return part.text;
  if (part.text && typeof part.text === "object" && typeof part.text.value === "string") {
    return part.text.value;
  }
  if (typeof part.output_text === "string") return part.output_text;
  if (typeof part.value === "string") return part.value;
  return "";
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  const chunks = [];
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  outputs.forEach((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    content.forEach((part) => {
      const text = toPartText(part);
      if (text) chunks.push(text);
    });
  });
  return chunks.join("\n").trim();
}

async function getQuickAssistSuggestion(payload) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const heuristic = buildHeuristicSuggestion(payload);
    if (heuristic) {
      return heuristic;
    }
    return fallbackSuggestion(payload);
  }

  const model = process.env.OPENAI_FAST_MODEL || process.env.OPENAI_MODEL || "gpt-5-codex";
  const systemPrompt = [
    "You are a fast assistant for code and general knowledge questions.",
    "Goal: maximize correctness and relevance for the user's exact question.",
    "If confidence is limited, explicitly say what is uncertain and what to verify next.",
    "Do not invent facts, citations, measurements, or sources.",
    "Return concise, friendly, human-readable help.",
    "Prioritize direct fixes, practical next steps, and verification guidance.",
    "Respond as strict JSON with keys: suggestion, rationale, relevantSnippet.",
    "Do not include markdown fences.",
  ].join(" ");

  const userPrompt = JSON.stringify(
    {
      question: payload.question || "",
      file: payload.selectedFile || "",
      selectedCode: payload.selectedCode || "",
      fileContent: payload.fileContent || "",
    },
    null,
    2
  );

  const controller = new AbortController();
  const timeoutMs = Number(process.env.OPENAI_FAST_TIMEOUT_MS || 8000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_output_tokens: 420,
        text: {
          format: {
            type: "json_schema",
            name: "quick_assist_response",
            strict: true,
            schema: QUICK_ASSIST_RESPONSE_SCHEMA,
          },
        },
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

    if (!response.ok) {
      const heuristic = buildHeuristicSuggestion(payload);
      if (heuristic) {
        return heuristic;
      }
      return fallbackSuggestion(payload);
    }
    const json = await response.json();
    const outputText = extractOutputText(json);
    const parsed = json.output_parsed || extractJsonObject(outputText);
    if (!parsed) {
      const fallback = fallbackSuggestion(payload);
      const plain = String(outputText || "").trim();
      if (plain) {
        return {
          suggestion: plain.slice(0, 1000),
          rationale:
            "Model returned plain text instead of strict JSON; parsed fallback preserved the response content.",
          relevantSnippet: fallback.relevantSnippet,
        };
      }
      const heuristic = buildHeuristicSuggestion(payload);
      if (heuristic) {
        return heuristic;
      }
      return fallback;
    }
    return normalizeModelSuggestion(parsed, payload);
  } catch {
    const heuristic = buildHeuristicSuggestion(payload);
    if (heuristic) {
      return heuristic;
    }
    return fallbackSuggestion(payload);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getQuickAssistSuggestion,
};
