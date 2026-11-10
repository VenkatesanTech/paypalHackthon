# Deploy PayPilot AI on Render

This deployment keeps the current Next.js/Prisma/SQLite implementation. It does not migrate the database provider or enable live PayPal payments.

## Proposed service

- Node web service: `paypilot-ai`, Singapore region, one instance.
- Compute: `0.5c-512mb` (formerly Starter).
- Persistent disk: 1 GB mounted at `/var/data`.
- Database: `file:/var/data/paypilot.db`.
- Build: `npm ci --include=dev && npm run build`.
- Start: `node scripts/render-start.cjs`.
- Automatic deployments: off.
- Health checks: Render's default TCP checks. The workspace requires Basic Auth, so do not configure `/` as an unauthenticated HTTP health check.

As checked November 10, 2026, base compute is USD 7/month and disk storage is USD 0.25/GB/month, approximately USD 7.25/month for this service plus applicable taxes, workspace charges, bandwidth/build overages and provider API usage. Review the actual Render creation screen before accepting charges. A free web service cannot attach the persistent disk required by this SQLite configuration.

## Deployment source

Render must receive a Git repository containing the current application and these deployment files, or a separately built/published container image. Select a deployment revision that includes the Gemini integration, `render.yaml` and `scripts/render-start.cjs`.

Keep local environment files, invoice databases, dependencies, recordings and build artifacts out of the deployment repository. Enter secrets privately in Render.

## Create from the Blueprint

1. Connect the Render account and the intended Git repository.
2. Once current source and `render.yaml` are available in the deployment branch, create a Render Blueprint from that branch.
3. Review the paid compute and disk configuration before creating resources.
4. Enter server-side `GEMINI_API_KEY`, `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` privately in Render. Use Sandbox credentials only. Do not paste credentials into chat, files or logs.
5. Render generates `WORKSPACE_PASSWORD`. Retrieve it privately from the service environment after creation; any Basic Auth username works.
6. `scripts/render-start.cjs` derives `APP_URL` from Render's `RENDER_EXTERNAL_URL`, runs existing Prisma migrations against the mounted disk, then starts Next.js on `0.0.0.0:$PORT`.
7. For a custom domain, explicitly set `APP_URL` to that exact HTTPS origin and redeploy. Optionally set `PAYPAL_MERCHANT_ID` to the expected Sandbox merchant ID.

The first deployment initializes an empty database. It does not upload the local invoice database or copy local secrets. Existing deployed database files are preserved; `prisma migrate deploy` applies migrations without resetting data. Disks are available only at runtime, so do not move migration execution to the build or pre-deploy command. Disk-backed services briefly stop during redeploys and cannot scale to multiple instances.

## Verify before calling deployment complete

- Render reports the new deploy live with the intended source revision.
- The HTTPS workspace URL returns 401 without credentials and loads after private owner authentication.
- Invoice creation, reload and persistence work using synthetic demonstration data.
- Restart/redeploy preserves the demonstration invoice on the persistent disk.
- Gemini produces a genuine draft and summary when configured.
- Public invoice links work without workspace authentication. PayPal returns to the correct public HTTPS origin.
- Only claim payment completion after genuine Sandbox approval/capture and server verification. Never infer success from a redirect.
- Record the real service URL and deploy ID; no URL is verified until these checks run.

## Official documentation

- https://render.com/docs/deploy-nextjs-app
- https://render.com/docs/blueprint-spec
- https://render.com/docs/disks
- https://render.com/docs/compute-plans
- https://render.com/pricing
