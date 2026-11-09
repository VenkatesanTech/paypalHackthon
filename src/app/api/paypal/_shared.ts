import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentError } from '@/lib/paypal';

export const accessSchema = z.object({
  invoiceId: z.string().min(1).max(100), paymentToken: z.string().min(16).max(200),
});
export const orderIdSchema = z.string().regex(/^[A-Z0-9]{1,36}$/);

export async function paymentBody(request: Request) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new PaymentError('Cross-origin payment requests are not allowed.', 403, 'INVALID_ORIGIN');
  }
  if (!request.headers.get('content-type')?.includes('application/json')) throw new PaymentError('Send payment requests as JSON.', 415);
  const raw = await request.text();
  if (raw.length > 8192) throw new PaymentError('Payment request is too large.', 413);
  try { return JSON.parse(raw) as unknown; } catch { throw new PaymentError('Invalid JSON request.', 400); }
}

export function paymentErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: 'Check the invoice link, order ID, and confirmation before continuing.' }, { status: 400 });
  if (error instanceof PaymentError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
  return NextResponse.json({ error: 'Payment could not be processed. Retry to safely check its existing status.' }, { status: 500 });
}

export const privateHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
