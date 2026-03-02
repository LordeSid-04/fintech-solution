import { describe, expect, it } from "vitest";
import { buildIntentChecklist, detectBuildIntent } from "@/lib/intent-checklist";

describe("intent checklist", () => {
  it("detects chatbot intent from prompt", () => {
    expect(detectBuildIntent("build an AI chatbot for me please")).toBe("chatbot");
  });

  it("passes chatbot checks for chatbot-shaped output", () => {
    const checklist = buildIntentChecklist({
      prompt: "build an AI chatbot for me please",
      assistantReply: "Built a responsive AI chatbot assistant.",
      rationale: "Added message thread, composer, and send actions.",
      generatedFiles: {
        "src/app/page.tsx": "chatbot assistant thread composer send message",
        "src/app/globals.css": "@media (max-width: 640px) {}",
        "preview/index.html": "<div>chatbot assistant</div>",
      },
    });
    const passed = checklist.items.filter((item) => item.passed).length;
    expect(checklist.intent).toBe("chatbot");
    expect(passed).toBe(checklist.items.length);
  });
});
