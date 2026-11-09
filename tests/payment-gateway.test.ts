import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { approvalUrl, createPayPalGateway, PaymentError } from '../src/lib/paypal';

describe('PayPal server gateway', { concurrency: false }, () => {
  let originalId: string | undefined, originalSecret: string | undefined;
  before(() => {
    originalId = process.env.PAYPAL_CLIENT_ID;
    originalSecret = process.env.PAYPAL_CLIENT_SECRET;
    process.env.PAYPAL_CLIENT_ID = 'test-server-client';
    process.env.PAYPAL_CLIENT_SECRET = 'test-server-secret';
  });
  after(() => {
    if (originalId === undefined) delete process.env.PAYPAL_CLIENT_ID; else process.env.PAYPAL_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET; else process.env.PAYPAL_CLIENT_SECRET = originalSecret;
  });

  it('uses the fixed sandbox API, OAuth credentials, and stable request IDs', async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetcher: typeof fetch = async (url, init = {}) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify(String(url).endsWith('/token')
        ? { access_token: 'private-access-token', expires_in: 3600 }
        : { id: 'ORDER123', status: 'CREATED' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const gateway = createPayPalGateway(fetcher);
    await gateway.createOrder({
      invoice: { id: 'invoice-123', number: 'INV-001', totalCents: 1099, currency: 'USD', paymentToken: 'private-token' },
      requestId: 'create-key', returnUrl: 'http://localhost:3000/pay/private-token?paypal=approved', cancelUrl: 'http://localhost:3000/pay/private-token?paypal=cancelled',
    });
    await gateway.captureOrder('ORDER123', 'capture-key');
    assert.equal(requests.length, 3, 'access token is cached on the server');
    for (const request of requests) assert.ok(request.url.startsWith('https://api-m.sandbox.paypal.com/'));
    assert.equal(new Headers(requests[0].init.headers).get('Authorization'), `Basic ${Buffer.from('test-server-client:test-server-secret').toString('base64')}`);
    const create = requests[1];
    assert.equal(new Headers(create.init.headers).get('PayPal-Request-Id'), 'create-key');
    assert.equal(new Headers(requests[2].init.headers).get('PayPal-Request-Id'), 'capture-key');
    const body = JSON.parse(String(create.init.body));
    assert.deepEqual(body.purchase_units[0].amount, { currency_code: 'USD', value: '10.99' });
    assert.equal(body.payment_source.paypal.experience_context.user_action, 'CONTINUE');
    assert.equal(body.intent, 'CAPTURE');
    assert.ok(!String(create.init.body).includes('test-server-secret'));
  });

  it('fails safely when credentials are absent without making network requests', async () => {
    const previous = process.env.PAYPAL_CLIENT_SECRET;
    delete process.env.PAYPAL_CLIENT_SECRET;
    let calls = 0;
    const gateway = createPayPalGateway(async () => { calls++; return new Response(); });
    await assert.rejects(gateway.getOrder('ORDER123'), (error: unknown) => error instanceof PaymentError && error.code === 'PAYPAL_NOT_CONFIGURED');
    assert.equal(calls, 0);
    process.env.PAYPAL_CLIENT_SECRET = previous;
  });

  it('does not forward provider response bodies or secrets in errors', async () => {
    const gateway = createPayPalGateway(async (url) => new Response(JSON.stringify(String(url).endsWith('/token')
      ? { access_token: 'private-access-token', expires_in: 3600 }
      : { message: 'SECRET_PROVIDER_CONTENT' }), { status: String(url).endsWith('/token') ? 200 : 500 }));
    await assert.rejects(gateway.getOrder('ORDER123'), (error: unknown) => error instanceof PaymentError && !error.message.includes('SECRET_PROVIDER_CONTENT'));
  });

  it('rejects live, credential-bearing, and malicious approval links', () => {
    for (const href of ['https://www.paypal.com/checkoutnow', 'https://www.sandbox.paypal.com.evil.test/', 'javascript:alert(1)', 'https://user:pass@www.sandbox.paypal.com/']) {
      assert.throws(() => approvalUrl({ id: 'ORDER123', status: 'CREATED', links: [{ rel: 'approve', href }] }), PaymentError);
    }
    assert.equal(approvalUrl({ id: 'ORDER123', status: 'CREATED', links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123' }] }), 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123');
  });
});
