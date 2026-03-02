import type { GovernanceMode } from "@/lib/governance";
import type { MockRunResult } from "@/lib/mockRun";

export interface CodexProofRecord {
  step: string;
  proof: {
    provider: "openai-api" | "codex-harness";
    model: string;
    responseId: string;
    timestamp: string;
    agentRole: "ARCHITECT" | "DEVELOPER" | "VERIFIER" | "OPERATOR" | "GOVERNOR";
  };
}

export interface GovernedRunResult extends MockRunResult {
  proofs: CodexProofRecord[];
  runId: string;
  blocked?: boolean;
  artifacts?: {
    plan?: unknown;
    diff?: {
      unifiedDiff?: string;
      rationale?: string;
      generatedFiles?: Record<string, string>;
      previewHtml?: string;
      assistantReply?: string;
    };
    test?: { dryRunResults?: string[] };
    ops?: { deployPlan?: string[]; rolloutSteps?: string[]; rollbackPlan?: string[] };
  };
  gate?: {
    gateDecision?: "ALLOWED" | "NEEDS_APPROVAL" | "BLOCKED";
    riskScore?: number;
    riskTier?: "LOW" | "MED" | "HIGH" | "CRITICAL";
    blockReasons?: string[];
    approvalsNeeded?: string[];
    reasonCodes?: string[];
    findingsByCategory?: Record<string, number>;
    riskFactors?: {
      impact: number;
      exploitability: number;
      uncertainty: number;
      governanceGap: number;
    };
    riskCard?: {
      topDrivers: string[];
      requiredControls: string[];
      rationale: string;
    };
  };
}

export interface ApprovalRecord {
  approverId: string;
  approvedAt: string;
}

export interface BreakGlassPayload {
  reason: string;
  expiresAt: string;
  postActionReviewRequired: true;
}

export interface GovernanceLedgerEvent {
  schemaVersion?: string;
  timestamp: string;
  actor: string;
  agentRole: "ARCHITECT" | "DEVELOPER" | "VERIFIER" | "OPERATOR" | "GOVERNOR";
  actionType: string;
  resourcesTouched: string[];
  prevEventHash?: string;
  eventHash?: string;
  scannerSummaryHash?: string;
  riskCardHash?: string;
  diffHash: string;
  testHashes: string[];
  approvals: ApprovalRecord[];
  breakGlass?: BreakGlassPayload;
}

export interface ApprovalHistoryEntry {
  timestamp: string;
  actor: string;
  actionType: string;
  approverIds: string[];
  breakGlassReason?: string;
  breakGlassExpiresAt?: string;
}

export interface QuickAssistSuggestion {
  suggestion: string;
  rationale: string;
  relevantSnippet: string;
}

export type PipelineStreamEvent =
  | { type: "run_started"; runId: string; timestamp: string }
  | { type: "heartbeat"; timestamp: string }
  | {
      type: "stage_started";
      agentRole: "ARCHITECT" | "DEVELOPER" | "VERIFIER" | "OPERATOR" | "GOVERNOR";
      stage: string;
      message: string;
    }
  | {
      type: "agent_output";
      agentRole: "ARCHITECT" | "DEVELOPER" | "VERIFIER" | "OPERATOR" | "GOVERNOR";
      stage: string;
      content: string;
      proof?: CodexProofRecord["proof"];
    }
  | { type: "generated_files"; files: Record<string, string> }
  | { type: "generated_preview"; html: string }
  | {
      type: "control_required";
      controls: string[];
      gateDecision: "ALLOWED" | "NEEDS_APPROVAL" | "BLOCKED";
      riskScore: number;
    }
  | { type: "timeline_step"; step: MockRunResult["timeline"][number] }
  | { type: "run_completed"; result: GovernedRunResult }
  | { type: "run_error"; message: string };

export function toApprovalHistoryEntries(events: GovernanceLedgerEvent[]): ApprovalHistoryEntry[] {
  return events
    .filter((event) => event.agentRole === "GOVERNOR")
    .filter((event) => event.approvals.length > 0 || Boolean(event.breakGlass))
    .map((event) => ({
      timestamp: event.timestamp,
      actor: event.actor,
      actionType: event.actionType,
      approverIds: event.approvals.map((item) => item.approverId),
      breakGlassReason: event.breakGlass?.reason,
      breakGlassExpiresAt: event.breakGlass?.expiresAt,
    }))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export async function fetchApprovalHistory(limit = 25): Promise<ApprovalHistoryEntry[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}/api/ledger/events`);
  if (!response.ok) {
    throw new Error(`Ledger fetch failed with status ${response.status}`);
  }
  const payload = (await response.json()) as { events?: GovernanceLedgerEvent[] };
  return toApprovalHistoryEntries(payload.events ?? []).slice(0, limit);
}

export async function fetchQuickAssistSuggestion(payload: {
  question: string;
  selectedFile?: string;
  selectedCode?: string;
  fileContent?: string;
}): Promise<QuickAssistSuggestion> {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}/api/assist/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Quick assist failed with status ${response.status}`);
  }
  return (await response.json()) as QuickAssistSuggestion;
}

export async function runGovernedPipeline(
  prompt: string,
  mode: GovernanceMode,
  confidencePercent: number,
  projectFiles?: Record<string, string>,
  approvals: ApprovalRecord[] = [],
  breakGlass?: BreakGlassPayload
): Promise<GovernedRunResult> {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}/api/orchestrator/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      actor: "frontend-user",
      approvals,
      breakGlass,
      confidenceMode: mode,
      confidencePercent,
      projectFiles: projectFiles ?? {},
    }),
  });

  if (!response.ok) {
    throw new Error(`Backend run failed with status ${response.status}`);
  }

  return (await response.json()) as GovernedRunResult;
}

export async function streamGovernedPipeline(
  prompt: string,
  mode: GovernanceMode,
  confidencePercent: number,
  onEvent: (event: PipelineStreamEvent) => void,
  projectFiles?: Record<string, string>,
  approvals: ApprovalRecord[] = [],
  breakGlass?: BreakGlassPayload
): Promise<GovernedRunResult> {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}/api/orchestrator/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      actor: "frontend-user",
      approvals,
      breakGlass,
      confidenceMode: mode,
      confidencePercent,
      projectFiles: projectFiles ?? {},
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Streaming backend run failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: GovernedRunResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as PipelineStreamEvent;
      onEvent(event);
      if (event.type === "run_completed") {
        finalResult = event.result;
      }
      if (event.type === "run_error") {
        throw new Error(event.message);
      }
    }
  }

  if (!finalResult) {
    throw new Error("Stream ended before final result was emitted.");
  }
  return finalResult;
}
