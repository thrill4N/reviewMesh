import { describe, it, expect } from 'vitest';
import { ReviewSynthesizer } from '../../src/synthesis/ReviewSynthesizer.js';
import type { ValidatedFinding } from '../../src/domain/Finding.js';
import type { AgentStatus } from '../../src/domain/ReviewResult.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
function makeValidatedFinding(overrides: Partial<ValidatedFinding> = {}): ValidatedFinding {
  _idCounter++;
  return {
    id: `finding-${_idCounter}`,
    title: 'Test finding',
    category: 'security',
    severity: 'medium',
    confidence: 0.8,
    file: 'src/Foo.ts',
    line: 10,
    location: 'Foo.bar()',
    evidence: 'const x = input;',
    explanation: 'Explanation',
    impact: 'Impact',
    recommendation: 'Fix it',
    sourceAgent: 'security',
    validationStatus: 'confirmed',
    validationNote: null,
    ...overrides,
  };
}

function makeAgentStatus(agent: string, status: 'success' | 'failed' = 'success'): AgentStatus {
  return {
    agent,
    status,
    findingCount: status === 'success' ? 1 : 0,
    error: status === 'failed' ? 'timeout' : null,
  };
}

const ALL_SUCCESS_STATUSES: AgentStatus[] = [
  makeAgentStatus('correctness'),
  makeAgentStatus('security'),
  makeAgentStatus('testing'),
  makeAgentStatus('maintainability'),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReviewSynthesizer', () => {
  const synthesizer = new ReviewSynthesizer();

  describe('status derivation', () => {
    it('returns "approved" when there are no findings', () => {
      const result = synthesizer.synthesize([], ALL_SUCCESS_STATUSES);
      expect(result.status).toBe('approved');
    });

    it('returns "changes_required" when there is a critical finding', () => {
      const result = synthesizer.synthesize(
        [makeValidatedFinding({ severity: 'critical' })],
        ALL_SUCCESS_STATUSES,
      );
      expect(result.status).toBe('changes_required');
    });

    it('returns "changes_required" when there is a high finding', () => {
      const result = synthesizer.synthesize(
        [makeValidatedFinding({ severity: 'high' })],
        ALL_SUCCESS_STATUSES,
      );
      expect(result.status).toBe('changes_required');
    });

    it('returns "needs_review" when findings are medium only', () => {
      const result = synthesizer.synthesize(
        [makeValidatedFinding({ severity: 'medium' })],
        ALL_SUCCESS_STATUSES,
      );
      expect(result.status).toBe('needs_review');
    });

    it('returns "approved" when findings are low only', () => {
      const result = synthesizer.synthesize(
        [makeValidatedFinding({ severity: 'low' })],
        ALL_SUCCESS_STATUSES,
      );
      expect(result.status).toBe('approved');
    });
  });

  describe('unsupported finding exclusion', () => {
    it('excludes unsupported findings from the final result', () => {
      const findings: ValidatedFinding[] = [
        makeValidatedFinding({ validationStatus: 'confirmed', severity: 'high' }),
        makeValidatedFinding({ validationStatus: 'unsupported', severity: 'critical' }),
      ];
      const result = synthesizer.synthesize(findings, ALL_SUCCESS_STATUSES);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].validationStatus).toBe('confirmed');
    });

    it('returns approved with no findings when all are unsupported', () => {
      const findings = [makeValidatedFinding({ validationStatus: 'unsupported' })];
      const result = synthesizer.synthesize(findings, ALL_SUCCESS_STATUSES);
      expect(result.status).toBe('approved');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('priority sorting', () => {
    it('sorts critical before high before medium before low', () => {
      const findings: ValidatedFinding[] = [
        makeValidatedFinding({ title: 'Low severity issue',      severity: 'low',      file: 'src/A.ts', location: 'A.low()' }),
        makeValidatedFinding({ title: 'Critical severity issue', severity: 'critical', file: 'src/B.ts', location: 'B.critical()' }),
        makeValidatedFinding({ title: 'Medium severity issue',   severity: 'medium',   file: 'src/C.ts', location: 'C.medium()' }),
        makeValidatedFinding({ title: 'High severity issue',     severity: 'high',     file: 'src/D.ts', location: 'D.high()' }),
      ];
      const result = synthesizer.synthesize(findings, ALL_SUCCESS_STATUSES);
      const severities = result.findings.map((f) => f.severity);
      expect(severities).toEqual(['critical', 'high', 'medium', 'low']);
    });

    it('sorts by confidence descending within the same severity', () => {
      const findings: ValidatedFinding[] = [
        makeValidatedFinding({ title: 'High confidence issue', severity: 'high', confidence: 0.7,  file: 'src/E.ts', location: 'E.low()' }),
        makeValidatedFinding({ title: 'Low confidence issue',  severity: 'high', confidence: 0.95, file: 'src/F.ts', location: 'F.high()' }),
      ];
      const result = synthesizer.synthesize(findings, ALL_SUCCESS_STATUSES);
      expect(result.findings[0].confidence).toBeGreaterThan(result.findings[1].confidence);
    });
  });

  describe('deduplication', () => {
    it('removes a near-duplicate finding with the same file, category, and location', () => {
      const findings: ValidatedFinding[] = [
        makeValidatedFinding({ file: 'src/Foo.ts', category: 'security', location: 'Foo.bar()' }),
        makeValidatedFinding({ file: 'src/Foo.ts', category: 'security', location: 'Foo.bar()' }),
      ];
      const result = synthesizer.synthesize(findings, ALL_SUCCESS_STATUSES);
      expect(result.findings).toHaveLength(1);
    });

    it('removes a near-duplicate with highly similar titles', () => {
      const findings: ValidatedFinding[] = [
        makeValidatedFinding({
          file: 'src/Foo.ts',
          category: 'correctness',
          location: null,
          title: 'Missing null check in processOrder',
        }),
        makeValidatedFinding({
          file: 'src/Foo.ts',
          category: 'correctness',
          location: null,
          title: 'Missing null check in processOrder method',
        }),
      ];
      const result = synthesizer.synthesize(findings, ALL_SUCCESS_STATUSES);
      expect(result.findings).toHaveLength(1);
    });

    it('keeps findings from different files', () => {
      const findings: ValidatedFinding[] = [
        makeValidatedFinding({ file: 'src/Foo.ts', location: 'Foo.bar()' }),
        makeValidatedFinding({ file: 'src/Bar.ts', location: 'Bar.baz()' }),
      ];
      const result = synthesizer.synthesize(findings, ALL_SUCCESS_STATUSES);
      expect(result.findings).toHaveLength(2);
    });

    it('keeps findings from different categories even with same location', () => {
      const findings: ValidatedFinding[] = [
        makeValidatedFinding({ category: 'security', location: 'Foo.bar()' }),
        makeValidatedFinding({ category: 'correctness', location: 'Foo.bar()' }),
      ];
      const result = synthesizer.synthesize(findings, ALL_SUCCESS_STATUSES);
      expect(result.findings).toHaveLength(2);
    });
  });

  describe('partial review handling', () => {
    it('sets partialReview=false when all agents succeed', () => {
      const result = synthesizer.synthesize([], ALL_SUCCESS_STATUSES);
      expect(result.partialReview).toBe(false);
      expect(result.partialReviewNote).toBeNull();
    });

    it('sets partialReview=true when an agent fails', () => {
      const statuses: AgentStatus[] = [
        makeAgentStatus('correctness', 'success'),
        makeAgentStatus('security', 'failed'),
        makeAgentStatus('testing', 'success'),
        makeAgentStatus('maintainability', 'success'),
      ];
      const result = synthesizer.synthesize([], statuses);
      expect(result.partialReview).toBe(true);
      expect(result.partialReviewNote).toContain('Security');
    });

    it('lists all failed agents in the partial note', () => {
      const statuses: AgentStatus[] = [
        makeAgentStatus('correctness', 'failed'),
        makeAgentStatus('security', 'failed'),
        makeAgentStatus('testing', 'success'),
        makeAgentStatus('maintainability', 'success'),
      ];
      const result = synthesizer.synthesize([], statuses);
      expect(result.partialReviewNote).toContain('Correctness');
      expect(result.partialReviewNote).toContain('Security');
    });
  });

  describe('metadata', () => {
    it('includes generatedAt as a valid ISO 8601 timestamp', () => {
      const result = synthesizer.synthesize([], ALL_SUCCESS_STATUSES);
      expect(() => new Date(result.generatedAt)).not.toThrow();
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes all agentStatuses in the result', () => {
      const result = synthesizer.synthesize([], ALL_SUCCESS_STATUSES);
      expect(result.agentStatuses).toHaveLength(4);
    });

    it('produces a summary with finding count breakdown', () => {
      const findings = [
        makeValidatedFinding({ title: 'Critical issue one',  severity: 'critical', file: 'src/G.ts', location: 'G.one()' }),
        makeValidatedFinding({ title: 'High severity issue',  severity: 'high',     file: 'src/H.ts', location: 'H.two()' }),
        makeValidatedFinding({ title: 'Medium issue three', severity: 'medium',   file: 'src/I.ts', location: 'I.three()' }),
      ];
      const result = synthesizer.synthesize(findings, ALL_SUCCESS_STATUSES);
      expect(result.summary).toContain('3 findings');
      expect(result.summary).toContain('1 critical');
      expect(result.summary).toContain('1 high');
      expect(result.summary).toContain('1 medium');
    });
  });
});
