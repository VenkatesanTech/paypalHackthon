# PayPilot AI

Next.js App Router → validated server API → Prisma → SQLite. AI and PayPal credentials remain server-only. Single-business local workspace; deploy only behind access control.

Folders: `src/app` pages and API routes; `src/components` interactive editor; `src/lib` validation, database and provider services; `prisma` schema and migrations; `tests` payment checks.

Stages: (1) database and validation; (2) invoice CRUD and editable AI extraction; (3) explicit PayPal create/approve/capture with persisted idempotency keys and verified amounts; (4) dashboard and summaries; (5) typecheck, tests, build and HTTP smoke checks.

Money is integer cents. Overdue is derived from due date. Only verified completed captures can mark invoices paid. Checkout locks invoice edits. AI has no payment tools. SQLite needs persistent Node hosting.
