import type { ProjectContext } from '../domain/ProjectContext.js';
import type { ChangeContext, ChangedFile } from '../domain/ChangeContext.js';
import type { RepositoryReader } from '../infrastructure/RepositoryReader.js';

/**
 * ChangeAnalyzer — Stage 2 of the review pipeline.
 *
 * Responsibility (ARCHITECTURE.md §4.3):
 * Produce a ChangeContext that summarizes what the diff does: which files changed,
 * what behavior was introduced, and which areas carry risk.
 *
 * Boundary: parses diff, reads changed files, identifies affected areas.
 * Does not make quality judgments (that is the agents' job).
 */
export class ChangeAnalyzer {
  private readonly reader: RepositoryReader;

  constructor(reader: RepositoryReader) {
    this.reader = reader;
  }

  /**
   * Builds a ChangeContext from a unified diff string and the project context.
   *
   * @param diffText       - Standard unified diff (output of `git diff`)
   * @param projectContext - Previously built ProjectContext (Stage 1 output)
   */
  async analyze(diffText: string, projectContext: ProjectContext): Promise<ChangeContext> {
    const changedFiles = await this.reader.parseChangedFiles(diffText);

    const affectedAreas = deriveAffectedAreas(changedFiles, projectContext);
    const potentialRiskAreas = derivePotentialRiskAreas(changedFiles, projectContext);
    const summary = buildSummary(changedFiles);
    const newBehavior = describeNewBehavior(changedFiles);

    return {
      summary,
      changedFiles,
      affectedAreas,
      potentialRiskAreas,
      newBehavior,
    };
  }
}

// ---------------------------------------------------------------------------
// Summary and description builders
// ---------------------------------------------------------------------------

function buildSummary(changedFiles: ChangedFile[]): string {
  if (changedFiles.length === 0) return 'No files changed.';
  if (changedFiles.length === 1) {
    return `Modified ${changedFiles[0].path}.`;
  }
  return `Modified ${changedFiles.length} files: ${changedFiles.map((f) => f.path).join(', ')}.`;
}

function describeNewBehavior(changedFiles: ChangedFile[]): string {
  const addedLines = changedFiles.flatMap((f) =>
    f.diff
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1).trim()),
  );

  if (addedLines.length === 0) return 'Lines removed only; no new code introduced.';

  // Extract function/class signatures and notable patterns from added lines
  const signatures = addedLines
    .filter(
      (l) =>
        /^\s*(export\s+)?(async\s+)?function\s+\w+/.test(l) ||
        /^\s*(export\s+)?(abstract\s+)?class\s+\w+/.test(l) ||
        /^\s*(public|private|protected|async)\s+\w+\s*\(/.test(l),
    )
    .slice(0, 5);

  if (signatures.length > 0) {
    return `Introduces or modifies: ${signatures.join('; ')}`;
  }

  return `${addedLines.length} line${addedLines.length === 1 ? '' : 's'} added across ${changedFiles.length} file${changedFiles.length === 1 ? '' : 's'}.`;
}

// ---------------------------------------------------------------------------
// Area classification
// ---------------------------------------------------------------------------

const AREA_PATTERNS: Array<{ pattern: RegExp; area: string }> = [
  { pattern: /auth|login|logout|session|token|jwt|oauth/i, area: 'authentication' },
  { pattern: /permission|role|guard|authorize|access/i, area: 'authorization' },
  { pattern: /database|db|sql|query|repository|entity|model/i, area: 'database' },
  { pattern: /route|controller|handler|endpoint|api/i, area: 'API routes' },
  { pattern: /middleware|interceptor|filter/i, area: 'middleware' },
  { pattern: /config|env|settings|secrets/i, area: 'configuration' },
  { pattern: /validation|validate|sanitize|schema/i, area: 'input validation' },
  { pattern: /test|spec/i, area: 'tests' },
  { pattern: /pipeline|workflow|stage|orchestrat/i, area: 'pipeline orchestration' },
  { pattern: /agent|llm|ai|prompt/i, area: 'AI agent layer' },
];

function deriveAffectedAreas(
  changedFiles: ChangedFile[],
  _projectContext: ProjectContext,
): string[] {
  const areas = new Set<string>();
  for (const file of changedFiles) {
    for (const { pattern, area } of AREA_PATTERNS) {
      if (pattern.test(file.path) || pattern.test(file.diff)) {
        areas.add(area);
      }
    }
  }
  if (areas.size === 0) areas.add('source code');
  return [...areas];
}

const RISK_PATTERNS: Array<{ pattern: RegExp; risk: string }> = [
  { pattern: /auth|login|session|token|jwt|oauth/i, risk: 'authentication logic' },
  { pattern: /permission|role|guard|authorize/i, risk: 'authorization logic' },
  { pattern: /sql|query|exec|eval/i, risk: 'injection risk' },
  { pattern: /readFile|writeFile|unlink|exec|spawn/i, risk: 'file system / process execution' },
  { pattern: /password|secret|key|credential/i, risk: 'credential handling' },
  { pattern: /http|fetch|axios|request/i, risk: 'outbound HTTP / SSRF' },
  { pattern: /deserializ|JSON\.parse|eval/i, risk: 'deserialization' },
  { pattern: /catch\s*\(|try\s*{/i, risk: 'error handling' },
];

function derivePotentialRiskAreas(
  changedFiles: ChangedFile[],
  projectContext: ProjectContext,
): string[] {
  const risks = new Set<string>();
  for (const file of changedFiles) {
    // Also scan full content for risk patterns
    const haystack = `${file.path}\n${file.diff}\n${file.fullContent}`;
    for (const { pattern, risk } of RISK_PATTERNS) {
      if (pattern.test(haystack)) {
        risks.add(risk);
      }
    }
  }

  // Add areas the project itself identified as security-sensitive
  for (const area of projectContext.securitySensitiveAreas) {
    for (const file of changedFiles) {
      if (file.path.includes(area)) {
        risks.add(`security-sensitive area: ${area}`);
      }
    }
  }

  return [...risks];
}
