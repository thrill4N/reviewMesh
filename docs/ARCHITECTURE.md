# ReviewMesh Architecture

> Version: Hackathon MVP  
> Status: Implementation-ready specification  
> Source of truth: `docs/CONTEXT.md`, `docs/PRD.md`, `docs/WORKFLOW.md`

---

## 1. Architecture Overview

ReviewMesh is a **modular monolith** built around IBM Bob 2.0's orchestration capabilities.

A developer submits a repository path and a Git diff. Bob orchestrates a nine-stage review pipeline: context analysis, change analysis, four specialist reviews executed in parallel, finding validation, deduplication/synthesis, and final presentation.

```
┌──────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                        │
│                    (Bob Chat / CLI / Minimal UI)                  │
└───────────────────────────────┬──────────────────────────────────┘
                                │ repository path + diff
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Review Pipeline (Application)                │
│  Stage 1: Context Analysis  →  Stage 2: Change Analysis          │
└───────────────────────────────┬──────────────────────────────────┘
                                │ ProjectContext + ChangeContext
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Bob Orchestrator                           │
│            (Bob 2.0 Agent Mode — coordinates workflow)           │
└────┬─────────────┬──────────────┬──────────────┬────────────────┘
     │             │              │               │
     ▼             ▼              ▼               ▼
┌─────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────────┐
│Correct. │ │Security  │ │Testing     │ │Maintainability   │
│Agent    │ │Agent     │ │Agent       │ │Agent             │
└────┬────┘ └────┬─────┘ └─────┬──────┘ └────────┬─────────┘
     │           │             │                  │
     └───────────┴─────────────┴──────────────────┘
                                │ Finding[]
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Finding Validator                          │
│            (verifies each finding against repo evidence)         │
└───────────────────────────────┬──────────────────────────────────┘
                                │ ValidatedFinding[]
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Review Synthesizer                           │
│          (deduplication, prioritization, final report)           │
└───────────────────────────────┬──────────────────────────────────┘
                                │ ReviewResult
                                ▼
                       Developer Presentation
```

The architecture is deliberately simple. All components live in a single deployable process. There are no message queues, no service meshes, and no distributed infrastructure.

---

## 2. Architecture Principles

| Principle | Application |
|---|---|
| Signal over noise | Fewer validated findings beat many speculative ones |
| Evidence before assertion | Every significant finding must cite file/line/code evidence |
| Specialization | Each agent has one narrow responsibility; no agent duplicates another |
| Parallel where safe | Specialist agents are independent and run concurrently |
| Context discipline | Agents receive only the context relevant to their task |
| Graceful degradation | A failing agent does not abort the review |
| Human in the loop | ReviewMesh recommends; a developer decides |
| Simplest sufficient design | No abstraction introduced unless it removes a concrete problem |

---

## 3. System Components

| Component | Type | Responsibility |
|---|---|---|
| **Presentation Layer** | UI / CLI | Accepts developer input; displays final review |
| **Review Pipeline** | Application service | Executes stages 1–9 in order; coordinates handoffs |
| **Context Analyzer** | Pipeline stage | Builds `ProjectContext` from repository artifacts |
| **Change Analyzer** | Pipeline stage | Builds `ChangeContext` from diff + changed files |
| **Bob Orchestrator** | Bob Agent | Dispatches specialist subagents; collects findings |
| **Correctness Agent** | Bob Subagent | Logic, behavior, edge cases, error handling |
| **Security Agent** | Bob Subagent | Injection, auth, unsafe data handling, secrets |
| **Testing Agent** | Bob Subagent | Coverage gaps, regression risk, missing scenarios |
| **Maintainability Agent** | Bob Subagent | Complexity, duplication, architectural inconsistency |
| **Finding Validator** | Pipeline stage | Cross-checks each finding against repository evidence |
| **Review Synthesizer** | Pipeline stage | Deduplication, prioritization, final report production |
| **Repository Reader** | Infrastructure | File I/O, diff parsing, context-aware file selection |

---

## 4. Component Responsibilities

### 4.1 Review Pipeline

**Responsibility:** Execute the nine review stages in sequence; manage stage-to-stage data handoffs; handle partial failures without aborting.

**Inputs:** Repository path, Git diff (or patch file)  
**Outputs:** `ReviewResult`  
**Dependencies:** Context Analyzer, Change Analyzer, Bob Orchestrator, Finding Validator, Review Synthesizer  
**Boundary:** The pipeline owns control flow only. It does not perform any analysis itself.

---

### 4.2 Context Analyzer

**Responsibility:** Produce a compact `ProjectContext` from the repository before any specialist agent runs.

**Inputs:** Repository path  
**Outputs:** `ProjectContext`  
**Dependencies:** Repository Reader  
**Boundary:** Reads repository artifacts (README, config, directory tree, dependency manifests, key source files). Does not analyze the diff.

---

### 4.3 Change Analyzer

**Responsibility:** Produce a `ChangeContext` that summarizes what the diff actually does.

**Inputs:** Git diff, changed file contents, `ProjectContext`  
**Outputs:** `ChangeContext`  
**Dependencies:** Repository Reader  
**Boundary:** Parses the diff, identifies changed functions/APIs/data flows, selects relevant surrounding code. Does not make quality judgments.

---

### 4.4 Bob Orchestrator

**Responsibility:** Dispatch the four specialist subagents concurrently; collect their findings; return a flat `Finding[]` array.

**Inputs:** `ProjectContext`, `ChangeContext`, agent-specific context slices  
**Outputs:** `Finding[]`  
**Dependencies:** Correctness Agent, Security Agent, Testing Agent, Maintainability Agent  
**Boundary:** Coordinates only. Does not perform code review. Does not validate or deduplicate findings.

---

### 4.5 Correctness Agent

**Responsibility:** Identify logic errors, broken control flow, incorrect assumptions, edge cases, and incorrect API usage in the changed code.

**Inputs:** `AgentContext` (project context + change context + correctness-relevant files)  
**Outputs:** `Finding[]` with `category: "correctness"`  
**Dependencies:** None (receives all required context as input)  
**Boundary:** Must not report style issues. Must not duplicate security or testing findings. Must not access agents or pipeline state.

---

### 4.6 Security Agent

**Responsibility:** Identify injection vulnerabilities, authentication/authorization weaknesses, unsafe input handling, secret exposure, and insecure data handling.

**Inputs:** `AgentContext` (project context + change context + security-sensitive files)  
**Outputs:** `Finding[]` with `category: "security"`  
**Dependencies:** None  
**Boundary:** Must not report theoretical vulnerabilities without repository evidence. Must not duplicate correctness or testing findings.

---

### 4.7 Testing Agent

**Responsibility:** Determine whether changed behavior is adequately tested; identify missing test cases, regression risks, and untested error paths.

**Inputs:** `AgentContext` (project context + change context + existing test files)  
**Outputs:** `Finding[]` with `category: "testing"`  
**Dependencies:** None  
**Boundary:** Reports on test coverage only. Does not re-identify logic or security bugs the other agents cover.

---

### 4.8 Maintainability Agent

**Responsibility:** Identify unnecessary complexity, duplication, abstraction problems, significant architectural inconsistencies, and relevant documentation gaps.

**Inputs:** `AgentContext` (project context + change context + related source files)  
**Outputs:** `Finding[]` with `category: "maintainability"`  
**Dependencies:** None  
**Boundary:** Must not flag pure style preferences as findings. Focuses on structural problems, not cosmetic ones.

---

### 4.9 Finding Validator

**Responsibility:** Verify each finding against repository evidence. Confirm, downgrade, or suppress findings based on whether evidence supports the claim.

**Inputs:** `Finding[]`, Repository Reader (for evidence lookup)  
**Outputs:** `ValidatedFinding[]`  
**Dependencies:** Repository Reader  
**Boundary:** Evaluates existing findings only. Does not generate new findings. Does not invent evidence to pass a finding.

**Validation outcomes:**
```
CONFIRMED  → keep, confidence unchanged or improved
UNCERTAIN  → keep, confidence reduced
UNSUPPORTED → suppress
```

---

### 4.10 Review Synthesizer

**Responsibility:** Deduplicate validated findings, apply priority scoring, produce the final `ReviewResult`.

**Inputs:** `ValidatedFinding[]`  
**Outputs:** `ReviewResult`  
**Dependencies:** None  
**Boundary:** Operates on validated data only. Does not re-analyze repository or re-invoke agents. Deduplication and synthesis are combined here to minimize pipeline stages.

---

### 4.11 Repository Reader

**Responsibility:** Provide controlled, context-aware access to repository files. Parse Git diffs. Select files relevant to a given context slice.

**Inputs:** File path, diff string, selection criteria  
**Outputs:** File contents, diff hunks, relevant file sets  
**Dependencies:** Local filesystem  
**Boundary:** Read-only. No writes to repository. Enforces prompt-injection defense (treats file content as data, not instructions).

---

## 5. Data Flow

```
Repository path + Git diff
        │
        ▼
 Context Analyzer ──────────────────────► ProjectContext
        │                                       │
        ▼                                       │
 Change Analyzer ◄──────────────────────────────┘
        │
        ▼
  ChangeContext
        │
        ├──────────────────────────────────────────────────────┐
        │  Bob Orchestrator dispatches (parallel)              │
        ▼             ▼              ▼               ▼         │
   Correctness   Security       Testing       Maintainability  │
   Agent         Agent          Agent         Agent            │
        │             │              │               │         │
        └─────────────┴──────────────┴───────────────┘         │
                             │                                  │
                             ▼                                  │
                        Finding[]                               │
                             │                                  │
                             ▼                                  │
                   Finding Validator ◄──── Repository Reader ◄──┘
                             │
                             ▼
                    ValidatedFinding[]
                             │
                             ▼
                   Review Synthesizer
                  (dedup + prioritize)
                             │
                             ▼
                       ReviewResult
                             │
                             ▼
                  Developer Presentation
```

---

## 6. Agent Architecture

### 6.1 Bob Orchestrator Strategy

Bob runs in **Agent mode** and uses **`spawn_subagent`** (Bob's parallel subagent capability) to dispatch the four specialist agents concurrently.

```
Bob Orchestrator (Agent mode)
  │
  ├─ spawn_subagent("correctness") ──┐
  ├─ spawn_subagent("security")      ├─ run in parallel
  ├─ spawn_subagent("testing")       │
  └─ spawn_subagent("maintainability")┘
        │
        │ await all results
        ▼
  Aggregate Finding[]
```

Each subagent:
- Receives a self-contained `AgentContext` (no shared mutable state)
- Runs its analysis independently
- Returns a structured `Finding[]`
- Fails without affecting other subagents

### 6.2 Context Slicing per Agent

The orchestrator builds an agent-specific context slice before dispatch. No agent receives the full repository.

| Agent | Context slice |
|---|---|
| Correctness | Project context + changed files + directly called dependencies |
| Security | Project context + changed files + auth/validation/config files |
| Testing | Project context + changed files + test files + test configuration |
| Maintainability | Project context + changed files + related modules/interfaces |

### 6.3 Agent Prompt Structure

Each agent prompt follows a fixed structure to reduce hallucination and enforce evidence requirements:

```
[SYSTEM ROLE]   You are a specialist <domain> reviewer.
[PROJECT]       <ProjectContext summary>
[CHANGE]        <ChangeContext summary>
[FILES]         <Relevant file contents>
[TASK]          Identify <domain> issues. For each finding, populate every
                field in the Finding schema. Do not fabricate file paths,
                line numbers, or APIs. If evidence is insufficient, reduce
                confidence rather than speculating.
[OUTPUT FORMAT] Return a JSON array of Finding objects only.
```

---

## 7. Core Data Contracts

### 7.1 ProjectContext

```typescript
interface ProjectContext {
  projectPurpose: string;
  architecture: string;               // brief description
  language: string;
  framework: string | null;
  relevantFiles: string[];            // paths only, for context slicing
  testStrategy: string;
  securitySensitiveAreas: string[];
  conventions: string;                // brief style/architecture conventions
}
```

### 7.2 ChangeContext

```typescript
interface ChangeContext {
  summary: string;                    // human-readable change description
  changedFiles: ChangedFile[];
  affectedAreas: string[];            // logical areas impacted (e.g. "auth", "DB")
  potentialRiskAreas: string[];
  newBehavior: string;
}

interface ChangedFile {
  path: string;
  diff: string;                       // the diff hunk(s) for this file
  fullContent: string;                // full current file content
}
```

### 7.3 AgentContext

```typescript
interface AgentContext {
  projectContext: ProjectContext;
  changeContext: ChangeContext;
  agentRole: "correctness" | "security" | "testing" | "maintainability";
  additionalFiles: FileContent[];     // agent-specific surrounding files
}

interface FileContent {
  path: string;
  content: string;
}
```

### 7.4 Finding (Canonical Model)

This is the single shared contract between all specialist agents and downstream stages.

```typescript
interface Finding {
  id: string;                         // UUID v4, assigned by orchestrator on collection
  title: string;                      // concise one-line description
  category: "correctness" | "security" | "testing" | "maintainability";
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;                 // 0.0–1.0
  file: string;                       // repository-relative path
  line: number | null;                // specific line, if known
  location: string | null;            // e.g. "OrderController.cancelOrder()"
  evidence: string;                   // what in the code supports this finding
  explanation: string;                // why this is a problem
  impact: string;                     // what could go wrong
  recommendation: string;             // concrete next step
  sourceAgent: "correctness" | "security" | "testing" | "maintainability";
}
```

**Rules:**
- Agents emit raw `Finding` objects (without `id`; the orchestrator assigns IDs on collection)
- Agents must not set `id`; the pipeline assigns it to prevent collisions
- `evidence` must reference actual code from the supplied context; fabrication is prohibited
- If `line` cannot be determined with confidence, it must be `null` (not guessed)

### 7.5 ValidatedFinding

```typescript
interface ValidatedFinding extends Finding {
  validationStatus: "confirmed" | "uncertain" | "unsupported";
  validationNote: string | null;      // reason for downgrade/suppression
}
```

Findings with `validationStatus: "unsupported"` are excluded from synthesis.

### 7.6 ReviewResult

```typescript
interface ReviewResult {
  status: "approved" | "changes_required" | "needs_review";
  summary: string;
  findings: ValidatedFinding[];       // deduplicated, priority-sorted
  agentStatuses: AgentStatus[];
  partialReview: boolean;             // true if any agent failed
  partialReviewNote: string | null;   // explains which agent failed
  generatedAt: string;                // ISO 8601 timestamp
}

interface AgentStatus {
  agent: string;
  status: "success" | "failed";
  findingCount: number;
  error: string | null;
}
```

---

## 8. Context Management

### 8.1 Strategy

LLM context is finite. No agent receives the entire repository.

The pipeline applies a three-tier context loading strategy:

```
Tier 1 — Global (all agents)
  ProjectContext: purpose, language, framework, conventions,
  security-sensitive areas, test strategy
  Size target: < 1,000 tokens

Tier 2 — Change (all agents)
  ChangeContext: diff, changed files, affected areas, risk areas
  Size target: < 3,000 tokens (scales with diff size)

Tier 3 — Agent-specific (per agent)
  Selected surrounding files relevant to the agent's domain
  Size target: < 4,000 tokens per agent
```

### 8.2 File Selection Rules

The Repository Reader applies domain-specific selection for Tier 3:

| Agent | Selection criteria |
|---|---|
| Correctness | Files directly called by changed functions; type definitions |
| Security | Auth/middleware files; input validation utilities; config |
| Testing | Existing test files for changed modules; test helpers |
| Maintainability | Sibling modules; interface/type files; shared utilities |

### 8.3 Overflow Handling

If a diff or file exceeds token budget:
1. Truncate to the most relevant diff hunks (centered on changed lines)
2. Summarize truncated sections in a `[TRUNCATED: n lines]` placeholder
3. Agents must not fabricate content for truncated areas

---

## 9. Parallel Execution

### 9.1 Parallelizable Stages

```
Stage 1 (Context)  ──► Stage 2 (Change)  ──► Stage 3 (Specialist Review)
                                                      │
                               ┌──────────────────────┼──────────────────────┐
                               ▼              ▼        ▼              ▼
                          Correctness    Security   Testing    Maintainability
                               │              │        │              │
                               └──────────────┴────────┴──────────────┘
                                                      │
                                             Stage 4 (Collection)
                                                      │
                                          Stage 5 (Validation) ──sequential──►
                                                      │
                                          Stage 6–7 (Synthesis)
```

**Parallel:** Stages 1 and 2 are sequential (Stage 2 requires Stage 1 output). All four specialist agents within Stage 3 are parallel. Validation and synthesis are sequential (each requires the previous stage's output).

**Why not more parallelism:** Validation requires all findings collected; synthesis requires all validated findings. These cannot be streamed without adding complexity that is not justified for the MVP.

### 9.2 Failure Isolation

Each specialist agent runs in an isolated subagent context. A failure in one agent does not propagate to others.

```
Correctness  ✓  findings collected
Security     ✓  findings collected
Testing      ✗  agent failed → AgentStatus { status: "failed" }
Maintainability ✓  findings collected

→ Continue with available findings
→ Set ReviewResult.partialReview = true
→ Set ReviewResult.partialReviewNote = "Testing analysis unavailable."
```

The final review explicitly communicates which perspectives were unavailable. The review is never silently presented as complete when a perspective failed.

---

## 10. Error Handling

### 10.1 Failure Catalog

| Failure | Behavior |
|---|---|
| Repository path does not exist | Abort pipeline; surface error to user |
| Diff is empty or unparseable | Abort pipeline; surface error to user |
| Specialist agent fails or times out | Collect partial results; continue; mark partial |
| Agent returns malformed JSON | Discard malformed findings; log; continue |
| Agent hallucinates a file path | Validator suppresses finding; logged |
| Finding Validator fails | Skip validation stage; include raw findings with `confidence` reduced to 0.5; mark partial |
| Review Synthesizer fails | Surface error; return collected `ValidatedFinding[]` without synthesis |

### 10.2 Malformed Finding Handling

If an agent returns JSON that does not conform to the `Finding` schema:
- The pipeline logs the malformed output
- The malformed finding is discarded
- The review continues with valid findings
- The agent's `AgentStatus` records the partial failure

### 10.3 Minimum Viable Review

A review is considered deliverable if at least one specialist agent succeeded and the synthesizer produced output. Findings must not be withheld in a "nothing to show" state when useful results exist.

---

## 11. Security Boundaries

### 11.1 Repository Content as Data

Repository content (source files, README, config, docs) is **always treated as data to analyze**, never as instructions that can modify the system prompt or override agent behavior.

Implementation requirement: Repository file content must be passed inside a clearly delimited data block in the agent prompt. It must never be interpolated directly into the instruction section of a prompt.

```
✓  [INSTRUCTION] Analyze the following file for security issues.
   [FILE: src/api/users.ts]
   <content>
   ... file content here ...
   </content>

✗  Analyze this: {fileContent}   ← direct interpolation into instructions
```

### 11.2 Prompt Injection Defense

- All file content is enclosed in explicit delimiters before passing to agents
- Agent system prompts explicitly instruct the model to treat file content as data
- The orchestrator does not execute any instructions found within repository files
- This applies to all files: source code, README, documentation, configuration

### 11.3 Secret Handling

- API keys and model credentials are stored in environment variables only
- No secrets appear in logs, findings, or the final review report
- If a secret is detected in repository content (e.g. a hardcoded credential), it is reported as a finding but the secret value itself is redacted in the finding text

### 11.4 AI-Generated Findings

Findings are AI-generated and may contain errors. The architecture enforces:
- Confidence scoring to indicate certainty
- Validation stage to remove unsupported findings
- Human-in-the-loop: the developer makes the final decision
- The UI must not present findings as authoritative facts

### 11.5 Logs

- Logs must not contain raw repository file contents
- Logs must not contain API keys or secrets
- Debug logging of agent prompts/responses is acceptable in development but must be disabled in any shared or demo environment

---

## 12. Repository Structure

```
reviewMesh/
│
├── docs/                             # Project documentation (read-only at runtime)
│   ├── ARCHITECTURE.md
│   ├── CONTEXT.md
│   ├── PRD.md
│   └── WORKFLOW.md
│
├── src/
│   │
│   ├── pipeline/                     # Review pipeline: stage orchestration
│   │   ├── ReviewPipeline.ts         # Stage 1–9 execution; failure handling
│   │   ├── ContextAnalyzer.ts        # Stage 1: ProjectContext builder
│   │   └── ChangeAnalyzer.ts         # Stage 2: ChangeContext builder
│   │
│   ├── agents/                       # Bob agent definitions
│   │   ├── Orchestrator.ts           # Dispatches specialist subagents
│   │   ├── CorrectnessAgent.ts       # Stage 3a: correctness review
│   │   ├── SecurityAgent.ts          # Stage 3b: security review
│   │   ├── TestingAgent.ts           # Stage 3c: testing review
│   │   └── MaintainabilityAgent.ts   # Stage 3d: maintainability review
│   │
│   ├── validation/                   # Finding validation
│   │   └── FindingValidator.ts       # Stage 5: confirms/downgrades/suppresses
│   │
│   ├── synthesis/                    # Review production
│   │   └── ReviewSynthesizer.ts      # Stage 6–8: dedup, prioritize, synthesize
│   │
│   ├── domain/                       # Shared data contracts (interfaces/types)
│   │   ├── Finding.ts                # Canonical Finding model
│   │   ├── ProjectContext.ts
│   │   ├── ChangeContext.ts
│   │   ├── AgentContext.ts
│   │   └── ReviewResult.ts
│   │
│   ├── infrastructure/               # I/O and external concerns
│   │   ├── RepositoryReader.ts       # File I/O, diff parsing, file selection
│   │   └── config.ts                 # Centralized configuration (env vars, limits)
│   │
│   └── ui/                           # Presentation layer
│       └── ReviewPresenter.ts        # Formats ReviewResult for display
│
├── tests/                            # Automated tests
│   ├── pipeline/
│   ├── agents/
│   ├── validation/
│   ├── synthesis/
│   └── fixtures/                     # Sample repos and diffs for testing/demo
│       ├── sample-repo/              # Intentionally flawed repo for demo
│       └── sample-diff.patch         # Demo diff with known issues
│
├── .env.example                      # Required environment variables (no secrets)
└── package.json
```

**Directory rules:**
- `domain/` contains only interfaces and types — no logic
- `pipeline/` orchestrates stages but performs no analysis itself
- `agents/` contains all Bob-specific integration code
- `infrastructure/` is the only layer that touches the filesystem or external APIs
- `ui/` is the only layer that formats output for the developer

---

## 13. Architecture Decisions

### 13.1 Modular Monolith vs Microservices

**Decision: Modular monolith.**

Microservices would require service discovery, inter-service networking, distributed tracing, and deployment orchestration — none of which provides value for a hackathon prototype. A well-structured monolith with clear module boundaries achieves the same separation of concerns with a fraction of the complexity. If ReviewMesh succeeds post-hackathon, the module boundaries already defined here make extraction into services straightforward.

### 13.2 Multiple Specialist Agents vs Single Reviewer

**Decision: Multiple specialist agents.**

A single generic reviewer must balance competing concerns, which tends to produce shallow or inconsistent analysis. Specialization allows each agent to be given a tighter prompt, a more relevant context slice, and a focused set of analysis rules. This produces deeper findings per domain and makes it easier to control what each agent should and should not report. It is also the primary demonstration of Bob 2.0's multi-agent capability.

### 13.3 Parallel vs Sequential Specialist Execution

**Decision: Parallel specialist execution within Stage 3.**

The four specialist agents are independent: none requires another agent's output. Running them concurrently reduces total review time proportional to the number of agents. Sequential execution would provide no benefit and would make the multi-agent parallelism invisible in the demo. Stages before and after the specialist tier remain sequential because their data dependencies are real.

### 13.4 Dedicated Deduplication Component vs Synthesis Responsibility

**Decision: Deduplication is a responsibility of the Review Synthesizer.**

A separate deduplication agent or stage would add a pipeline step and a component boundary without meaningful benefit at MVP scale. The synthesizer already inspects all validated findings to produce the final report; merging near-duplicate findings is a natural part of that process. If deduplication logic grows complex, it can be extracted into a helper module within the synthesis layer without changing the pipeline interface.

### 13.5 Local Repository vs GitHub Integration

**Decision: Local repository for MVP.**

GitHub integration requires OAuth, webhook infrastructure, API rate-limit handling, and PR comment formatting. None of these contribute to demonstrating the core multi-agent review pipeline. A local repository (or a prepared sample repository) eliminates all of this risk while preserving the full end-to-end demo workflow. GitHub integration is listed as the highest-priority stretch feature and can be added without architectural changes.

---

## 14. MVP vs Stretch

### 14.1 MVP (Required for Demonstration)

| Capability | Component |
|---|---|
| Accept local repository path + diff | Review Pipeline, Repository Reader |
| Build project context | Context Analyzer |
| Build change context | Change Analyzer |
| Run four specialist agents concurrently | Bob Orchestrator + 4 Agents |
| Produce structured findings (Finding schema) | All agents |
| Validate findings against repo evidence | Finding Validator |
| Deduplicate and prioritize findings | Review Synthesizer |
| Produce consolidated `ReviewResult` | Review Synthesizer |
| Display findings clearly to developer | Review Presenter |
| Handle partial agent failures gracefully | Review Pipeline |
| Sample flawed repository + diff for demo | `tests/fixtures/` |

### 14.2 Stretch (Only if MVP is Stable)

These features must not influence the core architecture.

| Priority | Capability | Notes |
|---|---|---|
| P1 | GitHub Pull Request integration | Adds Repository Reader GitHub adapter; no pipeline changes |
| P2 | Suggested code fixes | New field on Finding; new synthesis capability |
| P3 | Automatic regression-test generation | New post-synthesis stage; isolated |
| P4 | Inline PR review comments | GitHub adapter output format |
| P5 | Custom review policies | Configuration-driven agent prompt injection |

---

## 15. Implementation Guidance

### 15.1 Implementation Order

Implement in this sequence to maintain a working demo at every stage:

```
1. domain/          → define all interfaces first; everything depends on them
2. infrastructure/  → RepositoryReader; config
3. pipeline/        → ContextAnalyzer and ChangeAnalyzer (Stages 1–2)
4. agents/          → Orchestrator + one agent (Security recommended for demo impact)
5. agents/          → remaining three agents
6. validation/      → FindingValidator
7. synthesis/       → ReviewSynthesizer
8. ui/              → ReviewPresenter
9. tests/fixtures/  → sample repo and diff
```

Do not begin Stage 4 until Stages 1–3 are working end-to-end.

### 15.2 Bob Integration Points

| Stage | Bob Capability |
|---|---|
| Orchestration | Bob Agent mode — runs the pipeline as a Bob workflow |
| Specialist review | `spawn_subagent` — one per specialist agent |
| Context analysis | Bob document understanding — README, config, architecture docs |
| Repository inspection | Bob file read tools — relevant source and test files |

### 15.3 Configuration

All environment-specific values are centralized in `src/infrastructure/config.ts`, loaded from environment variables.

```typescript
// Non-exhaustive example
interface Config {
  modelId: string;              // Bob model identifier
  maxContextTokens: number;     // Per-agent context budget
  agentTimeoutMs: number;       // Per-agent execution timeout
  repoBasePath: string;         // Root of the repository being reviewed
  logLevel: "debug" | "info" | "warn" | "error";
}
```

No configuration is hardcoded in agent or pipeline files.

### 15.4 Testing Strategy

Each module should be independently testable with the Repository Reader mocked.

Priority test coverage:

| Module | What to test |
|---|---|
| Finding schema | Validation of required fields; rejection of malformed findings |
| Finding Validator | Confirm / uncertain / unsupported classification logic |
| Review Synthesizer | Deduplication of near-duplicate findings; priority ordering |
| Review Pipeline | Partial failure handling; correct stage sequencing |

Agent prompts are tested through the demo fixtures: the sample diff with known issues provides a repeatable integration test.

### 15.5 Demo Fixture Requirements

The `tests/fixtures/` directory should contain:

- A small, realistic sample repository (50–200 files, one domain, e.g. order management API)
- A single diff introducing several intentional problems across all four review categories:
  - One security issue (e.g. missing authorization check)
  - One correctness issue (e.g. incorrect state transition)
  - One testing gap (e.g. no test for the error path)
  - One maintainability issue (e.g. duplicated logic without abstraction)
- Expected `ReviewResult` for regression testing

This fixture serves double duty: integration test and hackathon demonstration.

---

## Unresolved Assumptions

The following assumptions are reasonable for the MVP but should be confirmed before implementation begins:

1. **Bob subagent parallelism** — The implementation assumes `spawn_subagent` can be called concurrently for multiple subagents within a single Bob Agent session. This should be verified against Bob 2.0 documentation before the orchestrator is built.

2. **Token budget** — The per-agent context budget (Tier 1 + 2 + 3 = ~8,000 tokens) is an estimate. Actual limits depend on the configured model. The context slicing strategy should be validated against the target model's context window.

3. **Diff format** — The pipeline assumes a standard unified diff (`git diff`) format. If the demo or integration needs to support other formats (e.g. GitHub patch format), the Repository Reader parser may need adjustment.

4. **Language support** — The MVP architecture is language-agnostic in design but the sample fixtures and agent prompts will likely be optimized for one language (TypeScript/JavaScript recommended, as it aligns with the Bob platform). This should be made explicit in the demo setup.

5. **Local file access** — The Repository Reader assumes Bob agents have read access to the local filesystem at the repository path. If Bob's subagent sandboxing restricts file access, the orchestrator may need to pre-load file contents and pass them in the agent context rather than allowing agents to read files themselves.
