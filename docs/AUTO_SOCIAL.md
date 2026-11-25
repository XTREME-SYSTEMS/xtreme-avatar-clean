# Auto Social / AI Social Media Manager

## Outcome
Remove repetitive social-media work from the business owner's day. Eden can accept conversational campaign requests, turn approved brand and invention assets into useful posts, and manage the content calendar and delivery evidence in the same application.

## Product experience
- One social dashboard with business/brand selection, account status, drafts, approvals, content calendar, delivery status and performance.
- Generate campaign strategy, platform-specific copy, captions, original graphics, approved video where supported, and reusable brand assets.
- Review drafts, request revisions, approve exact asset versions, choose authorized destinations and scheduling windows.
- After platform-specific publishing grants and delivery tests pass, execute approved posts and recurring campaigns within bounded owner-defined authority; otherwise retain drafts for manual publishing.
- Report actual platform metrics, post URLs, delivery failures and qualified inbound opportunities. Route approved lead opportunities to Lead Finder and invention briefs to Invention Machine without copying entire datasets.

## Existing app and observed provider status
Reuse Auto Social Eden GPT Site at https://eden-auto-social.strategic-ai.chatgpt.site and its existing MCP surface. Native app status reports persistent storage bound and campaign/content record operations. Durable write/readback has not been tested in this turn. Railway gateway health returned HTTP 200; a stored gateway authentication test from November 18, 2026 reports HTTP 401, so health does not prove inference. Stored OpenAI verification is model listing only, not generation. External social publishing and scheduled delivery are reported not connected. Google grants/profile and video generation/delivery are not verified. Do not describe any unsupported action as live.

## Integration boundary
Eden Core remains the primary intelligence/context authority. Xtreme Avatar authenticates through existing Neon Auth, verifies owner/tenant and explicit provider grants, and uses a fixed-purpose server adapter for the existing Auto Social app. Keep private provider credentials in their authorized secret store; never forward ChatGPT host credentials. Preserve existing social records and their provenance; store only authorized tenant-scoped references in Avatar, not duplicate social records or personal memory. Do not import legacy code or templates. No duplicate brain, social engine, database or scheduler. Existing durable runtime may deliver approved schedules only after real admission, claim, execution, and delivery receipts.

## Delivery and safety
Support Facebook, Instagram, LinkedIn, X, TikTok, YouTube and Google Business Profile only where official APIs, account types, scopes and current provider entitlement permit. Show per-account capability and blocked reasons. Enforce exact content-version and destination approval, brand controls, budgets, rate limits, idempotency, retries, cancellation and audit receipts. No automatic public posting before configured authorization and validation; no unsolicited bulk messaging, platform-rule bypass or fabricated engagement. Review and consent requirements apply separately to outreach.

## Acceptance
1. Authenticate a scoped account and verify wrong-tenant and revoked-grant denial.
2. Create one real authorized draft, edit it, persist and read it back with the same record ID.
3. Verify generated assets and exact revision approval; revision changes invalidate approval.
4. Prove a single separately approved platform post and delivery receipt; verify duplicate prevention, scheduling, cancellation, recovery and actual readback.
5. Retrieve real authorized analytics; show unavailable metrics as unknown, not zero.
6. Confirm responsive approved UI and independent Guardian review. Keep unsupported provider actions disabled.
