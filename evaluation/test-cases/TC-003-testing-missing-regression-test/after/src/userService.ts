/**
 * userService.ts — user account management utilities.
 */

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member' | 'guest';
}

// Simulated in-memory user store.
const users = new Map<string, User>();

/**
 * Returns true if the supplied string is a syntactically valid email address.
 *
 * Validates: local part, @ symbol, domain with at least one dot.
 * Does NOT verify deliverability.
 */
export function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * Looks up a user by their email address.
 * Returns undefined if no match is found.
 */
export function findUserByEmail(email: string): User | undefined {
  for (const user of users.values()) {
    if (user.email === email) return user;
  }
  return undefined;
}

/**
 * Creates a new user account.
 * Throws if the email is already registered or if the email is invalid.
 */
export function createUser(id: string, email: string, displayName: string): User {
  if (!isValidEmail(email)) {
    throw new Error(`Invalid email address: ${email}`);
  }
  if (findUserByEmail(email)) {
    throw new Error(`Email already registered: ${email}`);
  }
  const user: User = { id, email, displayName, role: 'member' };
  users.set(id, user);
  return user;
}
