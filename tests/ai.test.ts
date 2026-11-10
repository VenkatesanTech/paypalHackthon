import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftSchema, generateAi, insightsSchema, parseAiOutput } from '../src/lib/ai';

// Validation fixtures only; these are not provider responses or demo output.
const draft = { clientName: 'Demo Studio', clientEmail: 'billing@example.com', dueDate: '2026-12-01', currency: 'USD', notes: 'Review before sending.', items: [{ description: 'Design consulting', quantity: 3, unitPriceCents: 2000 }], status: 'DRAFT' };

test('AI draft validation preserves integer cents, USD and draft-only status', () => {
  assert.deepEqual(draftSchema.parse(draft), draft);
  for (const change of [{ status: 'PAID' }, { currency: 'EUR' }, { items: [{ description: 'Design', quantity: 1, unitPriceCents: 1.5 }] }]) {
    assert.equal(draftSchema.safeParse({ ...draft, ...change }).success, false);
  }
  assert.equal(draftSchema.safeParse({ ...draft, clientName: '', clientEmail: '', items: [{ description: '', quantity: 1, unitPriceCents: 0 }] }).success, true);
});

test('truncated, blocked, empty or malformed Gemini output is never accepted', () => {
  for (const reason of ['MAX_TOKENS', 'SAFETY', undefined]) assert.throws(() => parseAiOutput(JSON.stringify(draft), reason, 'invoice'));
  assert.throws(() => parseAiOutput('', 'STOP', 'invoice'));
  assert.throws(() => parseAiOutput('{', 'STOP', 'invoice'), /unreadable response/);
  assert.throws(() => parseAiOutput('{"summary":""}', 'STOP', 'insights'));
});

test('genuine Gemini invoice generation and financial summary', { skip: process.env.PAYPILOT_GEMINI_LIVE !== '1', timeout: 150000 }, async () => {
  const invoice = draftSchema.parse(await generateAi('Create a USD invoice for Demo Studio, billing@example.com, for 3 hours of design consulting at $20 per hour, due December 1, 2026. Add the note: Thank you for your business.', 'invoice'));
  assert.equal(invoice.clientName, 'Demo Studio');
  assert.equal(invoice.clientEmail, 'billing@example.com');
  assert.equal(invoice.dueDate, '2026-12-01');
  assert.equal(invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0), 6000);
  const result = insightsSchema.parse(await generateAi('Summarize the supplied test invoice activity, including the paid total and outstanding total in USD. Do not invent causes.', 'insights', [
    { status: 'PAID', totalCents: 6000, dueDate: '2026-12-01' },
    { status: 'PENDING', totalCents: 4000, dueDate: '2026-12-01' },
  ]));
  assert.match(result.summary, /60/);
  assert.match(result.summary, /40/);
});
