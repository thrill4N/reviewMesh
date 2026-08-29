/**
 * Finding — canonical shared contract between all specialist agents and downstream stages.
 *
 * Agents must NOT set `id`; the Orchestrator assigns UUIDs on collection to prevent collisions.
 *
 * Rules (from ARCHITECTURE.md §7.4):
 * - `evidence` must reference actual code from the supplied context; fabrication is prohibited.
 * - `line` must be null if the exact line cannot be determined with confidence.
 * - `confidence` must reflect actual certainty (0.0–1.0).
 * - `severity` must be proportionate to actual impact.
 */
export interface Finding {
  /** UUID v4 — assigned by Orchestrator on collection; not set by agents. */
  id: string;

  /** Concise one-line description of the problem. */
  title: string;

  /** Domain category — must match the emitting agent's role. */
  category: 'correctness' | 'security' | 'testing' | 'maintainability';

  /** Impact severity of the finding. */
  severity: 'critical' | 'high' | 'medium' | 'low';

  /**
   * Certainty that the evidence supports the finding.
   * 0.9–1.0: directly demonstrable; 0.7–0.89: strong indicators;
   * 0.5–0.69: plausible but incomplete; < 0.5: omit.
   */
  confidence: number;

  /** Repository-relative path of the affected file. */
  file: string;

  /** Specific line number, or null if not determinable with confidence. */
  line: number | null;

  /** Human-readable location, e.g. "OrderController.cancelOrder()". Null if not determinable. */
  location: string | null;

  /** Actual code excerpt or reference demonstrating the problem. Never fabricated. */
  evidence: string;

  /** Why this is a problem. */
  explanation: string;

  /** What could go wrong if not addressed. */
  impact: string;

  /** Concrete, actionable next step. */
  recommendation: string;

  /** Identifier of the agent that produced this finding. */
  sourceAgent: 'correctness' | 'security' | 'testing' | 'maintainability';
}

/**
 * RawFinding — emitted by specialist agents before the Orchestrator assigns an id.
 * All fields are identical to Finding except `id` is omitted.
 */
export type RawFinding = Omit<Finding, 'id'>;

/**
 * ValidatedFinding — a Finding enriched with a validation verdict from FindingValidator.
 * Findings with status "unsupported" are excluded from synthesis.
 */
export interface ValidatedFinding extends Finding {
  /** Outcome of the evidence check. */
  validationStatus: 'confirmed' | 'uncertain' | 'unsupported';

  /** Human-readable reason for a downgrade or suppression. Null for confirmed findings. */
  validationNote: string | null;
}
