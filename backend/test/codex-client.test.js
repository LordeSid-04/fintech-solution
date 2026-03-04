const test = require("node:test");
const assert = require("node:assert/strict");
const { callCodex, __test } = require("../src/lib/codex-client");

test("parseModelJson parses fenced JSON output", () => {
  const parsed = __test.parseModelJson("Here is the result:\n```json\n{\"ok\":true,\"count\":2}\n```");
  assert.deepEqual(parsed, { ok: true, count: 2 });
});

test("extractOutputText reads text from structured output parts", () => {
  const payload = {
    output: [
      {
        content: [
          { type: "output_text", text: { value: "{\"summary\":\"done\"}" } },
        ],
      },
    ],
  };
  const text = __test.extractOutputText(payload);
  assert.match(text, /summary/);
});

test("extractOutputParsed returns parsed object from output parts", () => {
  const payload = {
    output: [
      {
        content: [
          { type: "output_text", parsed: { summary: "ok" } },
        ],
      },
    ],
  };
  assert.deepEqual(__test.extractOutputParsed(payload), { summary: "ok" });
});

test("resolveCodexModel prefers explicit Codex model env", () => {
  const prevCodex = process.env.OPENAI_CODEX_MODEL;
  const prevOpenAi = process.env.OPENAI_MODEL;
  process.env.OPENAI_CODEX_MODEL = "gpt-5-codex";
  process.env.OPENAI_MODEL = "gpt-4o-mini";
  try {
    assert.equal(__test.resolveCodexModel(), "gpt-5-codex");
  } finally {
    process.env.OPENAI_CODEX_MODEL = prevCodex;
    process.env.OPENAI_MODEL = prevOpenAi;
  }
});

test("resolveCodexModelCandidates includes fallback chain without duplicates", () => {
  const previous = {
    OPENAI_CODEX_MODEL: process.env.OPENAI_CODEX_MODEL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_AUTOPILOT_FALLBACK_MODEL: process.env.OPENAI_AUTOPILOT_FALLBACK_MODEL,
    OPENAI_PAIR_MODEL: process.env.OPENAI_PAIR_MODEL,
    OPENAI_FAST_MODEL: process.env.OPENAI_FAST_MODEL,
  };
  process.env.OPENAI_CODEX_MODEL = "gpt-5-codex";
  process.env.OPENAI_MODEL = "gpt-4.1-mini";
  process.env.OPENAI_AUTOPILOT_FALLBACK_MODEL = "gpt-4o-mini";
  process.env.OPENAI_PAIR_MODEL = "gpt-4.1-mini";
  process.env.OPENAI_FAST_MODEL = "gpt-4o-mini";
  try {
    assert.deepEqual(__test.resolveCodexModelCandidates(), [
      "gpt-5-codex",
      "gpt-4.1-mini",
      "gpt-4o-mini",
    ]);
  } finally {
    process.env.OPENAI_CODEX_MODEL = previous.OPENAI_CODEX_MODEL;
    process.env.OPENAI_MODEL = previous.OPENAI_MODEL;
    process.env.OPENAI_AUTOPILOT_FALLBACK_MODEL = previous.OPENAI_AUTOPILOT_FALLBACK_MODEL;
    process.env.OPENAI_PAIR_MODEL = previous.OPENAI_PAIR_MODEL;
    process.env.OPENAI_FAST_MODEL = previous.OPENAI_FAST_MODEL;
  }
});

test("readWithTimeout throws timeout on stalled stream read", async () => {
  const reader = {
    read: () => new Promise(() => {}),
  };
  await assert.rejects(
    () => __test.readWithTimeout(reader, 20),
    (error) => error && error.code === "TIMEOUT"
  );
});

test("callCodex falls back to next model when primary times out", async () => {
  const previous = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_CODEX_MODEL: process.env.OPENAI_CODEX_MODEL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_AUTOPILOT_FALLBACK_MODEL: process.env.OPENAI_AUTOPILOT_FALLBACK_MODEL,
    OPENAI_PAIR_MODEL: process.env.OPENAI_PAIR_MODEL,
    OPENAI_FAST_MODEL: process.env.OPENAI_FAST_MODEL,
    OPENAI_TIMEOUT_MS: process.env.OPENAI_TIMEOUT_MS,
  };
  const previousFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_CODEX_MODEL = "gpt-5-codex";
  process.env.OPENAI_AUTOPILOT_FALLBACK_MODEL = "gpt-4o-mini";
  process.env.OPENAI_TIMEOUT_MS = "200";

  let callCount = 0;
  const requestedModels = [];
  global.fetch = async (_url, init = {}) => {
    callCount += 1;
    try {
      const parsedBody = JSON.parse(String(init.body || "{}"));
      requestedModels.push(parsedBody.model);
    } catch {
      requestedModels.push("unparsed");
    }
    if (callCount === 1) {
      const err = new Error("operation aborted");
      err.name = "AbortError";
      throw err;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "resp-2",
        output_text: "{\"result\":\"ok\"}",
      }),
    };
  };

  try {
    const result = await callCodex({
      agentRole: "ARCHITECT",
      systemPrompt: "system",
      userPrompt: "user",
      responseSchema: undefined,
    });
    assert.equal(requestedModels[0], "gpt-5-codex");
    assert.ok(callCount >= 2);
    if (requestedModels[1] && requestedModels[1] !== "unparsed") {
      assert.notEqual(requestedModels[1], "gpt-5-codex");
    }
    assert.ok(result.proof);
  } finally {
    process.env.OPENAI_API_KEY = previous.OPENAI_API_KEY;
    process.env.OPENAI_CODEX_MODEL = previous.OPENAI_CODEX_MODEL;
    process.env.OPENAI_MODEL = previous.OPENAI_MODEL;
    process.env.OPENAI_AUTOPILOT_FALLBACK_MODEL = previous.OPENAI_AUTOPILOT_FALLBACK_MODEL;
    process.env.OPENAI_PAIR_MODEL = previous.OPENAI_PAIR_MODEL;
    process.env.OPENAI_FAST_MODEL = previous.OPENAI_FAST_MODEL;
    process.env.OPENAI_TIMEOUT_MS = previous.OPENAI_TIMEOUT_MS;
    global.fetch = previousFetch;
  }
});
