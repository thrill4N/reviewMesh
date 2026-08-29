# ReviewMesh — AI Review Workflow Specification

## 1. Workflow Objective

The ReviewMesh workflow transforms a code change into a validated, prioritized engineering review.

The workflow is designed around:

> **Understand → Analyze in parallel → Validate → Deduplicate → Prioritize → Synthesize**

IBM Bob 2.0 acts as the workflow orchestrator.

---

# 2. High-Level Workflow

```text
                 Repository
                     +
                 Code Change
                     │
                     ▼
             ┌───────────────┐
             │ Bob Agent     │
             │ Orchestrator  │
             └───────┬───────┘
                     │
                     ▼
             Context Analysis
                     │
                     ▼
              Change Analysis
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
     Correctness  Security   Testing
       Agent       Agent      Agent
          │          │          │
          └──────────┼──────────┘
                     │
              Maintainability
                  Agent
                     │
                     ▼
             Finding Collection
                     │
                     ▼
            Finding Validation
                     │
                     ▼
             Deduplication
                     │
                     ▼
             Prioritization
                     │
                     ▼
             Review Synthesis
                     │
                     ▼
              Final Report
```

---

# 3. Stage 1 — Repository Context

## Purpose

Give the review agents enough context to understand the project before evaluating the change.

## Inputs

* repository
* README
* project configuration
* source tree
* relevant documentation
* tests
* dependency manifests

## Process

The orchestrator identifies:

* project purpose
* major components
* relevant files
* architecture conventions
* testing conventions
* dependencies
* security-sensitive areas

## Output

A compact project context object.

Example:

```json
{
  "projectPurpose": "...",
  "architecture": "...",
  "language": "TypeScript",
  "framework": "Express",
  "relevantFiles": [],
  "testStrategy": "...",
  "securitySensitiveAreas": []
}
```

The context should be concise enough to provide to specialist agents without unnecessarily consuming context.

---

# 4. Stage 2 — Change Analysis

## Purpose

Understand what the proposed change actually does.

## Inputs

* Git diff
* changed files
* relevant surrounding code
* project context

## Process

Identify:

* files changed
* functions changed
* APIs changed
* data flow affected
* dependencies affected
* tests added or modified
* potential impact areas

## Output

A change summary.

Example:

```text
Change:
Adds order cancellation endpoint.

Affected areas:
- OrderController
- OrderService
- Database repository

New behavior:
Users can cancel an order.

Potential risk areas:
- Authorization
- State transitions
- Database consistency
- Error handling
```

---

# 5. Stage 3 — Parallel Specialist Review

The orchestrator sends the relevant repository and change context to specialist agents.

These reviews are independent wherever possible and should run concurrently.

---

## 5.1 Correctness Agent

### Mission

Determine whether the change behaves correctly according to the available project context.

### Analyze

* logic
* control flow
* state transitions
* edge cases
* error handling
* API behavior
* assumptions

### Avoid

* style-only comments
* speculative bugs without evidence
* unrelated legacy problems

### Output

Structured correctness findings.

---

## 5.2 Security Agent

### Mission

Identify security problems introduced or affected by the change.

### Analyze

* authentication
* authorization
* input validation
* injection
* secret handling
* sensitive data exposure
* unsafe operations
* security-sensitive dependencies/configuration

### Avoid

* theoretical vulnerabilities unsupported by evidence
* generic security advice unrelated to the change

### Output

Structured security findings.

---

## 5.3 Testing Agent

### Mission

Determine whether the changed behavior is adequately tested.

### Analyze

* existing relevant tests
* new tests
* missing test cases
* error paths
* edge cases
* regression risks

### Output

Structured testing findings.

---

## 5.4 Maintainability Agent

### Mission

Identify maintainability problems caused or significantly affected by the change.

### Analyze

* unnecessary complexity
* duplication
* abstraction problems
* architectural inconsistency
* unclear interfaces
* significant documentation gaps

### Avoid

Turning every stylistic preference into a finding.

### Output

Structured maintainability findings.

---

# 6. Stage 4 — Finding Collection

All specialist outputs are collected into a common format.

## Canonical Finding Schema

```json
{
  "id": "finding-001",
  "title": "Missing authorization check",
  "category": "security",
  "severity": "high",
  "confidence": 0.92,
  "file": "src/orders/controller.ts",
  "line": 42,
  "evidence": "cancelOrder() retrieves the order using the request user ID but does not verify ownership.",
  "explanation": "A user may potentially cancel another user's order.",
  "impact": "Unauthorized modification of another user's order.",
  "recommendation": "Verify that the authenticated user owns the order before allowing cancellation.",
  "sourceAgent": "security"
}
```

---

# 7. Stage 5 — Finding Validation

## Purpose

Prevent unsupported AI findings from reaching the developer as authoritative conclusions.

The validator evaluates each finding against repository evidence.

### Validation questions

1. Does the referenced file exist?
2. Does the referenced code exist?
3. Does the evidence support the claim?
4. Is the issue actually introduced or affected by the change?
5. Is the severity reasonable?
6. Is the recommendation relevant?

### Outcomes

```text
CONFIRMED
   ↓
Keep finding

UNCERTAIN
   ↓
Keep with reduced confidence

UNSUPPORTED
   ↓
Suppress finding
```

The validator should not invent evidence to make a finding pass.

---

# 8. Stage 6 — Finding Deduplication

Different agents may identify the same underlying problem.

Example:

```text
Security Agent:
"Missing authorization check"

Correctness Agent:
"Order ownership is not verified"

```

These may represent one underlying issue.

The deduplication stage should:

1. identify overlapping findings
2. determine whether they describe the same root problem
3. merge them where appropriate
4. preserve useful information from each source

The final review should avoid presenting the same issue multiple times.

---

# 9. Stage 7 — Prioritization

Findings are prioritized using:

```text
Priority =
Severity
× Confidence
× Impact
× Relevance
```

This is a conceptual prioritization model rather than a requirement for literal mathematical scoring.

The system should prioritize:

1. Critical confirmed issues
2. High-severity confirmed issues
3. High-confidence medium issues
4. Lower-impact recommendations

The final report should not bury critical findings underneath minor suggestions.

---

# 10. Stage 8 — Review Synthesis

The synthesis agent converts validated findings into a coherent developer-facing review.

## Responsibilities

* summarize overall review status
* group findings by importance
* remove remaining redundancy
* explain major risks
* provide actionable recommendations
* identify areas that passed review where useful

## Example Output

```text
REVIEW STATUS: CHANGES REQUIRED

2 Critical
2 High
3 Medium
1 Low

BLOCKING ISSUES

1. SQL injection vulnerability
   src/api/users.ts:82

   Evidence:
   User-controlled input reaches the database query
   without parameterization.

   Recommendation:
   Use a parameterized query.

2. Missing authorization check
   src/orders/controller.ts:42

   ...

TESTING

The new cancellation flow has no test covering
unauthorized cancellation attempts.
```

---

# 11. Stage 9 — Developer Presentation

The UI should expose the result without overwhelming the user.

## Summary

```text
ReviewMesh

🔴 CHANGES REQUIRED

8 findings
2 Critical
2 High
3 Medium
1 Low
```

## Finding

```text
🔴 CRITICAL

SQL Injection

src/api/users.ts:82

Confidence: 94%

Evidence
...

Impact
...

Recommendation
...

[View Code]
```

The interface should allow developers to move from:

**Summary → Finding → Evidence → Recommendation**

with minimal navigation.

---

# 12. Failure Handling

Individual agent failures should not automatically terminate the review.

Example:

```text
Correctness     ✓
Security        ✓
Testing         ✗
Maintainability ✓
```

The system should continue where possible and communicate:

> Testing analysis was unavailable. The final review may be incomplete.

The system must never present an incomplete review as fully comprehensive.

---

# 13. Agent Independence

Each specialist agent should have:

* a clearly defined mission
* defined inputs
* defined outputs
* explicit analysis rules
* explicit exclusions

Agents should not duplicate the responsibilities of other agents unnecessarily.

---

# 14. Context Management

Do not provide every repository file to every agent.

The orchestrator should provide:

```text
Global project context
+
Relevant changed files
+
Relevant surrounding files
+
Relevant tests/docs
```

Context should be selected based on the change.

The goal is:

> **Maximum relevant context, minimum irrelevant context.**

---

# 15. Evidence Rules

Every significant finding should reference evidence.

Evidence may include:

* file
* line
* code fragment description
* test
* configuration
* documentation
* dependency information

Agents must not fabricate:

* file paths
* line numbers
* APIs
* functions
* project requirements
* vulnerabilities

If evidence cannot be established, confidence must be reduced or the finding suppressed.

---

# 16. Human Review Boundary

ReviewMesh does not make the final engineering decision.

The workflow ends at:

```text
AI Review
    ↓
Developer
    ↓
Accept / Reject / Investigate
```

The system must not:

* automatically merge
* automatically approve
* automatically deploy
* silently modify source code

Suggested fixes may be added as a future capability.

---

# 17. Hackathon Demonstration Workflow

The ideal demonstration uses one intentionally flawed code change containing several realistic problems.

Example:

```text
PR: Add order cancellation

Problems intentionally present:

1. Authorization vulnerability
2. Missing validation
3. Missing regression test
4. Logic edge case
5. Maintainability issue
```

The demo sequence:

```text
1. Show the code change
2. Start ReviewMesh
3. Show Bob orchestrating the review
4. Show specialist agents running
5. Show findings being collected
6. Show validation/deduplication
7. Show final prioritized review
8. Compare against manual review baseline
```

The audience should clearly see that the system is performing a workflow rather than simply generating a block of AI text.

---

# 18. Definition of Workflow Success

The workflow succeeds when it can:

```text
Understand the project
        ↓
Understand the change
        ↓
Perform multiple specialized analyses
        ↓
Run independent analyses efficiently
        ↓
Validate evidence
        ↓
Reduce duplicate/noisy findings
        ↓
Prioritize important issues
        ↓
Produce a useful developer review
```

The final output should be **more useful than the raw output of any single reviewer agent**.
