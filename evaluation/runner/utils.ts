/**
 * utils.ts — helper functions for the evaluation runner.
 *
 * All functions are pure or minimally side-effecting utilities.
 * Heavy I/O operations belong in index.ts (the runner orchestrator).
 */

import fs from 'fs/promises';
import path from 'path';

import type { Metrics, TestCase, TestCaseDiff, EvaluationReport, TestResult } from './types.js';
import type { Finding } from '../../src/domain/Finding.js';

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Calculates precision, recall, and F1 score from raw TP/FP/FN counts.
 *
 * NaN-safe: when denominators would be zero the metric defaults to 1.0,
 * which is the neutral "perfect" value (nothing to find → nothing missed).
 */
export function calculateMetrics(
  testCaseId: string,
  durationMs: number,
  truePositives: number,
  falsePositives: number,
  falseNegatives: number,
): Metrics {
  const precision =
    truePositives + falsePositives === 0
      ? 1.0
      : truePositives / (truePositives + falsePositives);

  const recall =
    truePositives + falseNegatives === 0
      ? 1.0
      : truePositives / (truePositives + falseNegatives);

  const f1Score =
    precision + recall === 0
      ? 0.0
      : (2 * precision * recall) / (precision + recall);

  return {
    testCaseId,
    durationMs,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1Score,
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Scores actual findings against expected finding counts per category.
 *
 * Matching strategy (category-level):
 * - For each expected category, the number of TP is min(actual, expected).
 * - Any excess actual findings become FP.
 * - Any shortfall in actual findings becomes FN.
 *
 * For the false-positive trap (TC-006) with totalExpected === 0:
 * - Every actual finding is a FP.
 * - FN is always 0 (nothing was expected).
 */
export function scoreFindings(
  testCase: TestCase,
  findings: Finding[],
): { truePositives: number; falsePositives: number; falseNegatives: number } {
  if (testCase.isFalsePositiveTrap) {
    return {
      truePositives: 0,
      falsePositives: findings.length,
      falseNegatives: 0,
    };
  }

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  // Count actual findings per category.
  const actualCounts: Record<string, number> = {};
  for (const finding of findings) {
    actualCounts[finding.category] = (actualCounts[finding.category] ?? 0) + 1;
  }

  // Score each expected category.
  const allCategories = new Set([
    ...Object.keys(testCase.expectedFindings),
    ...Object.keys(actualCounts),
  ]);

  for (const category of allCategories) {
    const expected = testCase.expectedFindings[category] ?? 0;
    const actual = actualCounts[category] ?? 0;

    const tp = Math.min(actual, expected);
    const fp = Math.max(0, actual - expected);
    const fn = Math.max(0, expected - actual);

    truePositives += tp;
    falsePositives += fp;
    falseNegatives += fn;
  }

  return { truePositives, falsePositives, falseNegatives };
}

/**
 * Determines whether a test case result counts as passing.
 *
 * Pass conditions:
 * - False-positive trap: zero findings produced.
 * - All other cases: recall === 1.0 (all expected findings found).
 */
export function isPassing(testCase: TestCase, metrics: Metrics): boolean {
  if (testCase.isFalsePositiveTrap) {
    return metrics.falsePositives === 0;
  }
  return metrics.recall === 1.0;
}

// ---------------------------------------------------------------------------
// Expected findings parser
// ---------------------------------------------------------------------------

/**
 * Parses the "## AgentName Findings (N expected)" headings in expected-findings.md
 * to extract the expected count per category.
 *
 * Returns a Record mapping category → count. Categories with "0 expected" are
 * included in the map so the runner can identify false-positive traps.
 */
export function parseExpectedFindings(markdown: string): {
  counts: Record<string, number>;
  isFalsePositiveTrap: boolean;
} {
  const counts: Record<string, number> = {};
  // Matches: ## CorrectnessAgent Findings (3 expected)
  //      or: ## SecurityAgent Findings (0 expected)
  const pattern =
    /^##\s+(Correctness|Security|Testing|Maintainability)Agent\s+Findings\s+\((\d+)\s+expected\)/gim;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const agentLabel = match[1]!.toLowerCase() as string;
    const count = parseInt(match[2]!, 10);
    // Map agent label to category key.
    const category = agentLabel as 'correctness' | 'security' | 'testing' | 'maintainability';
    counts[category] = count;
  }

  const totalExpected = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const isFalsePositiveTrap =
    totalExpected === 0 && markdown.toLowerCase().includes('false-positive trap');

  return { counts, isFalsePositiveTrap };
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Recursively lists all files under a directory, returning relative paths.
 */
async function listFilesRecursively(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const children = await listFilesRecursively(full);
      results.push(...children);
    } else {
      results.push(full);
    }
  }
  return results;
}

/**
 * Reads all files under a directory tree, returning a map of
 * repository-relative path → content.
 */
async function readFileTree(rootDir: string): Promise<Record<string, string>> {
  const allPaths = await listFilesRecursively(rootDir);
  const result: Record<string, string> = {};
  for (const absolute of allPaths) {
    const relative = path.relative(rootDir, absolute);
    result[relative] = await fs.readFile(absolute, 'utf-8');
  }
  return result;
}

/**
 * Loads the diff patch and before/after file trees for a test case.
 */
export async function loadTestCaseDiff(testCasePath: string): Promise<TestCaseDiff> {
  const patchPath = path.join(testCasePath, 'diff.patch');
  const beforeDir = path.join(testCasePath, 'before');
  const afterDir = path.join(testCasePath, 'after');

  const [patch, beforeFiles, afterFiles] = await Promise.all([
    fs.readFile(patchPath, 'utf-8'),
    readFileTree(beforeDir),
    readFileTree(afterDir),
  ]);

  return { patch, beforeFiles, afterFiles };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/**
 * Renders the aggregate EvaluationReport as a Markdown string.
 */
export function generateMarkdownReport(report: EvaluationReport): string {
  const lines: string[] = [];

  lines.push('# ReviewMesh Evaluation Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Total Tests | ${report.totalTests} |`);
  lines.push(`| Passed | ${report.passed} |`);
  lines.push(`| Partial | ${report.partial} |`);
  lines.push(`| Failed | ${report.failed} |`);
  lines.push(`| Average F1 | ${report.averageF1.toFixed(2)} |`);
  lines.push(`| Total Duration | ${(report.totalDurationMs / 1000).toFixed(1)}s |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| ID | Name | Expected | Found | TP | FP | FN | Precision | Recall | F1 | Duration | Status |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');

  for (const result of report.results) {
    const { testCase, metrics, passed } = result;
    const status = passed
      ? '✅ Pass'
      : metrics.truePositives > 0
        ? '⚠️ Partial'
        : '❌ Fail';

    lines.push(
      `| ${testCase.id} | ${testCase.name} | ${testCase.totalExpected} | ${result.findings.length} | ${metrics.truePositives} | ${metrics.falsePositives} | ${metrics.falseNegatives} | ${metrics.precision.toFixed(2)} | ${metrics.recall.toFixed(2)} | ${metrics.f1Score.toFixed(2)} | ${metrics.durationMs}ms | ${status} |`,
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Detailed Results');
  lines.push('');

  for (const result of report.results) {
    lines.push(`### ${result.testCase.id} — ${result.testCase.name}`);
    lines.push('');

    if (result.errors.length > 0) {
      lines.push('**Errors during run:**');
      lines.push('');
      for (const err of result.errors) {
        lines.push(`- ${err}`);
      }
      lines.push('');
    }

    if (result.findings.length === 0) {
      lines.push('_No findings produced._');
    } else {
      lines.push(`**Findings (${result.findings.length}):**`);
      lines.push('');
      for (const finding of result.findings) {
        lines.push(
          `- **[${finding.severity.toUpperCase()}]** [${finding.category}] ${finding.title}`,
        );
        lines.push(`  - File: \`${finding.file}\``);
        if (finding.line !== null) lines.push(`  - Line: ${finding.line}`);
        lines.push(`  - Confidence: ${finding.confidence.toFixed(2)}`);
        lines.push(`  - Evidence: \`${finding.evidence.slice(0, 120)}\``);
      }
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_Generated by ReviewMesh Evaluation Runner_');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Aggregate computation
// ---------------------------------------------------------------------------

/**
 * Derives aggregate report fields from a list of individual test results.
 */
export function aggregateResults(
  results: TestResult[],
  generatedAt: string,
): EvaluationReport {
  let passed = 0;
  let partial = 0;
  let failed = 0;
  let totalDurationMs = 0;
  let f1Sum = 0;

  for (const result of results) {
    totalDurationMs += result.metrics.durationMs;
    f1Sum += result.metrics.f1Score;

    if (result.passed) {
      passed += 1;
    } else if (result.metrics.truePositives > 0) {
      partial += 1;
    } else {
      failed += 1;
    }
  }

  const averageF1 = results.length > 0 ? f1Sum / results.length : 0;

  return {
    generatedAt,
    results,
    totalTests: results.length,
    passed,
    partial,
    failed,
    averageF1,
    totalDurationMs,
  };
}

// ---------------------------------------------------------------------------
// Console formatting
// ---------------------------------------------------------------------------

/** ANSI escape codes for coloured terminal output. */
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
} as const;

/**
 * Formats a single test result line for console output.
 * e.g. "  📝 TC-001: correctness-off-by-one ... ✅ (1/1, 2345ms)"
 */
export function formatResultLine(result: TestResult): string {
  const { testCase, metrics, passed } = result;

  const statusIcon = passed
    ? `${ANSI.green}✅${ANSI.reset}`
    : metrics.truePositives > 0
      ? `${ANSI.yellow}⚠️${ANSI.reset}`
      : `${ANSI.red}❌${ANSI.reset}`;

  const found = result.findings.length;
  const expected = testCase.totalExpected;
  const label = testCase.isFalsePositiveTrap
    ? `${found} FP`
    : `${metrics.truePositives}/${expected}`;

  const name = testCase.name.padEnd(36);
  return `  📝 ${ANSI.cyan}${testCase.id}${ANSI.reset}: ${name} ${statusIcon} (${label}, ${metrics.durationMs}ms)`;
}

/**
 * Formats the summary block printed after all tests complete.
 */
export function formatSummary(report: EvaluationReport): string {
  const lines: string[] = [
    '',
    `${ANSI.bold}📊 Summary:${ANSI.reset}`,
    `  Total Tests : ${report.totalTests}`,
    `  ${ANSI.green}Passed${ANSI.reset}      : ${report.passed}`,
    `  ${ANSI.yellow}Partial${ANSI.reset}     : ${report.partial}`,
    `  ${ANSI.red}Failed${ANSI.reset}      : ${report.failed}`,
    `  Average F1  : ${report.averageF1.toFixed(2)}`,
    `  Duration    : ${(report.totalDurationMs / 1000).toFixed(1)}s`,
    '',
  ];
  return lines.join('\n');
}
