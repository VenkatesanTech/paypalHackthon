import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient, type Invoice } from '@prisma/client';
import { createPaymentService } from '../src/lib/payment-service';
import { PaymentError, type CreateOrderInput, type PayPalGateway, type PayPalOrder } from '../src/lib/paypal';

// Only the external PayPal gateway is simulated. These tests exercise the real
// service, database transactions, unique constraints, and capture leases.
describe('invoice to PayPal payment flow', { concurrency: false }, () => {
  let directory: string;
  let database: PrismaClient;
  let invoice: Invoice;
  let gateway: FakeGateway;
  let service: ReturnType<typeof createPaymentService>;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'paypilot-payment-tests-'));
    database = new PrismaClient({ datasources: { db: { url: `file:${join(directory, 'test.db').replaceAll('\\', '/')}` } } });
    const migrations = resolve('prisma/migrations');
    for (const entry of (await readdir(migrations, { withFileTypes: true })).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const sql = await readFile(join(migrations, entry.name, 'migration.sql'), 'utf8');
      for (const statement of sql.split(';').map((text) => text.trim()).filter(Boolean)) {
        await database.$executeRawUnsafe(statement);
      }
    }
  });

  after(async () => {
    await database?.$disconnect();
    // Remove only the uniquely created test directory beneath the OS temp root.
    if (directory && resolve(directory).startsWith(resolve(tmpdir()) + '\\') && directory.includes('paypilot-payment-tests-')) {
      await rm(directory, { recursive: true, force: true });
    } else if (directory && resolve(directory).startsWith(resolve(tmpdir()) + '/') && directory.includes('paypilot-payment-tests-')) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await database.payment.deleteMany();
    await database.invoice.deleteMany();
    invoice = await database.invoice.create({ data: {
      number: 'INV-TEST-001', clientName: 'Test Client', clientEmail: 'test@example.com',
      dueDate: new Date('2030-12-01'), totalCents: 12500, currency: 'USD', status: 'PENDING',
      items: JSON.stringify([{ description: 'Design work', quantity: 1, unitPriceCents: 12500 }]),
    } });
    gateway = new FakeGateway();
    service = createPaymentService(database, gateway, () => 'http://localhost:3000');
    delete process.env.PAYPAL_MERCHANT_ID;
  });

  const access = () => ({ invoiceId: invoice.id, paymentToken: invoice.paymentToken, confirmed: true });
  async function checkout() {
    const created = await service.create(access());
    assert.ok(created.orderId);
    return { ...access(), orderId: created.orderId };
  }
  const paidInvoice = () => database.invoice.findUniqueOrThrow({ where: { id: invoice.id } });

  it('requires explicit confirmation before allocating an order or capturing', async () => {
    await assert.rejects(service.create({ ...access(), confirmed: false }), code('CONFIRMATION_REQUIRED'));
    assert.equal(await database.payment.count(), 0);
    const input = await checkout();
    await assert.rejects(service.capture({ ...input, confirmed: false }), code('CONFIRMATION_REQUIRED'));
    assert.equal(gateway.captureRequests.length, 0);
  });

  it('rejects draft invoices and invalid bearer tokens', async () => {
    await assert.rejects(service.create({ ...access(), paymentToken: 'wrong-token' }), code('INVOICE_NOT_FOUND'));
    await database.invoice.update({ where: { id: invoice.id }, data: { status: 'DRAFT' } });
    await assert.rejects(service.create(access()), code('INVOICE_DRAFT'));
    assert.equal(gateway.createRequests.length, 0);
  });

  it('takes the amount from the database and reuses one payable order', async () => {
    const first = await service.create(access());
    const again = await service.create(access());
    assert.equal(first.orderId, again.orderId);
    assert.equal(gateway.createRequests.length, 1);
    assert.equal(gateway.createRequests[0].invoice.totalCents, 12500);
    assert.equal(gateway.createRequests[0].invoice.currency, 'USD');
    assert.equal(gateway.createRequests[0].returnUrl, `http://localhost:3000/pay/${invoice.paymentToken}?paypal=approved`);
    assert.equal(gateway.captureRequests.length, 0);
    assert.equal(await database.payment.count(), 1);
    assert.equal((await paidInvoice()).status, 'PENDING');
  });

  it('prevents concurrent order creation with a persisted lease', async () => {
    const entered = deferred();
    const release = deferred();
    gateway.onCreate = async () => { entered.resolve(); await release.promise; };
    const first = service.create(access());
    await entered.promise;
    await assert.rejects(service.create(access()), code('PAYMENT_BUSY'));
    release.resolve();
    await first;
    assert.equal(gateway.createRequests.length, 1);
  });

  it('does not capture an order until PayPal confirms buyer approval', async () => {
    const input = await checkout();
    await assert.rejects(service.capture(input), code('ORDER_NOT_APPROVED'));
    assert.equal(gateway.captureRequests.length, 0);
    assert.equal((await paidInvoice()).status, 'PENDING');
  });

  it('verifies a completed capture and records paid status atomically', async () => {
    const input = await checkout();
    gateway.order.status = 'APPROVED';
    const result = await service.capture(input);
    assert.equal(result.paid, true);
    assert.equal(result.captureId, 'CAPTURE000001');
    assert.equal((await paidInvoice()).status, 'PAID');
    const payment = await database.payment.findUniqueOrThrow({ where: { invoiceId: invoice.id } });
    assert.equal(payment.captureId, result.captureId);
    assert.equal(payment.status, 'COMPLETED');
    assert.equal(payment.leaseExpiresAt, null);
    await service.capture(input);
    assert.equal(gateway.captureRequests.length, 1, 'refreshes and retries cannot capture twice');
  });

  it('rejects a foreign PayPal order even with a valid invoice token', async () => {
    const input = await checkout();
    await assert.rejects(service.capture({ ...input, orderId: 'OTHERORDER' }), code('ORDER_MISMATCH'));
    assert.equal(gateway.captureRequests.length, 0);
  });

  it('checks amount, currency, invoice identity, and intent before charging', async () => {
    const input = await checkout();
    gateway.order.status = 'APPROVED';
    const original = structuredClone(gateway.order);
    const mutations = [
      (order: PayPalOrder) => { order.purchase_units![0].amount!.value = '0.01'; },
      (order: PayPalOrder) => { order.purchase_units![0].amount!.currency_code = 'EUR'; },
      (order: PayPalOrder) => { order.purchase_units![0].custom_id = 'another-invoice'; },
      (order: PayPalOrder) => { order.purchase_units![0].reference_id = 'another-invoice'; },
      (order: PayPalOrder) => { order.intent = 'AUTHORIZE'; },
    ];
    for (const mutate of mutations) {
      gateway.order = structuredClone(original);
      mutate(gateway.order);
      await assert.rejects(service.capture(input), code('PAYMENT_MISMATCH'));
    }
    assert.equal(gateway.captureRequests.length, 0);
    assert.equal((await paidInvoice()).status, 'PENDING');
  });

  it('rejects a mismatched payee when merchant verification is configured', async () => {
    const input = await checkout();
    gateway.order.status = 'APPROVED';
    process.env.PAYPAL_MERCHANT_ID = 'EXPECTEDMERCHANT';
    await assert.rejects(service.capture(input), code('PAYEE_MISMATCH'));
    assert.equal(gateway.captureRequests.length, 0);
  });

  it('never marks pending or mismatched captures as paid', async () => {
    const input = await checkout();
    gateway.order.status = 'APPROVED';
    gateway.captureStatus = 'PENDING';
    assert.equal((await service.capture(input)).paid, false);
    assert.equal((await paidInvoice()).status, 'PENDING');
    await service.capture(input);
    assert.equal(gateway.captureRequests.length, 1, 'pending captures must not trigger a second charge');
    gateway.order.purchase_units![0].payments!.captures![0].status = 'COMPLETED';
    gateway.order.purchase_units![0].payments!.captures![0].amount.value = '125.01';
    await assert.rejects(service.status(input), code('CAPTURE_MISMATCH'));
    assert.equal((await paidInvoice()).status, 'PENDING');
  });

  it('recovers a timeout after a successful remote capture without charging again', async () => {
    const input = await checkout();
    gateway.order.status = 'APPROVED';
    gateway.failAfterCapture = true;
    assert.equal((await service.capture(input)).paid, true);
    assert.equal((await service.capture(input)).paid, true);
    assert.equal(gateway.captureRequests.length, 1);
    assert.equal((await paidInvoice()).status, 'PAID');
  });

  it('reuses the capture idempotency key after an uncertain failed request', async () => {
    const input = await checkout();
    gateway.order.status = 'APPROVED';
    gateway.failBeforeCapture = true;
    await assert.rejects(service.capture(input), code('PAYPAL_UNAVAILABLE'));
    gateway.failBeforeCapture = false;
    assert.equal((await service.capture(input)).paid, true);
    assert.equal(gateway.captureRequests.length, 2);
    assert.equal(gateway.captureRequests[0], gateway.captureRequests[1]);
  });

  it('prevents concurrent capture requests across independent service instances', async () => {
    const input = await checkout();
    gateway.order.status = 'APPROVED';
    const entered = deferred(), release = deferred();
    gateway.onCapture = async () => { entered.resolve(); await release.promise; };
    const first = service.capture(input);
    await entered.promise;
    const otherInstance = createPaymentService(database, gateway, () => 'http://localhost:3000');
    await assert.rejects(otherInstance.capture(input), code('PAYMENT_BUSY'));
    release.resolve();
    await first;
    assert.equal(gateway.captureRequests.length, 1);
  });

  it('reuses the order idempotency key after uncertain creation', async () => {
    gateway.failAfterCreate = true;
    await assert.rejects(service.create(access()), code('PAYPAL_UNAVAILABLE'));
    gateway.failAfterCreate = false;
    await service.create(access());
    assert.equal(gateway.createRequests.length, 2);
    assert.equal(gateway.createRequests[0].requestId, gateway.createRequests[1].requestId);
    assert.equal(await database.payment.count(), 1);
  });

  it('blocks unsafe recreation after the idempotency retry window', async () => {
    await database.payment.create({ data: {
      invoiceId: invoice.id, amountCents: invoice.totalCents, currency: invoice.currency,
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    } });
    await assert.rejects(service.create(access()), code('CHECKOUT_RECONCILIATION_REQUIRED'));
    assert.equal(gateway.createRequests.length, 0);
  });

  it('status refresh reconciles an existing capture and never initiates payment', async () => {
    const input = await checkout();
    gateway.finishCapture();
    assert.equal((await service.status(input)).paid, true);
    assert.equal(gateway.captureRequests.length, 0);
    assert.equal((await paidInvoice()).status, 'PAID');
  });
});

function code(expected: string) {
  return (error: unknown) => error instanceof PaymentError && error.code === expected;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

class FakeGateway implements PayPalGateway {
  order!: PayPalOrder;
  createRequests: CreateOrderInput[] = [];
  captureRequests: string[] = [];
  captureStatus = 'COMPLETED';
  failBeforeCapture = false;
  failAfterCapture = false;
  failAfterCreate = false;
  onCreate?: () => Promise<void>;
  onCapture?: () => Promise<void>;
  assertConfigured() {}
  async createOrder(input: CreateOrderInput) {
    this.createRequests.push(structuredClone(input));
    await this.onCreate?.();
    this.order = {
      id: 'ORDER000001', status: 'CREATED', intent: 'CAPTURE',
      purchase_units: [{
        reference_id: input.invoice.id, custom_id: input.invoice.id,
        amount: { currency_code: input.invoice.currency, value: (input.invoice.totalCents / 100).toFixed(2) },
        payee: { merchant_id: 'TESTMERCHANT' },
      }],
      links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER000001' }],
    };
    if (this.failAfterCreate) throw new PaymentError('Simulated timeout', 502, 'PAYPAL_UNAVAILABLE');
    return structuredClone(this.order);
  }
  async getOrder() { return structuredClone(this.order); }
  async captureOrder(_orderId: string, requestId: string) {
    this.captureRequests.push(requestId);
    await this.onCapture?.();
    if (this.failBeforeCapture) throw new PaymentError('Simulated timeout', 502, 'PAYPAL_UNAVAILABLE');
    this.finishCapture();
    if (this.failAfterCapture) throw new PaymentError('Simulated timeout', 502, 'PAYPAL_UNAVAILABLE');
    return structuredClone(this.order);
  }
  finishCapture() {
    this.order.status = 'COMPLETED';
    this.order.purchase_units![0].payments = { captures: [{
      id: 'CAPTURE000001', status: this.captureStatus,
      amount: structuredClone(this.order.purchase_units![0].amount!), final_capture: true,
    }] };
  }
}
