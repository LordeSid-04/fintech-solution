"use client";

import { useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { inferCodeLanguage } from "@/lib/syntax";
import { buildIntentChecklist } from "@/lib/intent-checklist";

type ResponseViewerProps = {
  promptText?: string;
  assistantReply?: string;
  rationale?: string;
  generatedFiles?: Record<string, string>;
  streamLines?: string[];
};

export function ResponseViewer({
  promptText = "",
  assistantReply = "",
  rationale = "",
  generatedFiles = {},
  streamLines = [],
}: ResponseViewerProps) {
  const streamAnchorRef = useRef<HTMLDivElement | null>(null);
  const fileEntries = Object.entries(generatedFiles);
  const hasContent = Boolean(assistantReply.trim() || rationale.trim() || fileEntries.length || streamLines.length);
  const checklist = buildIntentChecklist({
    prompt: promptText,
    assistantReply,
    rationale,
    generatedFiles,
  });
  const passedChecks = checklist.items.filter((item) => item.passed).length;

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
      {assistantReply.trim() ? (
        <section className="rounded border border-white/10 bg-black/30 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/55">Assistant Reply</h4>
          <p className="mt-2 whitespace-pre-wrap">{assistantReply}</p>
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
          <p className="mt-2 whitespace-pre-wrap text-white/75">{rationale}</p>
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
