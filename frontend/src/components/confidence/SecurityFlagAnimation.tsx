"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { DiffFinding } from "@/lib/mockRun";

type RiskTier = "LOW" | "MED" | "HIGH" | "CRITICAL" | "UNKNOWN";
type GateDecision = "ALLOWED" | "NEEDS_APPROVAL" | "BLOCKED" | "UNKNOWN";

type SecurityFlagAnimationProps = {
  findings: DiffFinding[];
  riskTier: RiskTier;
  gateDecision: GateDecision;
  isRunning: boolean;
  scanStepMs?: number;
};

const tierStyleMap: Record<RiskTier, string> = {
  LOW: "text-emerald-100 border-emerald-300/30 bg-emerald-300/10",
  MED: "text-amber-100 border-amber-300/30 bg-amber-300/10",
  HIGH: "text-orange-100 border-orange-300/30 bg-orange-300/10",
  CRITICAL: "text-rose-100 border-rose-300/30 bg-rose-300/10",
  UNKNOWN: "text-white/80 border-white/20 bg-white/[0.06]",
};

const gateStyleMap: Record<GateDecision, string> = {
  ALLOWED: "text-emerald-100 border-emerald-300/30 bg-emerald-300/10",
  NEEDS_APPROVAL: "text-amber-100 border-amber-300/30 bg-amber-300/10",
  BLOCKED: "text-rose-100 border-rose-300/30 bg-rose-300/10",
  UNKNOWN: "text-white/80 border-white/20 bg-white/[0.06]",
};

function normalizeTierScore(tier: RiskTier): number {
  switch (tier) {
    case "LOW":
      return 20;
    case "MED":
      return 50;
    case "HIGH":
      return 78;
    case "CRITICAL":
      return 95;
    default:
      return 0;
  }
}

function fallbackFindings(): DiffFinding[] {
  return [
    {
      id: "demo-low-1",
      severity: "LOW",
      title: "Style-only UI change",
      ruleName: "INFO-UI-001",
      lineNumber: 1,
      evidence: "+ update button spacing and text label",
      suggestedFixSnippet: "// no action needed",
    },
    {
      id: "demo-med-1",
      severity: "MED",
      title: "API change missing explicit test update",
      ruleName: "QUALITY-TEST-002",
      lineNumber: 2,
      evidence: "+ add new endpoint without corresponding unit test",
      suggestedFixSnippet: "// add unit/integration tests for new endpoint",
    },
    {
      id: "demo-high-1",
      severity: "HIGH",
      title: "Sensitive header logging detected",
      ruleName: "DIFF-LOG-005",
      lineNumber: 3,
      evidence: "+ logger.debug('headers', headers)",
      suggestedFixSnippet: "// redact token-bearing headers before logging",
    },
  ];
}

export function SecurityFlagAnimation({
  findings,
  riskTier,
  gateDecision,
  isRunning,
  scanStepMs = 420,
}: SecurityFlagAnimationProps) {
  const [scanCursor, setScanCursor] = useState(0);
  const renderedFindings = useMemo(
    () => (findings.length ? findings.slice(0, 5) : fallbackFindings()),
    [findings]
  );
  const riskScoreForBar = normalizeTierScore(riskTier);

  useEffect(() => {
    if (!isRunning) {
      setScanCursor(renderedFindings.length);
      return;
    }
    setScanCursor(0);
    const timer = window.setInterval(() => {
      setScanCursor((prev) => {
        if (prev >= renderedFindings.length) return prev;
        return prev + 1;
      });
    }, scanStepMs);
    return () => window.clearInterval(timer);
  }, [isRunning, renderedFindings.length, scanStepMs]);

  return (
    <div className="rounded-xl border border-white/10 bg-black/35 p-3">
      <p className="text-[11px] uppercase tracking-[0.08em] text-white/60">Scanner Replay</p>
      <div className="mt-2 space-y-1.5">
        {renderedFindings.map((finding, idx) => {
          const isActive = idx < scanCursor;
          return (
            <motion.div
              key={`${finding.id}-${idx}`}
              initial={{ opacity: 0.45, y: 2 }}
              animate={{ opacity: isActive ? 1 : 0.45, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`rounded border px-2 py-1 text-[11px] ${
                isActive
                  ? finding.severity === "CRITICAL"
                    ? "border-rose-300/35 bg-rose-300/10 text-rose-100"
                    : finding.severity === "HIGH"
                      ? "border-orange-300/35 bg-orange-300/10 text-orange-100"
                      : finding.severity === "MED"
                        ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                        : "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                  : "border-white/10 bg-white/[0.03] text-white/65"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>{finding.ruleName}</span>
                <span className="rounded-full border border-white/20 px-1.5 py-0.5 text-[10px]">
                  {finding.severity}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-white/85">{finding.evidence}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded border border-white/10 bg-black/30 p-2">
          <p className="text-[10px] uppercase tracking-[0.08em] text-white/60">Risk Tier</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tierStyleMap[riskTier]}`}>
              {riskTier}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-violet-300"
                animate={{ width: `${riskScoreForBar}%` }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
        <div className="rounded border border-white/10 bg-black/30 p-2">
          <p className="text-[10px] uppercase tracking-[0.08em] text-white/60">Gate Decision</p>
          <div className="mt-1">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${gateStyleMap[gateDecision]}`}>
              {gateDecision}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
