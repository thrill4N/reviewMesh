# ReviewMesh — Technology Stack

> Version: Hackathon MVP  
> Status: Approved for implementation  
> Source of truth: `docs/ARCHITECTURE.md`, `docs/CONTEXT.md`, `docs/PRD.md`, `docs/WORKFLOW.md`

---

## 1. Purpose of This Document

This document defines the concrete technology choices for the ReviewMesh MVP. Every decision traces directly to a requirement in the architecture or product documents. Technologies are not selected because they are popular; each is selected because it satisfies a specific need within the hackathon time constraint.

Technologies not mentioned here are not part of the MVP.

---

## 2. Language: TypeScript

**Decision: TypeScript throughout — frontend, backend, and shared domain.**

TypeScript is the sole application language for the following reasons:

| Concern | Why TypeScript |
|---|---|
| Shared data contracts | The `Finding`, `ValidatedFinding`, `ReviewResult`, and context interfaces defined in `ARCHITECTURE.md §7` are consumed by both frontend and backend. A single language eliminates translation layers and schema drift. |
| Agent-generated code | IBM Bob 2.0 generates TypeScript fluently. Type errors are caught at compile time, reducing the surface area for agent-introduced bugs during rapid hackathon implementation. |
| Strict mode | `strict: true` enforces non-null checks and type safety, which is critical when validating AI-generated `Finding` objects that may have missing or incorrectly typed fields. |
| IDE support | Full autocomplete and inline type checking accelerates development across multiple concurrent coding agents, each working in isolated modules. |
| Frontend/backend consistency | The domain types in `src/domain/` are imported directly by both `src/ui/` and `src/pipeline/`. No serialization contract divergence is possible. |

**TypeScript configuration:**
- `strict: true`
- `target: ES2022`
- `module: NodeNext` (backend), `ESNext` (frontend via Vite)
- `moduleResolution: NodeNext` (backend)

---

## 3. Backend

### Runtime: Node.js

**Decision: Node.js (LTS, v20+).**

The backend is a local process that reads the filesystem, parses Git diffs, and orchestrates the Bob-powered review pipeline. Node.js is the correct choice because:

- The repository reader (`src/infrastructure/RepositoryReader.ts`) performs local filesystem I/O — Node.js provides this natively without additional adaptation.
- Bob 2.0 integration code is written in TypeScript/JavaScript; Node.js is the natural host runtime.
- No blocking CPU-intensive computation occurs in the application layer (all heavy analysis is delegated to Bob subagents).
- The entire backend is a single deployable process (modular monolith per `ARCHITECTURE.md §13.1`). No runtime complexity beyond Node.js is warranted.

### Framework: Express

**Decision: Express (v4, stable).**

The backend exposes a minimal HTTP API consumed by the frontend. Express is selected because:

- It adds negligible setup overhead. A single `ReviewController` with one `POST /review` endpoint is all the MVP requires.
- It does not impose opinions about project structure that conflict with the domain-driven layout defined in `ARCHITECTURE.md §12`.
- No advanced features (GraphQL, WebSockets, streaming responses, middleware ecosystems) are needed for the MVP.
- Familiarity is near-universal; agents and developers can contribute without framework-specific knowledge.

**Rejected alternatives:**
- Fastify: marginally faster but adds complexity without benefit at this scale.
- NestJS: too opinionated; its module system conflicts with the module boundaries already defined in `ARCHITECTURE.md`.
- Hono/Elysia: unfamiliar to most coding agents; no benefit over Express for a single-endpoint MVP.

### Backend module structure

Follows `ARCHITECTURE.md §12` exactly:

```
src/
├── pipeline/          # Stage orchestration (ReviewPipeline, ContextAnalyzer, ChangeAnalyzer)
├── agents/            # Bob integration (Orchestrator + 4 specialist agents)
├── validation/        # FindingValidator
├── synthesis/         # ReviewSynthesizer
├── domain/            # Interfaces and types only — no logic
├── infrastructure/    # RepositoryReader, config
└── ui/                # ReviewPresenter (formats ReviewResult for display/API response)
```

An `api/` layer (request routing and controller) sits at the top level of `src/`:

```
src/
└── api/
    ├── server.ts      # Express app setup
    └── ReviewController.ts  # POST /review handler
```

---

## 4. Frontend

### Framework: React + TypeScript + Vite

**Decision: React 18, TypeScript, Vite.**

The frontend is a minimal developer-facing interface that displays:
- Repository/diff submission form
- Review execution progress (showing that parallel agents are running)
- Final `ReviewResult`: status, finding counts, severity, confidence, file/line, evidence, recommendation

**React** is selected because:
- The result display requires conditional rendering across finding lists, severity badges, agent status panels, and collapsible evidence sections — React's component model is the simplest way to organize this.
- Bob 2.0 generates React/TypeScript components accurately and consistently.
- No state management library is needed; React's built-in `useState`/`useEffect` is sufficient for a single review session with no persistence.

**Vite** is selected because:
- Near-instant development server startup and hot module replacement.
- Zero configuration required for a TypeScript + React project.
- `vite build` produces a static bundle deployable anywhere without a Node.js runtime.

**No UI component library** is introduced. The MVP uses plain HTML elements with minimal CSS. Visual complexity is not a success criterion.

**Rejected alternatives:**
- Next.js: SSR and file-based routing add significant setup overhead. Not needed for a single-page demo app.
- Create React App: deprecated; slower than Vite.
- Vue/Svelte: React is the shared language between Bob and the implementation team.

### Frontend scope

The frontend is intentionally minimal. It must demonstrate three things:

1. **Input** — A form accepting a local repository path and a Git diff (text area or file upload).
2. **Execution visibility** — A progress panel showing the four specialist agents running (agent name, status: pending / running / complete / failed).
3. **Results** — A structured finding list showing severity, confidence, file, location, evidence, explanation, and recommendation.

No routing library. No state management library. No CSS framework. Plain React + TypeScript.

---

## 5. AI / Agent Layer: IBM Bob 2.0

IBM Bob 2.0 is the AI orchestration environment. The boundary between Bob responsibilities and application responsibilities is critical and must not be blurred.

### Bob responsibilities

| Capability | Usage in ReviewMesh |
|---|---|
| Agent mode | Runs the Bob Orchestrator (`src/agents/Orchestrator.ts`) as a Bob Agent workflow |
| `spawn_subagent` | Dispatches the four specialist agents concurrently (per `ARCHITECTURE.md §6.1`) |
| Parallel tasks | Correctness, Security, Testing, and Maintainability agents run in parallel |
| Document/repository understanding | Context Analyzer leverages Bob's file-read tools to interpret README, config, architecture docs |
| AI-assisted implementation | Bob generates application code during the hackathon |

### Application responsibilities

These are handled in deterministic TypeScript code — never inside agent prompts:

| Responsibility | Location |
|---|---|
| Pipeline stage sequencing | `src/pipeline/ReviewPipeline.ts` |
| Diff parsing | `src/infrastructure/RepositoryReader.ts` |
| File I/O and context slicing | `src/infrastructure/RepositoryReader.ts` |
| Finding schema validation | `src/validation/FindingValidator.ts` (Zod) |
| Finding deduplication and prioritization | `src/synthesis/ReviewSynthesizer.ts` |
| Agent failure isolation | `src/pipeline/ReviewPipeline.ts` |
| Configuration loading | `src/infrastructure/config.ts` |
| HTTP API | `src/api/` |
| UI state | React component state |

Deterministic logic must not be placed in agent prompts. An agent that performs deduplication in its response is harder to test, harder to debug, and produces non-deterministic results across runs.

---

## 6. Review Data Model

The data model follows `ARCHITECTURE.md §7` exactly. TypeScript interfaces are the sole representation — no ORM, no database schema, no serialization library beyond `JSON.parse`/`JSON.stringify`.

```
src/domain/
├── Finding.ts          # Finding, ValidatedFinding
├── ProjectContext.ts   # ProjectContext
├── ChangeContext.ts    # ChangeContext, ChangedFile
├── AgentContext.ts     # AgentContext, FileContent
└── ReviewResult.ts     # ReviewResult, AgentStatus
```

These interfaces are the single shared contract between all pipeline stages, agents, and the frontend.

**The MVP uses ephemeral/in-memory review state.**

No database is introduced. Each review request is processed in memory from input to `ReviewResult`. The result is returned to the caller and not persisted. This satisfies all MVP requirements and eliminates a class of infrastructure that provides no demo value.

If persistence is needed post-hackathon, the `ReviewResult` interface serializes directly to JSON and is compatible with any document store without schema migration.

---

## 7. Repository and Git Integration

**Decision: Local filesystem + Node.js `child_process` for Git operations.**

Per `ARCHITECTURE.md §13.5`, GitHub/GitLab API integration is a stretch feature. The MVP works against a local repository.

### Minimum required capabilities

| Capability | Technology |
|---|---|
| Read file contents | Node.js `fs/promises` |
| List directory structure | Node.js `fs/promises` (`readdir` with recursion) |
| Execute `git diff` | Node.js `child_process.execFile('git', [...])` |
| Parse unified diff format | Custom parser in `RepositoryReader.ts` (standard unified diff — no library needed) |
| Identify changed files | Derived from parsed diff hunks |

No Git library (e.g. `isomorphic-git`, `nodegit`, `simple-git`) is introduced unless the custom diff parser proves insufficient during implementation. The standard unified diff format is well-defined; parsing it requires ~50 lines of TypeScript.

### Context slicing

The `RepositoryReader` selects agent-specific files using the domain-specific rules defined in `ARCHITECTURE.md §8.2`. This is deterministic file selection logic — it does not require a library.

---

## 8. Finding Validation

**Decision: Zod for structured AI output validation.**

AI agent responses must be validated before they enter the pipeline. An agent may return malformed JSON, missing required fields, out-of-range values, or structurally invalid findings.

[Zod](https://zod.dev) is the selected validation library because:

- It validates TypeScript types at runtime, bridging the gap between the compile-time `Finding` interface and the actual runtime data returned by agents.
- It produces precise, human-readable error messages that can be logged against the offending agent response.
- It is lightweight (no peer dependencies) and well-supported.
- It is the simplest tool that solves the problem; no schema compilation step, no separate schema files.

```typescript
// Example: validates that agent output conforms to Finding[]
const FindingSchema = z.object({
  title: z.string().min(1),
  category: z.enum(["correctness", "security", "testing", "maintainability"]),
  severity: z.enum(["critical", "high", "medium", "low"]),
  confidence: z.number().min(0).max(1),
  file: z.string(),
  line: z.number().nullable(),
  location: z.string().nullable(),
  evidence: z.string().min(1),
  explanation: z.string().min(1),
  impact: z.string().min(1),
  recommendation: z.string().min(1),
  sourceAgent: z.enum(["correctness", "security", "testing", "maintainability"]),
});
```

Any finding that fails schema validation is discarded and logged. The agent's `AgentStatus` records the partial failure. The review continues with valid findings only (per `ARCHITECTURE.md §10.2`).

**Rejected alternatives:**
- `ajv` (JSON Schema): requires separate schema definition files; more verbose; no TypeScript type inference.
- Manual field checks: error-prone; does not scale as the `Finding` schema evolves.
- `joi`: less TypeScript-idiomatic than Zod; larger API surface.

---

## 9. Testing Stack

### Test runner: Vitest

**Decision: Vitest.**

Vitest is selected over Jest because:
- It uses the same configuration file as Vite, eliminating a separate Jest config.
- It is faster in watch mode during active development.
- Its API is identical to Jest; no learning curve.
- It has native TypeScript support without `ts-jest` or `babel-jest`.

### Unit tests

Priority: highest. These tests validate deterministic business logic.

| Module | What to test |
|---|---|
| `FindingValidator` | `confirmed` / `uncertain` / `unsupported` classification logic |
| `ReviewSynthesizer` | Near-duplicate detection; priority score ordering; `partialReview` flag |
| `ReviewPipeline` | Partial failure handling; stage sequencing; single-agent failure does not abort |
| Finding schema (Zod) | Valid finding passes; missing `evidence` fails; out-of-range `confidence` fails |
| `RepositoryReader` | Diff parser: standard unified diff produces correct `ChangedFile[]` |
| `config.ts` | Missing required env var throws; correct defaults are applied |

### Integration tests

Secondary priority. These tests verify that pipeline stages connect correctly.

| Scenario | What to verify |
|---|---|
| End-to-end pipeline with fixture | Given `tests/fixtures/sample-diff.patch` and `tests/fixtures/sample-repo/`, the pipeline produces a `ReviewResult` with the expected finding categories |
| Agent interface contract | Orchestrator correctly assembles `AgentContext` per agent; each agent context slice contains only the expected files |
| API boundary | `POST /review` with valid body returns `200` and a conforming `ReviewResult`; with invalid body returns `400` |

### End-to-end tests

Not introduced for the MVP. The demo fixtures serve as the practical end-to-end test. A formal E2E framework (Playwright, Cypress) would add setup overhead without proportionate value in a hackathon context.

### Test fixture requirements

Follows `ARCHITECTURE.md §15.5`:
- `tests/fixtures/sample-repo/` — small intentionally flawed repository (~50–100 files)
- `tests/fixtures/sample-diff.patch` — diff introducing one known issue per agent category
- `tests/fixtures/expected-result.json` — expected `ReviewResult` for regression testing

---

## 10. Code Quality

### ESLint

**Decision: ESLint with `@typescript-eslint/recommended`.**

Enforces consistent code style across all agents' generated code and developer-written code. The ruleset is not customized beyond what `@typescript-eslint/recommended` provides — adding custom rules during a hackathon creates friction without benefit.

### Prettier

**Decision: Prettier with default configuration.**

A single `.prettierrc` with minimal overrides (e.g. `semi: true`, `singleQuote: true`) ensures all agent-generated code is consistently formatted. Prettier is run as a pre-commit formatter, not enforced in CI for the MVP.

### TypeScript strict mode

`strict: true` is non-negotiable. It prevents the class of null/undefined errors that are common when consuming AI-generated JSON (agent responses). Strict mode is the lowest-effort mechanism for catching these errors at compile time.

---

## 11. Configuration and Secrets

**Decision: Environment variables loaded via `dotenv`.**

All environment-specific values are loaded from `.env` at startup into `src/infrastructure/config.ts`, which validates their presence and exposes them as a typed `Config` object (per `ARCHITECTURE.md §15.3`).

### Required environment variables

```
# Bob / AI model
BOB_MODEL_ID=          # Bob 2.0 model identifier
BOB_API_KEY=           # Bob 2.0 API key (if applicable)

# Pipeline configuration
MAX_CONTEXT_TOKENS=8000     # Per-agent context token budget
AGENT_TIMEOUT_MS=30000      # Per-agent execution timeout (ms)

# Runtime
LOG_LEVEL=info              # debug | info | warn | error
PORT=3001                   # Backend HTTP port
```

### `.env.example`

A `.env.example` file is committed to the repository with all required variable names and placeholder values. The `.env` file is listed in `.gitignore` and never committed.

### Secret handling rules (from `ARCHITECTURE.md §11.3`)

- API keys appear only in environment variables
- No secrets appear in logs, findings, or the `ReviewResult`
- If a secret is found in repository content, the finding reports the location but redacts the secret value

---

## 12. Logging

**Decision: `pino` for structured logging.**

A lightweight structured logger is necessary to expose review workflow state:

| Field | Purpose |
|---|---|
| `reviewId` | Correlates all log entries for a single review request |
| `stage` | Current pipeline stage (e.g. `"context_analysis"`, `"security_agent"`) |
| `agent` | Agent name when applicable |
| `startedAt` / `completedAt` | ISO 8601 timestamps |
| `status` | `"started"` / `"completed"` / `"failed"` |
| `findingCount` | Findings produced at each stage |
| `error` | Error message on failure |

`pino` is selected over `winston` because it is faster, simpler, and produces JSON by default without configuration. Log level is controlled by the `LOG_LEVEL` environment variable.

**Log safety rules (from `ARCHITECTURE.md §11.5`):**
- Raw repository file contents are never logged
- API keys and secrets are never logged
- Agent prompt/response logging is permitted only at `LOG_LEVEL=debug` and must be disabled in any shared or demo environment

---

## 13. Deployment

**Decision: No deployment required for the hackathon demonstration.**

The MVP demonstration runs locally on the presenter's machine. This is consistent with `ARCHITECTURE.md §13.5` (local repository) and the hackathon scope.

### Local run instructions

```bash
# Backend
cd reviewMesh
npm install
cp .env.example .env   # fill in required values
npm run build
npm start              # starts Express on PORT (default 3001)

# Frontend (separate terminal)
cd reviewMesh/client
npm install
npm run dev            # Vite dev server on :5173
```

### Build outputs

| Artifact | Command | Output |
|---|---|---|
| Backend (compiled JS) | `tsc` | `dist/` |
| Frontend (static bundle) | `vite build` | `client/dist/` |

### Runtime requirements

- Node.js v20+
- `git` available in `PATH` (used by `RepositoryReader` via `child_process`)
- Bob 2.0 credentials in `.env`

### If hosting is needed for the demo

The frontend static bundle (`client/dist/`) can be served by Vercel or Netlify free tier with zero configuration. The backend can be deployed to Railway or Render free tier. No cloud infrastructure is introduced unless a live URL is required for the demonstration.

---

## 14. Dependency Philosophy

### One responsibility per dependency

| Dependency | Single responsibility |
|---|---|
| `express` | HTTP routing |
| `zod` | Runtime schema validation |
| `dotenv` | `.env` loading |
| `pino` | Structured logging |
| `react` | UI component model |
| `vite` | Frontend build tooling |
| `vitest` | Test runner |
| `typescript` | Type safety and compilation |
| `eslint` | Static analysis |
| `prettier` | Code formatting |

No dependency duplicates a capability provided by another. No dependency is introduced for a problem that Node.js or the TypeScript standard library already solves.

### No dependency for

| Problem | Solution |
|---|---|
| UUID generation | `node:crypto.randomUUID()` (Node.js built-in, v14.17+) |
| Unified diff parsing | Custom ~50-line parser in `RepositoryReader.ts` |
| File recursion | `fs/promises` (Node.js built-in) |
| JSON parse/stringify | Language built-in |
| Date formatting | `new Date().toISOString()` |

---

## 15. Technology Trade-offs

### TypeScript vs another backend language

Python would provide richer AI ecosystem libraries, but TypeScript is the correct choice because the domain interfaces in `ARCHITECTURE.md §7` need to be shared between frontend and backend without a separate schema definition layer. Bob 2.0 generates TypeScript accurately, and strict-mode TypeScript catches the class of null/missing-field errors that are common with AI-generated JSON.

### Express vs heavier backend framework

NestJS or Fastify would provide structure but impose opinions that conflict with the module boundaries already defined in `ARCHITECTURE.md §12`. A single `POST /review` endpoint does not justify a framework with a dependency injection container and decorator-based routing. Express is chosen precisely because it gets out of the way.

### React/Vite vs heavier frontend framework

Next.js SSR, TanStack Router, or Remix are not needed. ReviewMesh's frontend is a single page: a form and a results panel. There is no routing, no server-side rendering requirement, and no need for advanced data fetching patterns. Plain React with Vite is the minimum viable frontend.

### In-memory state vs database

The MVP processes one review at a time, returns the result synchronously, and does not need to recall past reviews. A database would require schema management, connection pooling, and migration tooling — none of which supports the demo. In-memory state is explicitly the correct choice here; it is not a shortcut.

### Local Git analysis vs GitHub API

GitHub API integration requires OAuth, webhook registration, rate-limit handling, and PR comment formatting. None of these capabilities demonstrate the multi-agent review workflow, which is the primary hackathon objective. Local Git analysis eliminates all external API dependencies and makes the demo reliable offline.

### Lightweight testing vs comprehensive test infrastructure

Comprehensive E2E test coverage with Playwright, CI pipeline matrix testing, and coverage reporting is appropriate for a production system. For a hackathon, the fixture-based integration test (known-bad diff → expected findings) provides the most useful regression coverage per unit of implementation effort. Unit tests focus on the deterministic business logic that is most likely to break silently.

### Modular monolith vs distributed services

Explicitly decided in `ARCHITECTURE.md §13.1`. Microservices would require service discovery, distributed tracing, and inter-service contracts. The modular monolith achieves the same module separation with one process, one deploy, and no network hops between pipeline stages.

---

## 16. Versions

| Technology | Version | Selection principle |
|---|---|---|
| Node.js | 20 LTS | Current LTS; stable `crypto.randomUUID()` support |
| TypeScript | 5.x | Current stable major; `moduleResolution: NodeNext` support |
| React | 18.x | Current stable; concurrent features available if needed |
| Vite | 5.x | Current stable; native TypeScript support |
| Express | 4.x | Stable long-term support version; v5 is available but not yet widely adopted |
| Zod | 3.x | Current stable; v3 API is mature |
| Vitest | 1.x | Current stable; Vite-native |
| pino | 8.x | Current stable |
| ESLint | 8.x | Current stable with `@typescript-eslint` v7 |
| Prettier | 3.x | Current stable |

If exact versions conflict with the project environment at implementation time, select the latest stable patch release of the specified major version.

---

## 17. MVP Stack Summary

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Submission form, agent progress, findings display |
| Backend | Node.js 20 + TypeScript + Express 4 | Review pipeline API, stage orchestration, HTTP routing |
| Language | TypeScript (strict mode) | Shared domain contracts, type safety, agent-generated code compatibility |
| AI / Agents | IBM Bob 2.0 | Orchestration, parallel subagents, specialist AI review |
| Git / Repo | Node.js `fs/promises` + `child_process` + custom diff parser | Local repository I/O, diff parsing, file selection |
| Validation | Zod 3 | Runtime validation of AI-generated Finding objects |
| Testing | Vitest + fixtures | Unit tests for deterministic logic; fixture-based integration test |
| Code Quality | ESLint + Prettier + TypeScript strict | Consistent code across agents and developers |
| Configuration | `dotenv` + typed `config.ts` | Environment variable loading; no hardcoded secrets |
| Logging | pino 8 | Structured review-stage logging |
| Deployment | Local (no infrastructure) | Hackathon demo runs on presenter's machine |

---

## 18. MVP vs Stretch Technology

### MVP — required for demonstration

All technologies listed in §17 above.

No additional technology is required for the MVP.

### Stretch — introduce only if MVP is complete and stable

| Technology | Enables |
|---|---|
| GitHub REST API (`@octokit/rest`) | P1 stretch: GitHub Pull Request integration |
| Playwright | E2E test coverage if demo reliability requires it |
| `express-rate-limit` | Basic API abuse protection for any hosted demo |
| Docker + `docker-compose` | Reproducible demo environment across machines |
| PostgreSQL + Prisma | `ReviewResult` persistence if review history is needed |
| Redis | Session state if multi-user demo is required |

Stretch technologies must not be treated as implicit MVP dependencies. They are listed here to prevent them from being introduced during core implementation.

---

## 19. Unresolved Technology Assumptions

These assumptions align with `ARCHITECTURE.md §Unresolved Assumptions` and must be confirmed before implementation begins:

1. **Bob subagent concurrency** — This stack assumes `spawn_subagent` supports concurrent dispatch within a single Bob Agent session. If parallelism is sequential-only, the orchestrator must be redesigned to dispatch agents sequentially. The pipeline interfaces do not change; only the orchestration timing changes.

2. **Bob API surface** — The `src/agents/` integration code depends on Bob 2.0's programmatic API. If Bob exposes agents only through a chat interface rather than a callable TypeScript API, the backend pipeline may need to invoke Bob through a different mechanism (e.g. CLI invocation via `child_process`, or structured prompt submission).

3. **Token budget** — The per-agent context budget (~8,000 tokens total across Tier 1 + 2 + 3) is estimated from `ARCHITECTURE.md §8.1`. Actual limits depend on the configured Bob model. The `MAX_CONTEXT_TOKENS` environment variable controls this; validate against the target model before implementing context slicing.

4. **Diff format** — The `RepositoryReader` parser targets standard unified diff (`git diff` output). If the demo or a stretch feature needs GitHub patch format, the parser will need adjustment.

5. **File system access from Bob subagents** — If Bob subagents run in a sandboxed context without filesystem access, the orchestrator must pre-load all file contents into the `AgentContext` payload. The domain interfaces support this; the `additionalFiles: FileContent[]` field exists for this purpose.

---

## 20. Final Verification

| Check | Status |
|---|---|
| Every technology supports the architecture | ✓ Stack follows `ARCHITECTURE.md` module structure and data contracts exactly |
| No unnecessary infrastructure introduced | ✓ No database, message queue, service mesh, or cloud infrastructure in MVP |
| Stack is realistic within remaining hackathon time | ✓ All technologies are zero-configuration or near-zero-configuration for a TypeScript project |
| Stack can be implemented by multiple coding agents without coupling | ✓ Module boundaries in `src/domain/`, `src/pipeline/`, `src/agents/`, etc. are independently addressable |
| Secrets are handled safely | ✓ `dotenv` + `config.ts` + `.env.example` + `.gitignore` |
| Testing remains practical | ✓ Vitest unit tests for deterministic logic; fixture-based integration test only |
| Unresolved assumptions are documented | ✓ §19 above |
