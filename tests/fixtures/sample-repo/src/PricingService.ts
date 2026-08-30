/**
 * PricingService — calculates prices and tax for orders.
 */
export class PricingService {
  /** Canonical tax rate. Any change must be made here only. */
  static readonly TAX_RATE = 0.15;

  calculateTotal(subtotal: number): number {
    return subtotal + subtotal * PricingService.TAX_RATE;
  }

  formatPrice(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }
}
