# Backend Control Plane

This backend implements a human-governed, multi-agent SDLC pipeline:

- `ARCHITECT` -> plan artifact
- `DEVELOPER` -> unified diff artifact
- `VERIFIER` -> test artifact
- `OPERATOR` -> rollout/rollback artifact
- `GOVERNOR` -> scanner findings, Risk Score, Risk Tier, and Gate Decision

## Codex Proof Metadata

Every Codex/OpenAI invocation records proof metadata:

- provider (`openai-api` or fallback `codex-harness`)
- model
- response/run id
- timestamp
- invoking agent role

Proof metadata is returned in API responses and can be shown in a frontend timeline Proof panel.

## Governance and Safety

- Rule-based scanners:
  - secret pattern scanning
  - dangerous diff detector:
    - `DROP TABLE`
    - `DELETE FROM` without `WHERE`
    - auth bypass patterns
    - wildcard IAM permissions
    - logging headers/cookies/tokens
- Additional scanners for:
  - intent drift (`INTENT-DRIFT-001`) when declared low-risk intent touches high-risk paths
  - trust-boundary changes (`BOUNDARY-*`) like dynamic execution and new network egress
  - policy drift (`POLICY-*`) when governance checks are removed from diffs
- Explainable risk engine computes:
  - `impact` (path/data blast radius)
  - `exploitability` (finding severity and count)
  - `uncertainty` (confidence vs evidence mismatch)
  - `governanceGap` (missing approvals / weak break-glass metadata)
- Governor emits a `riskCard` with top risk drivers and required controls for human review.
- Policy gate enforces two-person Approval for high Risk Tier
- Break-glass support requires reason, expiry, and post-action review flag
- High/Critical paths are explicitly human-governed: Gate Decision returns `approvalsNeeded` and `control_required` events.
- Confidence mode from frontend (`assist` / `pair` / `autopilot`) is treated as authoritative in gate evaluation.
- Mode-aware gate policy:
  - Assist: all changes require Approval
  - Pair: low ALLOWED, medium NEEDS_APPROVAL, high/critical BLOCKED
  - Autopilot: low/medium ALLOWED, high NEEDS_APPROVAL, critical BLOCKED unless Break-glass override
- Append-only audit ledger (`backend/data/evidence-ledger.jsonl`) logs:
  - `timestamp, actor, agentRole, actionType, resourcesTouched, diffHash, testHashes, approvals`
  - tamper-evidence fields: `schemaVersion, prevEventHash, eventHash, scannerSummaryHash, riskCardHash`
- Developer output includes prompt-grounding checks for build requests to reduce intent drift (for example, avoiding unrelated template substitutions).
- Developer build generation now applies stronger quality gates for website prompts (company-name grounding, anti-template checks, and multi-file completeness heuristics).
- At `autopilot` (`100% confidence`), company-website prompts also use a premium quality rubric with deterministic high-quality fallback scaffolding to avoid low-quality template drift.
- Autopilot fallback generation is intent-aware (for example, chatbot prompts produce chatbot UI scaffolds instead of generic website templates).

## Run

```bash
cd backend
copy .env.example .env
# then paste your real OPENAI_API_KEY in .env
npm test
npm start
```

API runs on `http://localhost:4000` by default.

The server auto-loads `backend/.env` on startup (without external dependencies).

### Main Endpoints

- `GET /health`
- `POST /api/orchestrator/run`
- `POST /api/orchestrator/stream` (NDJSON streaming events for real-time agent output)
- `GET /api/ledger/events`

### Demo Flow (Judge Friendly)

1. Run a safe prompt in `pair` mode and show Gate Decision `ALLOWED` or `NEEDS_APPROVAL`.
2. Run an unsafe prompt that introduces dangerous SQL or auth bypass and show scanner findings with Gate Decision `BLOCKED`.
3. Show `control_required` events, `approvalsNeeded`, Risk Tier, and Risk Score to demonstrate explicit human-in-the-loop governance.
4. Open recent ledger events to show append-only, hash-linked evidence entries.

## Frontend Link

Frontend should call:

- `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000`
- `POST /api/orchestrator/run` with `{ prompt, actor, approvals, breakGlass, confidenceMode, confidencePercent }`
