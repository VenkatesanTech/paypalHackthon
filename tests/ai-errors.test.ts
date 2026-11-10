import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiProviderError } from '../src/lib/ai-errors';

test('Gemini invalid keys, permissions and quota failures have actionable messages', () => {
  assert.match(aiProviderError({ status: 400, message: 'API_KEY_INVALID' }).message, /authentication failed/);
  assert.match(aiProviderError({ status: 401 }).message, /GEMINI_API_KEY/);
  assert.match(aiProviderError({ status: 403 }).message, /permissions/);
  assert.equal(aiProviderError({ status: 429 }).status, 429);
  assert.match(aiProviderError({ status: 429 }).message, /quota and billing/);
  assert.match(aiProviderError({ status: 404 }).message, /gemini-3.5-flash/);
});

test('network and timeout errors do not expose SDK messages or credentials', () => {
  const secret = 'private-provider-response-must-not-escape';
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    assert.ok(!aiProviderError({ status, message: secret }).message.includes(secret));
  }
  assert.match(aiProviderError(new TypeError('fetch failed: ' + secret)).message, /network connection/);
  assert.equal(aiProviderError({ name: 'AbortError', message: secret }).status, 504);
  assert.equal(aiProviderError({ status: 504 }).status, 504);
  assert.equal(aiProviderError(null).status, 503);
});
