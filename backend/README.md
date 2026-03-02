# Backend SDLC Control Plane

This service implements a human-governed multi-agent SDLC pipeline:

`ARCHITECT -> DEVELOPER -> VERIFIER -> OPERATOR -> GOVERNOR`

The orchestrator runs these stages sequentially and records:

- Codex proof metadata for each model call (`provider`, `model`, `responseId`, `timestamp`, `invokedBy`)
- scanner findings (line-level evidence)
- risk score + policy gate decisions
- append-only audit ledger events with diff/test hashes and approvals

## Run

```bash
npm install
npm run dev
```

Default server URL: `http://localhost:4000`

## Endpoints

- `GET /api/health`
- `POST /api/orchestrator/run`

Example request body:

```json
{
  "request": "Implement secure API patch for workspace save",
  "actor": "siddh",
  "approvals": [
    { "approverId": "alice", "approvedAt": "2026-03-02T10:00:00.000Z" },
    { "approverId": "bob", "approvedAt": "2026-03-02T10:01:00.000Z" }
  ]
}
```

## Security Checks Included

- Secret pattern scanning (OpenAI-style and AWS key patterns)
- Dangerous diff detector:
  - `DROP TABLE`
  - `DELETE FROM` without `WHERE`
  - auth disable/bypass patterns
  - wildcard IAM-like permissions
  - logging headers/cookies/tokens

## Dependency Review

Added backend dependencies:

- `openai`
- `typescript`
- `tsx`
- `vitest`

Reason:

- `openai` is required to call Codex through OpenAI API.
- `typescript` and `tsx` provide typed implementation and local execution.
- `vitest` provides lightweight unit tests for risk/policy/orchestrator behavior.

License note:

- These packages are generally permissive-license packages (commonly MIT-style). Confirm exact legal acceptance before production.

Minimal alternatives considered:

- Raw HTTP calls without SDK for OpenAI API; rejected for weaker ergonomics and proof metadata handling.
- Plain JavaScript without TypeScript; rejected because typed artifacts/ledger schema are a core requirement.
- Node built-in test runner; possible, but rejected for consistency with existing frontend Vitest setup.
