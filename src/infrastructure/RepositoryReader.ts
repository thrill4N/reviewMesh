import { readFile, readdir } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import type { ChangedFile } from '../domain/ChangeContext.js';
import type { FileContent } from '../domain/AgentContext.js';

/**
 * RepositoryReader — controlled, read-only access to repository files.
 *
 * Responsibilities (ARCHITECTURE.md §4.11):
 * - Read file contents from the repository path
 * - Parse unified Git diffs into structured ChangedFile records
 * - Select context-relevant files per agent role
 *
 * Security boundary:
 * - Read-only; never writes to or executes repository content
 * - All file content is treated as data (ARCHITECTURE.md §11.1)
 * - Paths are sanitized to prevent traversal outside the repository root
 */
export class RepositoryReader {
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  // ---------------------------------------------------------------------------
  // File reading
  // ---------------------------------------------------------------------------

  /**
   * Reads the content of a repository-relative file path.
   * Returns null if the file does not exist or cannot be read.
   */
  async readFile(repoRelativePath: string): Promise<string | null> {
    const safePath = this.resolveSafe(repoRelativePath);
    if (safePath === null) return null;

    try {
      return await readFile(safePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Reads multiple files, skipping those that do not exist.
   */
  async readFiles(paths: string[]): Promise<FileContent[]> {
    const results: FileContent[] = [];
    for (const p of paths) {
      const content = await this.readFile(p);
      if (content !== null) {
        results.push({ path: p, content });
      }
    }
    return results;
  }

  /**
   * Returns all files in the repository matching the given extensions.
   * Depth-first traversal; skips node_modules, .git, and hidden directories.
   *
   * @param extensions - e.g. ['.ts', '.js']
   * @param maxFiles   - safety cap; defaults to 200
   */
  async findFiles(extensions: string[], maxFiles = 200): Promise<string[]> {
    const results: string[] = [];
    await this.walkDir(this.repoRoot, extensions, results, maxFiles);
    return results;
  }

  private async walkDir(
    dir: string,
    extensions: string[],
    results: string[],
    maxFiles: number,
  ): Promise<void> {
    if (results.length >= maxFiles) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDir(fullPath, extensions, results, maxFiles);
      } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
        results.push(relative(this.repoRoot, fullPath).replace(/\\/g, '/'));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Diff parsing
  // ---------------------------------------------------------------------------

  /**
   * Parses a unified diff string into a list of ChangedFile records.
   * Reads the current full file content for each changed file from disk.
   *
   * Each section starting with `diff --git` or `--- a/` begins a new file block.
   */
  async parseChangedFiles(diffText: string): Promise<ChangedFile[]> {
    const fileDiffs = splitDiffByFile(diffText);
    const result: ChangedFile[] = [];

    for (const { path, diff } of fileDiffs) {
      const fullContent = (await this.readFile(path)) ?? '';
      result.push({ path, diff, fullContent });
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Context-aware file selection
  // ---------------------------------------------------------------------------

  /**
   * Selects additional context files for a given agent role.
   * Respects the Tier 3 selection rules from ARCHITECTURE.md §6.2 and §8.2.
   */
  async selectAdditionalFiles(
    agentRole: 'correctness' | 'security' | 'testing' | 'maintainability',
    changedFilePaths: string[],
    maxFiles = 8,
  ): Promise<FileContent[]> {
    const allTs = await this.findFiles(['.ts', '.js'], 200);

    let candidates: string[] = [];

    switch (agentRole) {
      case 'security':
        candidates = allTs.filter((f) => isSecurityRelevant(f));
        break;
      case 'testing':
        candidates = allTs.filter((f) => isTestFile(f));
        break;
      case 'correctness':
        candidates = allTs.filter(
          (f) => !isTestFile(f) && !changedFilePaths.includes(f) && isSourceFile(f),
        );
        break;
      case 'maintainability':
        candidates = allTs.filter(
          (f) =>
            !isTestFile(f) &&
            !changedFilePaths.includes(f) &&
            isSiblingOrInterface(f, changedFilePaths),
        );
        break;
    }

    // Prefer files closest in directory to the changed files
    const scored = candidates
      .map((f) => ({ path: f, score: proximityScore(f, changedFilePaths) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxFiles)
      .map((x) => x.path);

    return this.readFiles(scored);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves a repository-relative path to an absolute path, rejecting traversal.
   * Returns null for unsafe paths.
   */
  private resolveSafe(repoRelativePath: string): string | null {
    // Normalize separators and reject obvious traversal attempts
    const normalized = repoRelativePath.replace(/\\/g, '/');
    if (normalized.includes('..')) return null;

    const absolute = join(this.repoRoot, normalized);
    // Double-check the resolved path is still under repoRoot
    if (!absolute.startsWith(this.repoRoot)) return null;

    return absolute;
  }
}

// ---------------------------------------------------------------------------
// Diff splitting
// ---------------------------------------------------------------------------

interface FileDiff {
  path: string;
  diff: string;
}

/**
 * Splits a unified diff string into per-file chunks.
 * Handles both `diff --git a/foo b/foo` and `--- a/foo` header styles.
 */
function splitDiffByFile(diffText: string): FileDiff[] {
  const lines = diffText.split('\n');
  const results: FileDiff[] = [];

  let currentPath: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentPath !== null && currentLines.length > 0) {
      results.push({ path: currentPath, diff: currentLines.join('\n') });
    }
  };

  for (const line of lines) {
    // `diff --git a/src/foo.ts b/src/foo.ts`
    if (line.startsWith('diff --git ')) {
      flush();
      const match = line.match(/diff --git a\/.+ b\/(.+)/);
      currentPath = match ? match[1] : null;
      currentLines = [line];
      continue;
    }

    // Fallback: `--- a/src/foo.ts`
    if (line.startsWith('--- a/') && currentPath === null) {
      flush();
      currentPath = line.slice('--- a/'.length).trim();
      currentLines = [line];
      continue;
    }

    if (currentPath !== null) {
      currentLines.push(line);
    }
  }

  flush();
  return results;
}

// ---------------------------------------------------------------------------
// File classification helpers
// ---------------------------------------------------------------------------

function isTestFile(path: string): boolean {
  return (
    path.includes('/tests/') ||
    path.includes('/test/') ||
    path.includes('/__tests__/') ||
    path.includes('.test.') ||
    path.includes('.spec.')
  );
}

function isSecurityRelevant(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('auth') ||
    lower.includes('middleware') ||
    lower.includes('guard') ||
    lower.includes('permission') ||
    lower.includes('role') ||
    lower.includes('token') ||
    lower.includes('config') ||
    lower.includes('validation') ||
    lower.includes('sanitize') ||
    lower.includes('secret') ||
    lower.includes('env')
  );
}

function isSourceFile(path: string): boolean {
  return !isTestFile(path) && (path.endsWith('.ts') || path.endsWith('.js'));
}

function isSiblingOrInterface(path: string, changedPaths: string[]): boolean {
  const changedDirs = new Set(
    changedPaths.map((p) => p.split('/').slice(0, -1).join('/')),
  );
  const dir = path.split('/').slice(0, -1).join('/');
  return changedDirs.has(dir) || path.includes('domain/') || path.includes('interface');
}

function proximityScore(candidate: string, changedPaths: string[]): number {
  const candidateParts = candidate.split('/');
  let best = 0;
  for (const changed of changedPaths) {
    const changedParts = changed.split('/');
    let shared = 0;
    for (let i = 0; i < Math.min(candidateParts.length, changedParts.length); i++) {
      if (candidateParts[i] === changedParts[i]) shared++;
      else break;
    }
    if (shared > best) best = shared;
  }
  return best;
}
