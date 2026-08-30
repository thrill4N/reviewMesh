import type { Finding, ValidatedFinding } from '../domain/Finding.js';

/**
 * FindingValidator — verifies each finding against repository evidence.
 *
 * Responsibility (ARCHITECTURE.md §4.9):
 * - Confirm findings where the evidence clearly supports the claim
 * - Downgrade (uncertain) findings where evidence is weak or ambiguous
 * - Suppress (unsupported) findings where the evidence is absent or fabricated
 *
 * Boundary: evaluates existing findings only. Does not generate new findings.
 * Does not invent evidence to pass a finding.
 *
 * Validation outcomes (ARCHITECTURE.md §4.9):
 *   CONFIRMED   → keep, confidence unchanged
 *   UNCERTAIN   → keep, confidence reduced by 0.15 (min 0.5)
 *   UNSUPPORTED → suppress (excluded from synthesis)
 */
export class FindingValidator {
  /**
   * Validates all findings against the provided repository file contents.
   *
   * @param findings       - Findings collected from all agents (with IDs assigned)
   * @param repoFiles      - Map of repository-relative path → file content
   * @returns ValidatedFinding[] containing all non-suppressed findings
   */
  validate(
    findings: Finding[],
    repoFiles: Map<string, string>,
  ): ValidatedFinding[] {
    return findings.map((f) => this.validateOne(f, repoFiles));
  }

  private validateOne(
    finding: Finding,
    repoFiles: Map<string, string>,
  ): ValidatedFinding {
    // --- Check 1: the referenced file exists in the repository ---
    const fileContent = repoFiles.get(finding.file);
    if (fileContent === undefined) {
      return {
        ...finding,
        validationStatus: 'unsupported',
        validationNote: `Referenced file "${finding.file}" not found in repository context.`,
      };
    }

    // --- Check 2: evidence string appears (approximately) in the file ---
    const evidencePresent = isEvidencePresent(finding.evidence, fileContent);
    if (!evidencePresent) {
      // Downgrade rather than suppress: the file exists but the exact evidence
      // wasn't found. This may be due to diff context vs full-file differences.
      return {
        ...finding,
        validationStatus: 'uncertain',
        validationNote:
          'Evidence excerpt could not be located verbatim in the referenced file. ' +
          'Finding retained with reduced confidence.',
        confidence: Math.max(0.5, finding.confidence - 0.15),
      };
    }

    // --- Check 3: line number plausibility (if provided) ---
    if (finding.line !== null) {
      const lineCount = fileContent.split('\n').length;
      if (finding.line > lineCount) {
        return {
          ...finding,
          validationStatus: 'uncertain',
          validationNote: `Line ${finding.line} is beyond the file length (${lineCount} lines). Line reference may be approximate.`,
          confidence: Math.max(0.5, finding.confidence - 0.1),
        };
      }
    }

    // All checks passed
    return {
      ...finding,
      validationStatus: 'confirmed',
      validationNote: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Evidence matching
// ---------------------------------------------------------------------------

/**
 * Returns true if the evidence string (or a meaningful normalized portion of it)
 * can be found in the file content.
 *
 * Normalization: collapse whitespace and compare trimmed sub-strings to handle
 * minor formatting differences between the LLM's excerpt and the actual file.
 */
function isEvidencePresent(evidence: string, fileContent: string): boolean {
  if (evidence.trim() === '') return false;

  // First try exact substring match
  if (fileContent.includes(evidence.trim())) return true;

  // Normalize whitespace for a fuzzy match
  const normalizedEvidence = normalizeWhitespace(evidence);
  const normalizedFile = normalizeWhitespace(fileContent);

  if (normalizedFile.includes(normalizedEvidence)) return true;

  // Try matching the longest single line of the evidence (handles multi-line excerpts)
  const longestLine = evidence
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 10)
    .sort((a, b) => b.length - a.length)[0];

  if (longestLine !== undefined && fileContent.includes(longestLine)) return true;

  return false;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
