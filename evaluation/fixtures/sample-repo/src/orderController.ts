/**
 * orderController.ts — order management endpoints.
 *
 * KNOWN FLAW (intentional, for demo purposes):
 * The cancelOrder route does not verify that the requesting user owns the order.
 * Any authenticated user can cancel any order by guessing its ID.
 */

export interface Order {
  id: string;
  userId: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'cancelled';
  totalAmount: number;
}

const orders = new Map<string, Order>();

/**
 * Returns an order by ID. Returns undefined if not found.
 */
export function getOrder(orderId: string): Order | undefined {
  return orders.get(orderId);
}

/**
 * Cancels an order without checking who owns it.
 * Vulnerability: IDOR — any caller can cancel any order.
 */
export async function cancelOrder(orderId: string): Promise<void> {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found.`);
  if (order.status === 'shipped') throw new Error(`Cannot cancel a shipped order.`);
  order.status = 'cancelled';
}
