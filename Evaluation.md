# CodexGo Evaluation Report

This document records test and evaluation evidence for CodexGo in a reproducible format.

## Evaluation Context

- **Repository:** `experiment-dlweek`
- **Commit evaluated:** `07e8723`
- **Commit timestamp:** `2026-03-03 07:26:45 +0800`
- **Test date:** 2026-03-03
- **Environment:** Local Windows (Node.js runtime), backend Node test runner, frontend Vitest

## Objectives

- Validate core product stability across backend and frontend.
- Prove governance behavior (allow/gate/block) under policy and risk conditions.
- Verify security scanning and policy-drift detection behavior.
- Preserve traceability with repeatable commands and measurable outcomes.

## Test Execution Summary

| Suite | Command | Result |
|---|---|---|
| Backend governance and safety (focused) | `cd backend && npm test -- --test-name-pattern "policy\|scanner\|orchestrator\|autopilot\|break-glass\|approval"` | **10/10 passed** |
| Backend full regression | `cd backend && npm test` | **36/36 passed** |
| Frontend full regression | `cd frontend && npm test` | **11/11 files passed, 28/28 tests passed** |

## What the Results Demonstrate

### 1) Governance and policy enforcement

Focused backend tests confirmed:

- assist mode requires approval even for low risk
- pair mode allows low, gates medium, blocks high
- autopilot gates high and blocks critical without valid controls
- high-risk autopilot paths enforce two distinct approvers
- break-glass is blocked when expiry is invalid

**Evidence signal:** all focused governance tests passed.

### 2) Security and scanner coverage

Backend scanner tests validated detection for:

- dangerous SQL (`DROP TABLE`, `DELETE FROM` without `WHERE`)
- policy drift (removed approval checks)
- trust-boundary drift patterns
- secret-like token patterns

**Evidence signal:** scanner-related tests passed in full suite.

### 3) Quality controls for generated output

Developer agent tests validated:

- prompt grounding and anti-template drift
- intent-specific quality scoring
- company/brand grounding checks
- exact explicit-name preservation behavior for branded website output

**Evidence signal:** developer quality tests passed in full suite.

### 4) Frontend stability and integration behavior

Frontend tests validated:

- governance helper behavior
- backend-run parsing and typed event handling
- assistant companion and intent-checklist logic
- UI component rendering behavior

**Evidence signal:** all frontend test files and tests passed.

## Reproducibility

Run the same evaluation with:

```bash
cd backend
npm test -- --test-name-pattern "policy|scanner|orchestrator|autopilot|break-glass|approval"
npm test

cd ../frontend
npm test
```

If outputs match pass counts above, evaluation is reproducible for the same code revision.

## Visual Evidence Pack (Recommended)

Capture and attach screenshots for:

1. focused backend governance test output (`10/10 passed`)
2. full backend test output (`36/36 passed`)
3. full frontend test output (`28/28 passed`)
4. workspace gate examples:
   - safe change -> `ALLOWED`
   - medium/high risk -> `NEEDS_APPROVAL` or `BLOCKED`
5. ledger evidence sample (`/api/ledger/events`) showing hash-linked fields:
   - `prevEventHash`
   - `eventHash`
   - `diffHash`
   - `testHashes`

## Scenario Evaluation Matrix

| Scenario | Expected Risk Outcome | Expected Gate Outcome | Status |
|---|---|---|---|
| Low-risk code adjustment | LOW/MED | ALLOWED or NEEDS_APPROVAL (mode-dependent) | Verified |
| Medium-risk endpoint change | MED | NEEDS_APPROVAL (pair/autopilot policy path) | Verified |
| High-risk auth/policy change | HIGH | BLOCKED or approval-gated by mode | Verified |
| Critical destructive pattern | CRITICAL | BLOCKED unless valid break-glass controls | Verified |
| Invalid break-glass expiry | HIGH/CRITICAL path | BLOCKED | Verified |

## Residual Risks and Next Improvements

- Current persistence uses local file storage; production-grade durability should migrate to managed database/object storage.
- Add CI-published test artifacts (machine-readable reports) for centralized audit history.
- Add scheduled synthetic checks against deployed environment for ongoing evaluation drift detection.

