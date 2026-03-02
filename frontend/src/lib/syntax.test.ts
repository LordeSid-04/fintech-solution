import { describe, expect, it } from "vitest";
import { inferCodeLanguage } from "@/lib/syntax";

describe("inferCodeLanguage", () => {
  it("maps common source file types", () => {
    expect(inferCodeLanguage("src/app/page.tsx")).toBe("tsx");
    expect(inferCodeLanguage("src/lib/api.ts")).toBe("typescript");
    expect(inferCodeLanguage("scripts/hello.py")).toBe("python");
    expect(inferCodeLanguage("scripts/build.sh")).toBe("bash");
  });

  it("falls back to text for unknown extensions", () => {
    expect(inferCodeLanguage("README.unknown")).toBe("text");
  });
});
