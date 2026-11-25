# Product scope

All capabilities are requirements, not claims of implemented functionality. Keep the existing approved Figma visual language, mobile/desktop navigation and Finished/Completion Center. Any new Discovery layouts are proposed until approved; do not regenerate the approved screens unnecessarily.

## Workspace: full Google Workspace suite

A unified work center with Gmail inbox/drafts/search; Drive files/folders/shared drives and permissions; Calendar events, availability and scheduling; Docs editing; Sheets tables, formulas and analysis; Slides creation and editing; Contacts; Tasks; Meet scheduling and supported meeting features; Forms and Google Chat where official APIs and account entitlement support them. Provide previews, search, create/edit, organization, and explicit actions in the workspace. Support actual file and record IDs, not fake lists. Respect Drive sharing, administrator policy, individual grants and recipient confirmation. Do not conflate a Google Workspace API grant with Google Cloud IAM or domain-wide delegation. Admin SDK, Groups and organization management are optional separately authorized modules. Never claim that API coverage is identical to every native Google application.

## Discovery: leads and leadership research

A separate page for discovering business opportunities, prospective customers, companies and professional decision-makers/leaders. Search by industry, geography, company, role, opportunity and public professional sources. Show source URLs, freshness, match reasons, confidence and missing data. Offer filters, deduplication, saved lists, qualification and opt-in alerts via the existing authorized durable system. Export authorized records to existing Sheets/CRM or route to the existing lead system through a scoped adapter. Support research briefs and draft outreach for review. No speculative personal details, unauthorized harvesting, hidden tracking, scraping restrictions bypass, automatic mass contact, or private contact enrichment without lawful authorization. Respect opt-outs and source terms. A new page design and any external sending require separate approval.

## Remaining navigation

Home: GPT chat, vision, conversation history, approved live voice and Tavus avatar. Create: GPT Image, Adobe, Figma, project plans, visual mockups. Finished: deliverables, revisions, reports and approval receipts. Communications: Twilio voice/messaging and call notes with consent. Settings: Neon accounts, provider permissions, budgets, audit, disconnect and revocation.

Acceptance: real authorized roundtrips for each claimed operation, visible partial/blocked states, source provenance, accessible mobile and desktop UI, recovery and tenant-negative tests.
