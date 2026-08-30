/**
 * stringUtils.ts — string formatting helpers.
 */

/**
 * Normalises a name component: trims whitespace and collapses internal spaces.
 */
function normaliseName(part: string): string {
  return part.trim().replace(/\s+/g, ' ');
}

/**
 * Combines normalised first and last name parts into a display string.
 * Returns "Anonymous" when both parts are empty after normalisation.
 */
function combineName(first: string, last: string): string {
  if (!first && !last) return 'Anonymous';
  if (!first) return last;
  if (!last) return first;
  return `${first} ${last}`;
}

/**
 * Formats a full name for display on a user profile page.
 */
export function formatProfileName(firstName: string, lastName: string): string {
  return combineName(normaliseName(firstName), normaliseName(lastName));
}

/**
 * Formats a full name for display on a printed invoice.
 */
export function formatInvoiceName(firstName: string, lastName: string): string {
  return combineName(normaliseName(firstName), normaliseName(lastName));
}
