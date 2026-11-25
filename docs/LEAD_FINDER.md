# Lead Machine / Lead Finder

## Outcome
Business owners can describe their ideal customer or opportunity in natural language, review evidence-backed results and manage a qualified prospect pipeline without leaving Xtreme Avatar.

## Proposed screen (requires visual approval)
- Search bar and conversational research through Eden.
- Filters: target industry, company size when sourced, region, business type, opportunity category, professional role, freshness and qualification.
- Results: company, public business website, location, service fit, published business contact channels where authorized, decision-maker professional role when sourced, opportunity evidence, source links, observed date, score and reason.
- Detail view: evidence, missing facts, next steps, duplicate detection, notes, assign/save, list and pipeline status.
- Pipeline: discovered, qualified, review, outreach approved, contacted, follow-up, won/lost. State transitions require actual authorized receipts where applicable.
- Saved searches and repeatable lead campaigns through the existing approved durable workflow if one is proven; no duplicate scheduler.
- Export approved records into Google Sheets or an authorized existing CRM; create reviewed email/call/message drafts and hand off to existing communication modules. No auto-send by default.

## Implementation contract
Search real authorized public business sources and licensed provider APIs only. Do not claim access to a specific lead provider until authenticated and entitled. Reuse existing lead capabilities through a minimal typed adapter if compatible, not by importing the old application. Use server-side calls and tenant-scoped persistence in the existing Avatar Neon database; route reasoning via Eden Core. Store provenance, source freshness, per-field uncertainty, deduplication keys, permissions, suppression status, and operation receipts. No sensitive or speculative personal attributes, private contact harvesting, bypass of platform restrictions, or noncompliant outreach. Use explicit approval and compliance controls for any actual external sends, calls or metered execution.

Use a transparent qualification formula with source-backed factors: target fit, geography, opportunity evidence, contact-channel availability and freshness. Missing information remains unknown. Label scores as heuristic estimates, not guaranteed conversions. Validate against a representative approved business sample before promising quality.

## Acceptance
- One real authorized search yields traceable, deduplicated results and reproducible qualification explanations.
- Filters and saved lists work; source freshness and missing data are visible.
- A lead can be reviewed, corrected, saved, exported to a permitted destination and recovered after restart.
- Wrong-tenant, revoked provider grant, stale results, duplicate retries, over-budget and suppressed-contact cases are tested.
- A draft can be prepared without sending; any approved send requires separate consent and provider receipt.
- Mobile and desktop screens are visually approved; independent Guardian verifies exact source and runtime. No feature is marked complete based on demo rows.
