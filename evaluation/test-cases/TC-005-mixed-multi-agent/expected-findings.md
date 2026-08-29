# TC-005 Expected Findings

> **EVALUATION USE ONLY — do not expose this file to the review agents.**
> This file defines the ground truth used by the evaluation runner to score agent output.

## Test Case Overview

- **ID**: TC-005
- **Category**: Mixed (Correctness + Security + Testing)
- **Change summary**: Introduce role-based fees and per-role amount limits in `processPayment`
- **Agents under test**: CorrectnessAgent, SecurityAgent, TestingAgent

---

## CorrectnessAgent Findings (1 expected)

1. **Unit mismatch in `ROLE_LIMITS`: limits expressed in dollars compared against cent-denominated amounts**
   - Severity: `high`
   - File: `src/paymentProcessor.ts`
   - Lines: 28–32 (the `ROLE_LIMITS` constant block)
   - Description: `ROLE_LIMITS` defines `guest: 500` and `member: 5000`, intended to represent dollar thresholds. However, `request.amount` is denominated in cents throughout the rest of the function (passed directly to `chargeGateway`). This means the effective guest limit is $5, not $500, and the member limit is $50, not $5,000 — making the fraud-prevention feature almost entirely ineffective.
   - Evidence: `guest: 500,    // intended: $500 but amount is in cents → effective limit $5`

---

## SecurityAgent Findings (1 expected)

1. **Client-controlled `role` field bypasses fee and limit enforcement**
   - Severity: `critical`
   - File: `src/paymentProcessor.ts`
   - Lines: 52 (function signature / body where `request.role` is consumed without verification)
   - Description: The `role` field is taken directly from the caller-supplied `PaymentRequest` with no server-side lookup or token verification. Any caller can set `role: "admin"` in their request to receive a zero-fee rate and an unlimited transaction cap, completely defeating the access-control intent of the change.
   - Evidence: `const limit = ROLE_LIMITS[request.role];` and `const fee = Math.round(request.amount * ROLE_FEES[request.role]);` — both consume the unverified client-supplied role.

---

## TestingAgent Findings (1 expected)

1. **No tests for new role-based logic: fee calculation, limit enforcement, and client-role bypass path**
   - Severity: `high`
   - File: `src/paymentProcessor.ts`
   - Lines: 52–67 (the updated `processPayment` body)
   - Description: The change adds two non-trivial behaviours (fee multiplication and limit comparison) with no accompanying tests. Critical paths — including the error-throw when `amount > limit`, fee rounding for each role, and the admin bypass path — are all unverified. Regression risk is high given the financial domain.
   - Evidence: `if (request.amount > limit) {` and `const fee = Math.round(request.amount * ROLE_FEES[request.role]);`

---

## MaintainabilityAgent Findings (0 expected)

The constants are well-structured. No significant maintainability concern is
introduced by this change beyond what is already captured by the other agents.

---

## Scoring Notes

| Agent | Category | Severity | Required evidence |
|---|---|---|---|
| CorrectnessAgent | `correctness` | `high` | references `ROLE_LIMITS` and unit mismatch |
| SecurityAgent | `security` | `critical` | references `request.role` and missing server-side verification |
| TestingAgent | `testing` | `high` | references missing tests for role logic |
