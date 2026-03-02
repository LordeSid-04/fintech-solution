const { sha256 } = require("./hashing");

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

async function callCodex({ agentRole, systemPrompt, userPrompt }) {
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
        body: JSON.stringify({
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
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}`);
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
      parsed: extractJsonObject(text),
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
};
