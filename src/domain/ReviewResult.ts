import type { ValidatedFinding } from './Finding.js';

/**
 * ReviewResult — the final output produced by the Review Synthesizer.
 *
 * Delivered to the presentation layer after deduplication and prioritization.
 *
 * (ARCHITECTURE.md §7.6)
 */
export interface ReviewResult {
  /**
   * Overall disposition of the review.
   * - "approved": no findings or only low-severity informational findings
   * - "changes_required": one or more high/critical findings
   * - "needs_review": medium findings that warrant developer attention
   */
  status: 'approved' | 'changes_required' | 'needs_review';

  /** Human-readable summary of the review. */
  summary: string;

  /** Deduplicated, priority-sorted findings. Unsupported findings are excluded. */
  findings: ValidatedFinding[];

  /** Status of each specialist agent that was dispatched. */
  agentStatuses: AgentStatus[];

  /** True if one or more agents failed during the review. */
  partialReview: boolean;

  /** Explains which agent(s) failed, or null if partialReview is false. */
  partialReviewNote: string | null;

  /** ISO 8601 timestamp of when the review was produced. */
  generatedAt: string;
}

/**
 * AgentStatus — reports the outcome for a single specialist agent.
 */
export interface AgentStatus {
  /** Agent identifier matching AgentContext.agentRole. */
  agent: string;

  /** Whether the agent completed successfully. */
  status: 'success' | 'failed';

  /** Number of findings the agent produced (0 for failed agents). */
  findingCount: number;

  /** Error message if status is "failed"; null otherwise. */
  error: string | null;
}
