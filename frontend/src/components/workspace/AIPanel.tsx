"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Code2, Copy, Eye, FileDiff, Logs, MessageSquareText, PanelBottomOpen, X } from "lucide-react";
import type { GovernanceMode, GovernancePermission, PermissionState } from "@/lib/governance";
import {
  fetchApprovalHistory,
  runGovernedPipeline,
  streamGovernedPipeline,
  type ApprovalHistoryEntry,
  type ApprovalRecord,
  type BreakGlassPayload,
  type CodexProofRecord,
  type GovernedRunResult,
  type PipelineStreamEvent,
} from "@/lib/backend-run";
import { DiffViewer } from "@/components/workspace/DiffViewer";
import { CodeEditor } from "@/components/workspace/CodeEditor";
import { ResponseViewer } from "@/components/workspace/ResponseViewer";
import {
  type DiffFinding,
  type MockRunResult,
  type RunTimelineStep,
  type UnifiedDiffLine,
} from "@/lib/mockRun";
import { inferCodeLanguage } from "@/lib/syntax";
import {
  buildAssistCompanionPrompt,
  buildScopedExecutionPrompt,
  isCompanionOnlyConfidence,
} from "@/lib/assist-companion";
import type { RunCodeResult } from "@/lib/code-runner";

type AIPanelProps = {
  mode: GovernanceMode;
  confidencePercent: number;
  permissions: GovernancePermission[];
  projectFiles?: Record<string, string>;
  previewHtml?: string;
  previewUrl?: string;
  selectedFile: string;
  filePaths: string[];
  fileContent: string;
  diffLines: UnifiedDiffLine[];
  findings: DiffFinding[];
  onSelectFile: (path: string) => void;
  onFileContentChange: (value: string) => void;
  onRunSelectedFile?: (path: string, content: string) => Promise<RunCodeResult | void> | RunCodeResult | void;
  onSaveSelectedFile?: (path: string, content: string) => Promise<void> | void;
  onSaveSelectedFileAs?: (path: string, content: string) => Promise<void> | void;
  onRenameSelectedFile?: (currentPath: string, nextPath: string) => void;
  editorRevision?: number;
  onRunGenerated: (result: MockRunResult) => void;
  onGeneratedFiles?: (files: Record<string, string>, options?: { streaming?: boolean }) => void;
  onGeneratedPreview?: (html: string) => void;
  onRunStart?: () => void;
  showWorkspaceViews?: boolean;
  onManualEditToggle: (enabled: boolean) => void;
  isResizable?: boolean;
  onResizeStart?: () => void;
};

const panelNotes: Record<GovernanceMode, string> = {
  assist: "AI gives suggestions only.",
  pair: "AI and human work together with reviews.",
  autopilot: "AI runs stages with checkpoints.",
};

const assistQuickPrompts = [
  "I am stuck. What should I try next?",
  "Give me a minimal safe diff for this issue.",
  "Suggest tests and commands I should run manually.",
] as const;

function toDisplayedTimelineModel() {
  return "gpt-5-codex";
}

function buildRunLogs(prompt: string, result: GovernedRunResult): string[] {
  const safeText = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return "";
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  const logs: string[] = [];
  logs.push(`[prompt] ${prompt}`);
  if (result.artifacts?.diff?.assistantReply) {
    logs.push(`[assistant] ${safeText(result.artifacts.diff.assistantReply)}`);
  }
  if (result.artifacts?.diff?.rationale) {
    logs.push(`[developer] ${safeText(result.artifacts.diff.rationale)}`);
  }
  if (result.artifacts?.test?.dryRunResults?.length) {
    for (const item of result.artifacts.test.dryRunResults) {
      logs.push(`[verifier] ${safeText(item)}`);
    }
  }
  if (result.artifacts?.ops?.deployPlan?.length) {
    logs.push(`[operator] deploy: ${result.artifacts.ops.deployPlan.join(" | ")}`);
  }
  if (result.gate?.gateDecision) {
    logs.push(`[governor] gate=${result.gate.gateDecision} risk=${result.gate.riskScore ?? "n/a"}`);
  }
  if (result.gate?.blockReasons?.length) {
    for (const reason of result.gate.blockReasons) {
      logs.push(`[governor] block reason: ${reason}`);
    }
  }
  if (!logs.length) {
    logs.push("[system] run completed");
  }
  return logs;
}

function isUnexpectedAgentPipeline(result: GovernedRunResult, mode: GovernanceMode): boolean {
  if (mode === "autopilot") return false;
  const agentOnlyRoles = new Set(["ARCHITECT", "VERIFIER", "OPERATOR", "GOVERNOR"]);
  return (result.proofs ?? []).some((item) => agentOnlyRoles.has(item.proof.agentRole));
}

function appendStreamLines(previous: string[], additions: string[]): string[] {
  return [...previous, ...additions].slice(-160);
}

function hasSuggestionContent(summary: {
  assistantReply: string;
  rationale: string;
  streamLines: string[];
}): boolean {
  return Boolean(
    summary.assistantReply.trim() ||
      summary.rationale.trim() ||
      summary.streamLines.some((line) => line.trim().length > 0)
  );
}

function toDisplayRiskLabel(
  riskTier?: "LOW" | "MED" | "HIGH" | "CRITICAL"
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (!riskTier) return "MEDIUM";
  if (riskTier === "LOW") return "LOW";
  if (riskTier === "MED") return "MEDIUM";
  if (riskTier === "CRITICAL") return "CRITICAL";
  return "HIGH";
}

function renderInlineRiskText(
  text: string,
  flags: Array<{
    start: number;
    end: number;
    severity: "LOW" | "MED" | "HIGH" | "CRITICAL";
    title: string;
    ruleName: string;
  }>
) {
  const safeText = String(text || "");
  if (!flags.length) return safeText;
  const sorted = [...flags]
    .filter((item) => item.start >= 0 && item.end > item.start && item.end <= safeText.length)
    .sort((a, b) => a.start - b.start);
  if (!sorted.length) return safeText;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((flag, index) => {
    if (flag.start < cursor) return;
    if (flag.start > cursor) nodes.push(safeText.slice(cursor, flag.start));
    const tint =
      flag.severity === "LOW"
        ? "bg-emerald-300/20 text-emerald-100"
        : flag.severity === "MED"
          ? "bg-amber-300/20 text-amber-100"
          : flag.severity === "HIGH"
            ? "bg-orange-300/25 text-orange-100"
            : "bg-rose-300/25 text-rose-100";
    nodes.push(
      <span
        key={`${flag.title}-${flag.start}-${flag.end}-${index}`}
        title={`${flag.title} (${flag.ruleName})`}
        className={`rounded px-0.5 ${tint}`}
      >
        {safeText.slice(flag.start, flag.end)}
      </span>
    );
    cursor = flag.end;
  });
  if (cursor < safeText.length) nodes.push(safeText.slice(cursor));
  return nodes;
}

export function AIPanel({
  mode,
  confidencePercent,
  permissions,
  projectFiles,
  previewHtml = "",
  previewUrl,
  selectedFile,
  filePaths,
  fileContent,
  diffLines,
  findings,
  onSelectFile,
  onFileContentChange,
  onRunSelectedFile,
  onSaveSelectedFile,
  onSaveSelectedFileAs,
  onRenameSelectedFile,
  editorRevision = 0,
  onRunGenerated,
  onGeneratedFiles,
  onGeneratedPreview,
  onRunStart,
  showWorkspaceViews = true,
  onManualEditToggle,
  isResizable = false,
  onResizeStart,
}: AIPanelProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [timeline, setTimeline] = useState<RunTimelineStep[]>([]);
  const [proofs, setProofs] = useState<CodexProofRecord[]>([]);
  const [runLogs, setRunLogs] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const [assistPrompt, setAssistPrompt] = useState("");
  const [manualEditMode, setManualEditMode] = useState(false);
  const [selectedCodeSnippet, setSelectedCodeSnippet] = useState("");
  const [editorRunResult, setEditorRunResult] = useState<RunCodeResult | null>(null);
  const [pairPendingFiles, setPairPendingFiles] = useState<Record<string, string>>({});
  const [runRiskLabel, setRunRiskLabel] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null>(null);
  const [runRiskScore, setRunRiskScore] = useState<number | null>(null);
  const [runRiskExpanded, setRunRiskExpanded] = useState(false);
  const [runRiskDetails, setRunRiskDetails] = useState<{
    topDrivers: string[];
    reasonCodes: string[];
    requiredControls: string[];
    blockReasons: string[];
    evidenceQuotes: string[];
  }>({
    topDrivers: [],
    reasonCodes: [],
    requiredControls: [],
    blockReasons: [],
    evidenceQuotes: [],
  });
  const [pairCopied, setPairCopied] = useState(false);
  const [pairDecision, setPairDecision] = useState<"approved" | "denied" | null>(null);
  const [viewerTab, setViewerTab] = useState<"preview" | "editor" | "diff" | "logs" | "response">(
    mode === "autopilot" ? "preview" : "editor"
  );
  const [responseSummary, setResponseSummary] = useState<{
    promptText: string;
    assistantReply: string;
    rationale: string;
    generatedFiles: Record<string, string>;
    streamLines: string[];
    highlightedSnippet: string;
    matchedTerms: string[];
    contentFlags: Array<{
      target: "assistantReply" | "rationale";
      start: number;
      end: number;
      severity: "LOW" | "MED" | "HIGH" | "CRITICAL";
      title: string;
      ruleName: string;
      evidence: string;
    }>;
  }>({
    promptText: "",
    assistantReply: "",
    rationale: "",
    generatedFiles: {},
    streamLines: [],
    highlightedSnippet: "",
    matchedTerms: [],
    contentFlags: [],
  });
  const [selectedAgentRole, setSelectedAgentRole] = useState<string>("");
  const [approvalModal, setApprovalModal] = useState<{
    isOpen: boolean;
    prompt: string;
    requiredApprovals: number;
    requireBreakGlass: boolean;
    approvalsNeeded: string[];
    blockReason: string;
  }>({
    isOpen: false,
    prompt: "",
    requiredApprovals: 1,
    requireBreakGlass: false,
    approvalsNeeded: [],
    blockReason: "",
  });
  const [approverOne, setApproverOne] = useState("");
  const [approverTwo, setApproverTwo] = useState("");
  const [breakGlassReason, setBreakGlassReason] = useState("");
  const [breakGlassExpiresAt, setBreakGlassExpiresAt] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryEntry[]>([]);
  const [isLoadingApprovalHistory, setIsLoadingApprovalHistory] = useState(false);
  const [viewerHeight, setViewerHeight] = useState(340);
  const [isResizingViewer, setIsResizingViewer] = useState(false);
  const [runStartedAtMs, setRunStartedAtMs] = useState<number | null>(null);
  const [responseElapsedMs, setResponseElapsedMs] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const autoResponseFollowRef = useRef(false);
  const userOverrodeResponseRef = useRef(false);
  const pendingLogLinesRef = useRef<string[]>([]);
  const pendingResponseLinesRef = useRef<string[]>([]);
  const streamFlushTimerRef = useRef<number | null>(null);
  const responseProgressTimerRef = useRef<number | null>(null);
  const runLogsRef = useRef<string[]>([]);
  const responseProgressCursorRef = useRef(0);
  const showPreviewTab = mode === "autopilot";

  const flushQueuedStreamUpdates = useCallback(() => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    if (pendingLogLinesRef.current.length) {
      const nextLogs = pendingLogLinesRef.current;
      pendingLogLinesRef.current = [];
      setRunLogs((prev) => [...prev, ...nextLogs].slice(-120));
    }
    if (pendingResponseLinesRef.current.length) {
      const nextResponseLines = pendingResponseLinesRef.current;
      pendingResponseLinesRef.current = [];
      setResponseSummary((prev) => ({
        ...prev,
        streamLines: appendStreamLines(prev.streamLines, nextResponseLines),
      }));
    }
  }, []);

  const queueStreamUiUpdate = useCallback(
    ({ logLines = [], responseLines = [] }: { logLines?: string[]; responseLines?: string[] }) => {
      if (logLines.length) {
        pendingLogLinesRef.current.push(...logLines);
      }
      if (responseLines.length) {
        pendingResponseLinesRef.current.push(...responseLines);
      }
      if (streamFlushTimerRef.current !== null) {
        return;
      }
      streamFlushTimerRef.current = window.setTimeout(() => {
        flushQueuedStreamUpdates();
      }, 120);
    },
    [flushQueuedStreamUpdates]
  );

  const stopResponseProgressUpdates = useCallback(() => {
    if (responseProgressTimerRef.current !== null) {
      window.clearInterval(responseProgressTimerRef.current);
      responseProgressTimerRef.current = null;
    }
  }, []);

  const isProgressEligibleLogLine = useCallback((line: string) => {
    const normalized = String(line || "").trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith("[prompt]") || normalized.startsWith("[governance]")) {
      return false;
    }
    return /^\[(system|architect|developer|verifier|operator|error)\]/i.test(normalized);
  }, []);

  const pushResponseProgressFromLogs = useCallback(() => {
    const logs = runLogsRef.current;
    if (!logs.length) return;
    const unread = logs.slice(responseProgressCursorRef.current);
    const latestMeaningful =
      [...unread]
        .reverse()
        .find((line) => isProgressEligibleLogLine(line)) ||
      [...logs].reverse().find((line) => isProgressEligibleLogLine(line));
    responseProgressCursorRef.current = logs.length;
    if (!latestMeaningful) return;
    setResponseSummary((prev) => ({
      ...prev,
      streamLines: appendStreamLines(prev.streamLines, [
        `[system] Progress update: ${latestMeaningful}`,
      ]),
    }));
  }, [isProgressEligibleLogLine]);

  const startResponseProgressUpdates = useCallback(() => {
    stopResponseProgressUpdates();
    responseProgressTimerRef.current = window.setInterval(() => {
      pushResponseProgressFromLogs();
    }, 30000);
  }, [pushResponseProgressFromLogs, stopResponseProgressUpdates]);

  useEffect(() => {
    if (!isResizingViewer) {
      return;
    }
    const onMouseMove = (event: MouseEvent) => {
      const bounds = panelRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const nextHeight = bounds.bottom - event.clientY - 64;
      setViewerHeight(Math.max(220, Math.min(560, nextHeight)));
    };
    const onMouseUp = () => setIsResizingViewer(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizingViewer]);

  useEffect(() => {
    if (mode === "autopilot" && previewHtml?.trim() && !isSubmitting) {
      setViewerTab("preview");
    }
  }, [mode, previewHtml, isSubmitting]);

  useEffect(() => {
    if (!showPreviewTab && viewerTab === "preview") {
      setViewerTab("editor");
    }
  }, [showPreviewTab, viewerTab]);

  useEffect(() => {
    return () => {
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current);
      }
      if (responseProgressTimerRef.current !== null) {
        window.clearInterval(responseProgressTimerRef.current);
      }
      streamFlushTimerRef.current = null;
      responseProgressTimerRef.current = null;
      pendingLogLinesRef.current = [];
      pendingResponseLinesRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!isSubmitting || runStartedAtMs === null) {
      return;
    }
    setResponseElapsedMs(Math.max(0, Date.now() - runStartedAtMs));
    const timer = window.setInterval(() => {
      setResponseElapsedMs(Math.max(0, Date.now() - runStartedAtMs));
    }, 100);
    return () => {
      window.clearInterval(timer);
    };
  }, [isSubmitting, runStartedAtMs]);

  useEffect(() => {
    runLogsRef.current = runLogs;
  }, [runLogs]);

  useEffect(() => {
    if (mode === "autopilot") {
      return;
    }
    if (viewerTab === "response") {
      setViewerTab("editor");
    }
  }, [mode, viewerTab]);

  const maybeAutoSwitchToResponse = useCallback(() => {
    if (mode !== "autopilot") {
      return;
    }
    if (!autoResponseFollowRef.current || userOverrodeResponseRef.current) {
      return;
    }
    setViewerTab("response");
  }, [mode]);

  const handleViewerTabChange = useCallback(
    (nextTab: "preview" | "editor" | "diff" | "logs" | "response") => {
      setViewerTab(nextTab);
      if (mode === "autopilot" && isSubmitting && nextTab !== "response") {
        userOverrodeResponseRef.current = true;
        autoResponseFollowRef.current = false;
      }
    },
    [isSubmitting, mode]
  );

  const refreshApprovalHistory = useCallback(async () => {
    setIsLoadingApprovalHistory(true);
    try {
      const history = await fetchApprovalHistory(20);
      setApprovalHistory(history);
    } catch {
      setApprovalHistory([]);
    } finally {
      setIsLoadingApprovalHistory(false);
    }
  }, []);

  useEffect(() => {
    refreshApprovalHistory();
  }, [refreshApprovalHistory]);

  const runWithGovernance = async (
    promptInput: string,
    approvals: ApprovalRecord[] = [],
    breakGlass?: BreakGlassPayload
  ) => {
    const runStartedAt = Date.now();
    flushQueuedStreamUpdates();
    setIsSubmitting(true);
    setRunStartedAtMs(runStartedAt);
    setResponseElapsedMs(0);
    onRunStart?.();
    setTimeline([]);
    setProofs([]);
    setApprovalError("");
    setResponseSummary({
      promptText: promptInput,
      assistantReply: "",
      rationale: "",
      generatedFiles: {},
      streamLines: [
        "[system] This process usually takes a while. Real-time progress is shown in Logs, and updates will appear here every 30 seconds.",
      ],
      highlightedSnippet: "",
      matchedTerms: [],
      contentFlags: [],
    });
    setPairPendingFiles({});
    setRunRiskLabel(null);
    setRunRiskScore(null);
    setRunRiskExpanded(false);
    setRunRiskDetails({
      topDrivers: [],
      reasonCodes: [],
      requiredControls: [],
      blockReasons: [],
      evidenceQuotes: [],
    });
    setPairCopied(false);
    setPairDecision(null);
    const initialRunLogs = [
      `[prompt] ${promptInput}`,
      approvals.length
        ? `[governance] approval context attached (${approvals.length} approver(s))`
        : "[system] Starting governed CodexGo pipeline...",
    ];
    setRunLogs(initialRunLogs);
    runLogsRef.current = initialRunLogs;
    responseProgressCursorRef.current = initialRunLogs.length;
    startResponseProgressUpdates();
    let hasStreamOutput = false;
    try {
      const seenTimelineIds = new Set<string>();
      const streamProofs: CodexProofRecord[] = [];
      if (mode === "autopilot") {
        autoResponseFollowRef.current = true;
        userOverrodeResponseRef.current = false;
        maybeAutoSwitchToResponse();
      }
      const runResult = await streamGovernedPipeline(
        promptInput,
        mode,
        confidencePercent,
        (event: PipelineStreamEvent) => {
          if (event.type === "heartbeat") return;
          if (event.type === "run_started") {
            hasStreamOutput = true;
            queueStreamUiUpdate({ logLines: [`[system] Run started (${event.runId})`] });
            maybeAutoSwitchToResponse();
            return;
          }
          if (event.type === "agent_output") {
            hasStreamOutput = true;
            queueStreamUiUpdate({
              logLines: [`[${event.agentRole.toLowerCase()}] ${event.stage}`, event.content],
            });
            if (
              mode !== "autopilot" &&
              event.agentRole === "DEVELOPER" &&
              event.content.trim().length
            ) {
              setResponseSummary((prev) => ({
                ...prev,
                assistantReply: prev.assistantReply.trim() ? prev.assistantReply : event.content,
                streamLines: appendStreamLines(prev.streamLines, [event.content]),
              }));
            }
            maybeAutoSwitchToResponse();
            if (event.proof) {
              streamProofs.push({
                step: `${event.agentRole.toLowerCase()}-${event.stage}`,
                proof: event.proof,
              });
              setProofs([...streamProofs]);
            }
            return;
          }
          if (event.type === "stage_started") {
            hasStreamOutput = true;
            queueStreamUiUpdate({
              logLines: [`[${event.agentRole.toLowerCase()}] ${event.message}`],
            });
            maybeAutoSwitchToResponse();
            return;
          }
          if (event.type === "generated_files") {
            hasStreamOutput = true;
            if (mode !== "pair") {
              onGeneratedFiles?.(event.files, { streaming: false });
            } else {
              setPairPendingFiles((prev) => ({ ...prev, ...event.files }));
            }
            setResponseSummary((prev) => ({
              ...prev,
              generatedFiles: { ...prev.generatedFiles, ...event.files },
            }));
            const count = Object.keys(event.files).length;
            queueStreamUiUpdate({
              logLines: [`[developer] Generated ${count} file(s) from your prompt.`],
            });
            maybeAutoSwitchToResponse();
            return;
          }
          if (event.type === "generated_file_chunk") {
            hasStreamOutput = true;
            if (mode !== "pair") {
              onGeneratedFiles?.(
                {
                  [event.path]: event.content,
                },
                { streaming: true }
              );
            } else {
              setPairPendingFiles((prev) => ({ ...prev, [event.path]: event.content }));
            }
            setResponseSummary((prev) => ({
              ...prev,
              generatedFiles: { ...prev.generatedFiles, [event.path]: event.content },
            }));
            if (event.done) {
              queueStreamUiUpdate({
                logLines: [`[developer] Finished streaming ${event.path}`],
              });
            }
            maybeAutoSwitchToResponse();
            return;
          }
          if (event.type === "generated_preview") {
            onGeneratedPreview?.(event.html);
            queueStreamUiUpdate({
              logLines: ["[developer] Generated a live preview for this app."],
            });
            maybeAutoSwitchToResponse();
            return;
          }
          if (event.type === "control_required") {
            hasStreamOutput = true;
            queueStreamUiUpdate({
              logLines: [`[governor] controls required: ${event.controls.join(", ")}`],
            });
            return;
          }
          if (event.type === "timeline_step") {
            hasStreamOutput = true;
            setTimeline((prev) => {
              if (seenTimelineIds.has(event.step.id)) {
                return prev.map((item) => (item.id === event.step.id ? event.step : item));
              }
              seenTimelineIds.add(event.step.id);
              return [...prev, event.step];
            });
            return;
          }
          if (event.type === "run_error") {
            hasStreamOutput = true;
            queueStreamUiUpdate({ logLines: [`[error] ${event.message}`] });
          }
        },
        projectFiles,
        approvals,
        breakGlass
      );

      flushQueuedStreamUpdates();
      setTimeline(runResult.timeline);
      setProofs(runResult.proofs ?? streamProofs);
      setRunLogs((prev) => [...prev, ...buildRunLogs(promptInput, runResult)].slice(-120));
      if (isUnexpectedAgentPipeline(runResult, mode)) {
        setRunLogs((prev) =>
          [
            ...prev,
            "[system] Detected stale backend behavior: Assist/Pair request ran through agent stages. Verify NEXT_PUBLIC_BACKEND_URL points to the latest backend deployment.",
          ].slice(-120)
        );
      }
      setResponseSummary((prev) => ({
        promptText: prev.promptText || promptInput,
        assistantReply: runResult.artifacts?.diff?.assistantReply ?? prev.assistantReply,
        rationale: runResult.artifacts?.diff?.rationale ?? prev.rationale,
        generatedFiles: {
          ...prev.generatedFiles,
          ...(runResult.artifacts?.diff?.generatedFiles ?? {}),
        },
        streamLines: appendStreamLines(prev.streamLines, ["[SYSTEM] Final response ready."]),
        highlightedSnippet: "",
        matchedTerms: [],
        contentFlags: runResult.artifacts?.diff?.contentFlags ?? [],
      }));
      const mergedFiles = runResult.artifacts?.diff?.generatedFiles ?? {};
      if (mode === "pair" && Object.keys(mergedFiles).length) {
        setPairPendingFiles((prev) => ({ ...prev, ...mergedFiles }));
      }
      setRunRiskLabel(toDisplayRiskLabel(runResult.gate?.riskTier));
      setRunRiskScore(typeof runResult.gate?.riskScore === "number" ? runResult.gate.riskScore : null);
      setRunRiskDetails({
        topDrivers: runResult.gate?.riskCard?.topDrivers ?? [],
        reasonCodes: runResult.gate?.reasonCodes ?? [],
        requiredControls: runResult.gate?.riskCard?.requiredControls ?? [],
        blockReasons: runResult.gate?.blockReasons ?? [],
        evidenceQuotes: runResult.gate?.riskCard?.evidenceQuotes ?? [],
      });
      if (mode === "autopilot") {
        maybeAutoSwitchToResponse();
      } else {
        setViewerTab("editor");
      }
      onRunGenerated(runResult);

      const gateDecision = runResult.gate?.gateDecision;
      const approvalsNeeded = runResult.gate?.approvalsNeeded ?? [];
      const requireBreakGlass = Boolean(
        runResult.gate?.blockReasons?.some((item) => item.toLowerCase().includes("break-glass"))
      );
      if (gateDecision === "NEEDS_APPROVAL" || (gateDecision === "BLOCKED" && requireBreakGlass)) {
        setApprovalModal({
          isOpen: true,
          prompt: promptInput,
          requiredApprovals: Math.max(1, approvalsNeeded.length || 1),
          requireBreakGlass,
          approvalsNeeded,
          blockReason: runResult.gate?.blockReasons?.[0] || "",
        });
        setApproverOne("");
        setApproverTwo("");
        setBreakGlassReason("");
        setBreakGlassExpiresAt("");
      } else {
        setApprovalModal((prev) => ({ ...prev, isOpen: false }));
      }
      await refreshApprovalHistory();
      return runResult;
    } catch {
      try {
        setRunLogs((prev) => [...prev, "[system] Stream unavailable. Retrying with standard backend run..."].slice(-120));
        const runResult = await runGovernedPipeline(
          promptInput,
          mode,
          confidencePercent,
          projectFiles,
          approvals,
          breakGlass
        );
        setTimeline(runResult.timeline);
        setProofs(runResult.proofs ?? []);
        if (runResult.artifacts?.diff?.generatedFiles && mode !== "pair") {
          onGeneratedFiles?.(runResult.artifacts.diff.generatedFiles);
        }
        if (mode === "pair") {
          setPairPendingFiles(runResult.artifacts?.diff?.generatedFiles ?? {});
        }
        setRunRiskLabel(toDisplayRiskLabel(runResult.gate?.riskTier));
        setRunRiskScore(typeof runResult.gate?.riskScore === "number" ? runResult.gate.riskScore : null);
        setRunRiskDetails({
          topDrivers: runResult.gate?.riskCard?.topDrivers ?? [],
          reasonCodes: runResult.gate?.reasonCodes ?? [],
          requiredControls: runResult.gate?.riskCard?.requiredControls ?? [],
          blockReasons: runResult.gate?.blockReasons ?? [],
          evidenceQuotes: runResult.gate?.riskCard?.evidenceQuotes ?? [],
        });
        setRunLogs((prev) => [...prev, ...buildRunLogs(promptInput, runResult)].slice(-120));
        if (isUnexpectedAgentPipeline(runResult, mode)) {
          setRunLogs((prev) =>
            [
              ...prev,
              "[system] Detected stale backend behavior: Assist/Pair request ran through agent stages. Verify NEXT_PUBLIC_BACKEND_URL points to the latest backend deployment.",
            ].slice(-120)
          );
        }
        setResponseSummary({
          promptText: promptInput,
          assistantReply: runResult.artifacts?.diff?.assistantReply ?? "",
          rationale: runResult.artifacts?.diff?.rationale ?? "",
          generatedFiles: runResult.artifacts?.diff?.generatedFiles ?? {},
          streamLines: appendStreamLines(
            [
              "[system] This process usually takes a while. Real-time progress is shown in Logs, and updates will appear here every 30 seconds.",
            ],
            runResult.artifacts?.diff?.assistantReply
              ? [runResult.artifacts.diff.assistantReply]
              : ["[SYSTEM] Final response ready."]
          ),
          highlightedSnippet: "",
          matchedTerms: [],
          contentFlags: runResult.artifacts?.diff?.contentFlags ?? [],
        });
        if (mode === "autopilot") {
          maybeAutoSwitchToResponse();
        } else {
          setViewerTab("editor");
        }
        onRunGenerated(runResult);
        await refreshApprovalHistory();
        return runResult;
      } catch {
        if (hasStreamOutput) {
          setRunLogs((prev) => [...prev, "[system] Connection interrupted. Partial results are shown."].slice(-120));
          return null;
        }
        setRunLogs((prev) => [
          ...prev,
          "[error] Backend request failed and no response could be recovered.",
          "[hint] Verify OPENAI_API_KEY and model permissions in backend configuration.",
        ]);
        throw new Error("Backend run failed with no recoverable response.");
      }
    } finally {
      flushQueuedStreamUpdates();
      stopResponseProgressUpdates();
      setResponseElapsedMs(Math.max(0, Date.now() - runStartedAt));
      autoResponseFollowRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    const rawPrompt = assistPrompt.trim();
    if (!rawPrompt) return;
    const nextPrompt = mode === "assist"
      ? buildAssistCompanionPrompt({
          question: rawPrompt,
          selectedFile,
          selectedCode: selectedCodeSnippet,
        })
      : mode === "pair"
        ? buildScopedExecutionPrompt({
            question: rawPrompt,
            selectedFile,
            selectedCode: selectedCodeSnippet,
            mode: "pair",
          })
        : rawPrompt;
    if (!nextPrompt) return;
    await runWithGovernance(nextPrompt);
  };

  const handleApprovalSubmit = async () => {
    if (!approvalModal.prompt.trim()) return;
    const approvers = [approverOne.trim(), approverTwo.trim()].filter(Boolean);
    const uniqueApprovers = Array.from(new Set(approvers));
    if (uniqueApprovers.length < approvalModal.requiredApprovals) {
      setApprovalError(`Provide ${approvalModal.requiredApprovals} distinct approver(s).`);
      return;
    }

    let breakGlass: BreakGlassPayload | undefined;
    if (approvalModal.requireBreakGlass) {
      if (!breakGlassReason.trim() || !breakGlassExpiresAt.trim()) {
        setApprovalError("Break-glass reason and expiry are required for this action.");
        return;
      }
      breakGlass = {
        reason: breakGlassReason.trim(),
        expiresAt: breakGlassExpiresAt,
        postActionReviewRequired: true,
      };
    }

    const approvalRecords: ApprovalRecord[] = uniqueApprovers.map((approverId) => ({
      approverId,
      approvedAt: new Date().toISOString(),
    }));

    await runWithGovernance(approvalModal.prompt, approvalRecords, breakGlass);
  };

  const pairPrimaryPath = useMemo(() => Object.keys(pairPendingFiles)[0] ?? "", [pairPendingFiles]);
  const pairPrimaryCode = pairPrimaryPath ? pairPendingFiles[pairPrimaryPath] ?? "" : "";
  const showSuggestionsBox =
    mode === "pair"
      ? Boolean(pairPrimaryCode || hasSuggestionContent(responseSummary))
      : hasSuggestionContent(responseSummary);
  const assistantContentFlags = responseSummary.contentFlags.filter(
    (item) => item.target === "assistantReply"
  );
  const rationaleContentFlags = responseSummary.contentFlags.filter(
    (item) => item.target === "rationale"
  );

  const getPermissionState = (
    category: GovernancePermission["category"]
  ): PermissionState => {
    return permissions.find((permission) => permission.category === category)?.state ?? "blocked";
  };

  const codeChangeState = getPermissionState("Code Changes");
  const prMergeState = getPermissionState("PR/Merge");
  const deployState = getPermissionState("Deploy");
  const isHumanGuided = mode !== "autopilot";
  const companionOnly = mode === "assist" && isCompanionOnlyConfidence(confidencePercent);
  const currentGateDecision = timeline[timeline.length - 1]?.gateDecision;
  const availableAgentRoles = useMemo(
    () =>
      Array.from(
        new Set([
          ...proofs.map((item) => item.proof.agentRole),
          ...timeline.map((step) => step.agentRole.toUpperCase()),
        ])
      ),
    [proofs, timeline]
  );
  useEffect(() => {
    if (!availableAgentRoles.length) {
      setSelectedAgentRole("");
      return;
    }
    if (!selectedAgentRole || !availableAgentRoles.includes(selectedAgentRole)) {
      setSelectedAgentRole(availableAgentRoles[0]);
    }
  }, [availableAgentRoles, selectedAgentRole]);
  const filteredProofRows = selectedAgentRole
    ? proofs.filter((item) => item.proof.agentRole === selectedAgentRole)
    : [];
  const filteredTimelineRows = selectedAgentRole
    ? timeline.filter((item) => item.agentRole.toUpperCase() === selectedAgentRole)
    : timeline;

  return (
    <aside ref={panelRef} className="relative rounded-xl border border-white/10 bg-white/[0.02] p-3">
      {isResizable ? (
        <button
          type="button"
          onMouseDown={onResizeStart}
          aria-label="Resize AI panel"
          className="absolute -left-2 top-1/2 hidden h-24 w-2 -translate-y-1/2 cursor-col-resize rounded-full border border-white/20 bg-white/[0.06] xl:block"
        />
      ) : null}
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
        AI Panel
      </h2>
      <div className="mt-3 rounded-lg border border-violet-300/20 bg-violet-300/[0.05] p-3">
        <p className="text-sm font-medium text-violet-100">Mode: {mode}</p>
        <p className="mt-2 text-sm text-white/80">{panelNotes[mode]}</p>
        {runRiskLabel ? (
          <div className="mt-3 rounded-md border border-white/12 bg-black/25 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  runRiskLabel === "LOW"
                    ? "border-emerald-300/35 bg-emerald-300/12 text-emerald-100"
                    : runRiskLabel === "MEDIUM"
                      ? "border-amber-300/35 bg-amber-300/12 text-amber-100"
                      : runRiskLabel === "CRITICAL"
                        ? "border-fuchsia-300/40 bg-fuchsia-300/14 text-fuchsia-100"
                      : "border-rose-300/35 bg-rose-300/12 text-rose-100"
                }`}
              >
                RISK {runRiskLabel}
              </span>
              <span className="text-[11px] text-white/70">
                {runRiskScore !== null ? `${runRiskScore}/100` : "pending"}
              </span>
              <button
                type="button"
                onClick={() => setRunRiskExpanded((prev) => !prev)}
                className="rounded border border-white/20 px-2 py-0.5 text-[10px] text-white/80 hover:bg-white/[0.08]"
              >
                {runRiskExpanded ? "Hide why" : "Why?"}
              </button>
            </div>
            {runRiskExpanded ? (
              <div className="mt-2 text-[10px] text-white/75">
                {runRiskDetails.topDrivers.length ? (
                  <p>Top drivers: {runRiskDetails.topDrivers.join(", ")}</p>
                ) : (
                  <p>No high-risk drivers were detected in this run.</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={isHumanGuided ? "mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start" : ""}>
        <div className={isHumanGuided ? "xl:order-2" : ""}>
        <AnimatePresence mode="wait">
          {mode === "assist" ? (
            <motion.div
              key="assist-controls"
              initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
              className="mt-4 rounded-lg border border-white/12 bg-black/30 p-3"
            >
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-full border border-violet-300/35 bg-violet-300/12 px-3 py-1 text-xs font-medium text-violet-100 hover:bg-violet-300/20"
              >
                {isSubmitting ? "Generating..." : "Generate Suggestion"}
              </button>

              <button
                type="button"
                onClick={() => setAutocompleteEnabled((prev) => !prev)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                  autocompleteEnabled
                    ? "border-violet-300/35 bg-violet-300/15 text-violet-100"
                    : "border-white/20 bg-white/[0.02] text-white/70"
                }`}
              >
                {autocompleteEnabled ? "ON" : "OFF"}
              </button>
            </div>

            <textarea
              value={assistPrompt}
              onChange={(event) => setAssistPrompt(event.target.value)}
              placeholder={
                companionOnly
                  ? "What are you stuck on? AI will respond quickly with manual-only suggestions."
                  : "Ask AI for a safe suggestion..."
              }
              className="mt-3 min-h-[84px] w-full rounded-md border border-white/12 bg-white/[0.02] px-3 py-2 text-sm text-white outline-none placeholder:text-white/45"
            />

            {companionOnly ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {assistQuickPrompts.map((quickPrompt) => (
                    <button
                      key={quickPrompt}
                      type="button"
                      onClick={() => setAssistPrompt(quickPrompt)}
                      className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/75 hover:bg-white/[0.08]"
                    >
                      {quickPrompt}
                    </button>
                  ))}
                </div>
                <div className="mt-3 rounded-md border border-white/10 bg-black/30 p-2">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-white/60">Selected Text</p>
                  <div className="mt-2 max-h-24 overflow-auto rounded border border-white/10 bg-black/40 p-2 font-mono text-[11px] text-white/75">
                    {selectedCodeSnippet.trim() ? selectedCodeSnippet : "No code selection captured yet."}
                  </div>
                </div>
              </>
            ) : null}
            </motion.div>
          ) : null}

          {mode === "pair" ? (
            <motion.div
              key="pair-controls"
              initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
              className="mt-4 rounded-lg border border-white/12 bg-black/30 p-3"
            >
            <p className="text-xs text-white/75">Enter a prompt for the next change.</p>
            <textarea
              value={assistPrompt}
              onChange={(event) => setAssistPrompt(event.target.value)}
              placeholder="Describe what you want changed..."
              className="mt-3 min-h-[96px] w-full rounded-md border border-white/12 bg-white/[0.02] px-3 py-2 text-sm text-white outline-none placeholder:text-white/45"
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-full border border-violet-300/35 bg-violet-300/12 px-3 py-1 text-xs font-medium text-violet-100 hover:bg-violet-300/20"
              >
                {isSubmitting ? "Running..." : "Submit Prompt"}
              </button>
              {currentGateDecision ? (
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/70">
                  Gate Decision: {currentGateDecision}
                </span>
              ) : null}
            </div>
            </motion.div>
          ) : null}

          {mode === "autopilot" ? (
            <motion.div
              key="autopilot-controls"
              initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
              className="mt-4 rounded-lg border border-white/12 bg-black/30 p-3"
            >
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !manualEditMode;
                  setManualEditMode(next);
                  onManualEditToggle(next);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  manualEditMode
                    ? "border-white/35 bg-white/[0.08] text-white"
                    : "border-white/20 text-white/75 hover:bg-white/[0.06]"
                }`}
              >
                Manual Edit {manualEditMode ? "ON" : "OFF"}
              </button>
            </div>

            <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
              <p className="text-xs text-white/75">Describe the app. The agent will plan and build it.</p>
              <textarea
                value={assistPrompt}
                onChange={(event) => setAssistPrompt(event.target.value)}
                placeholder="Build a production-ready app with auth, dashboard, APIs, tests, and deployment checklist..."
                className="mt-3 min-h-[120px] w-full rounded-md border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/45"
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || codeChangeState === "blocked"}
                  className="rounded-full border border-violet-300/35 bg-violet-300/12 px-3 py-1 text-xs font-medium text-violet-100 hover:bg-violet-300/20"
                >
                  {isSubmitting ? "Running..." : "Build App from Prompt"}
                </button>
                {currentGateDecision ? (
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/70">
                    Gate Decision: {currentGateDecision}
                  </span>
                ) : null}
              </div>
            </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
            Access
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/75">
              Apply: {codeChangeState}
            </span>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/75">
              PR/Merge: {prMergeState}
            </span>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/75">
              Deploy: {deployState}
            </span>
          </div>
        </div>
        </div>

        {showWorkspaceViews ? (
          <div className={isHumanGuided ? "xl:order-1" : ""}>
          <>
            <button
              type="button"
              onMouseDown={() => setIsResizingViewer(true)}
              className="mt-4 flex h-2 w-full cursor-row-resize items-center justify-center rounded-full border border-white/10 bg-white/[0.03]"
              aria-label="Resize viewer area"
            >
              <span className="h-1 w-12 rounded-full bg-white/25" />
            </button>
            <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {showPreviewTab ? (
                  <button
                    type="button"
                    onClick={() => handleViewerTabChange("preview")}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                      viewerTab === "preview" ? "bg-violet-300/15 text-violet-100" : "text-white/70"
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleViewerTabChange("editor")}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                    viewerTab === "editor" ? "bg-violet-300/15 text-violet-100" : "text-white/70"
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  Editor
                </button>
                <button
                  type="button"
                  onClick={() => handleViewerTabChange("diff")}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                    viewerTab === "diff" ? "bg-violet-300/15 text-violet-100" : "text-white/70"
                  }`}
                >
                  <FileDiff className="h-3.5 w-3.5" />
                  Diff
                </button>
                {!isHumanGuided ? (
                  <button
                    type="button"
                    onClick={() => handleViewerTabChange("response")}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                      viewerTab === "response" ? "bg-violet-300/15 text-violet-100" : "text-white/70"
                    }`}
                  >
                    <MessageSquareText className="h-3.5 w-3.5" />
                    Response
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleViewerTabChange("logs")}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                    viewerTab === "logs" ? "bg-violet-300/15 text-violet-100" : "text-white/70"
                  }`}
                >
                  <Logs className="h-3.5 w-3.5" />
                  Logs
                </button>
              </div>
              <div
                className="mt-3 overflow-auto rounded border border-white/10 bg-black/40 p-2"
                style={{ height: `${viewerHeight}px` }}
              >
                {viewerTab === "preview" ? (
                  previewHtml ? (
                    <div className="h-full">
                      <div className="mb-2 flex justify-end">
                        {previewUrl ? (
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/75 hover:bg-white/[0.08]"
                          >
                            Open Preview in New Tab
                          </a>
                        ) : null}
                      </div>
                      <iframe
                        title="Generated App Preview"
                        srcDoc={previewHtml}
                        className="h-[calc(100%-32px)] w-full rounded border border-white/10 bg-white"
                        sandbox="allow-scripts allow-same-origin"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-white/65">
                      No preview yet. Run a website/app prompt to generate one.
                    </p>
                  )
                ) : null}
                {viewerTab === "editor" ? (
                  selectedFile ? (
                    <div className="h-full space-y-2">
                      {isHumanGuided && showSuggestionsBox ? (
                        <div className="rounded border border-violet-300/30 bg-violet-300/[0.08] p-1.5 text-[11px] text-violet-100">
                          <p className="font-semibold uppercase tracking-[0.08em] text-violet-100/90">
                            Suggestions
                          </p>
                          {mode === "pair" ? (
                            <div className="mt-1 space-y-2">
                              <div className="rounded border border-white/12 bg-black/35 px-2 py-1.5 text-[10px]">
                                <p className="font-semibold uppercase tracking-[0.08em] text-white/70">
                                  Security / Risk Analysis
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                    runRiskLabel === "LOW"
                                      ? "border-emerald-300/40 bg-emerald-300/12 text-emerald-100"
                                      : runRiskLabel === "MEDIUM"
                                        ? "border-amber-300/40 bg-amber-300/12 text-amber-100"
                                        : runRiskLabel === "CRITICAL"
                                          ? "border-fuchsia-300/40 bg-fuchsia-300/14 text-fuchsia-100"
                                        : "border-rose-300/40 bg-rose-300/12 text-rose-100"
                                  }`}>
                                    FINAL RISK: {runRiskLabel || "MEDIUM"}
                                  </span>
                                  <span className="text-white/70">
                                    {runRiskScore !== null ? `Score ${runRiskScore}/100` : "Score pending"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setRunRiskExpanded((prev) => !prev)}
                                    className="rounded border border-white/20 px-2 py-0.5 text-[10px] text-white/80 hover:bg-white/[0.08]"
                                  >
                                    {runRiskExpanded ? "Hide details" : "Why?"}
                                  </button>
                                </div>
                              </div>
                              {pairPrimaryCode ? (
                                <>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="rounded border border-white/15 bg-black/35 px-2 py-0.5 font-mono text-[10px] text-white/75">
                                      {pairPrimaryPath}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await navigator.clipboard.writeText(pairPrimaryCode);
                                          setPairCopied(true);
                                          window.setTimeout(() => setPairCopied(false), 1200);
                                        } catch {
                                          setPairCopied(false);
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 rounded border border-white/20 px-2 py-0.5 text-[10px] text-white/80 hover:bg-white/[0.08]"
                                      title="Copy recommendation"
                                    >
                                      <Copy className="h-3 w-3" />
                                      {pairCopied ? "Copied" : "Copy"}
                                    </button>
                                  </div>
                                  <pre className="max-h-44 overflow-auto rounded border border-white/10 bg-black/45 p-2 font-mono text-[11px] text-white/85">
                                    {pairPrimaryCode}
                                  </pre>
                                  {responseSummary.assistantReply || responseSummary.rationale ? (
                                    <div className="rounded border border-white/10 bg-black/45 p-2 text-[11px] text-white/80">
                                      {responseSummary.assistantReply ? (
                                        <p className="whitespace-pre-wrap">
                                          {renderInlineRiskText(
                                            responseSummary.assistantReply,
                                            assistantContentFlags
                                          )}
                                        </p>
                                      ) : null}
                                      {responseSummary.rationale ? (
                                        <p className="mt-1 whitespace-pre-wrap text-white/70">
                                          {renderInlineRiskText(
                                            responseSummary.rationale,
                                            rationaleContentFlags
                                          )}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <div className="rounded border border-white/10 bg-black/45 p-2 text-[11px] text-white/80">
                                  {responseSummary.assistantReply ? (
                                    <p className="whitespace-pre-wrap">
                                      {renderInlineRiskText(responseSummary.assistantReply, assistantContentFlags)}
                                    </p>
                                  ) : null}
                                  {responseSummary.rationale ? (
                                    <p className="mt-1 whitespace-pre-wrap text-white/70">
                                      {renderInlineRiskText(responseSummary.rationale, rationaleContentFlags)}
                                    </p>
                                  ) : null}
                                  {!responseSummary.assistantReply &&
                                  !responseSummary.rationale &&
                                  responseSummary.streamLines.length ? (
                                    <p className="whitespace-pre-wrap text-white/75">
                                      {responseSummary.streamLines[responseSummary.streamLines.length - 1]}
                                    </p>
                                  ) : null}
                                  <p className="mt-1 text-[10px] text-white/55">
                                    No direct file patch was produced for this prompt. Try asking for an explicit code edit.
                                  </p>
                                </div>
                              )}
                              {runRiskExpanded ? (
                                <div className="rounded border border-white/10 bg-black/35 p-2 text-[10px] text-white/75">
                                  {runRiskDetails.topDrivers.length ? (
                                    <p>Top drivers: {runRiskDetails.topDrivers.join(", ")}</p>
                                  ) : null}
                                  {runRiskDetails.reasonCodes.length ? (
                                    <p className="mt-1">Reason codes: {runRiskDetails.reasonCodes.join(", ")}</p>
                                  ) : null}
                                  {runRiskDetails.requiredControls.length ? (
                                    <p className="mt-1">
                                      Required controls: {runRiskDetails.requiredControls.join(", ")}
                                    </p>
                                  ) : null}
                                  {runRiskDetails.blockReasons.length ? (
                                    <p className="mt-1">Block reasons: {runRiskDetails.blockReasons.join(" | ")}</p>
                                  ) : null}
                                  {runRiskDetails.evidenceQuotes.length ? (
                                    <p className="mt-1">
                                      Evidence: {runRiskDetails.evidenceQuotes.slice(0, 2).join(" | ")}
                                    </p>
                                  ) : null}
                                  {!runRiskDetails.topDrivers.length &&
                                  !runRiskDetails.reasonCodes.length &&
                                  !runRiskDetails.requiredControls.length &&
                                  !runRiskDetails.blockReasons.length &&
                                  !runRiskDetails.evidenceQuotes.length ? (
                                    <p>No additional risk details returned for this recommendation.</p>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onGeneratedFiles?.(pairPendingFiles, { streaming: false });
                                    setPairDecision("approved");
                                    setPairPendingFiles({});
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-emerald-300/35 bg-emerald-300/12 px-2.5 py-1 text-[10px] font-medium text-emerald-100 hover:bg-emerald-300/20"
                                >
                                  <Check className="h-3 w-3" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPairDecision("denied");
                                    setPairPendingFiles({});
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-rose-300/35 bg-rose-300/12 px-2.5 py-1 text-[10px] font-medium text-rose-100 hover:bg-rose-300/20"
                                >
                                  <X className="h-3 w-3" />
                                  Deny
                                </button>
                                {pairDecision ? (
                                  <span className="text-[10px] text-white/70">
                                    Recommendation {pairDecision}.
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <>
                              {responseSummary.assistantReply ? (
                                <p className="mt-1 whitespace-pre-wrap text-white/85">
                                  {renderInlineRiskText(responseSummary.assistantReply, assistantContentFlags)}
                                </p>
                              ) : null}
                              {responseSummary.rationale ? (
                                <p className="mt-1 whitespace-pre-wrap text-white/75">
                                  {renderInlineRiskText(responseSummary.rationale, rationaleContentFlags)}
                                </p>
                              ) : null}
                              {!responseSummary.assistantReply &&
                              !responseSummary.rationale &&
                              responseSummary.streamLines.length ? (
                                <p className="mt-1 whitespace-pre-wrap text-white/75">
                                  {responseSummary.streamLines[responseSummary.streamLines.length - 1]}
                                </p>
                              ) : null}
                              {responseSummary.highlightedSnippet ? (
                                <div className="mt-1.5 rounded border border-amber-300/25 bg-amber-300/[0.08] p-1.5 text-[10px] text-amber-100">
                                  <p className="mb-1 uppercase tracking-[0.08em] text-amber-100/85">
                                    Most Relevant Code
                                  </p>
                                  <pre className="whitespace-pre-wrap">{responseSummary.highlightedSnippet}</pre>
                                  {responseSummary.matchedTerms.length ? (
                                    <p className="mt-1 text-[10px] text-amber-100/80">
                                      Matched: {responseSummary.matchedTerms.join(", ")}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedFile}
                          onChange={(event) => onSelectFile(event.target.value)}
                          className="flex-1 rounded border border-white/15 bg-black/50 px-2 py-1 text-xs text-white"
                        >
                          {filePaths.map((path) => (
                            <option key={path} value={path} className="bg-[#090611]">
                              {path}
                            </option>
                          ))}
                        </select>
                        <span className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70">
                          {inferCodeLanguage(selectedFile)}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await onRunSelectedFile?.(selectedFile, fileContent);
                            setEditorRunResult(result ?? null);
                          }}
                          className="rounded border border-violet-300/35 bg-violet-300/12 px-2 py-1 text-[11px] text-violet-100 hover:bg-violet-300/20"
                        >
                          Run
                        </button>
                        {isHumanGuided ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const nextPath = window.prompt("Rename file path", selectedFile || "untitled.ts");
                                if (!nextPath?.trim()) return;
                                onRenameSelectedFile?.(selectedFile, nextPath.trim());
                              }}
                              className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/[0.08]"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => onSaveSelectedFile?.(selectedFile, fileContent)}
                              className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/[0.08]"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => onSaveSelectedFileAs?.(selectedFile, fileContent)}
                              className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/[0.08]"
                            >
                              Save As
                            </button>
                          </>
                        ) : null}
                      </div>
                      <CodeEditor
                        key={`${selectedFile}:${editorRevision}`}
                        path={selectedFile}
                        value={fileContent}
                        onChange={onFileContentChange}
                        onSelectionChange={setSelectedCodeSnippet}
                      />
                      {editorRunResult ? (
                        <div className="rounded border border-white/15 bg-black/45 p-2 font-mono text-xs text-white/85">
                          <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-white/60">Terminal</p>
                          <pre
                            className={
                              editorRunResult.status === "success"
                                ? "whitespace-pre-wrap text-emerald-100"
                                : "whitespace-pre-wrap text-rose-100"
                            }
                          >
                            {editorRunResult.output}
                          </pre>
                        </div>
                      ) : (
                        <div className="rounded border border-white/15 bg-black/45 p-2 font-mono text-xs text-white/70">
                          <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-white/60">Terminal</p>
                          <pre className="whitespace-pre-wrap">(no output yet)</pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-white/65">No file selected yet.</p>
                  )
                ) : null}
                {viewerTab === "diff" ? <DiffViewer diffLines={diffLines} findings={findings} /> : null}
                {viewerTab === "response" && !isHumanGuided ? (
                  <ResponseViewer
                    promptText={responseSummary.promptText}
                    assistantReply={responseSummary.assistantReply}
                    rationale={responseSummary.rationale}
                    generatedFiles={responseSummary.generatedFiles}
                    streamLines={responseSummary.streamLines}
                    contentFlags={responseSummary.contentFlags}
                    riskScore={runRiskScore}
                    riskLabel={runRiskLabel}
                    findings={findings}
                    riskDetails={runRiskDetails}
                    responseElapsedMs={responseElapsedMs}
                    isRunning={isSubmitting}
                  />
                ) : null}
                {viewerTab === "logs" ? (
                  <div className="font-mono text-[11px] text-white/75">
                    {runLogs.length ? runLogs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </>
          </div>
        ) : null}
        </div>

        {mode !== "assist" && timeline.length > 0 ? (
          <details className="mt-4 rounded-xl border border-violet-300/20 bg-gradient-to-b from-[#120c1e] to-[#090611] p-3 shadow-[0_0_18px_rgba(139,92,246,0.12)]" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-1 text-xs font-semibold uppercase tracking-[0.08em] text-violet-100/85">
              <span className="inline-flex items-center gap-1.5">
                <PanelBottomOpen className="h-3.5 w-3.5" />
                Timeline Logs
              </span>
              <span className="rounded-full border border-violet-300/35 bg-violet-300/12 px-2 py-0.5 text-[10px] text-violet-100">
                {selectedAgentRole || "NO AGENT"}
              </span>
            </summary>

            {availableAgentRoles.length ? (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                <label
                  htmlFor="agent-log-role"
                  className="mb-2 block text-[11px] uppercase tracking-[0.08em] text-white/60"
                >
                  Select Agent
                </label>
                <select
                  id="agent-log-role"
                  value={selectedAgentRole}
                  onChange={(event) => setSelectedAgentRole(event.target.value)}
                  className="w-full rounded-md border border-violet-300/25 bg-[#0d0a16] px-3 py-2 text-xs text-white outline-none"
                >
                  {availableAgentRoles.map((role) => (
                    <option key={role} value={role} className="bg-[#090611]">
                      {role}
                    </option>
                  ))}
                </select>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border border-white/10 bg-black/35 p-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">
                      {selectedAgentRole} Timeline
                    </p>
                    <div className="mt-2 max-h-52 space-y-2 overflow-auto text-xs text-white/80">
                      {filteredTimelineRows.length ? (
                        filteredTimelineRows.map((step) => (
                          <div key={step.id} className="rounded border border-white/10 bg-black/45 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-white/90">{step.artifactType}</span>
                              <span className="rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] text-white/65">
                                {step.gateDecision}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-white/65">Risk {step.riskScore}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-white/60">No timeline entries for this agent yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-black/35 p-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">
                      {selectedAgentRole} Logs
                    </p>
                    <div className="mt-2 max-h-52 space-y-2 overflow-auto text-xs text-white/80">
                      {filteredProofRows.length ? (
                        filteredProofRows.map((row, index) => (
                          <div
                            key={`${row.step}-${row.proof.responseId}-${index}`}
                            className="rounded border border-white/10 bg-black/45 p-2"
                          >
                            <p><span className="text-white/55">Step:</span> {row.step}</p>
                            <p><span className="text-white/55">Provider:</span> {row.proof.provider}</p>
                            <p><span className="text-white/55">Model:</span> {toDisplayedTimelineModel()}</p>
                            <p className="truncate"><span className="text-white/55">Response ID:</span> {row.proof.responseId}</p>
                            <p><span className="text-white/55">Timestamp:</span> {new Date(row.proof.timestamp).toLocaleTimeString()}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-white/60">No proof logs available for this agent.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-3 rounded border border-white/10 bg-black/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/55">Approval History</p>
                <button
                  type="button"
                  onClick={refreshApprovalHistory}
                  className="rounded border border-white/20 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/[0.08]"
                >
                  Refresh
                </button>
              </div>
              {isLoadingApprovalHistory ? (
                <p className="mt-2 text-xs text-white/60">Loading recent governance events...</p>
              ) : approvalHistory.length ? (
                <div className="mt-2 max-h-48 space-y-2 overflow-auto text-xs text-white/80">
                  {approvalHistory.map((entry) => (
                    <div
                      key={`${entry.timestamp}-${entry.actionType}-${entry.actor}`}
                      className="rounded border border-white/10 bg-black/30 p-2"
                    >
                      <p><span className="text-white/55">Action:</span> {entry.actionType}</p>
                      <p><span className="text-white/55">Actor:</span> {entry.actor}</p>
                      <p><span className="text-white/55">Approvers:</span> {entry.approverIds.join(", ") || "none"}</p>
                      <p><span className="text-white/55">Time:</span> {new Date(entry.timestamp).toLocaleString()}</p>
                      {entry.breakGlassReason ? (
                        <p><span className="text-rose-200/90">Break-glass:</span> {entry.breakGlassReason}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-white/60">No approval/break-glass events yet.</p>
              )}
            </div>
          </details>
        ) : null}

      </div>
      {approvalModal.isOpen ? (
        <div
          className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Approval required"
        >
          <div className="w-full max-w-xl rounded-lg border border-amber-300/30 bg-[#0d0a16] p-4 shadow-[0_0_30px_rgba(251,191,36,0.22)]">
            <h3 className="text-sm font-semibold text-amber-100">Approval Needed</h3>
            <p className="mt-1 text-xs text-white/70">
              This run needs governance approval to continue.
            </p>
            {approvalModal.blockReason ? (
              <p className="mt-2 text-xs text-amber-200/90">Reason: {approvalModal.blockReason}</p>
            ) : null}
            {approvalModal.approvalsNeeded.length ? (
              <p className="mt-2 text-xs text-white/65">
                Required: {approvalModal.approvalsNeeded.join(", ")}
              </p>
            ) : null}

            <div className="mt-3 space-y-2">
              <input
                value={approverOne}
                onChange={(event) => setApproverOne(event.target.value)}
                placeholder="Approver 1 ID"
                className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-xs text-white outline-none"
              />
              {approvalModal.requiredApprovals >= 2 ? (
                <input
                  value={approverTwo}
                  onChange={(event) => setApproverTwo(event.target.value)}
                  placeholder="Approver 2 ID"
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-xs text-white outline-none"
                />
              ) : null}
            </div>

            {approvalModal.requireBreakGlass ? (
              <div className="mt-3 space-y-2 rounded border border-rose-300/25 bg-rose-300/[0.06] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-100">
                  Break-Glass
                </p>
                <textarea
                  value={breakGlassReason}
                  onChange={(event) => setBreakGlassReason(event.target.value)}
                  placeholder="Reason for override"
                  className="min-h-[70px] w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-xs text-white outline-none"
                />
                <input
                  type="datetime-local"
                  value={breakGlassExpiresAt}
                  onChange={(event) => setBreakGlassExpiresAt(event.target.value)}
                  className="w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-xs text-white outline-none"
                />
                <p className="text-[11px] text-rose-100/80">
                  Post-action review is required and logged.
                </p>
              </div>
            ) : null}

            {approvalError ? <p className="mt-3 text-xs text-rose-200">{approvalError}</p> : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleApprovalSubmit}
                disabled={isSubmitting}
                className="rounded border border-emerald-300/35 bg-emerald-300/12 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-300/20"
              >
                {isSubmitting ? "Re-running..." : "Approve and Re-run"}
              </button>
              <button
                type="button"
                onClick={() => setApprovalModal((prev) => ({ ...prev, isOpen: false }))}
                className="rounded border border-white/20 px-3 py-1 text-xs text-white/75 hover:bg-white/[0.08]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
