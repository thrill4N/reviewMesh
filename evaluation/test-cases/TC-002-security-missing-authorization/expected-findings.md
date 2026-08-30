# TC-002 Expected Findings

> **EVALUATION USE ONLY — do not expose this file to the review agents.**
> This file defines the ground truth used by the evaluation runner to score agent output.

## Test Case Overview

- **ID**: TC-002
- **Category**: Security
- **Change summary**: Add `requestingUserId` parameter to `cancelOrder` and verify ownership before cancellation
- **Primary agent under test**: SecurityAgent

---

## SecurityAgent Findings (1 expected)

1. **Missing ownership verification in `cancelOrder` allows IDOR**
   - Severity: `critical`
   - File: `src/orderController.ts`
   - Lines: 21 (function signature in the *before* state)
   - Description: The original `cancelOrder` function accepts only an `orderId` with no caller identity check. Any authenticated user who knows (or guesses) an order ID can cancel it, regardless of ownership. This is an insecure direct object reference (IDOR) vulnerability.
   - Evidence: `export async function cancelOrder(orderId: string): Promise<void> {`

---

## CorrectnessAgent Findings (0 expected)

The logic is correct given the original signature. The ownership gap is a security
concern, not a logic error.

---

## TestingAgent Findings (0 expected)

The change introduces new authorization logic. A testing agent *may* observe that no
regression test covers the unauthorized-cancellation path, but a finding is not
required for this test case to pass.

---

## MaintainabilityAgent Findings (0 expected)

The change is a focused security fix with no maintainability implications.

---

## Scoring Notes

| Field | Required match |
|---|---|
| `category` | `security` |
| `severity` | `critical` |
| `file` | contains `orderController.ts` |
| `evidence` | contains `cancelOrder` and indicates missing auth |
