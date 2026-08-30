import type { ProjectContext } from '../domain/ProjectContext.js';
import type { ChangeContext } from '../domain/ChangeContext.js';
import type { ReviewResult } from '../domain/ReviewResult.js';
import { RepositoryReader } from '../infrastructure/RepositoryReader.js';
import { ContextAnalyzer } from './ContextAnalyzer.js';
import { ChangeAnalyzer } from './ChangeAnalyzer.js';
import { Orchestrator, buildContextSlices } from '../agents/Orchestrator.js';
import { FindingValidator } from '../validation/FindingValidator.js';
import { ReviewSynthesizer } from '../synthesis/ReviewSynthesizer.js';
import type { ValidatedFinding } from '../domain/Finding.js';

/**
 * ReviewPipeline — executes all nine review stages in sequence.
 *
 * Responsibility (ARCHITECTURE.md §4.1):
 * - Manage stage-to-stage data handoffs
 * - Handle partial failures without aborting (graceful degradation)
 * - Return a ReviewResult regardless of partial agent failures
 *
 * Boundary: the pipeline owns control flow only. It performs no analysis itself.
 *
 * Stage sequence (ARCHITECTURE.md §9.1):
 *   Stage 1: Context Analysis   → ProjectContext
 *   Stage 2: Change Analysis    → ChangeContext
 *   Stage 3: Parallel Review    → Finding[] (via Orchestrator)
 *   Stage 4: Collection         → Finding[] with UUIDs
 *   Stage 5: Validation         → ValidatedFinding[]
 *   Stage 6–8: Synthesis        → ReviewResult
 */

export interface ReviewPipelineConfig {
  repoPath: string;
}

export class ReviewPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewPipelineError';
  }
}

export class ReviewPipeline {
  private readonly orchestrator: Orchestrator;
  private readonly validator: FindingValidator;
  private readonly synthesizer: ReviewSynthesizer;

  constructor(orchestrator: Orchestrator) {
    this.orchestrator = orchestrator;
    this.validator = new FindingValidator();
    this.synthesizer = new ReviewSynthesizer();
  }

  /**
   * Runs the complete review pipeline.
   *
   * @param repoPath - Absolute or cwd-relative path to the repository root
   * @param diffText - Unified diff string (output of `git diff`)
   */
  async run(repoPath: string, diffText: string): Promise<ReviewResult> {
    if (!repoPath || repoPath.trim() === '') {
      throw new ReviewPipelineError('repoPath must not be empty.');
    }
    if (!diffText || diffText.trim() === '') {
      throw new ReviewPipelineError('diffText must not be empty — nothing to review.');
    }

    // --- Stage 1: Context Analysis ---
    const reader = new RepositoryReader(repoPath);
    const contextAnalyzer = new ContextAnalyzer(reader);
    const projectContext: ProjectContext = await contextAnalyzer.analyze();

    // --- Stage 2: Change Analysis ---
    const changeAnalyzer = new ChangeAnalyzer(reader);
    const changeContext: ChangeContext = await changeAnalyzer.analyze(diffText, projectContext);

    if (changeContext.changedFiles.length === 0) {
      throw new ReviewPipelineError('Diff could not be parsed — no changed files identified.');
    }

    // --- Stage 3: Parallel Specialist Review + Stage 4: Collection ---
    const changedFilePaths = changeContext.changedFiles.map((f) => f.path);

    // Load agent-specific additional files for context slicing (Tier 3)
    const [correctnessFiles, securityFiles, testingFiles, maintainabilityFiles] =
      await Promise.all([
        reader.selectAdditionalFiles('correctness', changedFilePaths, 6),
        reader.selectAdditionalFiles('security', changedFilePaths, 6),
        reader.selectAdditionalFiles('testing', changedFilePaths, 6),
        reader.selectAdditionalFiles('maintainability', changedFilePaths, 6),
      ]);

    const slices = buildContextSlices(projectContext, changeContext, {
      correctness: correctnessFiles,
      security: securityFiles,
      testing: testingFiles,
      maintainability: maintainabilityFiles,
    });

    const orchestratorResult = await this.orchestrator.run(slices);

    // --- Stage 5: Finding Validation ---
    // Build file map for validation evidence checks
    const repoFiles = await buildRepoFileMap(reader, changeContext, [
      ...correctnessFiles,
      ...securityFiles,
      ...testingFiles,
      ...maintainabilityFiles,
    ]);

    let validatedFindings: ValidatedFinding[];
    let agentStatuses = orchestratorResult.agentStatuses;

    try {
      validatedFindings = this.validator.validate(orchestratorResult.findings, repoFiles);
    } catch (err) {
      // Validation failure: include raw findings with confidence reduced to 0.5
      // and mark as uncertain (ARCHITECTURE.md §10.1)
      validatedFindings = orchestratorResult.findings.map((f) => ({
        ...f,
        confidence: Math.min(f.confidence, 0.5),
        validationStatus: 'uncertain' as const,
        validationNote: 'Validation stage failed; finding confidence reduced.',
      }));
      agentStatuses = agentStatuses.map((s) => ({
        ...s,
        error:
          s.error ??
          `Validation failed: ${(err as Error).message}`,
      }));
    }

    // --- Stages 6–8: Synthesis ---
    return this.synthesizer.synthesize(validatedFindings, agentStatuses);
  }
}

// ---------------------------------------------------------------------------
// Helper: build file map for validation
// ---------------------------------------------------------------------------

async function buildRepoFileMap(
  reader: RepositoryReader,
  changeContext: ChangeContext,
  additionalFiles: Array<{ path: string; content: string }>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // Changed files are the primary evidence source
  for (const f of changeContext.changedFiles) {
    map.set(f.path, f.fullContent);
  }

  // Additional context files (loaded for each agent)
  for (const f of additionalFiles) {
    if (!map.has(f.path)) {
      map.set(f.path, f.content);
    }
  }

  return map;
}
