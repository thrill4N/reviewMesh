# ReviewMesh

> **Multi-agent AI code review built for signal, not noise.**

ReviewMesh uses IBM Bob 2.0 to coordinate a team of specialized AI reviewers that independently analyze a code change, validate their findings against repository evidence, and produce a concise, prioritized review a developer can act on.

Built for the IBM TechXchange 2026 Pre-conference Dev Day Hackathon.

---

## The Problem

Generic AI code reviewers produce too much noise — duplicate findings, low-confidence warnings, and recommendations without evidence. ReviewMesh solves this by using specialization, validation, and deduplication to surface only the findings that matter.

---

## How It Works

```
Developer (repository path + diff)
              ↓
        Bob Orchestrator
              ↓
    ┌─────────────────────┐
    │  Context Analysis   │
    │  Change Analysis    │
    └──────────┬──────────┘
               ↓
 ┌─────┬───────┬─────────┬──────────────┐
 │Corr.│  Sec. │ Testing │Maintainability│
 └──┬──┴───┬───┴────┬────┴──────┬───────┘
    └───────┴────────┴──────────┘
               ↓ Finding[]
       Finding Validator
               ↓ ValidatedFinding[]
       Review Synthesizer
               ↓ ReviewResult
       Final Review Report
```

1. **Context Analysis** — understands the repository structure, language, and conventions.
2. **Change Analysis** — parses the diff and identifies affected files and logic.
3. **Four specialist agents** run in parallel:
   - **Correctness** — logic errors, edge cases, incorrect API usage.
   - **Security** — injection vulnerabilities, auth weaknesses, secret exposure.
   - **Testing** — missing tests, regression risks, untested error paths.
   - **Maintainability** — complexity, duplication, architectural inconsistencies.
4. **Finding Validator** — verifies each finding against actual repository evidence.
5. **Review Synthesizer** — deduplicates near-identical findings and prioritizes by severity.
6. **Final report** — concise, evidence-backed, actionable.

---

## Project Structure

```
reviewMesh/
├── src/
│   ├── domain/          # Shared interfaces and types (Finding, ReviewResult, etc.)
│   ├── agents/          # Specialist review agents + Orchestrator
│   ├── pipeline/        # Review pipeline stage sequencing
│   ├── validation/      # Finding validator
│   ├── synthesis/       # Deduplication and prioritization
│   ├── infrastructure/  # Config, file I/O, external API adapters
│   └── ui/              # Output formatting
├── tests/
│   ├── agents/          # Unit tests for specialist agents
│   └── fixtures/        # Sample repository + diff for integration tests
├── docs/                # Architecture, PRD, workflow, and tech-stack docs
├── prompts/             # Agent prompt templates
├── evaluation/          # Baseline comparison data
├── .env.example         # Required environment variable template
├── tsconfig.json
└── vitest.config.ts
```

---

## Prerequisites

- **Node.js** v20+
- **npm** v9+
- **git** available in `PATH`
- IBM Bob 2.0 API credentials

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd reviewMesh
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

```env
BOB_MODEL_ID=         # Bob 2.0 model identifier
BOB_API_KEY=          # Bob 2.0 API key
MAX_CONTEXT_TOKENS=8000
AGENT_TIMEOUT_MS=30000
LOG_LEVEL=info
PORT=3001
```

### 4. Build

```bash
npm run build
```

### 5. Run

```bash
npm start
```

The backend starts on `http://localhost:3001` by default.

---

## Development

```bash
# Type-check
npm run typecheck

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5 (strict mode) |
| Runtime | Node.js v20+ |
| Backend | Express |
| Frontend | React + TypeScript + Vite |
| AI / Agent | IBM Bob 2.0 |
| Test runner | Vitest |
| Linting | ESLint + `@typescript-eslint` |
| Logging | pino |

---

## Finding Severity

| Severity | Meaning |
|---|---|
| `critical` | Immediate risk: data loss, auth bypass, production breakage |
| `high` | Significant defect or vulnerability; should be fixed before merge |
| `medium` | Meaningful issue; should be addressed soon |
| `low` | Minor improvement; informational |

---

## Design Principles

- **Signal over noise** — fewer validated findings beat many speculative ones.
- **Evidence before assertion** — every finding cites file, line, and code evidence.
- **Specialization** — each agent has one narrow responsibility.
- **Parallel where safe** — specialist agents run concurrently.
- **Graceful degradation** — a failing agent does not abort the review.
- **Human in the loop** — ReviewMesh recommends; a developer decides.

---

## Documentation

| Document | Description |
|---|---|
| [`docs/Context.md`](docs/Context.md) | Product identity, problem, and philosophy |
| [`docs/PRD.md`](docs/PRD.md) | Functional and non-functional requirements |
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | Detailed pipeline workflow specification |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Component design and data contracts |
| [`docs/TECH-STACK.md`](docs/TECH-STACK.md) | Technology choices and rationale |
| [`AGENTS.md`](AGENTS.md) | Agent operating rules and contribution guidelines |

---

## License

This project was built as a hackathon prototype. See repository for license details.
