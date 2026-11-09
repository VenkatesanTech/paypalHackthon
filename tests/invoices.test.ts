import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceSchema,total,status } from '../src/lib/invoices';
test('money uses integer cents and validates totals',()=>{assert.equal(total([{quantity:3,unitPriceCents:1999}]),5997);assert.throws(()=>total([{quantity:10000,unitPriceCents:100000000}]));});
test('clients cannot declare invoices paid or supply fractional cents',()=>{const v={clientName:'Client',clientEmail:'client@example.com',dueDate:'2026-12-01',items:[{description:'Design',quantity:1,unitPriceCents:100}],status:'PAID'};assert.equal(invoiceSchema.safeParse(v).success,false);assert.equal(invoiceSchema.safeParse({...v,status:'DRAFT',items:[{description:'Design',quantity:1,unitPriceCents:1.5}]}).success,false);});
test('overdue is derived only for issued invoices',()=>{assert.equal(status({status:'PENDING',dueDate:'2020-01-01'}),'OVERDUE');assert.equal(status({status:'DRAFT',dueDate:'2020-01-01'}),'DRAFT');assert.equal(status({status:'PAID',dueDate:'2020-01-01'}),'PAID');});
