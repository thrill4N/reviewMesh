#!/usr/bin/env node
/**
 * src/index.ts — ReviewMesh entry point.
 *
 * Two modes of operation:
 *
 *   1. Web server (default):
 *      node dist/src/index.js
 *      tsx src/index.ts
 *      → Starts the Express API on PORT (default 3001).
 *        The React frontend (client/) connects to this server.
 *
 *   2. CLI mode:
 *      node dist/src/index.js --cli --repo <path> --diff <file.patch>
 *      tsx src/index.ts --cli --repo <path> --diff <file.patch>
 *      → Runs the review pipeline against a local repository and diff file,
 *        prints the ReviewPresenter output to stdout, and exits.
 *
 * All configuration is loaded from environment variables via config.ts.
 * Never access process.env directly in other modules.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getConfig } from './infrastructure/config.js';
import { ReviewPipeline, ReviewPipelineError } from './pipeline/ReviewPipeline.js';
import { Orchestrator } from './agents/Orchestrator.js';
import { LLMClientAdapter } from './infrastructure/LLMClientAdapter.js';
import { ReviewPresenter } from './ui/ReviewPresenter.js';
import { startServer } from './api/server.js';

// ---------------------------------------------------------------------------
// CLI argument parsing (no external library — minimal deps rule)
// ---------------------------------------------------------------------------

interface CliArgs {
  cli: boolean;
  repo: string | null;
  diff: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = { cli: false, repo: null, diff: null, help: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--cli':
        result.cli = true;
        break;
      case '--repo':
        result.repo = args[++i] ?? null;
        break;
      case '--diff':
        result.diff = args[++i] ?? null;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

function printHelp(): void {
  process.stdout.write(`
ReviewMesh — Multi-agent AI code review

Usage:
  tsx src/index.ts                                 Start web server (default)
  tsx src/index.ts --cli --repo <path> --diff <file.patch>   CLI mode

Options:
  --cli          Run in CLI mode (no server)
  --repo <path>  Path to the local repository to review
  --diff <file>  Path to a .patch / unified diff file
  --help, -h     Show this help message

Environment variables (see .env.example):
  BOB_MODEL_ID        IBM Granite model identifier
  BOB_API_KEY         Watsonx API key
  MAX_CONTEXT_TOKENS  Per-agent context token budget (default: 8000)
  AGENT_TIMEOUT_MS    Per-agent execution timeout ms (default: 30000)
  PORT                HTTP server port (default: 3001)
  LOG_LEVEL           debug | info | warn | error (default: info)

Examples:
  # Start the API server
  tsx src/index.ts

  # Review a local repository from the command line
  tsx src/index.ts --cli --repo ./my-project --diff ./changes.patch
`);
}

// ---------------------------------------------------------------------------
// CLI review runner
// ---------------------------------------------------------------------------

async function runCli(repo: string, diffFile: string): Promise<void> {
  const repoPath = resolve(repo);
  const diffPath = resolve(diffFile);

  let diffText: string;
  try {
    diffText = await readFile(diffPath, 'utf-8');
  } catch {
    process.stderr.write(`Error: cannot read diff file "${diffPath}"\n`);
    process.exit(1);
  }

  if (diffText.trim() === '') {
    process.stderr.write(`Error: diff file "${diffPath}" is empty.\n`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`ReviewMesh — reviewing ${repoPath}`);
  // eslint-disable-next-line no-console
  console.log('Running parallel agent analysis...\n');

  const config = getConfig();
  const llmClient = new LLMClientAdapter(config);
  const orchestrator = new Orchestrator(llmClient);
  const pipeline = new ReviewPipeline(orchestrator);
  const presenter = new ReviewPresenter();

  try {
    const result = await pipeline.run(repoPath, diffText);
    process.stdout.write(presenter.format(result));
    process.stdout.write('\n');
    process.exit(result.status === 'changes_required' ? 1 : 0);
  } catch (err) {
    if (err instanceof ReviewPipelineError) {
      process.stderr.write(`Pipeline error: ${err.message}\n`);
    } else {
      process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
    }
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv);

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.cli) {
  if (!args.repo || !args.diff) {
    process.stderr.write('Error: --cli mode requires --repo <path> and --diff <file>\n');
    printHelp();
    process.exit(1);
  }
  await runCli(args.repo, args.diff);
} else {
  startServer();
}
