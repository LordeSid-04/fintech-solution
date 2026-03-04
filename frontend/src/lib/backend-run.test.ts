import { describe, expect, it } from "vitest";
import { __test, toApprovalHistoryEntries, type GovernanceLedgerEvent } from "@/lib/backend-run";

describe("toApprovalHistoryEntries", () => {
  it("keeps only governance events with approvals or break-glass", () => {
    const events: GovernanceLedgerEvent[] = [
      {
        timestamp: "2026-03-02T10:00:00.000Z",
        actor: "frontend-user",
        agentRole: "GOVERNOR",
        actionType: "pipeline-run-completed:pair",
        resourcesTouched: [],
        diffHash: "a",
        testHashes: [],
        approvals: [{ approverId: "alice", approvedAt: "2026-03-02T09:59:00.000Z" }],
      },
      {
        timestamp: "2026-03-02T10:01:00.000Z",
        actor: "frontend-user",
        agentRole: "DEVELOPER",
        actionType: "diff-generated",
        resourcesTouched: [],
        diffHash: "b",
        testHashes: [],
        approvals: [],
      },
      {
        timestamp: "2026-03-02T10:02:00.000Z",
        actor: "frontend-user",
        agentRole: "GOVERNOR",
        actionType: "pipeline-run-completed:autopilot",
        resourcesTouched: [],
        diffHash: "c",
        testHashes: [],
        approvals: [],
        breakGlass: {
          reason: "Emergency mitigation",
          expiresAt: "2026-03-02T11:00:00.000Z",
          postActionReviewRequired: true,
        },
      },
    ];

    const history = toApprovalHistoryEntries(events);
    expect(history).toHaveLength(2);
    expect(history[0].breakGlassReason).toBe("Emergency mitigation");
    expect(history[1].approverIds).toEqual(["alice"]);
  });
});

describe("stream line parsing", () => {
  it("parses valid NDJSON event lines", () => {
    const event = __test.parsePipelineStreamLine('{"type":"heartbeat","timestamp":"2026-03-04T00:00:00.000Z"}');
    expect(event).toEqual({
      type: "heartbeat",
      timestamp: "2026-03-04T00:00:00.000Z",
    });
  });

  it("ignores malformed NDJSON event lines", () => {
    const event = __test.parsePipelineStreamLine('{"type":"heartbeat","timestamp":');
    expect(event).toBeNull();
  });
});
