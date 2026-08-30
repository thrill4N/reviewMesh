import { randomUUID } from 'node:crypto';
import type { AgentContext } from '../domain/AgentContext.js';
import type { ProjectContext } from '../domain/ProjectContext.js';
import type { ChangeContext } from '../domain/ChangeContext.js';
import type { Finding, RawFinding } from '../domain/Finding.js';
import type { AgentStatus } from '../domain/ReviewResult.js';
import { CorrectnessAgent } from './CorrectnessAgent.js';
import { SecurityAgent } from './SecurityAgent.js';
import { TestingAgent } from './TestingAgent.js';
import { MaintainabilityAgent } from './MaintainabilityAgent.js';

/**
 * Orchestrator — dispatches all four specialist agents concurrently and
 * collects their findings into a single, id-stamped Finding[] array.
 *
 * Responsibilities (ARCHITECTURE.md §4.4):
 * - Build agent-specific context slices before dispatch
 * - Run all four agents in parallel (Promise.allSettled)
 * - Assign UUID v4 ids to all collected RawFindings
 * - Record AgentStatus for each agent (success or failed)
 * - Implement graceful degradation: a single agent failure does not abort
 *
 * Boundary: coordinates only — performs no code review itself.
 */

// ---------------------------------------------------------------------------
// LLM client interface (shared across agents)
// ---------------------------------------------------------------------------

export interface LLMClient {
  complete(systemPrompt: string, userMessage: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface OrchestratorResult {
  findings: Finding[];
  agentStatuses: AgentStatus[];
}

// ---------------------------------------------------------------------------
// Context slice builders (ARCHITECTURE.md §6.2)
// ---------------------------------------------------------------------------

/**
 * Additional files provided to each agent are built by the caller
 * (ReviewPipeline via RepositoryReader). The Orchestrator accepts them
 * as pre-loaded FileContent arrays to keep infrastructure concerns out.
 */
export interface AgentContextSlices {
  correctness: AgentContext;
  security: AgentContext;
  testing: AgentContext;
  maintainability: AgentContext;
}

/**
 * Builds the four agent context slices from shared project/change context
 * plus agent-specific additional files.
 */
export function buildContextSlices(
  projectContext: ProjectContext,
  changeContext: ChangeContext,
  additionalFiles: {
    correctness: AgentContext['additionalFiles'];
    security: AgentContext['additionalFiles'];
    testing: AgentContext['additionalFiles'];
    maintainability: AgentContext['additionalFiles'];
  },
): AgentContextSlices {
  return {
    correctness: {
      projectContext,
      changeContext,
      agentRole: 'correctness',
      additionalFiles: additionalFiles.correctness,
    },
    security: {
      projectContext,
      changeContext,
      agentRole: 'security',
      additionalFiles: additionalFiles.security,
    },
    testing: {
      projectContext,
      changeContext,
      agentRole: 'testing',
      additionalFiles: additionalFiles.testing,
    },
    maintainability: {
      projectContext,
      changeContext,
      agentRole: 'maintainability',
      additionalFiles: additionalFiles.maintainability,
    },
  };
}

// ---------------------------------------------------------------------------
// ID assignment
// ---------------------------------------------------------------------------

function assignIds(rawFindings: RawFinding[]): Finding[] {
  return rawFindings.map((f) => ({ ...f, id: randomUUID() }));
}

// ---------------------------------------------------------------------------
// Orchestrator class
// ---------------------------------------------------------------------------

export class Orchestrator {
  private readonly correctnessAgent: CorrectnessAgent;
  private readonly securityAgent: SecurityAgent;
  private readonly testingAgent: TestingAgent;
  private readonly maintainabilityAgent: MaintainabilityAgent;

  constructor(llmClient: LLMClient) {
    this.correctnessAgent = new CorrectnessAgent(llmClient);
    this.securityAgent = new SecurityAgent(llmClient);
    this.testingAgent = new TestingAgent(llmClient);
    this.maintainabilityAgent = new MaintainabilityAgent(llmClient);
  }

  /**
   * Dispatches all four specialist agents concurrently.
   * Collects findings from agents that succeed; records failures for those that don't.
   *
   * Graceful degradation: if one agent throws, the others' results are preserved.
   */
  async run(slices: AgentContextSlices): Promise<OrchestratorResult> {
    const [correctnessResult, securityResult, testingResult, maintainabilityResult] =
      await Promise.allSettled([
        this.correctnessAgent.review(slices.correctness),
        this.securityAgent.review(slices.security),
        this.testingAgent.review(slices.testing),
        this.maintainabilityAgent.review(slices.maintainability),
      ]);

    const allRaw: RawFinding[] = [];
    const agentStatuses: AgentStatus[] = [];

    const agents = [
      { name: 'correctness', result: correctnessResult },
      { name: 'security', result: securityResult },
      { name: 'testing', result: testingResult },
      { name: 'maintainability', result: maintainabilityResult },
    ] as const;

    for (const { name, result } of agents) {
      if (result.status === 'fulfilled') {
        const findings = result.value.findings;
        allRaw.push(...findings);
        agentStatuses.push({
          agent: name,
          status: 'success',
          findingCount: findings.length,
          error: null,
        });
      } else {
        const error = result.reason as Error;
        agentStatuses.push({
          agent: name,
          status: 'failed',
          findingCount: 0,
          error: error?.message ?? 'Unknown error',
        });
      }
    }

    return {
      findings: assignIds(allRaw),
      agentStatuses,
    };
  }
}
