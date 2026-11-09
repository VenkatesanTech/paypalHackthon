import { NextResponse } from 'next/server';
import { payments } from '@/lib/payment-service';
import { accessSchema, orderIdSchema, paymentBody, paymentErrorResponse, privateHeaders } from '../_shared';

export const runtime = 'nodejs';
const schema = accessSchema.extend({ orderId: orderIdSchema.optional() }).strict();

// POST keeps bearer payment tokens out of query strings and proxy access logs.
// This only verifies a pre-existing order and never initiates a charge.
export async function POST(request: Request) {
  try {
    const input = schema.parse(await paymentBody(request));
    return NextResponse.json(await payments.status(input), { headers: privateHeaders });
  } catch (error) { return paymentErrorResponse(error); }
}
