import type { ReviewResult } from '../domain/ReviewResult.js';
import type { ValidatedFinding } from '../domain/Finding.js';

/**
 * ReviewPresenter — formats a ReviewResult for terminal display.
 *
 * Responsibility (ARCHITECTURE.md §4, ui/ layer):
 * Produce a clear, readable terminal output for the developer.
 * No business logic here — presentation only.
 *
 * Boundary: must not modify ReviewResult content. Read-only access to findings.
 */
export class ReviewPresenter {
  /**
   * Renders a ReviewResult as a plain-text string for terminal output.
   */
  format(result: ReviewResult): string {
    const lines: string[] = [];

    lines.push(DIVIDER);
    lines.push('  REVIEWMESH — CODE REVIEW REPORT');
    lines.push(DIVIDER);
    lines.push('');

    // Status banner
    lines.push(`  Status:       ${formatStatus(result.status)}`);
    lines.push(`  Generated at: ${result.generatedAt}`);
    if (result.partialReview) {
      lines.push(`  ⚠  PARTIAL REVIEW: ${result.partialReviewNote ?? ''}`);
    }
    lines.push('');
    lines.push(`  ${result.summary}`);
    lines.push('');

    // Agent status table
    lines.push(THIN_DIVIDER);
    lines.push('  AGENT SUMMARY');
    lines.push(THIN_DIVIDER);
    for (const a of result.agentStatuses) {
      const icon = a.status === 'success' ? '✓' : '✗';
      const count = a.status === 'success' ? `${a.findingCount} finding${a.findingCount === 1 ? '' : 's'}` : `failed: ${a.error ?? 'unknown'}`;
      lines.push(`  ${icon}  ${capitalize(a.agent).padEnd(16)} ${count}`);
    }
    lines.push('');

    // Findings
    if (result.findings.length === 0) {
      lines.push(THIN_DIVIDER);
      lines.push('  No findings to display.');
      lines.push(THIN_DIVIDER);
    } else {
      lines.push(THIN_DIVIDER);
      lines.push(`  FINDINGS  (${result.findings.length} total)`);
      lines.push(THIN_DIVIDER);
      lines.push('');

      for (let i = 0; i < result.findings.length; i++) {
        lines.push(...formatFinding(result.findings[i], i + 1));
        lines.push('');
      }
    }

    lines.push(DIVIDER);
    lines.push('  ReviewMesh — evidence-backed multi-agent code review');
    lines.push(DIVIDER);

    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Finding formatter
// ---------------------------------------------------------------------------

function formatFinding(f: ValidatedFinding, index: number): string[] {
  const lines: string[] = [];
  const severityLabel = formatSeverity(f.severity);
  const statusLabel = f.validationStatus === 'uncertain' ? ' [uncertain]' : '';

  lines.push(
    `  [${index}] ${severityLabel}  ${f.category.toUpperCase()}${statusLabel}`,
  );
  lines.push(`      ${f.title}`);
  lines.push('');
  lines.push(
    `      File:       ${f.file}${f.line !== null ? `:${f.line}` : ''}`,
  );
  if (f.location) {
    lines.push(`      Location:   ${f.location}`);
  }
  lines.push(`      Confidence: ${Math.round(f.confidence * 100)}%`);
  lines.push('');
  lines.push(`      Evidence:`);
  lines.push(indent(f.evidence, 8));
  lines.push('');
  lines.push(`      Why it matters:`);
  lines.push(indent(f.explanation, 8));
  lines.push('');
  lines.push(`      Impact:`);
  lines.push(indent(f.impact, 8));
  lines.push('');
  lines.push(`      Recommendation:`);
  lines.push(indent(f.recommendation, 8));
  if (f.validationNote) {
    lines.push('');
    lines.push(`      Note: ${f.validationNote}`);
  }
  lines.push(`      ${THIN_DIVIDER_SHORT}`);

  return lines;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const DIVIDER = '═'.repeat(72);
const THIN_DIVIDER = '─'.repeat(72);
const THIN_DIVIDER_SHORT = '─'.repeat(60);

function formatStatus(status: ReviewResult['status']): string {
  switch (status) {
    case 'approved':         return '✓  APPROVED — No blocking issues found';
    case 'changes_required': return '✗  CHANGES REQUIRED — Critical or high severity issues found';
    case 'needs_review':     return '⚠  NEEDS REVIEW — Medium severity issues found';
  }
}

function formatSeverity(severity: ValidatedFinding['severity']): string {
  switch (severity) {
    case 'critical': return '[CRITICAL]';
    case 'high':     return '[HIGH]    ';
    case 'medium':   return '[MEDIUM]  ';
    case 'low':      return '[LOW]     ';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((l) => `${pad}${l}`)
    .join('\n');
}
