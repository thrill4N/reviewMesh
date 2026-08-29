/**
 * ChangeContext — information about the proposed code change being reviewed.
 *
 * Built by ChangeAnalyzer (Stage 2) from the provided Git diff and the
 * current content of affected files.
 *
 * (ARCHITECTURE.md §7.2)
 */
export interface ChangeContext {
  /** Human-readable description of what the change does. */
  summary: string;

  /** List of files that were modified, created, or deleted. */
  changedFiles: ChangedFile[];

  /**
   * Logical areas of the system affected by the change
   * (e.g. ["auth", "database", "API routes"]).
   */
  affectedAreas: string[];

  /**
   * Areas identified as potentially risky by the change analyzer
   * (e.g. ["authorization logic", "input validation"]).
   */
  potentialRiskAreas: string[];

  /** Description of the new or changed behavior introduced by this change. */
  newBehavior: string;
}

/**
 * ChangedFile — a single file involved in the change, including its diff and current full content.
 */
export interface ChangedFile {
  /** Repository-relative path. */
  path: string;

  /** Unified diff hunk(s) for this file. */
  diff: string;

  /** Full current content of the file (after the change is applied). */
  fullContent: string;
}
