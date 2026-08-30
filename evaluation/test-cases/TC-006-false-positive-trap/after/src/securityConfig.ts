/**
 * securityConfig.ts — application security configuration.
 *
 * AFTER state: hardcoded fallbacks removed. Missing env vars now cause an
 * explicit startup failure rather than silently using insecure defaults.
 */

export interface SecurityConfig {
  jwtSecret: string;
  encryptionKey: string;
  sessionTimeout: number;
}

/**
 * Loads the security configuration from environment variables.
 *
 * Throws if a required secret is absent, preventing the application from
 * starting with missing or default credentials.
 */
export function loadSecurityConfig(): SecurityConfig {
  const jwtSecret = process.env['JWT_SECRET'];
  const encryptionKey = process.env['ENCRYPTION_KEY'];

  if (!jwtSecret) {
    throw new Error('Required environment variable JWT_SECRET is not set.');
  }
  if (!encryptionKey) {
    throw new Error('Required environment variable ENCRYPTION_KEY is not set.');
  }

  return {
    jwtSecret,
    encryptionKey,
    sessionTimeout: parseInt(process.env['SESSION_TIMEOUT_MS'] ?? '3600000', 10),
  };
}
