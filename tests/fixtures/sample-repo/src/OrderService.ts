/**
 * OrderService — processes orders for a fictional e-commerce platform.
 *
 * Intentional defects for ReviewMesh demo:
 *   [security]       cancelOrder() performs no authorization check — any
 *                    authenticated user can cancel any order.
 *   [correctness]    applyDiscount() has an off-by-one logic error: it
 *                    applies the discount to the wrong subtotal field.
 *   [testing]        processRefund() has no test coverage at all.
 *   [maintainability] calculateTotal() duplicates tax-rate logic that
 *                    already exists in PricingService.
 */
export class OrderService {
  private readonly db: OrderRepository;
  private readonly payments: PaymentGateway;

  constructor(db: OrderRepository, payments: PaymentGateway) {
    this.db = db;
    this.payments = payments;
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return this.db.findById(orderId);
  }

  /**
   * Cancels an order.
   * BUG (security): no check that the requesting user owns this order.
   * Any authenticated caller can cancel any order by ID.
   */
  async cancelOrder(orderId: string): Promise<void> {
    const order = await this.db.findById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.status === 'shipped') throw new Error('Cannot cancel a shipped order');
    order.status = 'cancelled';
    await this.db.save(order);
  }

  /**
   * Applies a percentage discount to the order.
   * BUG (correctness): should apply to order.subtotal, not order.total.
   * When tax has already been added, the discount is calculated on the
   * wrong base amount.
   */
  applyDiscount(order: Order, discountPercent: number): Order {
    if (discountPercent < 0 || discountPercent > 100) {
      throw new RangeError('discountPercent must be between 0 and 100');
    }
    const discountAmount = order.total * (discountPercent / 100);  // BUG: should be order.subtotal
    return {
      ...order,
      total: order.total - discountAmount,
    };
  }

  /**
   * Processes a refund for a cancelled order.
   * Has no unit tests. (testing gap)
   */
  async processRefund(orderId: string): Promise<RefundResult> {
    const order = await this.db.findById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.status !== 'cancelled') {
      throw new Error('Can only refund cancelled orders');
    }
    const result = await this.payments.refund(order.paymentId, order.total);
    order.status = 'refunded';
    await this.db.save(order);
    return result;
  }

  /**
   * Calculates total with tax.
   * MAINTAINABILITY BUG: TAX_RATE is duplicated from PricingService.
   * Any change to tax rate must be updated in two places.
   */
  calculateTotal(subtotal: number): number {
    const TAX_RATE = 0.15;  // duplicated from PricingService.TAX_RATE
    return subtotal + subtotal * TAX_RATE;
  }
}

// ---------------------------------------------------------------------------
// Supporting types (minimal stubs for the demo fixture)
// ---------------------------------------------------------------------------

export interface Order {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'shipped' | 'cancelled' | 'refunded';
  subtotal: number;
  total: number;
  paymentId: string;
  items: OrderItem[];
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface RefundResult {
  refundId: string;
  amount: number;
  status: 'success' | 'failed';
}

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

export interface PaymentGateway {
  refund(paymentId: string, amount: number): Promise<RefundResult>;
}
