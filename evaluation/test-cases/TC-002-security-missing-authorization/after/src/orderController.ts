/**
 * orderController.ts — handles order lifecycle operations.
 */

export interface Order {
  id: string;
  userId: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'cancelled';
  totalAmount: number;
}

// Simulated in-memory store for demonstration purposes.
const orders = new Map<string, Order>();

/**
 * Cancels an order by its ID.
 *
 * Requires the requesting user's ID so that ownership can be verified before
 * the cancellation is applied.
 */
export async function cancelOrder(orderId: string, requestingUserId: string): Promise<void> {
  const order = orders.get(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }
  if (order.userId !== requestingUserId) {
    throw new Error(`User ${requestingUserId} is not authorised to cancel order ${orderId}.`);
  }
  if (order.status === 'shipped') {
    throw new Error(`Cannot cancel a shipped order.`);
  }
  order.status = 'cancelled';
}
