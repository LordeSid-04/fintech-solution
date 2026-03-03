# CodexGo

CodexGo is a governed AI engineering workspace for planning, generating, validating, and reviewing software changes with explicit policy controls.

It combines multi-agent orchestration, security scanning, risk scoring, human approvals, and append-only evidence logging in a single developer workflow. Here is the link to the application (deployed via Vercel): https://experiment-dlweek-5o5e.vercel.app/

---

## Evaluation Evidence

- Detailed test and evaluation report: `Evaluation.md`
- Grader-oriented testbench package: `testbench/`
- PDF-ready documentation draft content: `Project_Documentation_Draft.md`

---

## Key Capabilities

- **Confidence-based autonomy**: `assist`, `pair`, and `autopilot` modes map confidence to execution authority.
- **Role-separated pipeline**: ARCHITECT, DEVELOPER, VERIFIER, OPERATOR, and GOVERNOR produce distinct artifacts.
- **Policy-first execution**: every critical stage is gated by scanner output and risk policy.
- **Human control paths**: two-person approvals and break-glass safeguards for high-risk actions.
- **Traceable operations**: append-only ledger events with hash-linked integrity fields.
- **Streamed UX**: real-time stage events, generated files, preview updates, and governance feedback.
- **Version history + restore**: snapshot and restore workspace state per project across `assist` (0%), `pair` (50%), and `autopilot` (100%) runs; restore writes the selected snapshot back to that project state.
- **Domain-aware answer quality gates**: non-build suggestions are relevance-checked against the user prompt across coding and general-knowledge topics, with explicit uncertainty/clarification prompts and verification guidance (especially for high-stakes domains) instead of overconfident off-topic answers.
- **Workspace file operations**: create, open, rename, save, and delete files/folders directly in the file explorer across all confidence modes.

---

## Architecture

### Frontend (`frontend/`)

- Next.js control plane with routes for:
  - `auth`
  - `confidence`
  - `workspace`
- Workspace includes:
  - prompt submission
  - live streaming timeline
  - generated preview/editor/diff/logs/response views
  - approval modal and approval history
  - project version history modal with snapshot restore

### Backend (`backend/`)

- Node.js orchestration server exposing governed APIs.
- Core runtime modules:
  - `orchestrator.js` (pipeline sequencing + event emission)
  - `agents/*.js` (role-specific artifact generation)
  - `lib/scanners.js` (rule-based safety checks)
  - `lib/risk-engine.js` (risk score + tier + factors)
  - `lib/policy-engine.js` (gate decisions + required controls)
  - `lib/evidence-ledger.js` (append-only audit ledger)

---

## Pipeline

1. **ARCHITECT** creates plan and file strategy.
2. **GOVERNOR** evaluates post-plan risk.
3. **DEVELOPER** generates implementation artifacts.
4. **GOVERNOR** scans and gates generated diff.
5. **VERIFIER** prepares validation/test artifact.
6. **OPERATOR** prepares rollout/rollback artifact.
7. **GOVERNOR** re-evaluates after verification context.
8. **GOVERNOR** applies final gate decision.

Output includes timeline steps, findings, proofs, artifacts, and final gate metadata.

---

## Governance Model

### Modes

- **Assist**: manual-first, AI suggestions only, strict gating.
- **Pair**: collaborative mode with approvals for elevated risk.
- **Autopilot**: broader automation with policy-imposed controls.

### Gate Decisions

- `ALLOWED`
- `NEEDS_APPROVAL`
- `BLOCKED`

### Approval Controls

- Distinct approvers enforced where required.
- Break-glass requires:
  - reason
  - future expiry
  - post-action review flag

---

## Security and Risk Controls

Implemented rule-based checks include:

- secret pattern detection
- `DROP TABLE` detection
- `DELETE FROM` without `WHERE`
- auth middleware bypass patterns
- wildcard IAM-like permissions
- sensitive header/cookie/token logging
- policy drift and trust-boundary drift signals

Risk scoring exposes:

- risk score (`0-100`)
- risk tier (`LOW`, `MED`, `HIGH`, `CRITICAL`)
- factor breakdown
- top risk drivers
- required controls
- decision reason codes

---

## Evidence Ledger

Ledger events are append-only JSONL records with hash-link fields for auditability.

- File: `backend/data/evidence-ledger.jsonl`
- Schema: `backend/src/schemas/ledger-event.schema.json`
- Typical fields:
  - `timestamp`
  - `actor`
  - `agentRole`
  - `actionType`
  - `resourcesTouched`
  - `prevEventHash`
  - `eventHash`
  - `diffHash`
  - `testHashes`
  - `scannerSummaryHash`
  - `riskCardHash`
  - `approvals`
  - optional `breakGlass`

---

## API Surface

- `GET /health`
- `GET /api/ledger/events`
- `GET /api/projects?email=<email>`
- `POST /api/projects/save`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/assist/suggest`
- `POST /api/orchestrator/run`
- `POST /api/orchestrator/stream` (NDJSON)

---

## Quality and Generation Controls

For build-oriented prompts, DEVELOPER artifacts are validated with:

- prompt grounding checks
- domain/intent relevance checks
- template-drift rejection
- company/brand grounding checks
- exact explicit-name preservation for branded website outputs
- multi-pass refinement before fallback synthesis

Autopilot includes deterministic premium fallback templates for website/chatbot/dashboard/app intents when quality gates are not met.

For code-edit prompts (`pair`/`autopilot`), DEVELOPER now enforces file-level outputs:

- Codex is called first with current project files and explicit edit constraints.
- If the model returns explanation-only content, a second enforced pass requires `generatedFiles` + `filesTouched`.
- Deterministic logical-fix fallback is only used after Codex attempts, not before.
- Agent calls now use OpenAI Responses JSON-schema mode, with resilient parsing fallback for non-schema text.
- Pair-mode fallback prefers actual model text over generic placeholder replies when structured parsing fails.

---

## Local Setup

### Prerequisites

- Node.js `18.17+` (`20+` recommended)
- npm

### 1) Clone and install

```bash
git clone https://github.com/LordeSid-04/experiment-dlweek.git
cd experiment-dlweek
npm run setup
```

### 2) Configure backend environment

Create a local env file from the template:

```bash
cd backend
copy .env.example .env
```

(`copy` is for Windows PowerShell/CMD. On macOS/Linux use `cp .env.example .env`.)

Edit `backend/.env` and set values you need:

- `OPENAI_API_KEY` (optional but recommended for live model output)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_AUTH_TABLE` (optional; only if using Supabase auth store)

Where to get keys:

- OpenAI API key: OpenAI dashboard -> API Keys
- Supabase URL + Service Role key: Supabase project -> Settings -> API

Important:

- Use **Supabase Service Role key** on backend only (never expose in frontend code).
- Do not commit `.env` to GitHub.

### 3) Start backend

```bash
cd backend
npm install
npm test
npm start
```

### 4) Start frontend

```bash
cd frontend
npm install
npm test
npm run dev
```

Set frontend backend URL in `frontend/.env.local`:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

If you open the frontend from another device, do not use `localhost`. Use a backend address reachable by that device (for example `http://<your-lan-ip>:4000` or your deployed backend URL).

If Vercel is stuck on an older commit, push any new commit to `main` to trigger a fresh deployment from the latest source.

### 5) Open the app

- `http://localhost:3000/auth`
- `http://localhost:3000/confidence`
- `http://localhost:3000/workspace`

---

## Configuration

### Backend environment (`backend/.env`)

- `OPENAI_API_KEY` (optional; enables live model calls)
- `OPENAI_MODEL` (default: `gpt-5-codex`)
- `OPENAI_TIMEOUT_MS`
- `OPENAI_FAST_MODEL` (default: `gpt-5-codex`, used by quick assist endpoint)
- `OPENAI_FAST_TIMEOUT_MS` (default: `8000`)
- `GOVERNOR_USE_MODEL_SUMMARY` (`false` by default for lower latency)
- `BACKEND_PORT` (default: `4000`)
- `SUPABASE_URL` (optional; enables Supabase auth store)
- `SUPABASE_SERVICE_ROLE_KEY` (optional; required with `SUPABASE_URL`)
- `SUPABASE_AUTH_TABLE` (default: `users`)

`backend/.env` is local-only and intentionally not committed to GitHub. Use `backend/.env.example` as the template.

If `OPENAI_API_KEY` is unset, the backend uses a deterministic harness fallback for continuity.
After changing `OPENAI_API_KEY` in `backend/.env`, restart the backend process so the new key is loaded.

### Codex Troubleshooting

If responses look generic or no file patch is produced in pair mode:

1. Verify backend is reading your key:
   - `OPENAI_API_KEY` is set in `backend/.env`
   - backend was restarted after editing `.env`
2. Open workspace logs and confirm `provider` is `openai-api` for DEVELOPER steps.
3. Keep prompts explicit for edits (for example: "fix this file and return updated code").
4. Ensure the file is loaded in workspace state (selected file present in file explorer).

Auth storage behavior:

- If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, signup/login uses Supabase.
- Otherwise, backend falls back to `backend/data/users.json`.

Supabase auth table should include these columns:

- `id` (uuid/text primary key)
- `first_name` (text)
- `last_name` (text)
- `email` (text, unique)
- `mobile_number` (text)
- `password_salt` (text)
- `password_digest` (text)
- `created_at` (timestamp/text)

---

## Testing

- Backend: Node test runner (`backend/test/*`)
- Frontend: Vitest (`frontend/src/**/*.test.ts[x]`)

Run all tests:

```bash
cd backend && npm test
cd ../frontend && npm test
```

---

## Repository Structure

- `frontend/` - Next.js application (UI, governance controls, workspace)
- `backend/` - orchestration API, agents, policy/risk/scanning, ledger

Key contracts:

- `backend/src/types.js`
- `frontend/src/lib/backend-run.ts`
- `backend/src/schemas/ledger-event.schema.json`
