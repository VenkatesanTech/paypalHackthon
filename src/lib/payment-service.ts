import { timingSafeEqual } from 'node:crypto';
import type { Invoice, Payment, PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import {
  appOrigin, approvalUrl, PaymentError, paypalGateway,
  type PayPalGateway, type PayPalOrder,
} from '@/lib/paypal';

type PaymentAccess = { invoiceId: string; paymentToken: string };
type ConfirmedAccess = PaymentAccess & { confirmed: boolean };
type CaptureAccess = ConfirmedAccess & { orderId: string };
export type PaymentResult = {
  status: string; orderId: string | null; approveUrl: string | null; captureId: string | null; paid: boolean;
};

const LEASE_MS = 120_000;
// Ambiguous order creation is retried only inside PayPal's ordinary idempotency
// retention window. Never create another payable order after that window.
const SAFE_CREATE_RETRY_MS = 5 * 60 * 60 * 1000;

function sameToken(actual: string, provided: string) {
  const a = Buffer.from(actual), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function decimalCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return NaN;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : NaN;
}

export function verifyOrder(order: PayPalOrder, invoice: Invoice, payment: Payment) {
  const unit = order.purchase_units?.[0];
  if (order.id !== payment.paypalOrderId || order.intent !== 'CAPTURE' || order.purchase_units?.length !== 1
      || !unit || unit.reference_id !== invoice.id || unit.custom_id !== invoice.id
      || unit.amount?.currency_code !== payment.currency || decimalCents(unit.amount.value) !== payment.amountCents
      || invoice.totalCents !== payment.amountCents || invoice.currency !== payment.currency) {
    throw new PaymentError('Payment verification failed: the PayPal order does not match this invoice.', 409, 'PAYMENT_MISMATCH');
  }
  const merchantId = process.env.PAYPAL_MERCHANT_ID?.trim();
  if (merchantId && unit.payee?.merchant_id !== merchantId) {
    throw new PaymentError('Payment verification failed: the recipient does not match this business.', 409, 'PAYEE_MISMATCH');
  }
  const captures = unit.payments?.captures || [];
  for (const capture of captures) {
    if (capture.amount.currency_code !== payment.currency || decimalCents(capture.amount.value) !== payment.amountCents) {
      throw new PaymentError('Payment verification failed: the captured amount does not match this invoice.', 409, 'CAPTURE_MISMATCH');
    }
  }
  // This app only accepts a single full capture. No partial-payment arithmetic.
  if (captures.length > 1) throw new PaymentError('This order has an unexpected payment history. Contact the invoice owner.', 409, 'CAPTURE_MISMATCH');
  return captures[0];
}

export function createPaymentService(database: PrismaClient, gateway: PayPalGateway, origin = appOrigin) {
  async function invoiceFor(input: PaymentAccess) {
    const invoice = await database.invoice.findUnique({ where: { id: input.invoiceId }, include: { payment: true } });
    if (!invoice || !sameToken(invoice.paymentToken, input.paymentToken)) {
      throw new PaymentError('Invoice payment link was not found.', 404, 'INVOICE_NOT_FOUND');
    }
    if (invoice.status === 'DRAFT') throw new PaymentError('This invoice is still a draft and cannot accept payments.', 409, 'INVOICE_DRAFT');
    return invoice;
  }

  function result(payment: Payment, status = payment.status): PaymentResult {
    return { status, orderId: payment.paypalOrderId, approveUrl: payment.approvalUrl, captureId: payment.captureId, paid: payment.status === 'COMPLETED' };
  }

  async function acquire(payment: Payment, operation: 'CREATING' | 'CAPTURING') {
    const now = new Date();
    const lease = new Date(now.getTime() + LEASE_MS);
    const locked = await database.payment.updateMany({
      where: { id: payment.id, status: { not: 'COMPLETED' }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
      data: { leaseExpiresAt: lease, status: operation },
    });
    if (locked.count !== 1) throw new PaymentError('This payment is already being processed. Wait a moment, then refresh its status.', 409, 'PAYMENT_BUSY');
    return lease;
  }

  async function release(payment: Payment, lease: Date, status: string) {
    await database.payment.updateMany({
      where: { id: payment.id, leaseExpiresAt: lease, status: { not: 'COMPLETED' } },
      data: { leaseExpiresAt: null, status },
    });
  }

  async function reconcile(invoice: Invoice, payment: Payment, order: PayPalOrder): Promise<PaymentResult> {
    const capture = verifyOrder(order, invoice, payment);
    if (order.status === 'COMPLETED' && capture?.status === 'COMPLETED') {
      // Both records commit together, so a crashed response or duplicate return
      // cannot leave an invoice paid without its uniquely recorded capture.
      const completed = await database.$transaction(async (tx) => {
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.captureId && current.captureId !== capture.id) throw new PaymentError('Payment reference mismatch.', 409, 'CAPTURE_MISMATCH');
        const saved = await tx.payment.update({ where: { id: payment.id }, data: {
          status: 'COMPLETED', captureId: capture.id, leaseExpiresAt: null,
        } });
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID' } });
        return saved;
      });
      return result(completed);
    }
    // A completed order with a pending/declined capture is not a paid invoice.
    const remoteStatus = capture ? capture.status : order.status;
    if (payment.status === 'COMPLETED') {
      // A later refund/reversal must not be represented as freshly verified paid.
      return { ...result(payment, remoteStatus), paid: false };
    }
    return { ...result(payment, remoteStatus), paid: false };
  }

  async function create(input: ConfirmedAccess): Promise<PaymentResult> {
    if (input.confirmed !== true) throw new PaymentError('Confirm the invoice amount before opening PayPal.', 400, 'CONFIRMATION_REQUIRED');
    gateway.assertConfigured();
    const baseUrl = origin();
    let invoice = await invoiceFor(input);
    if (invoice.status === 'PAID' && invoice.payment?.status === 'COMPLETED') return result(invoice.payment);
    if (invoice.status === 'PAID') throw new PaymentError('This invoice is already paid.', 409, 'ALREADY_PAID');

    // Invoice editing also checks for this row inside its transaction. Snapshot
    // the amount and reserve the only payment slot in one database transaction.
    const payment = await database.$transaction(async (tx) => {
      const fresh = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { payment: true } });
      if (!['PENDING', 'OVERDUE'].includes(fresh.status)) throw new PaymentError('Only issued, unpaid invoices accept payment.', 409, 'INVOICE_NOT_PAYABLE');
      if (fresh.payment) return fresh.payment;
      return tx.payment.create({ data: { invoiceId: fresh.id, amountCents: fresh.totalCents, currency: fresh.currency } });
    });
    invoice = await invoiceFor(input);
    if (payment.amountCents !== invoice.totalCents || payment.currency !== invoice.currency) throw new PaymentError('The invoice changed after checkout began. Contact the invoice owner.', 409, 'PAYMENT_MISMATCH');
    if (payment.status === 'COMPLETED') return result(payment);
    if (payment.paypalOrderId) {
      const order = await gateway.getOrder(payment.paypalOrderId);
      const current = await reconcile(invoice, payment, order);
      return { ...current, approveUrl: approvalUrl(order) || payment.approvalUrl };
    }
    if (Date.now() - payment.createdAt.getTime() > SAFE_CREATE_RETRY_MS) {
      throw new PaymentError('This checkout could not be safely resumed. Contact the invoice owner to reconcile it in PayPal before creating another invoice.', 409, 'CHECKOUT_RECONCILIATION_REQUIRED');
    }
    const lease = await acquire(payment, 'CREATING');
    try {
      const page = `${baseUrl}/pay/${encodeURIComponent(invoice.paymentToken)}`;
      const order = await gateway.createOrder({ invoice, requestId: payment.requestId, returnUrl: `${page}?paypal=approved`, cancelUrl: `${page}?paypal=cancelled` });
      const link = approvalUrl(order);
      if (!link) throw new PaymentError('PayPal did not provide an approval link. Retry to resume this checkout.', 502, 'APPROVAL_MISSING');
      // Persist the returned order before any later remote request. An uncertain
      // response retries the same requestId; it never allocates a second order.
      const saved = await database.payment.update({ where: { id: payment.id }, data: {
        paypalOrderId: order.id, approvalUrl: link, status: 'CREATED', leaseExpiresAt: null,
      } });
      return result(saved, order.status);
    } catch (error) {
      await release(payment, lease, 'CREATING');
      throw error;
    }
  }

  async function capture(input: CaptureAccess): Promise<PaymentResult> {
    if (input.confirmed !== true) throw new PaymentError('Confirm payment before capturing this order.', 400, 'CONFIRMATION_REQUIRED');
    const invoice = await invoiceFor(input);
    const payment = invoice.payment;
    if (!payment || payment.paypalOrderId !== input.orderId) throw new PaymentError('This PayPal order does not belong to this invoice.', 409, 'ORDER_MISMATCH');
    if (payment.status === 'COMPLETED') return result(payment);
    gateway.assertConfigured();
    const lease = await acquire(payment, 'CAPTURING');
    try {
      const before = await gateway.getOrder(input.orderId);
      const existing = verifyOrder(before, invoice, payment);
      if (before.status === 'COMPLETED' || existing) return await reconcile(invoice, payment, before);
      if (before.status !== 'APPROVED') throw new PaymentError('Approve this order in PayPal before confirming payment.', 409, 'ORDER_NOT_APPROVED');
      try {
        await gateway.captureOrder(input.orderId, payment.captureRequestId);
      } catch (error) {
        // A timeout may occur after PayPal actually charged the buyer. Reconcile
        // before reporting failure; any subsequent retry uses the same key.
        try {
          const recovered = await gateway.getOrder(input.orderId);
          const state = await reconcile(invoice, payment, recovered);
          if (state.paid || recovered.purchase_units?.[0]?.payments?.captures?.length) return state;
        } catch { /* Keep the original safe provider error; never claim success. */ }
        throw error;
      }
      return await reconcile(invoice, payment, await gateway.getOrder(input.orderId));
    } finally {
      await release(payment, lease, 'CREATED');
    }
  }

  async function status(input: PaymentAccess & { orderId?: string }): Promise<PaymentResult> {
    const invoice = await invoiceFor(input);
    const payment = invoice.payment;
    if (!payment?.paypalOrderId) return { status: 'NOT_STARTED', orderId: null, approveUrl: null, captureId: null, paid: false };
    if (input.orderId && input.orderId !== payment.paypalOrderId) throw new PaymentError('This PayPal order does not belong to this invoice.', 409, 'ORDER_MISMATCH');
    gateway.assertConfigured();
    const order = await gateway.getOrder(payment.paypalOrderId);
    return reconcile(invoice, payment, order);
  }

  return { create, capture, status };
}

export const payments = createPaymentService(db, paypalGateway);
