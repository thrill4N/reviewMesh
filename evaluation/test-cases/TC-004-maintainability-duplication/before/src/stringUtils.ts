/**
 * stringUtils.ts — string formatting helpers.
 */

/**
 * Formats a full name for display on a user profile page.
 */
export function formatProfileName(firstName: string, lastName: string): string {
  const first = firstName.trim().replace(/\s+/g, ' ');
  const last = lastName.trim().replace(/\s+/g, ' ');
  if (!first && !last) return 'Anonymous';
  if (!first) return last;
  if (!last) return first;
  return `${first} ${last}`;
}

/**
 * Formats a full name for display on a printed invoice.
 * NOTE: duplicates the normalisation logic from formatProfileName.
 */
export function formatInvoiceName(firstName: string, lastName: string): string {
  const first = firstName.trim().replace(/\s+/g, ' ');
  const last = lastName.trim().replace(/\s+/g, ' ');
  if (!first && !last) return 'Anonymous';
  if (!first) return last;
  if (!last) return first;
  return `${first} ${last}`;
}
