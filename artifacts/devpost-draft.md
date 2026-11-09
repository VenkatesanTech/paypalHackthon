# Submission draft — not submitted

Title: PayPilot AI – AI-Powered Invoice & Payment Assistant

Tagline: Turn a description of your work into an invoice and track Sandbox payments in one workspace.

## Problem and solution
Freelancers and small businesses spend time drafting invoices and checking payment status. PayPilot AI combines editable invoice drafts, invoice management, a client payment page, and financial summaries.

## Implementation
Next.js and TypeScript provide the interface and server routes. OpenAI returns JSON invoice drafts validated with Zod before review; the insights endpoint summarizes up to 200 stored invoices. Prisma stores invoices and payment attempts in SQLite. Amounts use integer cents and invoice inputs support USD.

The PayPal integration uses Sandbox Orders with explicit buyer approval and server-side capture. Payment records store unique order/capture IDs, amount snapshots, idempotency keys, and processing leases. Server checks compare the order and capture against the invoice before marking it paid. AI has no payment tools.

## Evidence and limitations
Automated tests use a simulated PayPal gateway with a temporary database. These are not evidence of a real Sandbox transaction. Live AI behavior, buyer approval, responsive UI, and the final demo must be verified before submitting claims of successful end-to-end operation. This single-business prototype does not implement live payments, webhooks, refunds, tax, or currency conversion.

## Links and assets
- Target repository (publication unverified): https://github.com/venkatesanTech/paypilot-ai
- Public application: pending hosting and verification
- YouTube: pending genuine recording and approval
- Screenshots: pending capture from the running application
- Submission target supplied by owner: https://paypalaihackathon.devpost.com/

Do not submit until evidence is complete and the owner approves the final content.
