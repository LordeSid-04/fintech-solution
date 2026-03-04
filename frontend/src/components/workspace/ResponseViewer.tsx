"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { inferCodeLanguage } from "@/lib/syntax";
import { buildIntentChecklist } from "@/lib/intent-checklist";
import type { DiffFinding } from "@/lib/mockRun";

type ResponseViewerProps = {
  promptText?: string;
  assistantReply?: string;
  rationale?: string;
  generatedFiles?: Record<string, string>;
  streamLines?: string[];
  contentFlags?: Array<{
    target: "assistantReply" | "rationale";
    start: number;
    end: number;
    severity: "LOW" | "MED" | "HIGH" | "CRITICAL";
    title: string;
    ruleName: string;
    evidence: string;
  }>;
  riskScore?: number | null;
  riskLabel?: "LOW" | "MEDIUM" | "HIGH" | null;
  findings?: DiffFinding[];
  riskDetails?: {
    topDrivers: string[];
    reasonCodes: string[];
    requiredControls: string[];
    blockReasons: string[];
  };
};

const highlightClassBySeverity = {
  LOW: "bg-emerald-300/20 text-emerald-100",
  MED: "bg-amber-300/20 text-amber-100",
  HIGH: "bg-orange-300/25 text-orange-100",
  CRITICAL: "bg-rose-300/25 text-rose-100",
} as const;

function renderRiskHighlightedText(
  value: string,
  annotations: ResponseViewerProps["contentFlags"]
) {
  const text = String(value || "");
  const ranges = (annotations || [])
    .filter((item) => item.start >= 0 && item.end > item.start && item.end <= text.length)
    .sort((a, b) => a.start - b.start);
  if (!ranges.length) return text;

  const chunks: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start < cursor) return;
    if (range.start > cursor) {
      chunks.push(text.slice(cursor, range.start));
    }
    chunks.push(
      <span
        key={`${range.target}-${range.start}-${range.end}-${index}`}
        title={`${range.title} (${range.ruleName})`}
        className={`rounded px-0.5 ${highlightClassBySeverity[range.severity]}`}
      >
        {text.slice(range.start, range.end)}
      </span>
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    chunks.push(text.slice(cursor));
  }
  return chunks;
}

export function ResponseViewer({
  promptText = "",
  assistantReply = "",
  rationale = "",
  generatedFiles = {},
  streamLines = [],
  contentFlags = [],
  riskScore = null,
  riskLabel = null,
  findings = [],
  riskDetails = {
    topDrivers: [],
    reasonCodes: [],
    requiredControls: [],
    blockReasons: [],
  },
}: ResponseViewerProps) {
  const streamAnchorRef = useRef<HTMLDivElement | null>(null);
  const [showRiskWhy, setShowRiskWhy] = useState(false);
  const fileEntries = Object.entries(generatedFiles);
  const hasContent = Boolean(assistantReply.trim() || rationale.trim() || fileEntries.length || streamLines.length);
  const checklist = buildIntentChecklist({
    prompt: promptText,
    assistantReply,
    rationale,
    generatedFiles,
  });
  const passedChecks = checklist.items.filter((item) => item.passed).length;
  const assistantFlags = useMemo(
    () => contentFlags.filter((item) => item.target === "assistantReply"),
    [contentFlags]
  );
  const rationaleFlags = useMemo(
    () => contentFlags.filter((item) => item.target === "rationale"),
    [contentFlags]
  );

  useEffect(() => {
    streamAnchorRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [streamLines.length]);

  if (!hasContent) {
    return (
      <p className="text-sm text-white/65">
        No model response yet. Run a prompt to view explanation and generated code.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-sm text-white/85">
      {riskLabel ? (
        <section className="rounded border border-white/10 bg-black/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                riskLabel === "LOW"
                  ? "border-emerald-300/35 bg-emerald-300/12 text-emerald-100"
                  : riskLabel === "MEDIUM"
                    ? "border-amber-300/35 bg-amber-300/12 text-amber-100"
                    : "border-rose-300/35 bg-rose-300/12 text-rose-100"
              }`}
            >
              FINAL RISK: {riskLabel}
            </span>
            <span className="text-xs text-white/70">
              {typeof riskScore === "number" ? `Score ${riskScore}/100` : "Score pending"}
            </span>
            <button
              type="button"
              onClick={() => setShowRiskWhy((prev) => !prev)}
              className="rounded border border-white/20 px-2 py-0.5 text-[10px] text-white/80 hover:bg-white/[0.08]"
            >
              {showRiskWhy ? "Hide details" : "Why?"}
            </button>
          </div>
          {showRiskWhy ? (
            <div className="mt-2 rounded border border-white/10 bg-black/35 p-2 text-xs text-white/75">
              {riskDetails.topDrivers.length ? <p>Top drivers: {riskDetails.topDrivers.join(", ")}</p> : null}
              {riskDetails.reasonCodes.length ? (
                <p className="mt-1">Reason codes: {riskDetails.reasonCodes.join(", ")}</p>
              ) : null}
              {riskDetails.requiredControls.length ? (
                <p className="mt-1">Required controls: {riskDetails.requiredControls.join(", ")}</p>
              ) : null}
              {riskDetails.blockReasons.length ? (
                <p className="mt-1">Block reasons: {riskDetails.blockReasons.join(" | ")}</p>
              ) : null}
              {findings.length ? (
                <p className="mt-1">Findings flagged: {findings.length}</p>
              ) : (
                <p className="mt-1">No scanner findings flagged in displayed content.</p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {assistantReply.trim() ? (
        <section className="rounded border border-white/10 bg-black/30 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/55">Assistant Reply</h4>
          <p className="mt-2 whitespace-pre-wrap">{renderRiskHighlightedText(assistantReply, assistantFlags)}</p>
        </section>
      ) : null}

      {streamLines.length ? (
        <section className="rounded border border-white/10 bg-black/30 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/55">
            Live Stream
          </h4>
          <p className="mt-1 text-[11px] text-white/55">
            Updating in real time while agents retrieve and synthesize results.
          </p>
          <div className="mt-2 max-h-56 space-y-1 overflow-auto font-mono text-xs text-white/75">
            {streamLines.map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
            <div ref={streamAnchorRef} />
          </div>
        </section>
      ) : null}

      {rationale.trim() ? (
        <section className="rounded border border-white/10 bg-black/30 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/55">Implementation Notes</h4>
          <p className="mt-2 whitespace-pre-wrap text-white/75">
            {renderRiskHighlightedText(rationale, rationaleFlags)}
          </p>
        </section>
      ) : null}

      {promptText.trim() ? (
        <section className="rounded border border-white/10 bg-black/30 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/55">
            Intent Fit Checklist
          </h4>
          <p className="mt-1 text-[11px] text-white/60">
            Intent: {checklist.intent} ({passedChecks}/{checklist.items.length} checks passed)
          </p>
          <div className="mt-2 space-y-1.5 text-xs text-white/80">
            {checklist.items.map((item) => (
              <p key={item.id}>
                {item.passed ? "✅" : "⚠️"} {item.label}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {fileEntries.length ? (
        <section className="rounded border border-white/10 bg-black/30 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/55">
            Generated Files ({fileEntries.length})
          </h4>
          <div className="mt-2 space-y-2">
            {fileEntries.map(([path, code]) => (
              <details key={path} className="rounded border border-white/10 bg-black/35" open>
                <summary className="cursor-pointer px-3 py-2 font-mono text-xs text-violet-100">{path}</summary>
                <SyntaxHighlighter
                  language={inferCodeLanguage(path)}
                  style={oneDark}
                  customStyle={{
                    margin: 0,
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 0,
                    background: "rgba(0,0,0,0.38)",
                    fontSize: "12px",
                  }}
                  showLineNumbers
                  wrapLongLines
                >
                  {code}
                </SyntaxHighlighter>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
