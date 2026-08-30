/**
 * ReviewController — HTTP handler for the POST /api/review endpoint.
 *
 * Accepts { repoPath, diffText } and runs the full ReviewPipeline.
 * Returns the ReviewResult JSON on success or a structured error on failure.
 *
 * (TECH-STACK.md §3, ARCHITECTURE.md §4.1)
 */

import type { Request, Response } from 'express';
import { ReviewPipeline, ReviewPipelineError } from '../pipeline/ReviewPipeline.js';
import { Orchestrator } from '../agents/Orchestrator.js';
import { LLMClientAdapter } from '../infrastructure/LLMClientAdapter.js';
import { getConfig } from '../infrastructure/config.js';
import { ReviewPresenter } from '../ui/ReviewPresenter.js';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

interface ReviewRequest {
  repoPath: string;
  diffText: string;
}

function isValidReviewRequest(body: unknown): body is ReviewRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b['repoPath'] === 'string' && typeof b['diffText'] === 'string';
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class ReviewController {
  private readonly presenter: ReviewPresenter;

  constructor() {
    this.presenter = new ReviewPresenter();
  }

  /**
   * POST /api/review
   *
   * Body: { repoPath: string, diffText: string }
   * Response: ReviewResult JSON
   */
  async handleReview(req: Request, res: Response): Promise<void> {
    if (!isValidReviewRequest(req.body)) {
      res.status(400).json({
        error: 'Invalid request. Body must include "repoPath" (string) and "diffText" (string).',
      });
      return;
    }

    const { repoPath, diffText } = req.body;

    if (repoPath.trim() === '') {
      res.status(400).json({ error: 'repoPath must not be empty.' });
      return;
    }

    if (diffText.trim() === '') {
      res.status(400).json({ error: 'diffText must not be empty — nothing to review.' });
      return;
    }

    try {
      const config = getConfig();
      const llmClient = new LLMClientAdapter(config);
      const orchestrator = new Orchestrator(llmClient);
      const pipeline = new ReviewPipeline(orchestrator);

      const result = await pipeline.run(repoPath, diffText);

      res.status(200).json(result);
    } catch (err) {
      if (err instanceof ReviewPipelineError) {
        res.status(422).json({ error: err.message });
        return;
      }

      // Unexpected errors — do not expose internals
      const message =
        process.env['LOG_LEVEL'] === 'debug'
          ? (err as Error).message
          : 'Review pipeline failed. Check server logs for details.';

      res.status(500).json({ error: message });
    }
  }

  /**
   * GET /api/health
   * Liveness check for the frontend to confirm the server is ready.
   */
  handleHealth(_req: Request, res: Response): void {
    res.status(200).json({ status: 'ok', service: 'reviewmesh' });
  }

  /**
   * POST /api/review/text
   *
   * Same as /api/review but returns plain-text formatted output
   * (ReviewPresenter format) instead of JSON.
   */
  async handleReviewText(req: Request, res: Response): Promise<void> {
    if (!isValidReviewRequest(req.body)) {
      res.status(400).send('Invalid request. Body must include "repoPath" and "diffText".');
      return;
    }

    const { repoPath, diffText } = req.body;

    try {
      const config = getConfig();
      const llmClient = new LLMClientAdapter(config);
      const orchestrator = new Orchestrator(llmClient);
      const pipeline = new ReviewPipeline(orchestrator);

      const result = await pipeline.run(repoPath, diffText);
      const formatted = this.presenter.format(result);

      res.status(200).type('text/plain').send(formatted);
    } catch (err) {
      if (err instanceof ReviewPipelineError) {
        res.status(422).send(`Pipeline error: ${err.message}`);
        return;
      }
      res.status(500).send('Review pipeline failed. Check server logs for details.');
    }
  }
}
