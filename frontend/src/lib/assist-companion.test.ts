import {
  buildAssistCompanionPrompt,
  buildScopedExecutionPrompt,
  buildQuickAssistResponse,
  isCompanionOnlyConfidence,
} from "./assist-companion";

describe("assist companion helpers", () => {
  it("treats exactly zero confidence as companion-only mode", () => {
    expect(isCompanionOnlyConfidence(0)).toBe(true);
    expect(isCompanionOnlyConfidence(1)).toBe(false);
    expect(isCompanionOnlyConfidence(50)).toBe(false);
  });

  it("builds a scoped prompt when selected code is provided", () => {
    const prompt = buildAssistCompanionPrompt({
      question: "How can I simplify this?",
      selectedFile: "src/app.ts",
      selectedCode: "const a = foo(bar);",
    });

    expect(prompt).toContain("Focus only on the quoted code section");
    expect(prompt).toContain("File: src/app.ts");
    expect(prompt).toContain("const a = foo(bar);");
    expect(prompt).toContain("How can I simplify this?");
    expect(prompt).toContain("cannot apply patch");
  });

  it("returns empty prompt when no question and no selection", () => {
    expect(buildAssistCompanionPrompt({ question: "   " })).toBe("");
  });

  it("builds scoped execution prompt for pair/autopilot when selection exists", () => {
    const prompt = buildScopedExecutionPrompt({
      question: "Refactor this function",
      selectedFile: "src/app.ts",
      selectedCode: "const x = 1;",
      mode: "pair",
    });
    expect(prompt).toContain("Execution mode: Pair (50%)");
    expect(prompt).toContain("Selected file: src/app.ts");
    expect(prompt).toContain("only operate on the selected text");
    expect(prompt).toContain("const x = 1;");
  });

  it("returns original question for scoped execution when no selection", () => {
    const prompt = buildScopedExecutionPrompt({
      question: "Implement dashboard page",
      selectedCode: "",
      mode: "autopilot",
    });
    expect(prompt).toBe("Implement dashboard page");
  });

  it("builds quick local companion response with relevant snippet", () => {
    const result = buildQuickAssistResponse({
      question: "How do I fix print output?",
      selectedFile: "test.py",
      fileContent: 'print("hello")\nvalue = 3',
    });
    expect(result.assistantReply).toContain("Quick take");
    expect(result.highlightedSnippet.length).toBeGreaterThan(0);
  });

  it("detects square logic mismatch in fallback helper", () => {
    const result = buildQuickAssistResponse({
      question: "Why is my square output wrong?",
      selectedCode: "def square(x):\n  return x * 2",
    });
    expect(result.assistantReply).toContain("doubling");
    expect(result.assistantReply).toContain("** 2");
  });

  it("detects square mismatch when code is included in question text", () => {
    const result = buildQuickAssistResponse({
      question: [
        "why does this not return square?",
        "def square(x):",
        "  return x * 2",
        "print(square(3))",
      ].join("\n"),
    });
    expect(result.assistantReply).toContain("doubling");
    expect(result.assistantReply).toContain("** 2");
  });

  it("detects inverted even-check logic", () => {
    const result = buildQuickAssistResponse({
      question: "why is my even function wrong?",
      selectedCode: "def is_even(x):\n  return x % 2 == 1",
    });
    expect(result.assistantReply).toContain("inverted");
    expect(result.assistantReply).toContain("% 2 == 0");
  });
});
