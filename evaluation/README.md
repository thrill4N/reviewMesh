# ReviewMesh Evaluation Framework

A self-contained benchmark suite for measuring ReviewMesh agent quality.
Six test cases exercise each specialist agent independently, in combination,
and against a false-positive trap.

---

## Directory Structure

```
evaluation/
├── test-cases/
│   ├── TC-001-correctness-off-by-one/
│   ├── TC-002-security-missing-authorization/
│   ├── TC-003-testing-missing-regression-test/
│   ├── TC-004-maintainability-duplication/
│   ├── TC-005-mixed-multi-agent/
│   └── TC-006-false-positive-trap/
├── runner/
│   ├── index.ts        ← Main runner + CLI
│   ├── types.ts        ← Type definitions
│   └── utils.ts        ← Pure helper functions
├── fixtures/
│   └── sample-repo/    ← Minimal demo repository
└── README.md           ← This file
```

Each test case directory contains:

| File | Purpose |
|---|---|
| `before/src/*.ts` | Original code (pre-change state) |
| `after/src/*.ts` | Modified code (post-change state) |
| `diff.patch` | Unified diff between before and after |
| `expected-findings.md` | **Ground truth — never shown to agents** |

---

## Test Cases

| ID | Category | Expected Findings | Agent(s) Tested |
|---|---|---|---|
| TC-001 | Correctness | 1 (high) | CorrectnessAgent |
| TC-002 | Security | 1 (critical) | SecurityAgent |
| TC-003 | Testing | 1 (high) | TestingAgent |
| TC-004 | Maintainability | 1 (low) | MaintainabilityAgent |
| TC-005 | Mixed | 3 (1 per agent) | All agents |
| TC-006 | False Positive Trap | **0** | SecurityAgent (anti-test) |

### TC-001 — Correctness: Off-by-One

`sumArray` uses `i <= values.length` instead of `i < values.length`, silently
producing `NaN` on non-empty inputs. The CorrectnessAgent should flag this as
a high-severity logic error.

### TC-002 — Security: Missing Authorization

`cancelOrder` accepts any `orderId` with no ownership check, enabling IDOR.
The SecurityAgent should flag this as critical.

### TC-003 — Testing: Missing Regression Test

A new `isValidEmail` validator is added with no tests. The TestingAgent should
flag the missing coverage as high severity.

### TC-004 — Maintainability: Code Duplication

Two functions share identical 6-line normalisation logic. The MaintainabilityAgent
should flag the duplication as low severity.

### TC-005 — Mixed: Multi-Agent

A payment processor adds role-based limits (unit mismatch → correctness) with an
unverified client-supplied role (security) and no tests (testing). Expects one
finding from each of the three relevant agents.

### TC-006 — False Positive Trap

A change removes hardcoded secret fallbacks and replaces them with mandatory
env-var enforcement. The SecurityAgent **must not** flag this as a vulnerability.
Any finding produced here is a false positive.

---

## Setup

### Prerequisites

- Node.js ≥ 20
- TypeScript 5 (installed via the root `package.json`)

### Environment Variables

```bash
cp .env.example .env
# Edit .env and set:
BOB_API_KEY=your-bob-2.0-api-key
BOB_MODEL_ID=ibm/granite-13b-instruct-v2   # optional
AGENT_TIMEOUT_MS=30000                     # optional
```

If `BOB_API_KEY` is absent the runner starts in **stub mode**: all agents return
empty findings, which lets you verify the framework scaffolding without a live API.

---

## Running the Evaluation

### Full evaluation run

```bash
# From the repository root
node --loader ts-node/esm evaluation/runner/index.ts
```

### Custom output path

```bash
node --loader ts-node/esm evaluation/runner/index.ts --output path/to/report.md
```

### Stub mode (no API key required)

```bash
# Omit BOB_API_KEY or leave it blank
node --loader ts-node/esm evaluation/runner/index.ts
```

### Expected console output

```
🚀 Running 6 evaluation test cases...

  📝 TC-001: correctness off-by-one ...   ✅ (1/1, 2345ms)
  📝 TC-002: security missing auth    ...  ✅ (1/1, 2890ms)
  📝 TC-003: testing missing test     ...  ✅ (1/1, 3102ms)
  📝 TC-004: maintainability dup      ...  ✅ (1/1, 1890ms)
  📝 TC-005: mixed multi-agent        ...  ⚠️ (2/3, 4567ms)
  📝 TC-006: false positive trap      ...  ✅ (0 FP, 2134ms)

📊 Summary:
  Total Tests : 6
  Passed      : 5
  Partial     : 1
  Failed      : 0
  Average F1  : 0.86
  Duration    : 16.9s

✅ Report saved to docs/METRICS.md
```

The report is written to `docs/METRICS.md` by default.

---

## Metrics

Each test case produces a `Metrics` object:

| Field | Formula | Meaning |
|---|---|---|
| `truePositives` | min(actual, expected) per category | Agent found what was expected |
| `falsePositives` | max(0, actual − expected) | Agent found something unexpected |
| `falseNegatives` | max(0, expected − actual) | Agent missed an expected finding |
| `precision` | TP / (TP + FP) | How much of the output is useful |
| `recall` | TP / (TP + FN) | How much of what matters was found |
| `f1Score` | 2·P·R / (P+R) | Harmonic mean of precision and recall |

### False Positive Trap (TC-006)

For TC-006, the pass condition is inverted:

- **Pass** — agent produces 0 findings (correct true negative)
- **Fail** — agent produces ≥ 1 finding (false positive detected)

The `expectedFindings` count for TC-006 is 0, so any actual finding becomes a
false positive in the metrics.

### NaN-safety

When the denominator of precision or recall is zero (e.g. nothing was expected
and nothing was produced), the metric defaults to `1.0` to avoid NaN propagation.

---

## Adding a New Test Case

1. Create a directory under `evaluation/test-cases/` following the naming
   convention: `TC-NNN-short-description` (e.g. `TC-007-new-scenario`).

2. Populate the directory:
   ```
   TC-007-new-scenario/
   ├── before/src/myFile.ts     ← code with the problem
   ├── after/src/myFile.ts      ← code after the fix
   ├── diff.patch               ← unified diff
   └── expected-findings.md     ← ground truth (see format below)
   ```

3. Write `expected-findings.md` with the heading format the parser expects:
   ```markdown
   ## CorrectnessAgent Findings (1 expected)
   ## SecurityAgent Findings (0 expected)
   ## TestingAgent Findings (0 expected)
   ## MaintainabilityAgent Findings (0 expected)
   ```
   The parser extracts the number in parentheses for each agent heading.

4. Run the evaluation and verify your test case appears in the output.

---

## Troubleshooting

### "Could not read test-cases directory"

The runner looks for `evaluation/test-cases/` relative to the repository root.
Ensure the directory exists and contains `TC-NNN-*` subdirectories.

### "Missing expected-findings.md"

Every test case directory must contain an `expected-findings.md` file.
The runner will refuse to run the test case without it.

### Agent running in stub mode unexpectedly

Check that `BOB_API_KEY` is set in your shell or `.env` file.
The runner prints a warning when falling back to the stub client.

### TypeScript compilation errors in evaluation/

The runner uses the root `tsconfig.json`. If you add new files, ensure
`evaluation/**/*.ts` is included in the `tsconfig.json` `include` array.

### All test cases show 0 findings

This is expected in stub mode. The stub LLM client always returns `{ "findings": [] }`.
Set `BOB_API_KEY` to use the live API.

---

## Architecture Notes

The evaluation runner is deliberately kept separate from the production pipeline:

- It imports only the published domain types (`Finding`, `AgentContext`, etc.)
  and the `SecurityAgent` class.
- It does not depend on HTTP servers, databases, or other runtime infrastructure.
- Each test case runs in isolation: no shared state, no cross-test side effects.
- Running the evaluation multiple times produces identical results (idempotent).

When additional specialist agents (`CorrectnessAgent`, `TestingAgent`,
`MaintainabilityAgent`) are implemented in `src/agents/`, extend the
`runAgentsOnTestCase` function in `evaluation/runner/index.ts` following the
same pattern as the `SecurityAgent` integration.
