import { describe, it, expect, vi } from 'vitest';
import {
  SecurityAgent,
  SecurityAgentError,
  parseSecurityAgentResponse,
  type LLMClient,
} from '../../src/agents/SecurityAgent.js';
import type { AgentContext } from '../../src/domain/AgentContext.js';
import type { RawFinding } from '../../src/domain/Finding.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal valid AgentContext for the Security Agent.
 */
function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    agentRole: 'security',
    projectContext: {
      projectPurpose: 'Order management API',
      architecture: 'Express REST API with TypeScript',
      language: 'TypeScript',
      framework: 'Express',
      relevantFiles: ['src/controllers/OrderController.ts', 'src/middleware/auth.ts'],
      testStrategy: 'Vitest unit tests',
      securitySensitiveAreas: ['src/middleware/auth.ts', 'src/controllers/'],
      conventions: 'Thin controllers, service layer for business logic',
    },
    changeContext: {
      summary: 'Add order cancellation endpoint',
      changedFiles: [
        {
          path: 'src/controllers/OrderController.ts',
          diff: `@@ -20,0 +21,8 @@
+  async cancelOrder(req: Request, res: Response): Promise<void> {
+    const { orderId } = req.params;
+    const order = await this.orderService.findById(orderId);
+    await this.orderService.cancel(order);
+    res.json({ status: 'cancelled' });
+  }`,
          fullContent: `import { Request, Response } from 'express';
import { OrderService } from '../services/OrderService';

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  async cancelOrder(req: Request, res: Response): Promise<void> {
    const { orderId } = req.params;
    const order = await this.orderService.findById(orderId);
    await this.orderService.cancel(order);
    res.json({ status: 'cancelled' });
  }
}`,
        },
      ],
      affectedAreas: ['order management', 'API routes'],
      potentialRiskAreas: ['authorization'],
      newBehavior: 'Allows cancellation of any order by order ID without ownership check',
    },
    additionalFiles: [],
    ...overrides,
  };
}

/**
 * Builds a valid JSON response string containing a single security finding.
 */
function makeValidFindingResponse(overrides: Partial<RawFinding> = {}): string {
  const finding: Omit<RawFinding, 'id'> = {
    title: 'Missing ownership check on order cancellation endpoint',
    category: 'security',
    severity: 'high',
    confidence: 0.9,
    file: 'src/controllers/OrderController.ts',
    line: 7,
    location: 'OrderController.cancelOrder()',
    evidence:
      'const order = await this.orderService.findById(orderId); await this.orderService.cancel(order);',
    explanation:
      'The endpoint cancels any order by ID without verifying that the requesting user owns the order.',
    impact:
      'Any authenticated user can cancel orders belonging to other users (Insecure Direct Object Reference).',
    recommendation:
      'Verify req.user.id === order.userId before calling orderService.cancel().',
    sourceAgent: 'security',
    ...overrides,
  };

  return JSON.stringify({ findings: [finding] });
}

/**
 * Returns a mock LLMClient that resolves with the provided response.
 */
function mockClient(response: string): LLMClient {
  return {
    complete: vi.fn().mockResolvedValue(response),
  };
}

// ---------------------------------------------------------------------------
// parseSecurityAgentResponse unit tests
// ---------------------------------------------------------------------------

describe('parseSecurityAgentResponse', () => {
  it('parses a valid response with one finding', () => {
    const findings = parseSecurityAgentResponse(makeValidFindingResponse());

    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('security');
    expect(findings[0].sourceAgent).toBe('security');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].confidence).toBe(0.9);
    expect(findings[0].title).toBe('Missing ownership check on order cancellation endpoint');
  });

  it('parses an empty findings array (no vulnerabilities found)', () => {
    const findings = parseSecurityAgentResponse(JSON.stringify({ findings: [] }));
    expect(findings).toHaveLength(0);
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n' + makeValidFindingResponse() + '\n```';
    const findings = parseSecurityAgentResponse(raw);
    expect(findings).toHaveLength(1);
  });

  it('strips unmarked code fences before parsing', () => {
    const raw = '```\n' + makeValidFindingResponse() + '\n```';
    const findings = parseSecurityAgentResponse(raw);
    expect(findings).toHaveLength(1);
  });

  it('throws SecurityAgentError when response is not valid JSON', () => {
    expect(() => parseSecurityAgentResponse('not json at all')).toThrow(SecurityAgentError);
    expect(() => parseSecurityAgentResponse('not json at all')).toThrow(
      /not valid JSON/,
    );
  });

  it('throws SecurityAgentError when findings array is missing', () => {
    expect(() => parseSecurityAgentResponse(JSON.stringify({ result: [] }))).toThrow(
      SecurityAgentError,
    );
    expect(() => parseSecurityAgentResponse(JSON.stringify({ result: [] }))).toThrow(
      /"findings" array/,
    );
  });

  // --- Field validation ---

  it('drops finding with wrong category', () => {
    const findings = parseSecurityAgentResponse(
      makeValidFindingResponse({ category: 'correctness' } as unknown as Partial<RawFinding>),
    );
    expect(findings).toHaveLength(0);
  });

  it('drops finding with wrong sourceAgent', () => {
    const findings = parseSecurityAgentResponse(
      makeValidFindingResponse({ sourceAgent: 'correctness' }),
    );
    expect(findings).toHaveLength(0);
  });

  it('drops finding with invalid severity', () => {
    const findings = parseSecurityAgentResponse(
      makeValidFindingResponse({ severity: 'urgent' as RawFinding['severity'] }),
    );
    expect(findings).toHaveLength(0);
  });

  it('drops finding with confidence below 0.5', () => {
    const findings = parseSecurityAgentResponse(makeValidFindingResponse({ confidence: 0.4 }));
    expect(findings).toHaveLength(0);
  });

  it('accepts finding with confidence exactly 0.5', () => {
    const findings = parseSecurityAgentResponse(makeValidFindingResponse({ confidence: 0.5 }));
    expect(findings).toHaveLength(1);
  });

  it('drops finding with confidence above 1.0', () => {
    const findings = parseSecurityAgentResponse(makeValidFindingResponse({ confidence: 1.1 }));
    expect(findings).toHaveLength(0);
  });

  it('drops finding that includes an id field', () => {
    const raw = JSON.stringify({
      findings: [
        {
          id: 'abc-123',
          title: 'Test finding',
          category: 'security',
          severity: 'high',
          confidence: 0.9,
          file: 'src/foo.ts',
          line: 1,
          location: null,
          evidence: 'some code',
          explanation: 'why',
          impact: 'what',
          recommendation: 'fix it',
          sourceAgent: 'security',
        },
      ],
    });
    const findings = parseSecurityAgentResponse(raw);
    expect(findings).toHaveLength(0);
  });

  it('drops finding with empty evidence', () => {
    const findings = parseSecurityAgentResponse(makeValidFindingResponse({ evidence: '' }));
    expect(findings).toHaveLength(0);
  });

  it('drops finding with empty title', () => {
    const findings = parseSecurityAgentResponse(makeValidFindingResponse({ title: '' }));
    expect(findings).toHaveLength(0);
  });

  it('accepts finding with line: null', () => {
    const findings = parseSecurityAgentResponse(makeValidFindingResponse({ line: null }));
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBeNull();
  });

  it('accepts finding with location: null', () => {
    const findings = parseSecurityAgentResponse(makeValidFindingResponse({ location: null }));
    expect(findings).toHaveLength(1);
    expect(findings[0].location).toBeNull();
  });

  it('drops finding with a non-integer line number', () => {
    const findings = parseSecurityAgentResponse(
      makeValidFindingResponse({ line: 7.5 as unknown as number }),
    );
    expect(findings).toHaveLength(0);
  });

  it('drops finding with a zero line number', () => {
    const findings = parseSecurityAgentResponse(
      makeValidFindingResponse({ line: 0 as unknown as number }),
    );
    expect(findings).toHaveLength(0);
  });

  it('silently drops malformed findings while keeping valid ones', () => {
    const validFinding = {
      title: 'Valid finding',
      category: 'security',
      severity: 'medium',
      confidence: 0.75,
      file: 'src/foo.ts',
      line: null,
      location: null,
      evidence: 'actual code evidence',
      explanation: 'why',
      impact: 'what',
      recommendation: 'fix it',
      sourceAgent: 'security',
    };
    const malformedFinding = { category: 'security' }; // missing required fields

    const findings = parseSecurityAgentResponse(
      JSON.stringify({ findings: [malformedFinding, validFinding] }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('Valid finding');
  });
});

// ---------------------------------------------------------------------------
// SecurityAgent.review() integration-style tests (using mock LLM client)
// ---------------------------------------------------------------------------

describe('SecurityAgent.review()', () => {
  // --- Positive case: vulnerability detected ---

  it('returns a finding when the LLM identifies a security vulnerability', async () => {
    const client = mockClient(makeValidFindingResponse());
    const agent = new SecurityAgent(client);
    const result = await agent.review(makeContext());

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].category).toBe('security');
    expect(result.findings[0].severity).toBe('high');
    expect(result.findings[0].sourceAgent).toBe('security');
  });

  it('passes the correct system prompt and user message to the LLM', async () => {
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);
    const context = makeContext();
    await agent.review(context);

    expect(client.complete).toHaveBeenCalledTimes(1);
    const [systemPrompt, userMessage] = (client.complete as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, string];

    expect(systemPrompt).toContain('specialist Application Security Engineer');
    expect(systemPrompt).toContain('sourceAgent');
    expect(userMessage.toLowerCase()).toContain('order management api');
    expect(userMessage).toContain('OrderController.ts');
  });

  // --- Negative case: secure implementation produces no findings ---

  it('returns empty findings when the LLM finds no vulnerabilities', async () => {
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);
    const result = await agent.review(makeContext());

    expect(result.findings).toHaveLength(0);
  });

  // --- Context case: authorization exists in middleware ---

  it('does not report missing authorization when auth middleware is present in additionalFiles', async () => {
    // The LLM is given context showing auth middleware guards the route.
    // We simulate the LLM responding with no findings — this test verifies
    // the agent correctly accepts and forwards that result without error.
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);

    const contextWithAuth = makeContext({
      additionalFiles: [
        {
          path: 'src/middleware/auth.ts',
          content: `export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

export function requireOwnership(resourceField: string) {
  return (req, res, next) => {
    if (req.user.id !== req[resourceField].userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}`,
        },
        {
          path: 'src/routes/orders.ts',
          content: `import { Router } from 'express';
import { requireAuth, requireOwnership } from '../middleware/auth';
import { OrderController } from '../controllers/OrderController';

const router = Router();
const controller = new OrderController();

router.delete(
  '/orders/:orderId',
  requireAuth,
  requireOwnership('order'),
  controller.cancelOrder.bind(controller)
);

export default router;`,
        },
      ],
    });

    const result = await agent.review(contextWithAuth);
    // The mock LLM returns no findings — the agent must return an empty list
    // (not manufacture findings from context it didn't analyze itself).
    expect(result.findings).toHaveLength(0);

    // Verify the additional files were passed to the LLM so it could inspect them
    const [, userMessage] = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
    ];
    expect(userMessage).toContain('requireOwnership');
    expect(userMessage).toContain('src/middleware/auth.ts');
  });

  // --- Error handling ---

  it('throws SecurityAgentError when the LLM response is not parseable', async () => {
    const client = mockClient('I could not parse this request.');
    const agent = new SecurityAgent(client);

    await expect(agent.review(makeContext())).rejects.toThrow(SecurityAgentError);
  });

  it('throws SecurityAgentError when context has wrong agentRole', async () => {
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);
    const badContext = makeContext({ agentRole: 'correctness' });

    await expect(agent.review(badContext)).rejects.toThrow(SecurityAgentError);
    await expect(agent.review(badContext)).rejects.toThrow(/agentRole "correctness"/);
  });

  // --- Finding structure contract ---

  it('produced findings conform to the RawFinding contract (no id field)', async () => {
    const client = mockClient(makeValidFindingResponse());
    const agent = new SecurityAgent(client);
    const result = await agent.review(makeContext());

    for (const finding of result.findings) {
      expect((finding as Record<string, unknown>)['id']).toBeUndefined();
      expect(finding.category).toBe('security');
      expect(finding.sourceAgent).toBe('security');
      expect(typeof finding.confidence).toBe('number');
      expect(finding.confidence).toBeGreaterThanOrEqual(0.5);
      expect(finding.confidence).toBeLessThanOrEqual(1.0);
      expect(['critical', 'high', 'medium', 'low']).toContain(finding.severity);
      expect(typeof finding.evidence).toBe('string');
      expect(finding.evidence.trim().length).toBeGreaterThan(0);
    }
  });

  it('drops low-confidence findings before returning results', async () => {
    // The LLM returns one finding with confidence 0.3 (too low) and one with 0.8 (valid)
    const lowConf = { ...JSON.parse(makeValidFindingResponse()).findings[0], confidence: 0.3 };
    const highConf = { ...JSON.parse(makeValidFindingResponse()).findings[0], confidence: 0.8 };
    const client = mockClient(JSON.stringify({ findings: [lowConf, highConf] }));
    const agent = new SecurityAgent(client);

    const result = await agent.review(makeContext());
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].confidence).toBe(0.8);
  });

  it('filters out findings with wrong category silently', async () => {
    const badCategory = {
      ...JSON.parse(makeValidFindingResponse()).findings[0],
      category: 'maintainability',
      sourceAgent: 'maintainability',
    };
    const client = mockClient(JSON.stringify({ findings: [badCategory] }));
    const agent = new SecurityAgent(client);

    const result = await agent.review(makeContext());
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SecurityAgent prompt construction tests (via LLM call inspection)
// ---------------------------------------------------------------------------

describe('SecurityAgent prompt construction', () => {
  it('includes changed file paths in user message', async () => {
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);
    await agent.review(makeContext());

    const [, userMessage] = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
    ];
    expect(userMessage).toContain('src/controllers/OrderController.ts');
  });

  it('includes diff content in user message', async () => {
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);
    await agent.review(makeContext());

    const [, userMessage] = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
    ];
    expect(userMessage).toContain('cancelOrder');
  });

  it('includes security-sensitive areas from project context', async () => {
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);
    await agent.review(makeContext());

    const [, userMessage] = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
    ];
    expect(userMessage).toContain('src/middleware/auth.ts');
  });

  it('includes potential risk areas from change context', async () => {
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);
    await agent.review(makeContext());

    const [, userMessage] = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
    ];
    expect(userMessage).toContain('authorization');
  });

  it('includes additional context files when provided', async () => {
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);
    await agent.review(
      makeContext({
        additionalFiles: [
          { path: 'src/middleware/rbac.ts', content: 'export function checkRole() {}' },
        ],
      }),
    );

    const [, userMessage] = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
    ];
    expect(userMessage).toContain('src/middleware/rbac.ts');
    expect(userMessage).toContain('checkRole');
  });

  it('system prompt instructs agent to return JSON only', async () => {
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);
    await agent.review(makeContext());

    const [systemPrompt] = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
    ];
    expect(systemPrompt).toContain('"findings"');
    expect(systemPrompt).toContain('sourceAgent');
    expect(systemPrompt).toContain('No prose');
  });

  it('system prompt forbids fabricating line numbers', async () => {
    const client = mockClient(JSON.stringify({ findings: [] }));
    const agent = new SecurityAgent(client);
    await agent.review(makeContext());

    const [systemPrompt] = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
    ];
    expect(systemPrompt).toContain('null');
    expect(systemPrompt).toContain('fabricate');
  });
});
