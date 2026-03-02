"use client";

import { DiffViewer } from "@/components/workspace/DiffViewer";
import type { DiffFinding, UnifiedDiffLine } from "@/lib/mockRun";

type EditorDiffTabsProps = {
  tab: "editor" | "diff";
  onTabChange: (tab: "editor" | "diff") => void;
  diffLines: UnifiedDiffLine[];
  findings: DiffFinding[];
  selectedFile: string;
  fileContent: string;
  onFileContentChange: (value: string) => void;
};

export function EditorDiffTabs({
  tab,
  onTabChange,
  diffLines,
  findings,
  selectedFile,
  fileContent,
  onFileContentChange,
}: EditorDiffTabsProps) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onTabChange("editor")}
          className={`rounded-full px-3 py-1 text-xs ${
            tab === "editor"
              ? "bg-violet-300/15 text-violet-100"
              : "text-white/75 hover:bg-white/[0.06]"
          }`}
        >
          Editor
        </button>
        <button
          type="button"
          onClick={() => onTabChange("diff")}
          className={`rounded-full px-3 py-1 text-xs ${
            tab === "diff"
              ? "bg-violet-300/15 text-violet-100"
              : "text-white/75 hover:bg-white/[0.06]"
          }`}
        >
          Diff Viewer
        </button>
      </div>

      {tab === "editor" ? (
        <div className="min-h-[300px] rounded-lg border border-white/10 bg-black/35 p-3">
          {selectedFile ? (
            <>
              <p className="text-xs text-white/55">{selectedFile}</p>
              <textarea
                value={fileContent}
                onChange={(event) => onFileContentChange(event.target.value)}
                placeholder="Type code or notes here..."
                className="mt-3 min-h-[260px] w-full rounded-md border border-white/12 bg-black/45 p-3 font-mono text-sm text-white/85 outline-none placeholder:text-white/35"
              />
            </>
          ) : (
            <p className="text-sm text-white/65">
              Run a prompt in the AI panel to generate files before editing.
            </p>
          )}
        </div>
      ) : (
        <DiffViewer diffLines={diffLines} findings={findings} />
      )}
    </section>
  );
}
