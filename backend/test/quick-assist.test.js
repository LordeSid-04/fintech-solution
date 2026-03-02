const test = require("node:test");
const assert = require("node:assert/strict");
const { getQuickAssistSuggestion } = require("../src/lib/quick-assist");

test("quick assist detects square mismatch and suggests exponentiation", async () => {
  const result = await getQuickAssistSuggestion({
    question: "why does this code not return the required output? im trying to square input",
    selectedFile: "test.py",
    selectedCode: "def square(x):\n  return x * 2",
    fileContent: "def square(x):\n  return x * 2\nprint(square(3))",
  });
  assert.match(result.suggestion, /doubling/i);
  assert.match(result.suggestion, /\*\* 2/);
  assert.match(result.relevantSnippet, /return x \* 2/);
});
