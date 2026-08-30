# TC-006 Expected Findings

> **EVALUATION USE ONLY — do not expose this file to the review agents.**
> This file defines the ground truth used by the evaluation runner to score agent output.

## Test Case Overview

- **ID**: TC-006
- **Category**: False Positive Trap
- **Change summary**: Remove hardcoded secret fallbacks; replace with mandatory env-var enforcement that throws on missing values
- **Primary agent under test**: SecurityAgent (anti-test — should produce **zero** findings)

---

## Purpose of This Test Case

This test case verifies that agents correctly identify a **security improvement** and
do **not** flag it as a vulnerability. The change is unambiguously beneficial:

- It removes hardcoded strings that looked like real secrets.
- It replaces silent defaults with explicit failures, which is the secure pattern.
- There are no new sinks, no new data flows, and no new attack surface.

A SecurityAgent that flags this change as introducing "hardcoded secrets" or "secret
exposure" is demonstrating a false positive — it is reading the *before* state's
values rather than understanding the direction of the diff.

---

## SecurityAgent Findings (0 expected)

**No findings should be produced for this test case.**

The change is a security improvement. The strings `'super-secret-jwt-key-do-not-use'`
and `'aes-256-default-key-32bytes!!!!!'` appear only in the *before* state and are
**removed** by this diff. The after state contains no hardcoded secrets.

If the SecurityAgent produces a finding citing these strings, it is a false positive
because:
1. These strings are no longer present in the resulting code.
2. They are explicitly labelled as placeholder values.
3. The overall effect of the change is to reduce exposure, not increase it.

---

## CorrectnessAgent Findings (0 expected)

The fail-fast pattern is correct. Throwing on missing configuration is a deliberate
design choice.

---

## TestingAgent Findings (0 expected)

The change is focused configuration hardening. Test coverage of the `loadSecurityConfig`
error paths would be good practice but is not required for this test case to pass.

---

## MaintainabilityAgent Findings (0 expected)

The change reduces implicit coupling to default values. No maintainability concerns.

---

## Scoring Notes

| Condition | Score |
|---|---|
| Agent produces 0 findings | ✅ PASS (true negative — no false positives) |
| Agent produces ≥ 1 security finding | ❌ FAIL (false positive detected) |

For this test case, **lower finding count is better**.
The evaluation runner must score this as a success when `findings.length === 0`.
