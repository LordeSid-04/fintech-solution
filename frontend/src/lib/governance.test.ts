import { getGovernanceConfig, getMode, clampPercent } from "./governance";

describe("governance helpers", () => {
  it("maps percentage ranges to expected modes", () => {
    expect(getMode(0)).toBe("assist");
    expect(getMode(29)).toBe("assist");
    expect(getMode(30)).toBe("pair");
    expect(getMode(70)).toBe("pair");
    expect(getMode(71)).toBe("autopilot");
    expect(getMode(100)).toBe("autopilot");
  });

  it("clamps confidence values to legal range", () => {
    expect(clampPercent(-4)).toBe(0);
    expect(clampPercent(55)).toBe(55);
    expect(clampPercent(200)).toBe(100);
  });

  it("returns governance config with required fields", () => {
    const config = getGovernanceConfig(55);
    expect(config.mode).toBe("pair");
    expect(config.label).toBe("Pair Mode");
    expect(config.description.length).toBeGreaterThan(10);
    expect(config.permissions.length).toBeGreaterThan(0);
    expect(config.permissions[0]).toHaveProperty("category");
    expect(config.permissions[0]).toHaveProperty("state");
    expect(config.riskPolicy).toBe("review_first");
  });

  it("keeps autopilot mode for upper range", () => {
    expect(getMode(90)).toBe("autopilot");
    expect(getMode(95)).toBe("autopilot");
  });
});
