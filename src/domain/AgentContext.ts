import type { ProjectContext } from './ProjectContext.js';
import type { ChangeContext } from './ChangeContext.js';

/**
 * AgentContext — the self-contained input bundle delivered to each specialist agent.
 *
 * No agent receives the full repository. The Orchestrator slices the context
 * based on agent role before dispatch. (ARCHITECTURE.md §6.2)
 *
 * (ARCHITECTURE.md §7.3)
 */
export interface AgentContext {
  /** Project-level context shared across all agents. */
  projectContext: ProjectContext;

  /** Change-specific context — the diff and affected files. */
  changeContext: ChangeContext;

  /**
   * The role this agent is performing.
   * Agents must not analyze outside this domain.
   */
  agentRole: 'correctness' | 'security' | 'testing' | 'maintainability';

  /**
   * Agent-specific additional files chosen by the Orchestrator for this role.
   * For the Security Agent: auth/middleware/config files relevant to the change.
   */
  additionalFiles: FileContent[];
}

/**
 * FileContent — a repository file provided to an agent for additional context.
 */
export interface FileContent {
  /** Repository-relative path. */
  path: string;

  /** Full file content. */
  content: string;
}
