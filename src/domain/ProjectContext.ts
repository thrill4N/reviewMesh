/**
 * ProjectContext — information about the repository being reviewed.
 *
 * Built by ContextAnalyzer (Stage 1) from repository documentation, README,
 * configuration files, and directory structure.
 *
 * (ARCHITECTURE.md §7.1)
 */
export interface ProjectContext {
  /** What the project does — derived from README/documentation. */
  projectPurpose: string;

  /** Brief description of the project's architecture. */
  architecture: string;

  /** Primary language used in the repository. */
  language: string;

  /** Primary framework, or null if none is identifiable. */
  framework: string | null;

  /** Repository-relative paths of notable source files (for context slicing decisions). */
  relevantFiles: string[];

  /** How the project is tested (e.g. "Jest unit tests", "no test suite identified"). */
  testStrategy: string;

  /**
   * Areas of the codebase that handle security-sensitive operations
   * (e.g. ["auth/", "payments/", "api/middleware/auth.ts"]).
   */
  securitySensitiveAreas: string[];

  /**
   * Brief summary of project conventions — naming, module structure, error handling style.
   * Agents use this to avoid flagging intentional project-specific patterns as issues.
   */
  conventions: string;
}
