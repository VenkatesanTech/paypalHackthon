# PayPilot AI demo production plan

Status: not recorded. Target 160 seconds, 1920×1080, 30 FPS, MP4. Do not publish until the real AI and Sandbox checkout have succeeded and the final recording has been reviewed.

| Time | Actual application action | Narration |
| --- | --- | --- |
| 0:00–0:20 | Show dashboard and branding; hide browser chrome and personal tabs | Freelancers spend time turning work into invoices and checking whether clients have paid. PayPilot AI brings invoice drafts, payment tracking, and financial summaries into one workspace. |
| 0:20–0:55 | Enter the prompt below. Wait for the real AI response; inspect fields | Describe the work in everyday language. The AI extracts a structured draft. I review the client, due date, quantities, and prices before saving. The AI cannot initiate payments. |
| 0:55–1:20 | Review draft, save, open edit, update notes, publish | Three hours at twenty dollars totals sixty dollars. I can edit the invoice before checkout begins, then publish a client payment link. |
| 1:20–2:00 | Open payment page, create genuine Sandbox order, approve with Personal buyer, return and confirm capture | This demonstration uses PayPal Sandbox. The buyer approves the order in PayPal. Back in the app, the server checks the order and captured amount before marking the invoice paid. |
| 2:00–2:25 | Generate actual financial summary from stored records | The financial summary uses invoice records from this workspace. It helps me review outstanding payments. These are AI suggestions that I review before acting. |
| 2:25–2:40 | Show dashboard and verified transaction, finish with branding | PayPilot AI connects invoice drafting, management, and Sandbox payment tracking. Built with Next.js, OpenAI, PayPal Orders, Prisma, and SQLite for the PayPal AI Hackathon 2026. |

Prompt: `Create a USD invoice for Demo Studio, billing@example.com, for 3 hours of design consulting at $20 per hour, due December 1, 2026. Add the note: Thank you for your business.`

Use clearly identified demonstration data, not private client information. Verify the generated total is 6000 cents / USD 60.00. Do not record a failed or mocked payment as successful. If provider latency exceeds the allotted time, edit waiting time with a visible “waiting shortened” caption; retain the real sequence and outcome. Keep login, credentials, payment-link tokens, personal emails, account details, and developer panels out of the recording.

## OBS fallback

1. Open OBS Studio manually. Add Window Capture for the application browser only; use a cropped source that excludes browser tabs and address bar. Disable notifications.
2. Set base/output resolution to 1920×1080 and common FPS to 30. Set audio to 48 kHz. Record narration through a microphone or use reviewed captions.
3. Record to MKV to protect the recording, then use File → Remux Recordings to produce MP4. Save the final export as `artifacts/demo/paypilot-ai-demo.mp4`.
4. Complete a genuine Sandbox checkout rehearsal before recording. If it fails, resolve it first; do not substitute test output or screenshots.
5. Review the exported file end to end. Confirm duration is under 180 seconds, audio is clear, no private details appear, and the successful capture is genuine.
6. Capture clean dashboard, invoice draft, and verified payment screenshots from the app for README/Devpost. These assets are currently pending.

Thumbnail brief: 1280×720, dark background, large “PayPilot AI”, subtitle “AI Invoices · PayPal Sandbox”, and one genuine redacted app screenshot. No success claims before verified recording.
