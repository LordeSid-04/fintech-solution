# Cinematic Landing Page (Next.js)

A user-friendly, premium-style landing page inspired by your reference image and `vid2 (1).gif`.

## Stack Decision

- Framework: `Next.js` (App Router)
- Styling: `Tailwind CSS`
- Why not switch to Vite: this project already had a Next.js scaffold, and Next.js gives production-ready routing, image optimization, and a cleaner path for future backend/auth features.

## Assets Used

- Hero background animation: `public/hero-background.gif`
- Inspiration panel image: `public/inspo-reference.png`

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

To use the governed backend pipeline:

1. Start backend (`../backend`):
   ```bash
   npm install
   npm start
   ```
2. Set frontend env:
   ```bash
   NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
   ```
3. Run frontend dev server and submit prompts from workspace AI panel.

Additional route:

- `http://localhost:3000/confidence` for the futuristic confidence/permissions layout.
- Governance mapping utilities: `src/lib/governance.ts` (`getMode`, `getGovernanceConfig`).
- Global confidence state store: `src/lib/store.ts` (Zustand + localStorage persist).
- Governance helper hook: `src/lib/use-governance.ts`.
- Mock agent run generator: `src/lib/mockRun.ts` (timeline feed for workspace panel).
- Diff viewer highlights risky lines and links to finding popover details in workspace.
- Workspace viewer now includes a dedicated `Response` tab (alongside Preview/Editor/Diff/Logs) for readable model output.
- Response tab renders generated code with in-browser syntax highlighting for a more IDE-authentic review flow.
- In `Autopilot` (`100% confidence`), the UI now auto-switches to `Response` as soon as streaming starts, and live agent output updates smoothly in real time.
- `Autopilot` now streams per-file generation progress (`generated_file_chunk`) so files appear and fill in real time while generation is running.
- Response tab now includes a live response timer and a file picker to inspect one generated file at a time without scrolling through all files.
- Response tab now includes an intent-fit checklist (chatbot/website/dashboard/app) so users can quickly verify the generated output matches the original prompt intent.
- Timeline now includes Approval history (from backend ledger) with approvers and Break-glass context.
- Confidence slider snaps to `0`, `50`, `100`; modes map to Assist `0`, Pair `50`, Autopilot `100`.
- Assist at `0` is companion-only: scoped code-quote help, suggestions/diffs only, and manual Approval-required execution.
- Assist (`0`) and Pair (`50`) use an IDE-style in-browser editor with syntax highlighting and inline run output.
- Assist (`0`) companion responses are now local-first and selection-aware (fast think-box in editor; no forced Logs tab jump).
- TypeScript/TSX run flow transpiles in-browser before execution; Python uses Pyodide sandbox execution.
- Assist (`0`) now calls a fast backend OpenAI suggestion endpoint and renders a compact in-editor `Suggestions` box.
- Auth UX now uses a single signup roundtrip when possible: backend signup returns a session so the client can skip a second login request.
- Editor includes a terminal-style output panel that always shows run output (`(no output)` when nothing is emitted).
- Confidence is stored per selected project from the confidence page project selector.
- Workspace save flow supports in-app project persistence and optional `.zip` download export.

## Confidence Mode Contracts (Strict Reset)

- `0% (Assist)`: OpenAI companion mode for scoped suggestions and targeted code guidance only.
- `50% (Pair)`: OpenAI pair-programmer mode for partial code generation/fixes with governance gates.
- `100% (Autopilot)`: full agentic pipeline (Architect/Developer/Verifier/Operator/Governor).
- `100% (Autopilot)` now emits periodic developer progress updates during long generations and uses deterministic recovery scaffolds if strict quality checks fail after refinement budget.
- No heuristic/harness content fallback is used for generation paths; model failures now return explicit error codes and remediation guidance.

## Safety Scanner + Risk Engine

Every generated response is scanned and risk-scored before final gate output:

- Secret pattern scanning (OpenAI/AWS/GitHub token formats)
- Dangerous diff detection:
  - `DROP TABLE`
  - `DELETE FROM` without `WHERE`
  - auth middleware disable/bypass patterns
  - IAM wildcard permissions
  - logging headers/cookies/tokens
- Risk card now includes:
  - `topDrivers`
  - `requiredControls`
  - `reasonCodes`
  - `evidenceQuotes` (exact snippets with file/line references) shown under `Why?`

## OpenAI Key Troubleshooting

If quality is low or runs fail, check backend configuration first:

1. Set `OPENAI_API_KEY` in backend env.
2. Ensure selected model names are available for your account:
   - Defaults are now Codex-first (`OPENAI_CODEX_MODEL` / `OPENAI_MODEL` / `OPENAI_ASSIST_MODEL` / `OPENAI_PAIR_MODEL` set to `gpt-5-codex` in `backend/.env.example`).
   - `OPENAI_ASSIST_MODEL`
   - `OPENAI_PAIR_MODEL`
   - `OPENAI_CODEX_MODEL`
   - optional `OPENAI_AUTOPILOT_FALLBACK_MODEL` for 100% mode model fallback on provider/model compatibility errors
3. Increase timeout if needed (`OPENAI_FAST_TIMEOUT_MS`, `DIRECT_MODEL_TIMEOUT_MS`).
   - For faster direct assist/pair responses, tune context/output limits:
     - `DIRECT_CONTEXT_FILES_ASSIST`, `DIRECT_CONTEXT_LINES_ASSIST`
     - `DIRECT_CONTEXT_FILES_PAIR`, `DIRECT_CONTEXT_LINES_PAIR`
     - `DIRECT_TOKEN_SCAN_CHARS_ASSIST`, `DIRECT_TOKEN_SCAN_CHARS_PAIR`
     - `DIRECT_MAX_OUTPUT_TOKENS_ASSIST`, `DIRECT_MAX_OUTPUT_TOKENS_PAIR`
   - For faster 100% autopilot stage latency, tune:
     - `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_ATTEMPTS`
     - `ARCHITECT_MODEL_TIMEOUT_MS`, `ARCHITECT_MODEL_MAX_ATTEMPTS`
     - `DEVELOPER_STAGE_BUDGET_MS`, `DEVELOPER_MODEL_TIMEOUT_MS`, `DEVELOPER_MODEL_MAX_ATTEMPTS`
     - `DEVELOPER_CONTEXT_MAX_FILES`, `DEVELOPER_CONTEXT_MAX_CHARS_PER_FILE`, `DEVELOPER_CONTEXT_MAX_TOTAL_CHARS`
     - `VERIFIER_MODEL_TIMEOUT_MS`, `VERIFIER_MODEL_MAX_ATTEMPTS`
     - `OPERATOR_MODEL_TIMEOUT_MS`, `OPERATOR_MODEL_MAX_ATTEMPTS`
4. Backend now returns explicit model errors such as:
   - `INVALID_API_KEY`
   - `MODEL_NOT_PERMITTED`
   - `MODEL_NOT_FOUND`
   - `RATE_LIMITED`
   - `TIMEOUT`

## Rollout and Rollback Verification

- Stage changes in small reversible steps.
- Validate scanner/risk output and gate behavior in staging before broader rollout.
- If rollback is required, revert to prior build artifacts and re-run verification checks (`tests + scanner assertions`) before reopening traffic.

## Tests

Unit tests are included for ledger schemas/utilities:

```bash
npm run test
```

Watch mode:

```bash
npm run test:watch
```

## Evidence Logging (Demo-Grade)

Typed ledger event schemas are in `src/lib/evidence-ledger.ts`.
The CTA click appends an event to local storage using:

- `timestamp`
- `actor`
- `agentRole`
- `actionType`
- `resourcesTouched`
- `diffHash`
- `testHashes`
- `approvals`

This implementation is append-only in behavior (new events are appended to prior history).

Backend ledger evidence is also append-only at `backend/data/evidence-ledger.jsonl`.

## Design System (Landing Page)

Reusable tokens are defined in `src/lib/design-system.ts`:

- Typography: hero, h2, body, eyebrow
- Spacing: container, hero section, content section
- Buttons: pill primary + outline variants
- Cards: glass card + hover glow

Reusable UI primitives:

- `src/components/ui/Container.tsx`
- `src/components/ui/Section.tsx`
- `src/components/ui/PillButton.tsx`
- `src/components/ui/GlassCard.tsx`

## Motion + Scrolling UX

- Hero entrance animations use `framer-motion` for eyebrow/headline/subtext sequencing.
- Reduced-motion preferences are respected via `useReducedMotion` and zero-motion fallbacks.
- Scroll behavior uses CSS smooth scrolling with JS fallback for anchor navigation.
- Scroll snap is tuned for comfort (`proximity` on mobile/Safari, `mandatory` on desktop).

## Performance + Accessibility

- Reduced expensive glows/blur usage to lower repaint/compositing cost.
- Improved text contrast on body/supporting copy for readability on dark backgrounds.
- Added keyboard-visible focus rings on navbar controls.
- FAQ section uses semantic `details/summary` for keyboard-friendly disclosure behavior.
- Maintained heading hierarchy (`h1` hero, `h2` section titles, `h3` card/FAQ items).

## Dependency Review

Added dependencies:

- `vitest`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `jsdom`
- `framer-motion`
- `zustand`
- `jszip`
- `react-syntax-highlighter`
- `@types/react-syntax-highlighter`
- `@uiw/react-codemirror`
- `@codemirror/lang-javascript`
- `@codemirror/lang-python`
- `@codemirror/lang-html`
- `@codemirror/lang-css`
- `@codemirror/lang-json`
- `@codemirror/lang-markdown`
- `@codemirror/lang-yaml`
- `@codemirror/theme-one-dark`

Reason:

- Needed a lightweight unit test setup for feature coverage and regression checks.
- Needed subtle entrance animations with reduced-motion accessibility controls.
- Needed global persisted app state for confidence mode selection.
- Needed client-side ZIP export for project files when users download to device.
- Needed a browser-side syntax highlighter to render generated code legibly in the new Response tab.
- Needed a Monaco/CodeMirror-style editor with language-aware highlighting for Assist/Pair coding workflows.

License note:

- These packages are commonly distributed under permissive licenses (MIT-style); confirm exact license text during production legal review.

Minimal alternative considered:

- Node built-in test runner without additional packages. Rejected because it adds friction for React/DOM-oriented tests and weaker ergonomics for frontend unit coverage.
- CSS-only keyframe transitions for hero content. Rejected because it is harder to orchestrate staggered entrance timing while cleanly honoring reduced-motion preferences.
- Manual blob export as plain JSON. Rejected because requirement is archive export with project file paths preserved.
- Hand-rolled regex token coloring. Rejected because it is less accurate and less maintainable than a purpose-built syntax highlighter.
- Kept plain `<textarea>` editor. Rejected because it does not provide IDE-like language tooling or scalable syntax experience.
