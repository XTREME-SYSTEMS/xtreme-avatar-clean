# Product scope

All capabilities are requirements, not claims of implemented functionality. Keep the existing approved Figma visual language, mobile/desktop navigation and Finished/Completion Center. Any new Discovery layouts are proposed until approved; do not regenerate the approved screens unnecessarily.

## Four flagship product pillars

**AI Avatar** is the conversational operating interface. **Invention Machine** turns validated opportunities into approved business concepts, plans, brands, mockups and verified deliverables. **Lead Machine** has a dedicated Lead Finder page (`/leads`) that turns authorized business research into qualified, actionable sales opportunities.

**Auto Social** is a dedicated social media workspace (`/social`) that lets Eden prepare, review, schedule and, once authorized provider delivery is verified, publish branded campaigns and report results.

These are modules of one application, not four separate products or runtimes. Workspace, Discovery, Create, Finished, Communications and Settings are shared supporting capabilities. Keep the navigation simple; preserve the approved design language and obtain approval for new screens.

See [Lead Finder](LEAD_FINDER.md), [Invention Machine](INVENTION_MACHINE.md) and [Auto Social](AUTO_SOCIAL.md).

## Workspace: full Google Workspace suite

A unified work center with Gmail inbox/drafts/search; Drive files/folders/shared drives and permissions; Calendar events, availability and scheduling; Docs editing; Sheets tables, formulas and analysis; Slides creation and editing; Contacts; Tasks; Meet scheduling and supported meeting features; Forms and Google Chat where official APIs and account entitlement support them. Provide previews, search, create/edit, organization, and explicit actions in the workspace. Support actual file and record IDs, not fake lists. Respect Drive sharing, administrator policy, individual grants and recipient confirmation. Do not conflate a Google Workspace API grant with Google Cloud IAM or domain-wide delegation. Admin SDK, Groups and organization management are optional separately authorized modules. Never claim that API coverage is identical to every native Google application.

## Discovery: shared opportunity and leadership research

A supporting research page for discovering business opportunities, prospective customers, companies and professional decision-makers/leaders. Sales-oriented results flow to the dedicated Lead Finder; invention research flows to the Invention Machine. Search by industry, geography, company, role, opportunity and public professional sources. Show source URLs, freshness, match reasons, confidence and missing data. Offer filters, deduplication, saved lists, qualification and opt-in alerts via the existing authorized durable system. Export authorized records to existing Sheets/CRM or route to the existing lead system through a scoped adapter. Support research briefs and draft outreach for review. No speculative personal details, unauthorized harvesting, hidden tracking, scraping restrictions bypass, automatic mass contact, or private contact enrichment without lawful authorization. Respect opt-outs and source terms. A new page design and any external sending require separate approval.

## Remaining navigation

Home: GPT chat, vision, conversation history, approved live voice and Tavus avatar. Create: GPT Image, Adobe, Figma, project plans, visual mockups. Finished: deliverables, revisions, reports and approval receipts. Communications: Twilio voice/messaging and call notes with consent. Settings: Neon accounts, provider permissions, budgets, audit, disconnect and revocation.

Acceptance: real authorized roundtrips for each claimed operation, visible partial/blocked states, source provenance, accessible mobile and desktop UI, recovery and tenant-negative tests.
