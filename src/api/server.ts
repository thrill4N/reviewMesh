/**
 * server.ts — Express application setup for ReviewMesh.
 *
 * Exposes the minimal API surface required by the MVP:
 *   GET  /api/health           → liveness probe
 *   POST /api/review           → run the review pipeline; returns ReviewResult JSON
 *   POST /api/review/text      → same pipeline; returns plain-text presenter output
 *
 * (TECH-STACK.md §3, ARCHITECTURE.md §4)
 */

import express from 'express';
import cors from 'cors';
import { ReviewController } from './ReviewController.js';
import { getConfig } from '../infrastructure/config.js';

export function createApp(): express.Application {
  const app = express();

  // Parse JSON bodies (review requests send JSON)
  app.use(express.json({ limit: '10mb' }));

  // Allow the Vite dev server (localhost:5173) and any configured origin
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3001',
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, Postman)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin "${origin}" not allowed`));
        }
      },
      methods: ['GET', 'POST', 'OPTIONS'],
    }),
  );

  const controller = new ReviewController();

  // Routes
  app.get('/api/health', (req, res) => controller.handleHealth(req, res));
  app.post('/api/review', (req, res) => controller.handleReview(req, res));
  app.post('/api/review/text', (req, res) => controller.handleReviewText(req, res));

  // 404 fallback
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  return app;
}

/**
 * Starts the HTTP server. Called from src/index.ts.
 */
export function startServer(): void {
  const config = getConfig();
  const port = parseInt(process.env['PORT'] ?? '3001', 10);

  const app = createApp();

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`ReviewMesh API server listening on http://localhost:${port}`);
    if (config.logLevel === 'debug') {
      // eslint-disable-next-line no-console
      console.log(`  Model: ${config.modelId}`);
      // eslint-disable-next-line no-console
      console.log(`  Agent timeout: ${config.agentTimeoutMs}ms`);
    }
  });
}
