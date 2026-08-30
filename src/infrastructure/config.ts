/**
 * config.ts — centralized runtime configuration for ReviewMesh.
 *
 * All environment-specific values are loaded here and exposed through a single
 * typed `Config` object. No other module may access `process.env` directly.
 *
 * (ARCHITECTURE.md §13, AGENTS.md §13)
 */

export interface Config {
  /** Bob / LLM model identifier. */
  modelId: string;

  /** Optional API key for the LLM provider. Empty string if not required. */
  apiKey: string;

  /** Per-agent context token budget. */
  maxContextTokens: number;

  /** Per-agent execution timeout in milliseconds. */
  agentTimeoutMs: number;

  /** Root path of the repository being reviewed. */
  repoBasePath: string;

  /** Logging verbosity. */
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  /** HTTP port for the Express server. */
  port: number;
}

function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value !== undefined && value.trim() !== '' ? value.trim() : defaultValue;
}

function parsePositiveInt(raw: string, name: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer; got "${raw}"`);
  }
  return n;
}

function parseLogLevel(raw: string): Config['logLevel'] {
  const valid: Config['logLevel'][] = ['debug', 'info', 'warn', 'error'];
  if (valid.includes(raw as Config['logLevel'])) {
    return raw as Config['logLevel'];
  }
  return 'info';
}

/**
 * Loads and validates the application configuration from environment variables.
 *
 * Called once at startup. Throws if required variables are absent.
 */
export function loadConfig(): Config {
  return {
    modelId: optionalEnv('BOB_MODEL_ID', 'ibm/granite-3-8b-instruct'),
    apiKey: optionalEnv('BOB_API_KEY', ''),
    maxContextTokens: parsePositiveInt(
      optionalEnv('MAX_CONTEXT_TOKENS', '8000'),
      'MAX_CONTEXT_TOKENS',
    ),
    agentTimeoutMs: parsePositiveInt(
      optionalEnv('AGENT_TIMEOUT_MS', '30000'),
      'AGENT_TIMEOUT_MS',
    ),
    repoBasePath: optionalEnv('REPO_BASE_PATH', process.cwd()),
    logLevel: parseLogLevel(optionalEnv('LOG_LEVEL', 'info')),
    port: parsePositiveInt(optionalEnv('PORT', '3001'), 'PORT'),
  };
}

/**
 * Singleton config instance.
 * Import and call `getConfig()` from any module that needs configuration.
 */
let _config: Config | null = null;

export function getConfig(): Config {
  if (_config === null) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Reset the cached config. Used in tests only.
 * @internal
 */
export function resetConfig(): void {
  _config = null;
}
