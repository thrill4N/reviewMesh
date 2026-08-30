/**
 * index.ts — ReviewMesh Evaluation Runner
 *
 * Loads all test cases from evaluation/test-cases/, runs each one through the
 * ReviewMesh agent pipeline (via the SecurityAgent's interface and AgentContext
 * contract), computes precision/recall/F1 metrics, and writes a Markdown report
 * to docs/METRICS.md.
 *
 * Usage:
 *   node --loader ts-node/esm evaluation/runner/index.ts [--output path/to/report.md]
 *
 * The runner is architecture-agnostic: it exercises the domain contracts
 * (AgentContext, Finding, ReviewResult) directly without requiring a running HTTP
 * server or a live Bob API key.  When BOB_API_KEY is absent the runner falls
 * back to a stub LLM client that returns empty findings, allowing the framework
 * itself to be tested without network access.
 *
 * Environment variables (all optional):
 *   BOB_API_KEY       — Bob 2.0 API key (omit for stub mode)
 *   BOB_MODEL_ID      — Model identifier (default: "ibm/granite-13b-instruct-v2")
 *   AGENT_TIMEOUT_MS  — Per-agent timeout in ms (default: 30000)
 *   EVAL_OUTPUT       — Override report output path (default: docs/METRICS.md)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import type { AgentContext } from '../../src/domain/AgentContext.js';
import type { ChangeContext, ChangedFile } from '../../src/domain/ChangeContext.js';
import type { ProjectContext } from '../../src/domain/ProjectContext.js';
import type { Finding } from '../../src/domain/Finding.js';
import { SecurityAgent } from '../../src/agents/SecurityAgent.js';
import type { LLMClient } from '../../src/agents/SecurityAgent.js';

import type { TestCase, TestResult, EvaluationReport, TestCaseDiff } from './types.js';
import {
  calculateMetrics,
  scoreFindings,
  isPassing,
  parseExpectedFindings,
  loadTestCaseDiff,
  generateMarkdownReport,
  aggregateResults,
  formatResultLine,
  formatSummary,
} from './utils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEST_CASES_DIR = path.resolve(__dirname, '..', 'test-cases');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'docs', 'METRICS.md');
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// LLM client
// ---------------------------------------------------------------------------

/**
 * Builds a real LLM client that calls the Bob/WatsonX API.
 * Only used when BOB_API_KEY is present in the environment.
 *
 * The production codebase has not yet implemented a concrete HTTP client, so
 * this is a minimal fetch-based implementation sufficient for evaluation.
 */
function buildLiveLLMClient(apiKey: string, modelId: string): LLMClient {
  return {
    async complete(systemPrompt: string, userMessage: string): Promise<string> {
      const body = JSON.stringify({
        model_id: modelId,
        input: `${systemPrompt}\n\n${userMessage}`,
        parameters: {
          max_new_tokens: 2048,
          temperature: 0.0,
        },
      });

      const response = await fetch(
        'https://us-south.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { results?: Array<{ generated_text: string }> };
      const text = data.results?.[0]?.generated_text;
      if (typeof text !== 'string') {
        throw new Error('LLM API response did not contain generated_text.');
      }
      return text;
    },
  };
}

/**
 * Stub LLM client used when no API key is configured.
 * Returns an empty findings JSON so the runner can exercise the framework
 * scaffolding without network access.
 */
function buildStubLLMClient(): LLMClient {
  return {
    async complete(_systemPrompt: string, _userMessage: string): Promise<string> {
      // Simulate a brief network delay.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      return '{ "findings": [] }';
    },
  };
}

// ---------------------------------------------------------------------------
// Test case loading
// ---------------------------------------------------------------------------

/**
 * Reads the test-cases directory and returns a sorted list of TestCase objects.
 */
async function loadTestCases(testCasesDir: string): Promise<TestCase[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(testCasesDir);
  } catch {
    throw new Error(
      `Could not read test-cases directory: ${testCasesDir}\n` +
        'Ensure evaluation/test-cases/ exists and is populated.',
    );
  }

  const tcDirs = entries
    .filter((name) => /^TC-\d{3}-/.test(name))
    .sort(); // Alphabetical = numeric order for TC-00N prefixes.

  if (tcDirs.length === 0) {
    throw new Error(`No test case directories found in ${testCasesDir}.`);
  }

  const cases: TestCase[] = [];

  for (const dir of tcDirs) {
    const tcPath = path.join(testCasesDir, dir);
    const mdPath = path.join(tcPath, 'expected-findings.md');

    let markdown: string;
    try {
      markdown = await fs.readFile(mdPath, 'utf-8');
    } catch {
      throw new Error(
        `Missing expected-findings.md for test case: ${dir}\n` +
          `Expected at: ${mdPath}`,
      );
    }

    const { counts, isFalsePositiveTrap } = parseExpectedFindings(markdown);
    const totalExpected = Object.values(counts).reduce((sum, n) => sum + n, 0);

    cases.push({
      id: dir,
      name: dir.replace(/^TC-\d{3}-/, '').replace(/-/g, ' '),
      path: tcPath,
      expectedFindings: counts,
      totalExpected,
      isFalsePositiveTrap,
    });
  }

  return cases;
}

// ---------------------------------------------------------------------------
// Context building
// ---------------------------------------------------------------------------

/**
 * Builds a minimal ProjectContext appropriate for the synthetic test case repos.
 * Real production usage would derive this from the repository being reviewed.
 */
function buildProjectContext(testCase: TestCase): ProjectContext {
  return {
    projectPurpose: `Synthetic test repository for evaluation test case ${testCase.id}.`,
    architecture: 'Single-module TypeScript application.',
    language: 'TypeScript',
    framework: null,
    relevantFiles: [],
    testStrategy: 'Vitest unit tests (not present in test case fixtures).',
    securitySensitiveAreas: ['src/'],
    conventions:
      'Standard TypeScript conventions; explicit return types; no any; errors thrown as Error instances.',
  };
}

/**
 * Converts the test case diff into a ChangeContext suitable for agent dispatch.
 */
function buildChangeContext(testCase: TestCase, diff: TestCaseDiff): ChangeContext {
  const changedFiles: ChangedFile[] = Object.entries(diff.afterFiles).map(([relPath, content]) => ({
    path: relPath,
    diff: diff.patch,
    fullContent: content,
  }));

  return {
    summary: `Code change for evaluation test case ${testCase.id}: ${testCase.name}`,
    changedFiles,
    affectedAreas: ['src/'],
    potentialRiskAreas: ['business logic', 'authorization', 'data handling'],
    newBehavior: `Post-change state of ${testCase.name} (see diff.patch for details).`,
  };
}

/**
 * Builds an AgentContext for the given agent role.
 */
function buildAgentContext(
  role: AgentContext['agentRole'],
  testCase: TestCase,
  diff: TestCaseDiff,
): AgentContext {
  const projectContext = buildProjectContext(testCase);
  const changeContext = buildChangeContext(testCase, diff);

  // Include before-state files as additional context for agents that benefit
  // from seeing what changed (security agent, for example).
  const additionalFiles = Object.entries(diff.beforeFiles).map(([relPath, content]) => ({
    path: `before/${relPath}`,
    content,
  }));

  return {
    projectContext,
    changeContext,
    agentRole: role,
    additionalFiles,
  };
}

// ---------------------------------------------------------------------------
// Single agent execution
// ---------------------------------------------------------------------------

/**
 * Runs the SecurityAgent against a single test case and returns its findings.
 *
 * Only the SecurityAgent is fully implemented in the current codebase.
 * When additional agents are implemented, this function can be extended with
 * the same pattern.
 */
async function runAgentsOnTestCase(
  testCase: TestCase,
  diff: TestCaseDiff,
  llmClient: LLMClient,
): Promise<{ findings: Finding[]; errors: string[] }> {
  const findings: Finding[] = [];
  const errors: string[] = [];

  // Security agent (fully implemented).
  try {
    const securityContext = buildAgentContext('security', testCase, diff);
    const agent = new SecurityAgent(llmClient);
    const result = await agent.review(securityContext);

    // Assign placeholder IDs (Orchestrator responsibility in production).
    for (const raw of result.findings) {
      findings.push({
        ...raw,
        id: `eval-${testCase.id}-security-${findings.length + 1}`,
      });
    }
  } catch (err) {
    errors.push(`SecurityAgent failed: ${(err as Error).message}`);
  }

  // Correctness, Testing, Maintainability agents: stubs.
  // These agents are not yet implemented in src/agents/. When they are, replace
  // each stub block with the same pattern used for SecurityAgent above.
  for (const role of ['correctness', 'testing', 'maintainability'] as const) {
    if (!agentExpectedForTestCase(testCase, role)) continue;
    errors.push(
      `${role} agent is not yet implemented; expected ${testCase.expectedFindings[role] ?? 0} finding(s) will be counted as false negatives.`,
    );
  }

  return { findings, errors };
}

/**
 * Returns true when the test case's expected findings include at least one
 * finding for the given agent category.
 */
function agentExpectedForTestCase(testCase: TestCase, role: string): boolean {
  return (testCase.expectedFindings[role] ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Single test case execution
// ---------------------------------------------------------------------------

/**
 * Runs a single test case end-to-end and returns a scored TestResult.
 */
async function runTestCase(testCase: TestCase, llmClient: LLMClient): Promise<TestResult> {
  const start = Date.now();

  let findings: Finding[] = [];
  let errors: string[] = [];

  try {
    const diff = await loadTestCaseDiff(testCase.path);
    const agentResult = await runAgentsOnTestCase(testCase, diff, llmClient);
    findings = agentResult.findings;
    errors = agentResult.errors;
  } catch (err) {
    errors.push(`Test case setup failed: ${(err as Error).message}`);
  }

  const durationMs = Date.now() - start;
  const { truePositives, falsePositives, falseNegatives } = scoreFindings(testCase, findings);
  const metrics = calculateMetrics(
    testCase.id,
    durationMs,
    truePositives,
    falsePositives,
    falseNegatives,
  );
  const passed = isPassing(testCase, metrics);

  return { testCase, metrics, findings, errors, passed };
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

/**
 * EvaluationRunner — coordinates loading, execution, scoring, and reporting.
 */
export class EvaluationRunner {
  private readonly llmClient: LLMClient;
  private readonly outputPath: string;

  constructor(llmClient: LLMClient, outputPath: string = DEFAULT_OUTPUT) {
    this.llmClient = llmClient;
    this.outputPath = outputPath;
  }

  /**
   * Loads all test cases from the test-cases directory.
   */
  async loadTestCases(): Promise<TestCase[]> {
    return loadTestCases(TEST_CASES_DIR);
  }

  /**
   * Runs all test cases, prints progress, and returns the aggregate report.
   */
  async runAll(): Promise<EvaluationReport> {
    const testCases = await this.loadTestCases();

    console.log(`\n🚀 Running ${testCases.length} evaluation test cases...\n`);

    // Run all test cases concurrently (each is isolated; no shared state).
    const settled = await Promise.allSettled(
      testCases.map((tc) => runTestCase(tc, this.llmClient)),
    );

    const results: TestResult[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
        console.log(formatResultLine(outcome.value));
      } else {
        // Promise rejection indicates a fatal setup failure — this should not
        // happen under normal operation because runTestCase catches all errors.
        console.error(`  ❌ Fatal error during test execution: ${outcome.reason}`);
      }
    }

    const report = aggregateResults(results, new Date().toISOString());
    console.log(formatSummary(report));

    return report;
  }

  /**
   * Writes the Markdown report to the configured output path.
   */
  async saveReport(report: EvaluationReport): Promise<void> {
    const markdown = generateMarkdownReport(report);
    // Ensure the output directory exists.
    await fs.mkdir(path.dirname(this.outputPath), { recursive: true });
    await fs.writeFile(this.outputPath, markdown, 'utf-8');
    console.log(`✅ Report saved to ${path.relative(REPO_ROOT, this.outputPath)}\n`);
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Determines the output path from CLI args or environment.
 */
function resolveOutputPath(): string {
  const argIndex = process.argv.indexOf('--output');
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    return path.resolve(process.argv[argIndex + 1]!);
  }
  return process.env['EVAL_OUTPUT'] ?? DEFAULT_OUTPUT;
}

/**
 * Builds the appropriate LLM client based on available environment variables.
 */
function resolveLLMClient(): LLMClient {
  const apiKey = process.env['BOB_API_KEY'];
  const modelId = process.env['BOB_MODEL_ID'] ?? 'ibm/granite-13b-instruct-v2';

  if (!apiKey) {
    console.warn(
      '⚠️  BOB_API_KEY is not set — running in stub mode.\n' +
        '   Agents will return empty findings. Set BOB_API_KEY to run live evaluations.\n',
    );
    return buildStubLLMClient();
  }

  console.log(`ℹ️  Using live LLM client with model: ${modelId}\n`);
  return buildLiveLLMClient(apiKey, modelId);
}

// Only execute when run directly as a script.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  const llmClient = resolveLLMClient();
  const outputPath = resolveOutputPath();
  const runner = new EvaluationRunner(llmClient, outputPath);

  runner
    .runAll()
    .then((report) => runner.saveReport(report))
    .catch((err: unknown) => {
      console.error('❌ Evaluation runner failed:', err);
      process.exitCode = 1;
    });
}
