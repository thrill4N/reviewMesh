import type { ValidatedFinding } from '../domain/Finding.js';
import type { AgentStatus } from '../domain/ReviewResult.js';
import type { ReviewResult } from '../domain/ReviewResult.js';

/**
 * ReviewSynthesizer — deduplication, prioritization, and final report production.
 *
 * Responsibility (ARCHITECTURE.md §4.10):
 * - Exclude unsupported findings from the final result
 * - Deduplicate near-identical findings from different agents
 * - Sort findings by priority (severity then confidence)
 * - Determine overall review status
 * - Produce the final ReviewResult
 *
 * Boundary: operates on validated findings only. Does not re-analyze repository.
 */
export class ReviewSynthesizer {
  /**
   * Synthesizes a ReviewResult from validated findings and agent statuses.
   *
   * @param validatedFindings - Output of FindingValidator (may include unsupported)
   * @param agentStatuses     - One entry per specialist agent
   */
  synthesize(
    validatedFindings: ValidatedFinding[],
    agentStatuses: AgentStatus[],
  ): ReviewResult {
    // 1. Exclude unsupported findings
    const supported = validatedFindings.filter(
      (f) => f.validationStatus !== 'unsupported',
    );

    // 2. Deduplicate near-identical findings
    const deduplicated = deduplicateFindings(supported);

    // 3. Sort by priority: severity desc, then confidence desc
    const sorted = deduplicated.sort(compareByPriority);

    // 4. Derive overall status
    const status = deriveStatus(sorted);

    // 5. Determine partial review flag
    const failedAgents = agentStatuses.filter((a) => a.status === 'failed');
    const partialReview = failedAgents.length > 0;
    const partialReviewNote = partialReview
      ? buildPartialNote(failedAgents)
      : null;

    // 6. Build summary
    const summary = buildSummary(sorted, agentStatuses, partialReview);

    return {
      status,
      summary,
      findings: sorted,
      agentStatuses,
      partialReview,
      partialReviewNote,
      generatedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Removes near-duplicate findings.
 *
 * Two findings are considered near-duplicates if they share the same:
 * - file
 * - category
 * - AND either the same location OR highly similar titles (>= 80% token overlap)
 *
 * When a near-duplicate is found, the higher-confidence finding is kept.
 */
function deduplicateFindings(findings: ValidatedFinding[]): ValidatedFinding[] {
  const kept: ValidatedFinding[] = [];

  for (const candidate of findings) {
    const isDuplicate = kept.some((existing) => areDuplicates(existing, candidate));
    if (!isDuplicate) {
      kept.push(candidate);
    }
  }

  return kept;
}

function areDuplicates(a: ValidatedFinding, b: ValidatedFinding): boolean {
  if (a.file !== b.file) return false;
  if (a.category !== b.category) return false;

  // Same location (non-null and equal)
  if (a.location !== null && b.location !== null && a.location === b.location) {
    return true;
  }

  // Highly similar titles
  if (titleSimilarity(a.title, b.title) >= 0.8) return true;

  return false;
}

/**
 * Token overlap similarity between two strings (Jaccard index on word sets).
 */
function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  if (union.size === 0) return 1;
  return intersection.size / union.size;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);
}

// ---------------------------------------------------------------------------
// Priority sorting
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<ValidatedFinding['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function compareByPriority(a: ValidatedFinding, b: ValidatedFinding): number {
  const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (severityDiff !== 0) return severityDiff;
  return b.confidence - a.confidence;
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

function deriveStatus(
  findings: ValidatedFinding[],
): ReviewResult['status'] {
  const hasCriticalOrHigh = findings.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );
  if (hasCriticalOrHigh) return 'changes_required';

  const hasMedium = findings.some((f) => f.severity === 'medium');
  if (hasMedium) return 'needs_review';

  return 'approved';
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

function buildSummary(
  findings: ValidatedFinding[],
  agentStatuses: AgentStatus[],
  partialReview: boolean,
): string {
  const total = findings.length;

  if (total === 0) {
    const base = 'No significant issues found in this change.';
    return partialReview ? `${base} Note: review is partial — not all agents completed.` : base;
  }

  const bySeverity = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
  };

  const parts: string[] = [];
  if (bySeverity.critical > 0) parts.push(`${bySeverity.critical} critical`);
  if (bySeverity.high > 0) parts.push(`${bySeverity.high} high`);
  if (bySeverity.medium > 0) parts.push(`${bySeverity.medium} medium`);
  if (bySeverity.low > 0) parts.push(`${bySeverity.low} low`);

  const severityBreakdown = parts.join(', ');
  const base = `Found ${total} finding${total === 1 ? '' : 's'} (${severityBreakdown}).`;

  return partialReview ? `${base} Note: review is partial — not all agents completed.` : base;
}

function buildPartialNote(failedAgents: AgentStatus[]): string {
  const names = failedAgents.map((a) => capitalize(a.agent)).join(', ');
  return `The following analysis perspectives were unavailable: ${names}. Results reflect only the agents that completed successfully.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
