# Governed Multi-Agent Builder

## Run from GitHub (Start Here)

Use this if you are running the project for the first time from the repository.

### 1) Prerequisites

- Node.js `18.17+` (Node `20+` recommended)
- npm (bundled with Node)
- Git

### 2) Clone and install

```bash
git clone https://github.com/LordeSid-04/experiment-dlweek.git
cd experiment-dlweek
```

Backend:

```bash
cd backend
copy .env.example .env
# set OPENAI_API_KEY in .env
npm install
npm test
npm start
```

Frontend (new terminal):

```bash
cd frontend
npm install
npm test
npm run dev
```

Set frontend env:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

Open:

- `http://localhost:3000/confidence`
- `http://localhost:3000/workspace`

### 3) Quick verification checklist

- `GET http://localhost:4000/health` returns `ok: true`
- Submitting a workspace prompt produces timeline events
- Risk output appears (`Risk Score`, `Risk Tier`, `Gate Decision`)
- `GET /api/ledger/events` returns appended governance events

This repository is a governed AI app builder with:

- a **frontend workspace** (confidence slider + AI panel + preview/editor/diff/logs/response views),
- a **backend control plane** (multi-agent orchestration + scanners + Risk Tier + Gate Decision),
- an **append-only evidence ledger** for auditable runs.

The system is designed so confidence controls **execution authority**, not model quality.

## Documentation Summary (Approach + Solution)

We are solving a specific reliability problem: AI can generate code quickly, but without governance it can also generate unsafe or non-compliant changes (for example auth bypasses, destructive SQL, or unreviewed high-risk edits).  
Our approach is to treat the confidence slider as a permissions contract, then enforce policy gates at multiple stages of an orchestrated multi-agent pipeline.  
The solution combines role-separated artifacts, rule-based scanning, explainable risk scoring, mode-aware gating, and append-only evidence logging so every important decision can be audited and replayed.

In practical terms, the system works as a governed delivery loop:

1. User provides prompt + confidence mode.
2. Agents produce plan, implementation, tests, and rollout/rollback artifacts.
3. Governor scans, scores, and gates each stage.
4. High-risk paths trigger approvals (and break-glass requirements when applicable).
5. Final outputs plus governance evidence are rendered in UI and persisted to hash-linked ledger events.

The result is a fast-but-controlled workflow designed to reduce catastrophic automation while keeping AI productivity benefits.

## Problem Statement and Design Approach

### Problem statement

Teams want AI-assisted speed without losing control over:

- security posture,
- change-risk visibility,
- human accountability,
- rollback readiness,
- auditability for post-action review.

### Design approach

- **Policy-first orchestration**: generation is not enough; every stage is gated.
- **Role separation**: architect/developer/verifier/operator/governor produce distinct artifacts.
- **Explainable governance**: risk has decomposed factors and explicit reason codes.
- **Human-in-the-loop by default**: approvals escalate with risk and mode.
- **Append-only evidence**: every completed/blocked run produces verifiable ledger artifacts.

## End-to-End Solution Architecture

### Frontend control plane (`frontend/`)

- Confidence route (`/confidence`) chooses autonomy level (`assist`, `pair`, `autopilot`).
- Workspace route (`/workspace`) runs governed prompts and visualizes:
  - timeline,
  - generated files + preview,
  - diff and scanner findings,
  - logs and agent proofs,
  - approval modal and approval history.
- Stream-first UX consumes NDJSON events from backend and updates UI incrementally.
- Manual and local persistence capabilities:
  - in-browser file explorer/editor,
  - local project save,
  - optional zip export.

### Backend control plane (`backend/`)

- `server.js` exposes governance-aware APIs (`run`, `stream`, ledger reads, quick assist).
- `orchestrator.js` executes stages:
  1. ARCHITECT (plan)
  2. GOVERNOR (after-plan)
  3. DEVELOPER (diff/files/preview)
  4. GOVERNOR (after-diff)
  5. VERIFIER (tests/checks)
  6. GOVERNOR (after-test)
  7. OPERATOR (rollout + rollback)
  8. GOVERNOR (final gate)
- `scanners.js` detects risky patterns (secrets, SQL danger, auth bypass, token logging, trust/policy drift).
- `risk-engine.js` computes explainable score from:
  - impact,
  - exploitability,
  - uncertainty,
  - governance gap.
- `policy-engine.js` maps risk + mode + approvals + break-glass into `ALLOWED` / `NEEDS_APPROVAL` / `BLOCKED`.
- `evidence-ledger.js` writes append-only JSONL events with chained hashes.

## Frontend and Backend Workflows

### Frontend workflow

1. User enters prompt in AI panel.
2. Frontend sends `prompt`, `confidenceMode`, `confidencePercent`, `projectFiles`, optional `approvals/breakGlass`.
3. UI consumes streaming events:
   - `stage_started`, `agent_output`, `generated_files`, `generated_preview`, `timeline_step`, `control_required`.
4. If gate requires approval, modal enforces distinct approvers and optional break-glass fields.
5. Re-run includes approval payload.
6. UI shows final artifacts + governance outputs + approval history.

### Backend workflow

1. Validate request, derive confidence mode if needed.
2. Run orchestrator stages and emit stream events.
3. Run scanners on generated diff/test stages.
4. Compute risk assessment and policy decision.
5. Short-circuit on blocked decisions when required.
6. Append hash-linked ledger event for blocked/completed runs.
7. Return normalized governed result.

## Metrics and Current Performance Against Them

The following reflects current implemented behavior and test-backed coverage (not synthetic benchmark claims):

1. **Safety detection coverage (rule-based)**
   - Implemented checks for required classes:
     - secret patterns,
     - `DROP TABLE`,
     - `DELETE FROM` without `WHERE`,
     - auth bypass patterns,
     - wildcard IAM permissions,
     - sensitive headers/cookies/tokens logging.
   - Additional checks: intent drift, trust-boundary drift, policy drift.
   - Status: **Implemented and unit-tested** (`backend/test/scanners.test.js`).

2. **Governance correctness (mode-aware policy)**
   - Assist: requires human approval.
   - Pair: low allow, medium approve, high/critical block.
   - Autopilot: high requires two-person approval; critical requires valid break-glass + approvals.
   - Status: **Implemented and unit-tested** (`backend/test/policy-engine.test.js`).

3. **Two-person rule + break-glass enforcement**
   - Distinct approver checks implemented.
   - Break-glass requires reason + future expiry + post-action review flag.
   - Invalid break-glass is blocked.
   - Status: **Implemented and unit-tested**.

4. **Traceability and auditability**
   - Ledger events are append-only JSONL with hash chain:
     - `prevEventHash`, `eventHash`, `diffHash`, `testHashes`, `scannerSummaryHash`, `riskCardHash`.
   - Approval and break-glass context are retained and viewable in workspace.
   - Status: **Implemented end-to-end**.

5. **Explainability of decisions**
   - Gate output includes:
     - risk score/tier,
     - risk factors,
     - top drivers,
     - required controls,
     - findings by category,
     - reason codes.
   - Status: **Implemented in backend artifacts + frontend visualization**.

6. **Resilience of user workflow**
   - Streaming-first execution with fallback to non-stream endpoint.
   - If backend unavailable, mock fallback prevents dead-end UX.
   - Status: **Implemented**.

7. **Response quality controls**
   - Developer grounding checks reduce intent drift (for example avoiding irrelevant template substitutions).
   - Additional quality heuristics for build prompts.
   - Status: **Implemented and unit-tested** (`backend/test/developer.test.js`).

## Key Implementation Details for Documentation

### Contracts and data shape

- Runtime role/mode and artifact contracts:
  - `backend/src/types.js`
- Ledger event schema (typed JSON schema):
  - `backend/src/schemas/ledger-event.schema.json`
- Frontend run result types and stream event types:
  - `frontend/src/lib/backend-run.ts`

### Core API surface

- `GET /health`
- `GET /api/ledger/events`
- `POST /api/assist/suggest`
- `POST /api/orchestrator/run`
- `POST /api/orchestrator/stream` (NDJSON)

### Decision model

- Scanner findings -> risk factors -> risk score/tier -> policy decision.
- Final gate output always contains decision context, not just pass/fail.

### Human control model

- Approval modal is triggered by gate outcomes.
- Approval payload requires distinct identities where policy requires.
- Break-glass flow is explicit, time-bounded, and post-review tagged.

### Reversibility and operational safety

- Operator agent provides rollout and rollback plan artifacts.
- High-risk and critical routes are gated, not auto-executed.
- Evidence ledger supports post-run review and incident reconstruction.

## Extended Narrative (Well-Worded Solution Statement)

This project demonstrates a governed AI engineering pattern where autonomy is earned through controls, not assumed by default.  
Instead of letting generation directly imply execution, the system enforces a policy contract at each stage of the software lifecycle.  
By combining role-separated agents, explainable risk scoring, scanner-driven guardrails, approval workflows, and tamper-evident evidence logs, the platform preserves speed while maintaining accountability.  
The practical outcome is a workflow that can move quickly on low-risk work, escalate properly on medium/high-risk changes, and block dangerous actions unless strict human and break-glass criteria are satisfied.

## Quick Glossary

- **Risk Score**: Numeric score (`0-100`) computed from scanner and governance signals.
- **Risk Tier**: Bucket derived from score/severity (`LOW`, `MED`, `HIGH`, `CRITICAL`).
- **Gate Decision**: Final policy result (`ALLOWED`, `NEEDS_APPROVAL`, `BLOCKED`).
- **Approval**: Human confirmation required for medium/high-risk actions by mode policy.
- **Break-glass**: Emergency override requiring reason, expiry, and post-action review.

## Repository Structure

- `frontend/` - Next.js app (confidence page + workspace UI)
- `backend/` - Node.js orchestration server (agents, policy, risk, scanners, ledger)

## Authentication (NTU Student Pilot)

- A lightweight auth flow is available at `frontend/src/app/auth/page.tsx`.
- Signup requires:
  - first name,
  - last name,
  - email ending with `@e.ntu.edu.sg`,
  - Singapore mobile number (`+65` or 8-digit local format),
  - password (minimum 8 chars).
- Backend auth APIs:
  - `POST /api/auth/signup`
  - `POST /api/auth/login`
- User records are stored in `backend/data/users.json` (initialized empty on first run).
- Signup/login actions append audit events to the evidence ledger.

## Project Persistence Across Sessions

- Projects are now persisted per authenticated user in `backend/data/projects.json`.
- Backend project APIs:
  - `GET /api/projects?email=<user-email>`
  - `POST /api/projects/save`
- Frontend sync behavior:
  - `confidence` view loads saved projects for the logged-in user,
  - `workspace` save action writes locally and syncs to backend,
  - future logins for the same user restore project list and files.

## Core Product Flow

1. User picks a confidence value using a snapping slider (`0`, `50`, or `100`) on the confidence page.
2. Frontend maps confidence to mode:
   - `0` -> `assist` (companion-only, manual execution)
   - `50` -> `pair`
   - `100` -> `autopilot`
3. User enters a prompt in workspace.
4. Frontend calls backend with:
   - `prompt`
   - `confidenceMode`
   - `confidencePercent`
   - optional `approvals`
   - optional `breakGlass`
5. Backend runs multi-agent pipeline:
   - `ARCHITECT` -> plan
   - `DEVELOPER` -> implementation artifact
   - `GOVERNOR` -> risk + policy gate
   - `VERIFIER` -> test plan/results artifact
   - `OPERATOR` -> rollout/rollback artifact
   - final `GOVERNOR` gate
6. Frontend streams stage output in real-time.
7. If the Gate Decision is `NEEDS_APPROVAL` (or Break-glass is required), user can approve in workspace and re-run.
8. Final result is rendered in:
   - `Preview`
   - `Editor`
   - `Diff`
   - `Logs`
   - `Response` (with syntax-highlighted generated files)
   - Assist/Pair include a Monaco/CodeMirror-style editor with in-editor run output for supported languages.

## Confidence Slider and Governance Modes

The confidence slider controls permissions and Gate Decision strictness.

### Assist Mode (0)

- AI behaves like an in-editor companion and can generate plans, diffs, and suggestions.
- User can select code in editor and ask for scoped help on the quoted section only.
- AI cannot autonomously apply changes, open PRs, merge, or deploy.
- All changes require manual execution and Approval regardless of Risk Tier.

### Pair Mode (50)

- AI can generate diffs and PR-oriented output.
- Low Risk Tier can proceed.
- Medium Risk Tier requires Approval.
- High/Critical Risk Tier is blocked.

### Autopilot Mode (100)

- AI can run broader plan -> implement -> verify workflows.
- Low/Medium Risk Tier can proceed.
- High Risk Tier requires Approval.
- Critical Risk Tier is blocked unless Break-glass override is supplied.

## Backend Architecture

Backend entrypoint: `backend/src/server.js`

### Main components

- `backend/src/orchestrator.js`
  - Coordinates agent sequence and emits streaming events.
- `backend/src/agents/*.js`
  - Role-specific artifacts (`architect`, `developer`, `verifier`, `operator`, `governor`).
- `backend/src/lib/scanners.js`
  - Rule-based checks:
    - secrets
    - dangerous diff detection
    - intent-drift detection
    - trust-boundary checks
    - policy-drift checks
- `backend/src/lib/risk-engine.js`
  - Explainable risk model with `impact`, `exploitability`, `uncertainty`, `governanceGap`.
- `backend/src/lib/policy-engine.js`
  - Decides Gate Decision using:
    - `confidenceMode`
    - risk tier/severity
    - approvals
    - Break-glass validity
- `backend/src/lib/evidence-ledger.js`
  - Append-only JSONL audit events.

### API Endpoints

- `GET /health`
- `GET /api/ledger/events`
- `POST /api/assist/suggest` (fast suggestion endpoint for Assist 0% UX)
- `POST /api/orchestrator/run` (single response)
- `POST /api/orchestrator/stream` (NDJSON streaming)

## Frontend Architecture

Frontend entrypoint routes:

- `frontend/src/app/confidence/page.tsx`
  - Confidence slider + governance visualization + mode preview.
- `frontend/src/app/workspace/page.tsx`
  - Workspace shell, file state, preview URL lifecycle, run integration.

Workspace UI:

- `frontend/src/components/workspace/AIPanel.tsx`
  - Prompt submission
  - Real-time stream rendering
  - Timeline + per-agent log selection
  - Governance approval modal (approvers + Break-glass)
  - Approval history panel (fetched from backend ledger events)
  - Security demo panel (safe/risky/counter-risk scenarios with live Gate Decision and control output)
- `frontend/src/components/workspace/ResponseViewer.tsx`
  - Readable assistant output + syntax-highlighted generated code.

Governance helpers:

- `frontend/src/lib/governance.ts`
- `frontend/src/lib/use-governance.ts`
- `frontend/src/lib/store.ts`
- `frontend/src/lib/backend-run.ts`

## Approval and Break-Glass Workflow

When backend returns:

- `NEEDS_APPROVAL`: workspace opens approval modal.
- `BLOCKED` with Break-glass requirement: modal asks for:
  - two distinct approvers (as required),
  - Break-glass reason,
  - Break-glass expiry.

User submits, frontend re-runs with Approval payload and Break-glass context.

## Prompt Grounding Guardrail

Developer artifact normalization includes prompt-intent checks to reduce domain drift.
Example: non-portfolio prompts are prevented from silently returning portfolio template output.

## Evidence and Auditability

Each run appends a ledger event with:

- `schemaVersion`
- `timestamp`
- `actor`
- `agentRole`
- `actionType`
- `resourcesTouched`
- `prevEventHash`
- `eventHash`
- `scannerSummaryHash`
- `riskCardHash`
- `diffHash`
- `testHashes`
- `approvals`
- optional `breakGlass`

Ledger file: `backend/data/evidence-ledger.jsonl`

## Local Development

### Backend

```bash
cd backend
copy .env.example .env
# add OPENAI_API_KEY in .env
npm install
npm test
npm start
```

### Frontend

```bash
cd frontend
npm install
npm test
npm run dev
```

Set:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

Then open:

- `http://localhost:3000/confidence`
- `http://localhost:3000/workspace`

## Testing

- Backend: Node test runner (`backend/test/*`)
- Frontend: Vitest (`frontend/src/**/*.test.ts[x]`)

## Demo Script (Security + Human-in-the-Loop)

1. Open `/workspace` and run **Security Simulation -> Risky Diff**.
2. Show scanner-driven output (`Risk Score`, `Risk Tier`, `Gate Decision`, `top drivers`, `decision codes`).
3. Show `Human checkpoints triggered` and approval modal requirements.
4. Re-run with approvers (and Break-glass when required) to demonstrate controlled override path.
5. Open approval history to prove auditability and hash-linked ledger evidence.

## Design Intent

This project demonstrates a practical pattern for controlled AI automation:

- strong human override paths,
- explicit mode-based policy contracts,
- transparent stage outputs,
- reproducible governance decisions,
- append-only evidence for post-run review.
