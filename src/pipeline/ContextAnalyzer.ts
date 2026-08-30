import type { ProjectContext } from '../domain/ProjectContext.js';
import type { RepositoryReader } from '../infrastructure/RepositoryReader.js';

/**
 * ContextAnalyzer — Stage 1 of the review pipeline.
 *
 * Responsibility (ARCHITECTURE.md §4.2):
 * Build a compact ProjectContext from repository artifacts (README, package.json,
 * tsconfig, directory structure, etc.).
 *
 * Boundary: reads only. Does not analyze the diff. Does not make quality judgments.
 */
export class ContextAnalyzer {
  private readonly reader: RepositoryReader;

  constructor(reader: RepositoryReader) {
    this.reader = reader;
  }

  /**
   * Builds a ProjectContext by inspecting the repository root.
   */
  async analyze(): Promise<ProjectContext> {
    const [readme, packageJson, tsconfigJson] = await Promise.all([
      this.reader.readFile('README.md'),
      this.reader.readFile('package.json'),
      this.reader.readFile('tsconfig.json'),
    ]);

    const pkg = safeParseJson(packageJson);

    // Discover top-level source files for context slicing
    const relevantFiles = await this.reader.findFiles(['.ts', '.js'], 50);

    return {
      projectPurpose: extractPurpose(readme, pkg),
      architecture: inferArchitecture(relevantFiles, pkg),
      language: inferLanguage(tsconfigJson, pkg, relevantFiles),
      framework: inferFramework(pkg),
      relevantFiles: relevantFiles.slice(0, 30),
      testStrategy: inferTestStrategy(pkg, relevantFiles),
      securitySensitiveAreas: findSecurityAreas(relevantFiles),
      conventions: inferConventions(relevantFiles, pkg),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractPurpose(readme: string | null, pkg: Record<string, unknown>): string {
  // Try package.json description first
  if (typeof pkg.description === 'string' && pkg.description.trim()) {
    return pkg.description.trim();
  }
  // First non-heading paragraph of README
  if (readme) {
    const lines = readme.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    if (lines.length > 0) return lines[0].trim().slice(0, 300);
  }
  if (typeof pkg.name === 'string') return `${pkg.name} application`;
  return 'Purpose not determinable from repository artifacts.';
}

function inferArchitecture(files: string[], _pkg: Record<string, unknown>): string {
  const hasSrc = files.some((f) => f.startsWith('src/'));
  const hasDomain = files.some((f) => f.includes('domain/'));
  const hasPipeline = files.some((f) => f.includes('pipeline/'));
  const hasAgents = files.some((f) => f.includes('agents/'));
  const hasApi = files.some((f) => f.includes('api/') || f.includes('routes/'));
  const hasController = files.some((f) =>
    f.toLowerCase().includes('controller'),
  );

  const parts: string[] = [];
  if (hasDomain && hasPipeline && hasAgents) {
    parts.push('multi-agent pipeline with domain-driven design');
  } else if (hasDomain) {
    parts.push('domain-driven design');
  }
  if (hasApi || hasController) parts.push('REST API');
  if (hasSrc) parts.push('modular monolith');

  return parts.length > 0 ? parts.join(', ') : 'standard Node.js application';
}

function inferLanguage(
  tsconfig: string | null,
  pkg: Record<string, unknown>,
  files: string[],
): string {
  if (tsconfig) return 'TypeScript';
  const deps = {
    ...(pkg.dependencies as Record<string, unknown> | undefined),
    ...(pkg.devDependencies as Record<string, unknown> | undefined),
  };
  if ('typescript' in deps) return 'TypeScript';
  if (files.some((f) => f.endsWith('.ts'))) return 'TypeScript';
  return 'JavaScript';
}

function inferFramework(pkg: Record<string, unknown>): string | null {
  const deps = {
    ...(pkg.dependencies as Record<string, unknown> | undefined),
    ...(pkg.devDependencies as Record<string, unknown> | undefined),
  };
  if ('express' in deps) return 'Express';
  if ('fastify' in deps) return 'Fastify';
  if ('koa' in deps) return 'Koa';
  if ('next' in deps) return 'Next.js';
  if ('nestjs' in deps || '@nestjs/core' in deps) return 'NestJS';
  return null;
}

function inferTestStrategy(pkg: Record<string, unknown>, files: string[]): string {
  const deps = {
    ...(pkg.dependencies as Record<string, unknown> | undefined),
    ...(pkg.devDependencies as Record<string, unknown> | undefined),
  };
  const hasTests = files.some(
    (f) => f.includes('.test.') || f.includes('.spec.') || f.includes('/tests/'),
  );
  if (!hasTests) return 'No test files identified in repository.';

  if ('vitest' in deps) return 'Vitest unit tests';
  if ('jest' in deps) return 'Jest unit tests';
  if ('mocha' in deps) return 'Mocha unit tests';
  return 'Unit tests present (runner not identified)';
}

function findSecurityAreas(files: string[]): string[] {
  const keywords = ['auth', 'middleware', 'guard', 'permission', 'token', 'secret', 'crypto'];
  const areas = new Set<string>();
  for (const f of files) {
    const lower = f.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        // Record the directory, not the file
        const dir = f.split('/').slice(0, -1).join('/');
        areas.add(dir || f);
        break;
      }
    }
  }
  return [...areas];
}

function inferConventions(files: string[], pkg: Record<string, unknown>): string {
  const parts: string[] = [];
  if (files.some((f) => f.endsWith('.ts'))) {
    parts.push('TypeScript with strict typing');
  }
  const deps = {
    ...(pkg.dependencies as Record<string, unknown> | undefined),
    ...(pkg.devDependencies as Record<string, unknown> | undefined),
  };
  if ('eslint' in deps) parts.push('ESLint enforced');
  if ('prettier' in deps) parts.push('Prettier formatted');

  const hasDomain = files.some((f) => f.includes('domain/'));
  if (hasDomain) parts.push('domain interfaces in src/domain/');

  return parts.length > 0 ? parts.join('; ') : 'No specific conventions identified.';
}
