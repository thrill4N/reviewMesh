/**
 * securityConfig.ts — application security configuration.
 *
 * Loads credentials exclusively from environment variables.
 * Throws at startup if required variables are absent.
 */

export interface SecurityConfig {
  jwtSecret: string;
  sessionTimeout: number;
}

export function loadSecurityConfig(): SecurityConfig {
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('Required environment variable JWT_SECRET is not set.');
  }

  return {
    jwtSecret,
    sessionTimeout: parseInt(process.env['SESSION_TIMEOUT_MS'] ?? '3600000', 10),
  };
}
