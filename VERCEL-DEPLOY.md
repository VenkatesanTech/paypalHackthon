# Deploy PayPilot AI on Vercel

Vercel runs the Next.js application with a hosted PostgreSQL database. The local SQLite database and existing Render configuration remain available. No local invoice data is uploaded automatically.

## Deployment configuration

- Use the Vercel Hobby plan for this personal, non-commercial hackathon prototype, within its usage limits.
- Add a Neon Free PostgreSQL database through Vercel Storage/Marketplace, or connect an existing hosted PostgreSQL database.
- Import the repository and use `vercel.json` for the Next.js build configuration.
- Set Node.js to 22.x in the Vercel project settings.
- Use a fresh production database. Review existing data before applying migrations to any shared database.

## Server-side environment variables

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | Pooled PostgreSQL URL from the database provider; use a small connection limit for serverless runtimes |
| DIRECT_URL | Direct PostgreSQL URL for migrations; Neon Marketplace's DATABASE_URL_UNPOOLED is also accepted |
| WORKSPACE_PASSWORD | Required strong owner password; keep it private |
| GEMINI_API_KEY | Google Gemini API credential |
| PAYPAL_CLIENT_ID | PayPal Sandbox REST app client ID |
| PAYPAL_CLIENT_SECRET | PayPal Sandbox REST app secret |
| PAYPAL_MERCHANT_ID | Optional expected Sandbox seller ID |
| APP_URL | Optional exact public HTTPS origin; production defaults to Vercel's production domain |

Do not expose these credentials through `NEXT_PUBLIC_` variables or commit connection strings. Configure database variables separately for Production and Preview; previews should use an isolated database branch. The provider may offer free limits, but Gemini usage and other services remain subject to their own quotas and billing.

## Build and database lifecycle

`scripts/vercel-build.cjs` validates the hosted database configuration and owner password, generates the PostgreSQL Prisma client, applies PostgreSQL migrations on production deployments, then builds Next.js. Preview builds generate the client without running production migrations.

PostgreSQL schema and migrations live in `prisma/postgresql/`. Default local commands continue to use `prisma/schema.prisma` and SQLite. Do not run the Vercel-specific build in a running local SQLite workspace: Prisma generation selects the client provider. Use an isolated copy for local deployment validation, or regenerate the SQLite client with `npx prisma generate` after stopping the local app.

Owner pages retain Basic Auth. Public client payment links remain accessible by their confidential tokens. Production PayPal returns use the stable Vercel production domain, or the explicitly configured APP_URL. PayPal remains Sandbox-only. Hosted transactions use serializable isolation to preserve consistency under concurrent requests.

## Verify after deployment

1. Confirm a Ready Vercel production deployment with the intended Git commit.
2. Confirm the workspace rejects unauthenticated access and loads after private owner authentication.
3. Create a synthetic invoice; reload and verify database persistence.
4. Verify a public client invoice link without owner authentication.
5. Verify genuine Gemini generation and insights when credentials are configured.
6. Verify Sandbox checkout/capture separately; do not infer payment success from a redirect.

## Official references

- https://vercel.com/kb/guide/is-sqlite-supported-in-vercel
- https://vercel.com/docs/postgres
- https://vercel.com/docs/plans/hobby
- https://neon.com/pricing
