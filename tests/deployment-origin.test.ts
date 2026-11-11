import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appOrigin } from '../src/lib/paypal';

test('checkout return URLs select the correct local, production and preview origin', () => {
  const names = ['APP_URL','VERCEL_ENV','VERCEL_PROJECT_PRODUCTION_URL','VERCEL_URL'] as const;
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.equal(appOrigin(), 'http://localhost:3000');
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'paypilot.example.com';
    process.env.VERCEL_URL = 'paypilot-preview.example.com';
    assert.equal(appOrigin(), 'https://paypilot.example.com');
    process.env.VERCEL_ENV = 'preview';
    assert.equal(appOrigin(), 'https://paypilot-preview.example.com');
    process.env.APP_URL = 'https://custom.example.com';
    assert.equal(appOrigin(), 'https://custom.example.com');
    for (const invalid of ['http://public.example.com', 'https://example.com/path', 'https://user:pass@example.com']) {
      process.env.APP_URL = invalid;
      assert.throws(appOrigin, /application origin/);
    }
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});
