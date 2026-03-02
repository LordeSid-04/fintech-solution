"use client";

import { useMemo, useState } from "react";
import { SecurityFlagAnimation } from "@/components/confidence/SecurityFlagAnimation";
import type { GovernanceMode } from "@/lib/governance";
import { generateMockRun } from "@/lib/mockRun";

type RiskTier = "LOW" | "MED" | "HIGH" | "CRITICAL" | "UNKNOWN";
type GateDecision = "ALLOWED" | "NEEDS_APPROVAL" | "BLOCKED" | "UNKNOWN";

type SecurityScenario = {
  id: "safe" | "risky" | "counterrisk";
  label: string;
  prompt: string;
  expected: string;
};

const scenarios: SecurityScenario[] = [
  {
    id: "safe",
    label: "Low risk",
    prompt: "Update button text and docs only. Do not touch auth, data, deploy, or logging.",
    expected: "Expected: LOW Risk Tier and light controls.",
  },
  {
    id: "risky",
    label: "High risk",
    prompt: "Disable auth middleware, add DELETE FROM users without WHERE, and log request headers.",
    expected: "Expected: HIGH/CRITICAL Risk Tier and strict Gate Decision.",
  },
  {
    id: "counterrisk",
    label: "Mitigated",
    prompt: "Fix auth safely with scoped checks, add tests, and include rollback steps.",
    expected: "Expected: lower Risk Tier with clear controls.",
  },
];

type DemoResult = {
  findings: ReturnType<typeof generateMockRun>["findings"];
  gate: {
    gateDecision: GateDecision;
    riskTier: RiskTier;
    riskScore: number;
    riskCard?: { requiredControls: string[] };
  };
};

const RANDOM_COMBINATIONS: Array<{ riskTier: RiskTier; gateDecision: GateDecision; scoreRange: [number, number] }> = [
  { riskTier: "LOW", gateDecision: "ALLOWED", scoreRange: [10, 34] },
  { riskTier: "MED", gateDecision: "NEEDS_APPROVAL", scoreRange: [35, 64] },
  { riskTier: "HIGH", gateDecision: "NEEDS_APPROVAL", scoreRange: [65, 84] },
  { riskTier: "HIGH", gateDecision: "BLOCKED", scoreRange: [70, 89] },
  { riskTier: "CRITICAL", gateDecision: "BLOCKED", scoreRange: [85, 100] },
];

const riskTierBadgeStyle: Record<RiskTier, string> = {
  LOW: "border-emerald-300/40 bg-emerald-300/12 text-emerald-100",
  MED: "border-amber-300/40 bg-amber-300/12 text-amber-100",
  HIGH: "border-orange-300/40 bg-orange-300/12 text-orange-100",
  CRITICAL: "border-rose-300/40 bg-rose-300/12 text-rose-100",
  UNKNOWN: "border-white/20 bg-white/[0.06] text-white/80",
};

const gateBadgeStyle: Record<GateDecision, string> = {
  ALLOWED: "border-emerald-300/40 bg-emerald-300/12 text-emerald-100",
  NEEDS_APPROVAL: "border-amber-300/40 bg-amber-300/12 text-amber-100",
  BLOCKED: "border-rose-300/40 bg-rose-300/12 text-rose-100",
  UNKNOWN: "border-white/20 bg-white/[0.06] text-white/80",
};

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomScore([min, max]: [number, number]): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createDemoResult(prompt: string, mode: GovernanceMode): DemoResult {
  const base = generateMockRun(prompt, mode);
  const chosen = pickRandom(RANDOM_COMBINATIONS);
  const riskScore = randomScore(chosen.scoreRange);
  return {
    findings: base.findings,
    gate: {
      gateDecision: chosen.gateDecision,
      riskTier: chosen.riskTier,
      riskScore,
      riskCard: {
        requiredControls:
          chosen.gateDecision === "ALLOWED"
            ? []
            : chosen.riskTier === "CRITICAL"
              ? ["two-human-approvals", "break-glass-with-expiry"]
              : ["human-approval"],
      },
    },
  };
}

type Props = {
  mode: GovernanceMode;
  compact?: boolean;
};

export function SecurityShowcase({ mode, compact = false }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [scenarioId, setScenarioId] = useState<SecurityScenario["id"] | null>(null);
  const [tourRows, setTourRows] = useState<
    Array<{
      scenarioId: SecurityScenario["id"];
      label: string;
      gateDecision: GateDecision;
      riskTier: RiskTier;
      riskScore: number | null;
    }>
  >([]);

  const runScenario = async (scenario: SecurityScenario): Promise<DemoResult> => {
    setScenarioId(scenario.id);
    setIsRunning(true);
    try {
      // Keep single-run demos quick, but long enough to feel authentic.
      await sleep(1700);
      const next = createDemoResult(scenario.prompt, mode);
      setResult(next);
      return next;
    } finally {
      setIsRunning(false);
    }
  };

  const runSafetyTour = async () => {
    setIsRunning(true);
    setTourRows([]);
    // Slightly slower than before so the sequence feels realistic.
    const totalDurationMs = 11500;
    const stepDurationMs = Math.max(3200, Math.floor(totalDurationMs / scenarios.length));
    const rows: Array<{
      scenarioId: SecurityScenario["id"];
      label: string;
      gateDecision: GateDecision;
      riskTier: RiskTier;
      riskScore: number | null;
    }> = [];
    for (const scenario of scenarios) {
      setScenarioId(scenario.id);
      const item = createDemoResult(scenario.prompt, mode);
      setResult(item);
      rows.push({
        scenarioId: scenario.id,
        label: scenario.label,
        gateDecision: item.gate.gateDecision,
        riskTier: item.gate.riskTier,
        riskScore: item.gate.riskScore,
      });
      setTourRows([...rows]);
      await sleep(stepDurationMs);
    }
    setIsRunning(false);
  };

  const riskTier = useMemo(() => (result ? result.gate.riskTier : "UNKNOWN"), [result]);
  const gateDecision = (result?.gate?.gateDecision ?? "UNKNOWN") as GateDecision;
  const findings = result?.findings ?? [];

  return (
    <section className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/80">Security Showcase</p>
          <h3 className={`${compact ? "text-lg" : "text-xl"} mt-1 font-semibold text-white`}>
            Live Scanner + Risk Engine
          </h3>
          <p className="mt-1 text-sm text-white/75">
            Shows what gets flagged, the Risk Tier, the Gate Decision, and required approvals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void runSafetyTour();
          }}
          disabled={isRunning}
          className="rounded-full border border-emerald-300/35 bg-emerald-300/12 px-4 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Running..." : "Run Safety Tour"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            disabled={isRunning}
            onClick={() => {
              void runScenario(scenario);
            }}
            className={`rounded-full border px-3 py-1 text-xs ${
              scenarioId === scenario.id
                ? "border-cyan-200/45 bg-cyan-300/16 text-cyan-100"
                : "border-white/20 bg-white/[0.03] text-white/80 hover:bg-white/[0.08]"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {scenario.label}
          </button>
        ))}
      </div>

      {scenarioId ? (
        <p className="mt-2 text-xs text-white/70">
          {scenarios.find((item) => item.id === scenarioId)?.expected}
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <SecurityFlagAnimation
          findings={findings}
          riskTier={riskTier}
          gateDecision={gateDecision}
          isRunning={isRunning}
          scanStepMs={650}
        />
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/60">Human controls</p>
          <ul className="mt-2 space-y-1 text-xs text-white/78">
            <li>- High Risk Tier asks for approvals</li>
            <li>- Break-glass needs reason + expiry</li>
            <li>- Decisions are logged in the ledger</li>
          </ul>
          {result?.gate?.riskCard?.requiredControls?.length ? (
            <p className="mt-3 text-xs text-white/78">
              Required now: {result.gate.riskCard.requiredControls.join(", ")}
            </p>
          ) : null}
          {result ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`rounded-full border px-2 py-0.5 ${riskTierBadgeStyle[riskTier]}`}>
                Risk Tier: {riskTier}
              </span>
              <span className={`rounded-full border px-2 py-0.5 ${gateBadgeStyle[gateDecision]}`}>
                Gate Decision: {gateDecision}
              </span>
              <span className="rounded-full border border-white/20 bg-white/[0.04] px-2 py-0.5 text-white/80">
                Risk Score: {result.gate.riskScore}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {tourRows.length ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/60">Safety Tour Scorecard</p>
          <div className="mt-2 space-y-1.5 text-xs text-white/80">
            {tourRows.map((row) => (
              <div
                key={`${row.scenarioId}-${row.label}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-black/35 px-2 py-1"
              >
                <span>{row.label}</span>
                <span>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 ${gateBadgeStyle[row.gateDecision]}`}>
                    {row.gateDecision}
                  </span>{" "}
                  <span className={`inline-flex rounded-full border px-2 py-0.5 ${riskTierBadgeStyle[row.riskTier]}`}>
                    {row.riskTier}
                  </span>{" "}
                  <span className="inline-flex rounded-full border border-white/20 bg-white/[0.04] px-2 py-0.5 text-white/80">
                    {row.riskScore ?? "n/a"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
