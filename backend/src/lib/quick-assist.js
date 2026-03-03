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
        max_output_tokens: 420,
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
      return fallback;
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
