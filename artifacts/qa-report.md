# QA and release evidence

Date: 2026-11-09. Tests ran against temporary databases with simulated provider responses; no real Sandbox payment was made by this test run. Existing application records and credentials were not changed.

| Test | Expected | Actual | Result | Follow-up |
| --- | --- | --- | --- | --- |
| Invoice calculations/validation | Integer cents, totals and protected status validate | 3 tests passed | PASS | Add UI coverage |
| Payment flow | Match order/capture to invoice; block unapproved, wrong amounts and duplicates | 16 tests passed using simulated gateway and real temporary SQLite | PASS, automated only | Complete genuine Sandbox checkout |
| PayPal gateway | Sandbox endpoint, USD 10.99 for 1099 cents, stable IDs and safe errors | 4 tests passed using injected fetch | PASS, automated only | Verify real provider responses |
| TypeScript | No compiler errors | `npm run typecheck` exit 0 | PASS | None |
| Main routes | HTTP 200 | Previous session checks passed for dashboard/invoices/new/insights/settings | Historical PASS | Recheck in browser before release |
| Invoice UI create/edit/persistence | Valid edits persist after reload | Not tested in browser | BLOCKED | Restore browser connection |
| AI drafts and insights | Genuine responses, correct fields and useful summaries | Not exercised against OpenAI | NOT RUN | Run actual API/UI flow |
| USD rejection | Non-USD invoice input rejected | Zod USD literal found by inspection | NOT FULLY TESTED | Add rejection test before claiming full coverage |
| Sandbox approval/capture | Buyer approves; only verified completed capture marks paid | No genuine transaction observed | NOT RUN | Resolve prior currency error and record real checkout |
| Responsive UI and console | Usable layouts; no console errors | Browser host unavailable in previous attempts | BLOCKED | Restore Chrome host |
| Production build | Build succeeds | Latest attempt generated Prisma client and compiled Next.js, then failed with spawn EPERM during the build TypeScript step | BLOCKED | Run build in an environment that permits child processes |

## Commands executed successfully
```
node --import tsx tests/invoices.test.ts
node --import tsx tests/payment-flow.test.ts
node --import tsx tests/payment-gateway.test.ts
npm run typecheck
```
Direct test execution avoids the child-process EPERM encountered with `npm test` in this environment. All 23 tests passed. This does not establish live provider success.

## Findings
- Release exclusion gap fixed: `.gitignore` now excludes environment variants, build outputs and SQLite variants while allowing the sanitized template.
- README setup now preserves existing `.env` instead of overwriting it.
- No confirmed frontend rendering bug has been fixed; visual inspection remains pending.
- Payment gateway forwards invoice currency; the USD schema protects normal creation, but gateway validation of legacy/non-USD/invalid totals is not independently enforced. No financial logic changed during this publishing preparation.
- Existing payment tests establish idempotency behavior under simulated responses, not remote PayPal guarantees.
- A PayPal secret previously appeared in conversation output from an old template. Template credentials were cleared earlier; rotation status is unknown. Do not publish secret-bearing artifacts.

Release is not ready for a claim of successful end-to-end AI and PayPal operation until the outstanding checks pass.
