# TC-003 Expected Findings

> **EVALUATION USE ONLY — do not expose this file to the review agents.**
> This file defines the ground truth used by the evaluation runner to score agent output.

## Test Case Overview

- **ID**: TC-003
- **Category**: Testing
- **Change summary**: Introduce `isValidEmail` validation helper and gate `createUser` on it
- **Primary agent under test**: TestingAgent

---

## TestingAgent Findings (1 expected)

1. **No tests covering `isValidEmail` or the new validation gate in `createUser`**
   - Severity: `high`
   - File: `src/userService.ts`
   - Lines: 21–23 (the new `isValidEmail` function)
   - Description: The change introduces `isValidEmail` with a regular-expression pattern and wires it into `createUser` as an early guard. Neither the function itself nor the updated `createUser` path has a corresponding test. Malformed email strings, boundary cases (e.g. missing `@`, multiple dots, empty string), and the error-throw path in `createUser` are all untested.
   - Evidence: `export function isValidEmail(email: string): boolean {` and `if (!isValidEmail(email)) {`

---

## SecurityAgent Findings (0 expected)

Email validation is an improvement, not a vulnerability. A regex that is too permissive
is a correctness concern, not a security finding in this context.

---

## CorrectnessAgent Findings (0 expected)

The regex used is a standard syntactic email pattern. Potential false-negative inputs
(e.g. quoted local parts) are edge cases outside the stated scope.

---

## MaintainabilityAgent Findings (0 expected)

The helper is short and well-documented. No maintainability concerns are introduced.

---

## Scoring Notes

| Field | Required match |
|---|---|
| `category` | `testing` |
| `severity` | `high` |
| `file` | contains `userService.ts` |
| `evidence` | references `isValidEmail` |
