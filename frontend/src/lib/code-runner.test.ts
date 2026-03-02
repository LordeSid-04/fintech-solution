import { describe, expect, it } from "vitest";
import { runCodeInBrowser } from "@/lib/code-runner";

describe("runCodeInBrowser", () => {
  it("returns default output for unsupported languages", async () => {
    const result = await runCodeInBrowser("notes.txt", "hello");
    expect(result.status).toBe("success");
    expect(result.output).toContain("(no output)");
  });
});
