# TC-004 Expected Findings

> **EVALUATION USE ONLY — do not expose this file to the review agents.**
> This file defines the ground truth used by the evaluation runner to score agent output.

## Test Case Overview

- **ID**: TC-004
- **Category**: Maintainability
- **Change summary**: Extract `normaliseName` and `combineName` helpers to eliminate duplication between `formatProfileName` and `formatInvoiceName`
- **Primary agent under test**: MaintainabilityAgent

---

## MaintainabilityAgent Findings (1 expected)

1. **Identical normalisation logic duplicated across `formatProfileName` and `formatInvoiceName`**
   - Severity: `low`
   - File: `src/stringUtils.ts`
   - Lines: 8–14 and 22–28 (the two function bodies in the *before* state)
   - Description: Both functions contain identical 6-line blocks that trim, normalise whitespace, and combine name parts. Any future change to the name-formatting rules must be applied in two places, making divergent behaviour likely over time.
   - Evidence: The comment `NOTE: duplicates the normalisation logic from formatProfileName` in `formatInvoiceName`, plus the byte-for-byte identical bodies of both functions.

---

## CorrectnessAgent Findings (0 expected)

The duplication is not a logic error; both functions behave correctly.

---

## SecurityAgent Findings (0 expected)

String formatting helpers have no security implications.

---

## TestingAgent Findings (0 expected)

Both functions are covered by their existing (implied) callers. The refactoring does
not introduce new untested paths.

---

## Scoring Notes

| Field | Required match |
|---|---|
| `category` | `maintainability` |
| `severity` | `low` |
| `file` | contains `stringUtils.ts` |
| `evidence` | references duplication between the two functions |
