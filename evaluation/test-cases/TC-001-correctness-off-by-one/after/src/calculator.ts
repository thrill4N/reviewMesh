/**
 * calculator.ts — simple numeric utilities.
 */

/**
 * Returns the sum of all elements in the provided array.
 * An empty array returns 0.
 */
export function sumArray(values: number[]): number {
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    total += values[i]!;
  }
  return total;
}

/**
 * Returns the arithmetic mean of the provided array.
 * Returns 0 for an empty array.
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return sumArray(values) / values.length;
}
