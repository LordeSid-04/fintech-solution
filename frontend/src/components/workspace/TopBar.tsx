import { ShieldCheck } from "lucide-react";
import type { GovernanceMode } from "@/lib/governance";

type TopBarProps = {
  mode: GovernanceMode;
  confidencePercent: number;
  onOpenPermissions: () => void;
  onOpenHistory: () => void;
};

const modeLabel: Record<GovernanceMode, string> = {
  assist: "Assist",
  pair: "Pair",
  autopilot: "Autopilot",
};

export function TopBar({
  mode,
  confidencePercent,
  onOpenPermissions,
  onOpenHistory,
}: TopBarProps) {
  return (
    <header className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-violet-300/35 bg-violet-300/12 px-3 py-1 text-xs font-semibold text-violet-100">
          {modeLabel[mode]} ({confidencePercent}%)
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenHistory}
            className="rounded-full border border-white/20 bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/85 transition hover:bg-white/[0.08]"
          >
            History
          </button>
          <button
            type="button"
            onClick={onOpenPermissions}
            className="rounded-full border border-white/20 bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/85 transition hover:bg-white/[0.08]"
          >
            Access
          </button>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/35 bg-violet-400/15 px-3 py-1 text-xs font-medium text-violet-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Audit: ON
          </div>
        </div>
      </div>
    </header>
  );
}
