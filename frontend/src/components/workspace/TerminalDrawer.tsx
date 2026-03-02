"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

type TerminalDrawerProps = {
  logs: string[];
  showAuditIndicator?: boolean;
};

export function TerminalDrawer({ logs, showAuditIndicator = true }: TerminalDrawerProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] px-3 pb-3 pt-2">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="mx-auto mb-2 flex w-full items-center justify-center rounded-md py-1 hover:bg-white/[0.04]"
        aria-label={isOpen ? "Collapse terminal drawer" : "Expand terminal drawer"}
      >
        <span className="h-1 w-14 rounded-full bg-white/25" />
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
          Logs
        </h2>
        <div className="flex items-center gap-2">
          {showAuditIndicator ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/35 bg-violet-400/15 px-2.5 py-1 text-[10px] font-medium text-violet-200">
              <ShieldCheck className="h-3 w-3" />
              Audit Recording ON
            </span>
          ) : null}
          <span className="text-[11px] text-white/60">{isOpen ? "Expanded" : "Collapsed"}</span>
        </div>
      </div>

      {isOpen ? (
        <div className="mt-3 max-h-44 overflow-auto rounded-lg border border-white/10 bg-black/35 p-3 font-mono text-xs text-white/75">
          {logs.length ? (
            logs.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)
          ) : (
            <p>[system] waiting for agent runs...</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
