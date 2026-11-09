import { Buffer } from 'node:buffer';
import { z } from 'zod';

// This module is imported by server routes only. Sandbox is deliberately fixed:
// changing an environment variable can never accidentally enable live charges.
const PAYPAL_API = 'https://api-m.sandbox.paypal.com';
const moneySchema = z.object({ currency_code: z.string(), value: z.string() });
const captureSchema = z.object({
  id: z.string(), status: z.string(), amount: moneySchema,
  final_capture: z.boolean().optional(), create_time: z.string().optional(),
});
const orderSchema = z.object({
  id: z.string().regex(/^[A-Z0-9]{1,36}$/), status: z.string(), intent: z.string().optional(),
  purchase_units: z.array(z.object({
    reference_id: z.string().optional(), custom_id: z.string().optional(),
    invoice_id: z.string().optional(), amount: moneySchema.optional(),
    payee: z.object({ merchant_id: z.string().optional() }).optional(),
    payments: z.object({ captures: z.array(captureSchema).optional() }).optional(),
  })).optional(),
  links: z.array(z.object({ rel: z.string(), href: z.string(), method: z.string().optional() })).optional(),
});

export type PayPalOrder = z.infer<typeof orderSchema>;
export type OrderInvoice = {
  id: string; number: string; totalCents: number; currency: string; paymentToken: string;
};
export type CreateOrderInput = {
  invoice: OrderInvoice; requestId: string; returnUrl: string; cancelUrl: string;
};
export interface PayPalGateway {
  assertConfigured(): void;
  createOrder(input: CreateOrderInput): Promise<PayPalOrder>;
  getOrder(orderId: string): Promise<PayPalOrder>;
  captureOrder(orderId: string, requestId: string): Promise<PayPalOrder>;
}

export class PaymentError extends Error {
  constructor(message: string, public statusCode = 400, public code = 'PAYMENT_ERROR') {
    super(message);
    this.name = 'PaymentError';
  }
}

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim());
}

export function approvalUrl(order: PayPalOrder): string | null {
  const link = order.links?.find((item) => item.rel === 'payer-action' || item.rel === 'approve');
  if (!link) return null;
  try {
    const url = new URL(link.href);
    if (url.protocol !== 'https:' || !['www.sandbox.paypal.com', 'sandbox.paypal.com'].includes(url.hostname)
        || url.username || url.password || url.port) throw new Error('Unexpected approval URL');
    return url.toString();
  } catch {
    throw new PaymentError('PayPal returned an invalid sandbox approval link.', 502, 'INVALID_APPROVAL_URL');
  }
}

export function appOrigin() {
  try {
    const url = new URL(process.env.APP_URL || 'http://localhost:3000');
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid origin');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('Use HTTPS');
    }
    return url.origin;
  } catch {
    throw new PaymentError('Set APP_URL to your application origin (HTTPS, or localhost for development).', 503, 'APP_URL_INVALID');
  }
}

export function createPayPalGateway(fetcher: typeof fetch = fetch): PayPalGateway {
  let accessToken: { value: string; expiresAt: number; clientId: string } | null = null;
  let tokenPromise: Promise<string> | null = null;

  function assertConfigured() {
    if (!paypalConfigured()) {
      throw new PaymentError('PayPal Sandbox is not connected. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to your server environment.', 503, 'PAYPAL_NOT_CONFIGURED');
    }
  }

  async function safeFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetcher(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15_000), redirect: 'error' });
    } catch {
      throw new PaymentError('PayPal could not be reached. Retry this payment to safely check its existing status.', 502, 'PAYPAL_UNAVAILABLE');
    }
  }

  async function token(): Promise<string> {
    assertConfigured();
    const clientId = process.env.PAYPAL_CLIENT_ID!.trim();
    if (accessToken && accessToken.clientId === clientId && accessToken.expiresAt > Date.now()) return accessToken.value;
    if (tokenPromise) return tokenPromise;
    tokenPromise = (async () => {
      const response = await safeFetch(`${PAYPAL_API}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${process.env.PAYPAL_CLIENT_SECRET!.trim()}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (!response.ok) throw new PaymentError('PayPal Sandbox authentication failed. Check the server credentials.', 503, 'PAYPAL_AUTH_FAILED');
      const parsed = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).safeParse(await response.json());
      if (!parsed.success) throw new PaymentError('PayPal returned an invalid authentication response.', 502, 'PAYPAL_RESPONSE_INVALID');
      accessToken = { value: parsed.data.access_token, expiresAt: Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000, clientId };
      return accessToken.value;
    })();
    try { return await tokenPromise; } finally { tokenPromise = null; }
  }

  async function request(path: string, method: 'GET' | 'POST', body?: unknown, requestId?: string): Promise<PayPalOrder> {
    const bearer = await token();
    const response = await safeFetch(`${PAYPAL_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', Prefer: 'return=representation',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      if (response.status === 401) accessToken = null;
      let issue = '';
      try {
        const data = await response.json() as { details?: { issue?: string }[] };
        issue = data.details?.[0]?.issue || '';
      } catch { /* Never forward provider response bodies or credentials. */ }
      if (issue === 'INSTRUMENT_DECLINED') throw new PaymentError('PayPal declined this payment method. Return to PayPal and choose another method.', 422, issue);
      if (issue === 'ORDER_NOT_APPROVED') throw new PaymentError('Approve this order in PayPal before confirming payment.', 409, issue);
      if (issue === 'ORDER_ALREADY_CAPTURED') throw new PaymentError('This order was already captured. Refresh its payment status.', 409, issue);
      if (response.status === 404) throw new PaymentError('This PayPal order is unavailable or has expired. Contact the invoice owner.', 409, 'PAYPAL_ORDER_UNAVAILABLE');
      throw new PaymentError('PayPal could not complete the request. Retry to safely check the existing payment.', 502, 'PAYPAL_REQUEST_FAILED');
    }
    let data: unknown;
    try { data = await response.json(); } catch { throw new PaymentError('PayPal returned an invalid response. Retry to check payment status.', 502, 'PAYPAL_RESPONSE_INVALID'); }
    const parsed = orderSchema.safeParse(data);
    if (!parsed.success) throw new PaymentError('PayPal returned an invalid order response. Retry to check payment status.', 502, 'PAYPAL_RESPONSE_INVALID');
    return parsed.data;
  }

  function pathFor(orderId: string) {
    if (!/^[A-Z0-9]{1,36}$/.test(orderId)) throw new PaymentError('Invalid PayPal order ID.', 400, 'INVALID_ORDER_ID');
    return `/v2/checkout/orders/${orderId}`;
  }

  return {
    assertConfigured,
    createOrder: ({ invoice, requestId, returnUrl, cancelUrl }) => request('/v2/checkout/orders', 'POST', {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: invoice.id, custom_id: invoice.id, invoice_id: `${invoice.number}-${invoice.id}`,
        description: `PayPilot AI invoice ${invoice.number}`,
        amount: { currency_code: invoice.currency, value: (invoice.totalCents / 100).toFixed(2) },
      }],
      payment_source: { paypal: { experience_context: {
        brand_name: 'PayPilot AI', shipping_preference: 'NO_SHIPPING', user_action: 'CONTINUE',
        return_url: returnUrl, cancel_url: cancelUrl,
      } } },
    }, requestId),
    getOrder: (orderId) => request(pathFor(orderId), 'GET'),
    captureOrder: (orderId, requestId) => request(`${pathFor(orderId)}/capture`, 'POST', {}, requestId),
  };
}

export const paypalGateway = createPayPalGateway();
