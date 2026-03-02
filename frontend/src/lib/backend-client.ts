export interface BackendApprovalRecord {
  approverId: string;
  approvedAt: string;
}

export interface BackendProof {
  provider: "openai-api" | "codex-harness";
  model: string;
  responseId: string;
  timestamp: string;
  invokedBy: "ARCHITECT" | "DEVELOPER" | "VERIFIER" | "OPERATOR" | "GOVERNOR";
}

export interface BackendPipelineResponse {
  governorChecks: Array<{
    stage: "after-plan" | "after-diff" | "final";
    decision: {
      riskScore: number;
      riskLevel: "LOW" | "MEDIUM" | "HIGH";
      gateDecision: "ALLOWED" | "NEEDS_APPROVAL" | "BLOCKED";
      reasons: string[];
    };
  }>;
  artifacts: {
    plan: { proof?: BackendProof };
    diff: { proof?: BackendProof };
    test: { proof?: BackendProof };
    ops: { proof?: BackendProof };
  };
}

const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export async function runBackendPipeline(request: string): Promise<BackendPipelineResponse> {
  const response = await fetch(`${backendBaseUrl}/api/orchestrator/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      request,
      actor: "frontend-user",
      approvals: [] as BackendApprovalRecord[],
    }),
  });

  if (!response.ok) {
    throw new Error(`Backend pipeline failed with status ${response.status}`);
  }

  return (await response.json()) as BackendPipelineResponse;
}
