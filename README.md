# PayPilot AI

## Problem and solution

Freelancers and small businesses need to turn descriptions of work into accurate invoices and track whether clients have paid. PayPilot AI combines editable AI invoice drafts, invoice management, a Sandbox payment page, and summaries of stored invoice activity.

## Features and stack

- Natural-language invoice drafts with human review and server validation.
- USD invoices, draft/published states, edit locking after checkout starts, and derived overdue status.
- PayPal Sandbox Orders with server-side capture verification and duplicate-capture protections.
- AI financial summaries from up to 200 invoices.
- Next.js 16, React 19, TypeScript, Tailwind CSS 4, Google Gemini API, PayPal Orders API, Prisma 6, and SQLite.

## Screenshots and demo

Actual application screenshots are pending capture; no mockups are presented as working evidence. Demo video URL: **pending genuine recording, verification, and publication approval**. See [recording plan](artifacts/demo/recording-plan.md) and [QA report](artifacts/qa-report.md).

## Architecture

Browser UI → Next.js server routes → validated invoice/payment services → Prisma → SQLite. Server routes call Gemini and PayPal; credentials stay on the server. The client approves through PayPal Sandbox, then requests server-side capture. See [architecture notes](ARCHITECTURE.md).

A Next.js App Router + TypeScript + Tailwind application for creating invoices with AI, sharing payment links, and receiving verified PayPal **sandbox** payments. Prisma 6 persists invoices and idempotent payment attempts in SQLite. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Run locally

Requires Node.js 22 and npm, with access to the npm registry and Prisma engine downloads.

```powershell
npm install
# First setup only: preserve any existing .env
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npx prisma generate
npm run db:setup
npm run dev
```

Open http://localhost:3000. The dashboard starts empty; all figures come from the database. No payment success is simulated. Manual invoicing works without AI or PayPal keys.

## Environment

Set these in `.env`, restart the server, and keep the file private:

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | SQLite file, e.g. `file:./dev.db` relative to `prisma/` |
| APP_URL | Exact public origin, localhost locally and HTTPS when hosted |
| WORKSPACE_PASSWORD | Owner password; any Basic Auth username works. Required in production. Use HTTPS. |
| PAYPAL_CLIENT_ID | Sandbox REST app client ID |
| PAYPAL_CLIENT_SECRET | Sandbox REST app secret; server only |
| PAYPAL_MERCHANT_ID | Optional expected sandbox merchant ID for extra recipient verification |
| GEMINI_API_KEY | Server-side Google Gemini API key |
| AI model | `gemini-3.5-flash` via the official `@google/genai` SDK |

Development without WORKSPACE_PASSWORD is intended for localhost only. Production refuses workspace access until a password is set. Public client payment pages remain accessible through their unguessable links. Treat these links as confidential.

## Invoice → payment demo

1. Create an invoice manually or describe one to the AI assistant. Review the extracted JSON and edit client, due date, quantities and prices.
2. Save a draft, or explicitly publish it. Publishing enables a client payment link; it does not create a PayPal order.
3. Open the payment page, review the total and choose **Continue to PayPal sandbox**.
4. Approve with a separate PayPal sandbox **personal buyer** account. Do not use your merchant account as the buyer.
5. Return and choose **Confirm and capture payment**. Only a matching, completed server-verified capture marks the invoice paid.
6. Return to the dashboard to see the verified transaction and updated totals.

Create a sandbox business REST app and test buyer at [PayPal Developer](https://developer.paypal.com/dashboard/). Copy its sandbox credentials to the server environment. Sandbox is fixed in code and cannot accidentally switch to live mode.

The payment record reserves one order per invoice, snapshots the amount, uses separate stable create/capture idempotency keys, and uses database leases to block concurrent captures. Retries reconcile the existing order. Checkout locks invoice editing. Unknown outcomes remain unpaid until verification. After an ambiguous order creation older than five hours, checkout requires manual reconciliation in PayPal rather than risking a second order. Expired/declined checkouts may need reconciliation and a replacement invoice; cancellation does not silently delete an attempt.

The public status API can reconcile without charging: `POST /api/paypal/status` with `{invoiceId,paymentToken,orderId?}`. Create and capture endpoints also require `confirmed:true`. A return URL or approval alone never proves payment.

## AI

AI requests go through `/api/ai`; credentials stay on the server. Invoice responses use JSON mode plus Zod validation, then appear in an editable form. Missing fields must be completed before saving. AI has no order or capture tools. Insights summarize up to 200 invoice records and should be reviewed. Invoice activity is sent to the configured AI provider when a summary is requested. [Official Gemini SDK guidance](https://github.com/googleapis/js-genai).

Gemini requires `GEMINI_API_KEY` in the server environment. Restart the app after changing it. The previous `OPENAI_API_KEY` and `OPENAI_MODEL` settings are no longer used. No API key is sent to the browser. Invoice descriptions and notes remain part of the editable draft; insights return the same summary shape. Invalid credentials, quota/rate limits and network failures show safe errors without provider response details.

## Verification

```powershell
npm run test
npm run typecheck
npm run build
npm start
```

Payment tests use a temporary SQLite database and mocked PayPal gateway; they never charge. Real end-to-end verification needs your sandbox credentials and buyer approval. All 23 automated tests and TypeScript checks passed on November 9, 2026. In this restricted environment, run each test file with `node --import tsx tests/<filename>.test.ts` if the standard test runner reports spawn EPERM. Production build and browser/live-provider verification remain incomplete. See artifacts/qa-report.md for evidence and limitations.

To opt into genuine Gemini integration tests (makes API requests using synthetic invoice data):

```powershell
$env:PAYPILOT_GEMINI_LIVE="1"
node --env-file=.env --import tsx tests/ai.test.ts
Remove-Item Env:PAYPILOT_GEMINI_LIVE
```

Without this flag, automated tests do not call Gemini. The live test verifies an actual invoice draft and a summary of known test totals; it does not create invoices or payments.

## Hosting and scope

For Render, use the included [Blueprint](render.yaml) and [deployment guide](RENDER-DEPLOY.md). SQLite requires a paid web service with a persistent disk. The startup script applies migrations after the disk mounts and derives the public application origin from Render.

Deploy to a Node.js server with a persistent disk, HTTPS, WORKSPACE_PASSWORD and server-side secrets. Run `prisma migrate deploy` before `next start`. Back up the SQLite database. Ephemeral serverless filesystems and Cloudflare Workers are unsuitable for this SQLite implementation. This is a single-business hackathon app with USD integer quantities; it does not implement tax, multi-tenant accounts, refunds, live payments or webhooks. Payment updates reconcile on checkout confirmation/status requests; refresh the dashboard after payment.
