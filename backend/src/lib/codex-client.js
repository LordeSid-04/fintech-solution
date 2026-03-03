const { sha256 } = require("./hashing");

function extractFencedJson(text) {
  const fencedMatch = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fencedMatch?.[1]?.trim() || "";
}

function extractBalancedJson(text) {
  const value = String(text || "");
  const openers = ["{", "["];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!openers.includes(char)) continue;
    const stack = [char];
    let inString = false;
    let escaped = false;
    for (let cursor = index + 1; cursor < value.length; cursor += 1) {
      const current = value[cursor];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === "\\") {
          escaped = true;
          continue;
        }
        if (current === "\"") {
          inString = false;
        }
        continue;
      }
      if (current === "\"") {
        inString = true;
        continue;
      }
      if (current === "{" || current === "[") {
        stack.push(current);
        continue;
      }
      if (current === "}" || current === "]") {
        const last = stack[stack.length - 1];
        const pairMatches =
          (last === "{" && current === "}") || (last === "[" && current === "]");
        if (!pairMatches) {
          break;
        }
        stack.pop();
        if (!stack.length) {
          return value.slice(index, cursor + 1);
        }
      }
    }
  }
  return "";
}

function tryParseJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parseModelJson(text) {
  const direct = tryParseJson(text);
  if (direct) return direct;

  const fenced = extractFencedJson(text);
  const fencedParsed = tryParseJson(fenced);
  if (fencedParsed) return fencedParsed;

  const balanced = extractBalancedJson(text);
  return tryParseJson(balanced);
}

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
  const contentParts = [];
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  outputs.forEach((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    content.forEach((part) => {
      const text = toPartText(part);
      if (text) contentParts.push(text);
    });
  });
  if (contentParts.length) return contentParts.join("\n").trim();
  return "";
}

function extractOutputParsed(payload) {
  if (payload?.output_parsed && typeof payload.output_parsed === "object") {
    return payload.output_parsed;
  }
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of outputs) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.parsed && typeof part.parsed === "object") {
        return part.parsed;
      }
    }
  }
  return null;
}

function toResponseBody({ model, systemPrompt, userPrompt, responseSchema }) {
  const body = {
    model,
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
  };
  if (responseSchema?.schema && typeof responseSchema.schema === "object") {
    body.text = {
      format: {
        type: "json_schema",
        name: responseSchema.name || "agent_response",
        strict: true,
        schema: responseSchema.schema,
      },
    };
  }
  return body;
}

async function callCodex({ agentRole, systemPrompt, userPrompt, responseSchema }) {
  const now = new Date().toISOString();
  const model = process.env.OPENAI_MODEL || "gpt-5-codex";
  const key = process.env.OPENAI_API_KEY;

  if (!key) {
    const syntheticId = `harness-${sha256(`${agentRole}:${userPrompt}`).slice(0, 12)}`;
    return {
      text: JSON.stringify({ note: "OPENAI_API_KEY missing, using harness fallback." }),
      parsed: null,
      proof: {
        provider: "codex-harness",
        model,
        responseId: syntheticId,
        timestamp: now,
        agentRole,
      },
    };
  }

  try {
    const controller = new AbortController();
    const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 45000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: controller.signal,
        body: JSON.stringify(toResponseBody({ model, systemPrompt, userPrompt, responseSchema })),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}`);
    }

    const payload = await response.json();
    const text = extractOutputText(payload);
    const parsed = extractOutputParsed(payload) || parseModelJson(text);

    return {
      text,
      parsed,
      proof: {
        provider: "openai-api",
        model,
        responseId: payload.id || `openai-${sha256(text).slice(0, 12)}`,
        timestamp: now,
        agentRole,
      },
    };
  } catch (error) {
    const fallbackId = `harness-${sha256(`${agentRole}:${now}`).slice(0, 12)}`;
    return {
      text: JSON.stringify({ note: `OpenAI call failed (${error.message}); harness fallback used.` }),
      parsed: null,
      proof: {
        provider: "codex-harness",
        model,
        responseId: fallbackId,
        timestamp: now,
        agentRole,
      },
    };
  }
}

module.exports = {
  callCodex,
  __test: {
    extractBalancedJson,
    parseModelJson,
    extractOutputText,
    extractOutputParsed,
  },
};
