# TC-001 Expected Findings

> **EVALUATION USE ONLY — do not expose this file to the review agents.**
> This file defines the ground truth used by the evaluation runner to score agent output.

## Test Case Overview

- **ID**: TC-001
- **Category**: Correctness
- **Change summary**: Fix off-by-one loop condition in `sumArray` — `<=` corrected to `<`
- **Primary agent under test**: CorrectnessAgent

---

## CorrectnessAgent Findings (1 expected)

1. **Off-by-one error in `sumArray` loop condition**
   - Severity: `high`
   - File: `src/calculator.ts`
   - Lines: 11 (the `for` loop line in the *before* state)
   - Description: The loop condition `i <= values.length` causes the loop to execute one extra iteration. On the final pass, `values[values.length]` is `undefined`, so `total += undefined` produces `NaN`, silently corrupting the return value.
   - Evidence: `for (let i = 0; i <= values.length; i++) {`

---

## SecurityAgent Findings (0 expected)

No security vulnerabilities are introduced by this change.

---

## TestingAgent Findings (0 expected)

The fix corrects an existing bug; no new untested behaviour is introduced.
A testing agent *may* note the absence of an edge-case test for an empty array, but
that is an informational observation, not a required finding for this test case.

---

## MaintainabilityAgent Findings (0 expected)

The change is a single-line correction with no maintainability implications.

---

## Scoring Notes

| Field | Required match |
|---|---|
| `category` | `correctness` |
| `severity` | `high` |
| `file` | contains `calculator.ts` |
| `evidence` | contains `<=` |
