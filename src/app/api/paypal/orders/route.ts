import { NextResponse } from 'next/server';
import { z } from 'zod';
import { payments } from '@/lib/payment-service';
import { accessSchema, paymentBody, paymentErrorResponse, privateHeaders } from '../_shared';

export const runtime = 'nodejs';
const schema = accessSchema.extend({ confirmed: z.literal(true) }).strict();

export async function POST(request: Request) {
  try {
    const input = schema.parse(await paymentBody(request));
    return NextResponse.json(await payments.create(input), { headers: privateHeaders });
  } catch (error) { return paymentErrorResponse(error); }
}
