/**
 * types.ts — shared type definitions for the evaluation runner.
 *
 * These types are internal to the evaluation framework and must not be imported
 * by the production ReviewMesh source.
 */

import type { Finding } from '../../src/domain/Finding.js';

// ---------------------------------------------------------------------------
// Test case loading
// ---------------------------------------------------------------------------

/**
 * A single parsed test case loaded from the test-cases directory.
 */
export interface TestCase {
  /** Unique identifier, e.g. "TC-001-correctness-off-by-one". */
  id: string;

  /** Human-readable name derived from the directory name. */
  name: string;

  /** Absolute path to the test case directory. */
  path: string;

  /**
   * Expected finding counts per agent category.
   * Key is the category string ("correctness", "security", "testing", "maintainability").
   * Value is the number of findings expected from that agent.
   * A missing key means 0 findings are expected from that agent.
   */
  expectedFindings: Record<string, number>;

  /**
   * Total expected findings across all agents.
   * Derived from summing all values in `expectedFindings`.
   */
  totalExpected: number;

  /**
   * Whether this is a false-positive trap test.
   * Pass condition is inverted: 0 findings = success.
   */
  isFalsePositiveTrap: boolean;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Evaluation metrics for a single test case run.
 */
export interface Metrics {
  /** Identifier of the test case these metrics belong to. */
  testCaseId: string;

  /** Wall-clock time in milliseconds for the entire review run. */
  durationMs: number;

  /** Number of findings the agent produced that match expected findings. */
  truePositives: number;

  /** Number of findings the agent produced that were not expected. */
  falsePositives: number;

  /** Number of expected findings the agent did not produce. */
  falseNegatives: number;

  /**
   * TP / (TP + FP). 1.0 when no unexpected findings were produced.
   * NaN-safe: returns 1.0 when TP + FP = 0 (no findings produced).
   */
  precision: number;

  /**
   * TP / (TP + FN). 1.0 when all expected findings were found.
   * NaN-safe: returns 1.0 when TP + FN = 0 (no findings expected).
   */
  recall: number;

  /**
   * Harmonic mean of precision and recall.
   * NaN-safe: returns 1.0 when both precision and recall are 1.0.
   */
  f1Score: number;
}

// ---------------------------------------------------------------------------
// Test result
// ---------------------------------------------------------------------------

/**
 * The complete result of running a single test case through the evaluation runner.
 */
export interface TestResult {
  /** The test case that was evaluated. */
  testCase: TestCase;

  /** Computed metrics for this run. */
  metrics: Metrics;

  /** Actual findings returned by the review agents (after synthesis). */
  findings: Finding[];

  /** Non-fatal errors encountered during the run (e.g. partial agent failure). */
  errors: string[];

  /** Whether the test case passed based on the matching rules. */
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Aggregate report
// ---------------------------------------------------------------------------

/**
 * Aggregated result across all test cases.
 */
export interface EvaluationReport {
  /** ISO 8601 timestamp of when the evaluation was run. */
  generatedAt: string;

  /** Individual results in run order. */
  results: TestResult[];

  /** Total number of test cases. */
  totalTests: number;

  /** Number of test cases that fully passed. */
  passed: number;

  /** Number of test cases that partially passed (some findings found, not all). */
  partial: number;

  /** Number of test cases that failed (no expected findings found, or false positives). */
  failed: number;

  /** Average F1 score across all test cases. */
  averageF1: number;

  /** Total wall-clock time in milliseconds across all test cases. */
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Agent context builder output
// ---------------------------------------------------------------------------

/**
 * Minimal representation of a test case's diff and file content used to
 * construct the AgentContext passed to the review pipeline.
 */
export interface TestCaseDiff {
  /** Content of the diff.patch file. */
  patch: string;

  /** Full content of the "after" source files, keyed by repository-relative path. */
  afterFiles: Record<string, string>;

  /** Full content of the "before" source files, keyed by repository-relative path. */
  beforeFiles: Record<string, string>;
}
