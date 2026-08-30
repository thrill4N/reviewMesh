/**
 * paymentProcessor.ts — processes payment transactions.
 *
 * Changes in this version:
 *   - Adds role-based fee (admin: no fee, member: 2%, guest: 5%).
 *   - Adds a per-request amount limit (guest: $500, member: $5000, admin: unlimited).
 */

export type UserRole = 'admin' | 'member' | 'guest';

export interface PaymentRequest {
  userId: string;
  role: UserRole;
  amount: number;
  currency: string;
  description: string;
}

export interface PaymentResult {
  transactionId: string;
  status: 'success' | 'failed';
  processedAt: string;
}

// Per-role transaction limits in the base currency unit (e.g. USD cents).
// BUG (correctness): limits are defined in dollars but compared against cents-based amounts,
// causing the guest limit to be 500x too permissive.
const ROLE_LIMITS: Record<UserRole, number> = {
  guest: 500,    // intended: $500 but amount is in cents → effective limit $5
  member: 5000,  // intended: $5,000 but amount is in cents → effective limit $50
  admin: Infinity,
};

const ROLE_FEES: Record<UserRole, number> = {
  guest: 0.05,
  member: 0.02,
  admin: 0,
};

// Simulated payment gateway.
async function chargeGateway(amount: number, currency: string): Promise<string> {
  return `TXN-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

/**
 * Processes a payment, applying role-based fees and limits.
 *
 * SECURITY: the `role` field comes directly from the request payload with no
 * server-side verification. A caller can self-elevate to 'admin' to bypass
 * fee charges and limits.
 */
export async function processPayment(request: PaymentRequest): Promise<PaymentResult> {
  const limit = ROLE_LIMITS[request.role];

  // Correctness bug: limit is in dollars, amount is in cents.
  if (request.amount > limit) {
    throw new Error(`Amount exceeds limit for role ${request.role}.`);
  }

  const fee = Math.round(request.amount * ROLE_FEES[request.role]);
  const total = request.amount + fee;

  const txnId = await chargeGateway(total, request.currency);
  return {
    transactionId: txnId,
    status: 'success',
    processedAt: new Date().toISOString(),
  };
}
