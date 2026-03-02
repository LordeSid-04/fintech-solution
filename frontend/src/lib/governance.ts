export type GovernanceMode = "assist" | "pair" | "autopilot";
export type PermissionState = "allowed" | "gated" | "blocked";

export interface GovernancePermission {
  category:
    | "Suggestions & Planning"
    | "Code Changes"
    | "Checks (lint/tests/CI)"
    | "PR/Merge"
    | "Deploy"
    | "Protected Actions";
  label: string;
  state: PermissionState;
}

export interface GovernanceConfig {
  mode: GovernanceMode;
  label: "Manual Mode" | "Pair Mode" | "Autopilot with Gates";
  description: string;
  permissions: GovernancePermission[];
  riskPolicy: "strict_manual" | "review_first" | "traffic_light";
}

export function clampPercent(percent: number): number {
  if (Number.isNaN(percent)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(percent)));
}

export function getMode(percent: number): GovernanceMode {
  const value = clampPercent(percent);
  if (value <= 29) {
    return "assist";
  }
  if (value <= 70) {
    return "pair";
  }
  return "autopilot";
}

export function getPermissions(mode: GovernanceMode): GovernancePermission[] {
  const stateMap: Record<
    GovernancePermission["category"],
    Record<GovernanceMode, PermissionState>
  > = {
    "Suggestions & Planning": {
      assist: "allowed",
      pair: "allowed",
      autopilot: "allowed",
    },
    "Code Changes": {
      assist: "gated",
      pair: "allowed",
      autopilot: "allowed",
    },
    "Checks (lint/tests/CI)": {
      assist: "gated",
      pair: "allowed",
      autopilot: "allowed",
    },
    "PR/Merge": {
      assist: "blocked",
      pair: "gated",
      autopilot: "gated",
    },
    Deploy: {
      assist: "blocked",
      pair: "blocked",
      autopilot: "gated",
    },
    "Protected Actions": {
      assist: "blocked",
      pair: "blocked",
      autopilot: "blocked",
    },
  };

  const labels: Record<GovernancePermission["category"], string> = {
    "Suggestions & Planning": "Generate plans, assumptions, and reviewable scope",
    "Code Changes": "Generate and stage code diffs; apply follows confidence gates",
    "Checks (lint/tests/CI)": "Run verification workflows based on confidence policy",
    "PR/Merge": "Open PR drafts and progress merge if gates allow",
    Deploy: "Trigger deployment only when risk and approvals satisfy policy",
    "Protected Actions": "Perform high-risk or restricted operations",
  };

  return (Object.keys(stateMap) as GovernancePermission["category"][]).map(
    (category) => ({
      category,
      label: labels[category],
      state: stateMap[category][mode],
    })
  );
}

export function getGovernanceConfig(percent: number): GovernanceConfig {
  const mode = getMode(percent);

  if (mode === "assist") {
    return {
      mode,
      label: "Manual Mode",
      description: "Codex assists with suggestions and diffs; humans execute final actions.",
      permissions: getPermissions(mode),
      riskPolicy: "strict_manual",
    };
  }

  if (mode === "pair") {
    return {
      mode,
      label: "Pair Mode",
      description: "Codex and humans collaborate with checkpoints before sensitive operations.",
      permissions: getPermissions(mode),
      riskPolicy: "review_first",
    };
  }

  return {
    mode,
    label: "Autopilot with Gates",
    description: "Codex automates broader flows while policy and risk controls enforce stops.",
    permissions: getPermissions(mode),
    riskPolicy: "traffic_light",
  };
}
