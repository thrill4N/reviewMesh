/**
 * securityConfig.ts — application security configuration.
 *
 * BEFORE state: hardcoded default secrets used as fallback when env vars are absent.
 * This is the problematic state that the "after" diff improves.
 */

export interface SecurityConfig {
  jwtSecret: string;
  encryptionKey: string;
  sessionTimeout: number;
}

/**
 * Loads the security configuration from environment variables,
 * falling back to hardcoded defaults when variables are absent.
 *
 * PROBLEM: the fallback values are real-looking secrets committed to source
 * control, creating a risk of accidental use in production.
 */
export function loadSecurityConfig(): SecurityConfig {
  return {
    jwtSecret: process.env['JWT_SECRET'] ?? 'super-secret-jwt-key-do-not-use',
    encryptionKey: process.env['ENCRYPTION_KEY'] ?? 'aes-256-default-key-32bytes!!!!!',
    sessionTimeout: parseInt(process.env['SESSION_TIMEOUT_MS'] ?? '3600000', 10),
  };
}
