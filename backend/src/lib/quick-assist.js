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

function buildSnippet(payload) {
  const selected = (payload.selectedCode || "").trim();
  const content = (payload.fileContent || "").trim();
  return selected || content;
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

function buildHeuristicSuggestion(payload) {
  const snippet = buildSnippet(payload);
  if (!snippet) {
    return null;
  }
  const squareMismatch = detectSquareMismatch(payload, snippet);
  if (squareMismatch) {
    return squareMismatch;
  }
  return null;
}

function fallbackSuggestion(payload) {
  const snippet = buildSnippet(payload) || "No relevant code snippet found.";
  return {
    suggestion: [
      "Start with one small, reversible change in the selected code path.",
      "Then run it immediately and compare expected vs actual output.",
      "If you share expected output, I can suggest a precise one-line fix.",
    ].join(" "),
    rationale:
      "Quick fallback was used because model response was unavailable. This keeps guidance fast and actionable.",
    relevantSnippet: snippet,
  };
}

async function getQuickAssistSuggestion(payload) {
  const heuristic = buildHeuristicSuggestion(payload);
  if (heuristic) {
    return heuristic;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return fallbackSuggestion(payload);
  }

  const model = process.env.OPENAI_FAST_MODEL || "gpt-4o-mini";
  const systemPrompt = [
    "You are a fast coding assistant for an in-browser editor.",
    "Return concise, friendly, human-readable help.",
    "Prioritize direct fixes and practical next steps.",
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
        max_output_tokens: 260,
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
      return fallbackSuggestion(payload);
    }
    const json = await response.json();
    const outputText =
      json.output_text ||
      json.output
        ?.flatMap((item) => item.content || [])
        ?.map((part) => part.text || "")
        ?.join("\n") ||
      "";
    const parsed = extractJsonObject(outputText);
    if (!parsed) {
      return fallbackSuggestion(payload);
    }
    const fallback = fallbackSuggestion(payload);
    return {
      suggestion:
        typeof parsed.suggestion === "string"
          ? parsed.suggestion
          : fallback.suggestion,
      rationale:
        typeof parsed.rationale === "string" ? parsed.rationale : fallback.rationale,
      relevantSnippet:
        typeof parsed.relevantSnippet === "string"
          ? parsed.relevantSnippet
          : fallback.relevantSnippet,
    };
  } catch {
    return fallbackSuggestion(payload);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getQuickAssistSuggestion,
};
