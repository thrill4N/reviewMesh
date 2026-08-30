import { describe, it, expect, vi } from 'vitest';
import { OrderService } from '../src/OrderService.js';
import type { Order, OrderRepository, PaymentGateway } from '../src/OrderService.js';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: 'pending',
    subtotal: 100,
    total: 115,
    paymentId: 'pay-1',
    items: [],
    ...overrides,
  };
}

function makeRepo(order: Order | null): OrderRepository {
  return {
    findById: vi.fn().mockResolvedValue(order),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('OrderService', () => {
  it('cancelOrder — cancels a pending order', async () => {
    const order = makeOrder({ status: 'pending' });
    const db = makeRepo(order);
    const service = new OrderService(db, {} as PaymentGateway);
    await service.cancelOrder('order-1');
    expect(order.status).toBe('cancelled');
    expect(db.save).toHaveBeenCalledWith(order);
  });

  it('cancelOrder — throws when order is shipped', async () => {
    const order = makeOrder({ status: 'shipped' });
    const db = makeRepo(order);
    const service = new OrderService(db, {} as PaymentGateway);
    await expect(service.cancelOrder('order-1')).rejects.toThrow('Cannot cancel a shipped order');
  });

  it('applyDiscount — applies discount (note: applies to total, not subtotal)', () => {
    const order = makeOrder({ subtotal: 100, total: 115 });
    const service = new OrderService(makeRepo(order), {} as PaymentGateway);
    const result = service.applyDiscount(order, 10);
    // The BUG: discount is applied to total (115) instead of subtotal (100)
    // Expected (correct) behavior: total = 115 - (100 * 0.10) = 105
    // Actual (buggy) behavior:    total = 115 - (115 * 0.10) = 103.5
    expect(result.total).toBe(103.5); // reflects the bug
  });
});
