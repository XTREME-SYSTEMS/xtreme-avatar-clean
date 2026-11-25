# Clean-room engineering mandate

Canonical NEW Avatar frontend: XTREME-SYSTEMS/xtreme-avatar-clean. The old xtreme-avatar-platform repository is historical/reference and current-production support only. These instructions supersede older Avatar plugin references to that repo as the build target. Do not clone or import its application, history, dependencies, auth adapters, configuration, secrets or database schemas.

Start from a fresh supported Next.js TypeScript foundation. Use approved Figma assets with provenance. Neon Auth (Managed Better Auth) and the existing Avatar Neon project are the sole target application identity/data stack. Eden Universal Core V2 is the sole intelligence/memory boundary; its existing Neon memory is accessed through an authenticated Core API, not directly by browsers. No Supabase, X1, Base44 or parallel auth runtime in the new source. Do not delete existing services/data to accomplish this.

Implement the complete product scope, including AI Avatar, Invention Machine, dedicated Lead Finder, full Google Workspace suite and shared Discovery research. Use real provider contracts, incremental OAuth grants, server-side adapters, least privilege, tenant isolation, metered-call controls, audit receipts and independent Guardian. Do not claim functionality from mockups or credential presence. Use isolated branches and draft PRs; never bypass protected main or promote production without approval. Reuse the existing engineering factory only after actual admission and worker receipt; no automatic outbound messages or calls from discovery.

Check architecture/product.json and release gates before each task. Test the clean-room boundary with node --test tests/cleanroom-policy.test.mjs. This is a source guard, not production certification.
