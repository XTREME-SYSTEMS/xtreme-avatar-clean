export type Availability = "foundation" | "verification-required";

export type ModuleDefinition = {
  eyebrow: string;
  title: string;
  description: string;
  availability: Availability;
  capabilities: readonly string[];
  boundary: string;
};

export const modules = {
  avatar: {
    eyebrow: "AI AVATAR",
    title: "Intelligence, with a human interface",
    description:
      "A conversational workspace designed for authenticated Core reasoning, approved voice, and verified avatar playback.",
    availability: "verification-required",
    capabilities: ["AI chat", "Live voice", "Tavus avatar", "Conversation history"],
    boundary:
      "Chat and memory remain unavailable until Neon identity and authenticated Eden Core receipts pass.",
  },
  invention: {
    eyebrow: "INVENTION MACHINE",
    title: "From opportunity to approved outcome",
    description:
      "Move source-backed opportunities through validation, planning, creative review, and verified delivery.",
    availability: "foundation",
    capabilities: [
      "Opportunity discovery",
      "Market validation",
      "Business plans",
      "Approval mockups",
    ],
    boundary:
      "Engineering handoff and provider work require an approved revision and a verified worker receipt.",
  },
  leads: {
    eyebrow: "LEAD FINDER",
    title: "Research that earns the next step",
    description:
      "Find and qualify business opportunities with citations, freshness, deduplication, and transparent scoring.",
    availability: "foundation",
    capabilities: [
      "Natural-language search",
      "Source citations",
      "Qualification",
      "Saved pipelines",
    ],
    boundary:
      "No discovery result triggers an automatic message or call. Outreach remains a reviewed draft.",
  },
  social: {
    eyebrow: "AUTO SOCIAL",
    title: "Campaigns built for deliberate release",
    description:
      "Prepare branded campaigns, review exact revisions, and monitor authorized delivery from one workspace.",
    availability: "verification-required",
    capabilities: [
      "Strategy and planning",
      "Copy and image drafts",
      "Approval queue",
      "Delivery analytics",
    ],
    boundary:
      "Publishing and scheduling stay unavailable until tenant scope, platform OAuth, and delivery receipts pass.",
  },
  workspace: {
    eyebrow: "GOOGLE WORKSPACE",
    title: "Your work, connected with consent",
    description:
      "A unified surface for permitted Gmail, Drive, Calendar, Docs, Sheets, Slides, and collaboration tasks.",
    availability: "verification-required",
    capabilities: ["Mail and calendar", "Files and shared drives", "Docs and sheets", "Tasks and meetings"],
    boundary:
      "Each service requires a separate least-privilege grant. Sign-in does not imply Workspace consent.",
  },
  discovery: {
    eyebrow: "DISCOVERY",
    title: "Source-backed research, shared safely",
    description:
      "Explore companies, opportunities, and decision-makers with provenance and clear uncertainty.",
    availability: "foundation",
    capabilities: ["Public-source research", "Freshness and confidence", "Deduplication", "Approved handoff"],
    boundary:
      "No hidden tracking, unauthorized enrichment, or automatic outbound contact.",
  },
  create: {
    eyebrow: "CREATE",
    title: "Shape the next approved version",
    description:
      "Bring plans, images, Adobe documents, Figma sources, and mockups into a versioned creative flow.",
    availability: "verification-required",
    capabilities: ["Image concepts", "Adobe documents", "Figma sources", "Review mockups"],
    boundary:
      "Creative provider actions remain unavailable until access and exact-revision receipts are verified.",
  },
  communications: {
    eyebrow: "COMMUNICATIONS",
    title: "Every conversation needs consent",
    description:
      "A future home for authorized voice and messaging with delivery evidence and call notes.",
    availability: "verification-required",
    capabilities: ["Voice", "SMS and MMS", "Approved channels", "Consent receipts"],
    boundary:
      "No call or message can be placed before signed callbacks, consent, and approved test traffic pass.",
  },
  settings: {
    eyebrow: "SETTINGS",
    title: "Identity, grants, budgets, and audit",
    description:
      "See the application boundaries that will govern tenant access, provider permissions, and revocation.",
    availability: "verification-required",
    capabilities: ["Neon identity", "Connected accounts", "Budgets", "Audit and revocation"],
    boundary:
      "Account controls remain read-only until branch-specific Neon Auth configuration is verified.",
  },
} satisfies Record<string, ModuleDefinition>;
