import { describe, it, expect } from 'vitest';
import { FindingValidator } from '../../src/validation/FindingValidator.js';
import type { Finding } from '../../src/domain/Finding.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const FILE_CONTENT = `
async cancelOrder(orderId: string): Promise<void> {
  const order = await this.db.findById(orderId);
  if (!order) throw new Error('Order ' + orderId + ' not found');
  if (order.status === 'shipped') throw new Error('Cannot cancel a shipped order');
  order.status = 'cancelled';
  await this.db.save(order);
}
`;

// Evidence string that exactly matches a substring of FILE_CONTENT above
const EVIDENCE = "order.status = 'cancelled';";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test-uuid-1',
    title: 'Missing authorization check',
    category: 'security',
    severity: 'high',
    confidence: 0.9,
    file: 'src/OrderService.ts',
    line: null,  // null to avoid spurious line-range uncertainty in tests
    location: 'OrderService.cancelOrder()',
    evidence: EVIDENCE,
    explanation: 'No ownership check before cancellation.',
    impact: 'Any user can cancel any order.',
    recommendation: 'Verify order.userId === requestingUserId before proceeding.',
    sourceAgent: 'security',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FindingValidator', () => {
  const validator = new FindingValidator();

  describe('confirmed findings', () => {
    it('confirms a finding when file exists and evidence is present', () => {
      const repoFiles = new Map([['src/OrderService.ts', FILE_CONTENT]]);
      const findings = [makeFinding()];
      const results = validator.validate(findings, repoFiles);

      expect(results).toHaveLength(1);
      expect(results[0].validationStatus).toBe('confirmed');
      expect(results[0].validationNote).toBeNull();
    });

    it('preserves confidence for confirmed findings', () => {
      const repoFiles = new Map([['src/OrderService.ts', FILE_CONTENT]]);
      const results = validator.validate([makeFinding({ confidence: 0.85 })], repoFiles);
      expect(results[0].confidence).toBe(0.85);
    });
  });

  describe('unsupported findings', () => {
    it('marks a finding unsupported when the file does not exist in repo', () => {
      const repoFiles = new Map<string, string>(); // empty
      const results = validator.validate([makeFinding()], repoFiles);

      expect(results[0].validationStatus).toBe('unsupported');
      expect(results[0].validationNote).toContain('not found in repository context');
    });

    it('includes the missing file name in the note', () => {
      const results = validator.validate(
        [makeFinding({ file: 'src/ghost/NonExistent.ts' })],
        new Map(),
      );
      expect(results[0].validationNote).toContain('src/ghost/NonExistent.ts');
    });
  });

  describe('uncertain findings', () => {
    it('marks uncertain when evidence is absent from the file', () => {
      const repoFiles = new Map([['src/OrderService.ts', 'completely different content here']]);
      const results = validator.validate([makeFinding()], repoFiles);

      expect(results[0].validationStatus).toBe('uncertain');
      expect(results[0].confidence).toBeLessThan(0.9);
    });

    it('reduces confidence by 0.15 for uncertain findings', () => {
      const repoFiles = new Map([['src/OrderService.ts', 'completely different content here']]);
      const results = validator.validate([makeFinding({ confidence: 0.9 })], repoFiles);
      expect(results[0].confidence).toBeCloseTo(0.75, 5);
    });

    it('does not reduce confidence below 0.5 for uncertain findings', () => {
      const repoFiles = new Map([['src/OrderService.ts', 'completely different content here']]);
      const results = validator.validate([makeFinding({ confidence: 0.55 })], repoFiles);
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('marks uncertain when line number exceeds file length', () => {
      const shortFile = 'line 1\nline 2\nline 3';
      const repoFiles = new Map([
        ['src/OrderService.ts', `${shortFile}\n${FILE_CONTENT}`],
      ]);
      // FILE_CONTENT has ~9 lines, shortFile prepended has ~12 total.
      // Line 999 is clearly beyond file length.
      const results = validator.validate([makeFinding({ line: 999 })], repoFiles);
      expect(results[0].validationStatus).toBe('uncertain');
    });
  });

  describe('batch validation', () => {
    it('validates multiple findings independently', () => {
      const repoFiles = new Map([['src/OrderService.ts', FILE_CONTENT]]);
      const findings: Finding[] = [
        makeFinding({ id: 'a', confidence: 0.9 }),
        makeFinding({ id: 'b', file: 'src/Missing.ts', confidence: 0.8 }),
      ];
      const results = validator.validate(findings, repoFiles);

      expect(results).toHaveLength(2);
      expect(results[0].validationStatus).toBe('confirmed');
      expect(results[1].validationStatus).toBe('unsupported');
    });

    it('returns an empty array for empty input', () => {
      const results = validator.validate([], new Map());
      expect(results).toHaveLength(0);
    });
  });

  describe('evidence matching', () => {
    it('matches evidence with normalized whitespace', () => {
      // Extra spaces around the equals sign — normalized match should find it
      const contentWithExtraSpaces = "order.status   =   'cancelled';";
      const repoFiles = new Map([['src/OrderService.ts', contentWithExtraSpaces]]);
      const results = validator.validate(
        [makeFinding({ evidence: EVIDENCE })],
        repoFiles,
      );
      // Normalized match should find it
      expect(results[0].validationStatus).toBe('confirmed');
    });

    it('matches using the longest line of multi-line evidence', () => {
      const fileContent = "order.status = 'cancelled';\nawait this.db.save(order);";
      const repoFiles = new Map([['src/OrderService.ts', fileContent]]);
      const multiLineEvidence = "order.status = 'cancelled';\nawait this.db.save(order);";
      const results = validator.validate(
        [makeFinding({ evidence: multiLineEvidence })],
        repoFiles,
      );
      expect(results[0].validationStatus).toBe('confirmed');
    });
  });
});
