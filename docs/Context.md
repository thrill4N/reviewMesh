# ReviewMesh — Project Context

## 1. Project Identity

**Project Name:** ReviewMesh
**Working Title:** Bob ReviewMesh
**Tagline:** Multi-agent AI code review built for signal, not noise.

ReviewMesh is an AI-powered developer workflow that uses IBM Bob 2.0 to coordinate specialized code-review agents.

The system analyzes a proposed code change from multiple engineering perspectives, validates the resulting findings, removes redundant or unsupported feedback, and produces a prioritized review that a human developer can act on.

ReviewMesh is being developed as a prototype for the IBM TechXchange 2026 Pre-conference Dev Day Hackathon.

---

## 2. Problem

Code review is an important software-engineering quality gate, but reviewing a change thoroughly requires developers to consider several different concerns simultaneously:

* Is the implementation correct?
* Does it introduce security vulnerabilities?
* Are important scenarios covered by tests?
* Does it introduce unnecessary complexity or technical debt?
* Does the change conflict with existing project conventions or architecture?

Developers often perform these checks manually or use several disconnected tools.

AI can accelerate code review, but generic AI reviewers can produce:

* excessive feedback
* duplicate findings
* low-confidence warnings
* generic recommendations
* findings without evidence
* inconsistent severity classifications

The result is a new problem:

> AI can increase the amount of review feedback without necessarily increasing the amount of useful review feedback.

ReviewMesh focuses on solving this problem.

---

## 3. Product Vision

ReviewMesh should behave like a small team of specialized AI engineering reviewers working together.

Instead of asking one AI model:

> "Review this code."

ReviewMesh asks specialized reviewers to independently investigate different dimensions of the change and then combines their work.

The core principle is:

> **Specialization → Parallel Analysis → Validation → Synthesis → Actionable Review**

---

## 4. Target User

The primary user is a software developer who needs to review or validate a code change before it is merged.

Secondary users include:

* software engineering teams
* technical leads
* maintainers of open-source projects
* students learning professional code-review practices

The prototype should prioritize developer usability rather than enterprise administration.

---

## 5. Core User Journey

A developer provides a repository and a proposed code change.

ReviewMesh then:

1. Understands the repository context.
2. Understands what changed.
3. Sends the relevant context to specialized review agents.
4. Runs independent reviews in parallel where possible.
5. Collects findings.
6. Validates findings against repository evidence.
7. Removes duplicates and unsupported findings.
8. Prioritizes actionable findings.
9. Presents a concise final review.

The developer should be able to understand:

* what is wrong
* where it is wrong
* why it matters
* how confident the system is
* what should be done next

---

## 6. AI Architecture Philosophy

IBM Bob 2.0 is a core part of the solution.

ReviewMesh should use Bob as an orchestrator rather than treating Bob as a simple code-generation assistant.

The intended workflow is:

```text
Developer
    ↓
Bob Orchestrator
    ↓
Repository + Change Understanding
    ↓
┌────────────┬────────────┬──────────────┐
│ Correctness│  Security  │   Testing    │
│   Agent    │    Agent   │    Agent     │
└────────────┴────────────┴──────────────┘
                  │
                  ▼
        Finding Validation
                  │
                  ▼
        Finding Deduplication
                  │
                  ▼
          Review Synthesis
                  │
                  ▼
          Final Review Report
```

Bob capabilities should be used where they provide real value:

* Agent mode for orchestration
* Parallel tasks for independent review dimensions
* Subagents for specialized analysis
* Document understanding for repository documentation and supporting artifacts

The implementation should demonstrate these capabilities rather than merely mentioning them.

---

## 7. Review Perspectives

The MVP contains four specialist perspectives.

### Correctness Agent

Responsible for identifying:

* logic errors
* incorrect assumptions
* edge cases
* broken control flow
* incorrect API usage
* behavior inconsistent with the apparent requirements

### Security Agent

Responsible for identifying:

* injection vulnerabilities
* authentication weaknesses
* authorization problems
* unsafe input handling
* secret exposure
* insecure data handling
* obvious security-sensitive configuration problems

### Testing Agent

Responsible for identifying:

* missing tests
* insufficient edge-case coverage
* regression risks
* untested error paths
* tests that do not adequately verify the changed behavior

### Maintainability Agent

Responsible for identifying:

* unnecessary complexity
* duplication
* maintainability problems
* significant architectural inconsistencies
* unclear abstractions
* relevant documentation gaps

---

## 8. Signal-over-Noise Principle

ReviewMesh must prefer fewer high-quality findings over many speculative findings.

Every finding should be:

* relevant to the change
* supported by repository evidence
* actionable
* assigned a reasonable severity
* accompanied by a confidence level

The system should not report a vulnerability merely because a vulnerable pattern is theoretically possible.

The system must distinguish between:

* confirmed issue
* plausible concern
* low-confidence recommendation

---

## 9. Human-in-the-Loop Principle

ReviewMesh assists developers; it does not replace human engineering judgment.

The system must not:

* automatically merge code
* automatically approve a pull request
* claim absolute correctness
* silently modify production code

The developer remains responsible for deciding whether a finding should be acted upon.

---

## 10. Hackathon Objective

The prototype must demonstrate that a multi-agent Bob-powered workflow can improve code-review efficiency and/or quality compared with a conventional manual review workflow.

The project should provide measurable evidence involving metrics such as:

* review time
* manual effort
* useful findings
* false positives
* critical issues detected
* review completeness

The final demonstration should compare a baseline workflow with ReviewMesh.

---

## 11. Scope Philosophy

The project is a focused proof of concept.

Prioritize:

1. Working end-to-end workflow
2. Meaningful use of IBM Bob 2.0
3. High-quality findings
4. Clear user experience
5. Measurable impact

Do not prioritize:

* enterprise authentication
* billing
* multi-tenancy
* complex infrastructure
* autonomous code merging
* supporting every programming language
* building a general-purpose developer platform

---

## 12. Future Direction

If the MVP succeeds, ReviewMesh could evolve into a broader engineering-quality platform supporting:

* GitHub/GitLab pull requests
* CI/CD integration
* automatic regression-test generation
* organization-specific review policies
* custom reviewer agents
* dependency analysis
* architecture review
* documentation validation
* automated remediation suggestions

These are future capabilities, not MVP requirements.
