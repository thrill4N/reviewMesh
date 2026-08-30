/**
 * paymentProcessor.ts — processes payment transactions.
 *
 * This is the BEFORE state for TC-005. It contains multiple issues:
 *   1. No role-based access control — any role can process unlimited amounts.
 *   2. No upper bound on transaction amounts — facilitates fraud.
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

// Simulated payment gateway.
async function chargeGateway(amount: number, currency: string): Promise<string> {
  // Returns a transaction ID.
  return `TXN-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

/**
 * Processes a payment for the given request.
 * No role check, no amount limit.
 */
export async function processPayment(request: PaymentRequest): Promise<PaymentResult> {
  const txnId = await chargeGateway(request.amount, request.currency);
  return {
    transactionId: txnId,
    status: 'success',
    processedAt: new Date().toISOString(),
  };
}
