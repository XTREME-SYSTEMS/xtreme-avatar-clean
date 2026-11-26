/** Deterministic, public, anonymous probes only. No credentials or user data. */
const web = "https://www.xtremeavatar.com";
const apex = "https://xtremeavatar.com";
const railway = "https://xtreme-avatar-comms-api-production.up.railway.app";
export const RELIABILITY_VERSION = "2026-11-26-v1";
export const PROBES = Object.freeze([
  { id: "home", url: web + "/", method: "GET", assertion: "html", area: "frontend" },
  { id: "account", url: web + "/account", method: "GET", assertion: "html", area: "frontend" },
  { id: "dashboard_access", url: web + "/dashboard", method: "GET", assertion: "account_redirect", area: "security" },
  { id: "anonymous_session", url: web + "/api/session", method: "GET", assertion: "anonymous", area: "security" },
  { id: "settings_boundary", url: web + "/api/settings/communications", method: "GET", assertion: "denied", area: "security" },
  {
    id: "outbound_boundary", url: web + "/api/communications/send", method: "POST",
    assertion: "denied", area: "security",
    // There is intentionally no cookie or authorization. This request must never reach Twilio.
    body: JSON.stringify({ to: "NOT_A_PHONE", channel: "sms", message: "unauthenticated-negative-probe", mediaUrls: [], requestId: "00000000-0000-4000-8000-000000000001" }),
  },
  { id: "railway_health", url: railway + "/health", method: "GET", assertion: "service_health", area: "transport" },
  { id: "railway_neon", url: railway + "/ready", method: "GET", assertion: "neon_ready", area: "database" },
  { id: "apex_redirect", url: apex + "/", method: "GET", assertion: "canonical_redirect", area: "domain" },
]);

export function assertAllowlistedProbe(spec) {
  if (!PROBES.some(p => p.id === spec?.id && p.url === spec.url && p.method === spec.method)) {
    throw new Error("unrecognized_probe");
  }
  const url = new URL(spec.url);
  if (url.protocol !== "https:" || !["www.xtremeavatar.com", "xtremeavatar.com", "xtreme-avatar-comms-api-production.up.railway.app"].includes(url.hostname)
    || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("unsafe_probe_url");
  }
}
function noStore(response) {
  return String(response.headers.get("cache-control") ?? "").toLowerCase().includes("no-store");
}
function validRedirect(response, expected, source) {
  const location = response.headers.get("location");
  if (!location) return false;
  try {
    const uri = new URL(location, source);
    return uri.origin === expected.origin && uri.pathname === expected.pathname;
  } catch { return false; }
}
function safeJson(body) {
  if (!body || body.length > 4096) return null;
  try {
    const data = JSON.parse(body);
    return data !== null && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch { return null; }
}

export function evaluateProbe(spec, response, body) {
  assertAllowlistedProbe(spec);
  const status = response.status;
  const contentType = response.headers.get("content-type") ?? "";
  const doc = safeJson(body);
  const fail = code => ({ pass: false, code });
  const pass = () => ({ pass: true, code: "PASS" });
  switch (spec.assertion) {
    case "html":
      return status === 200 && contentType.includes("text/html") && body.includes("XTREME AVATAR")
        ? pass() : fail("HTML_UNAVAILABLE");
    case "account_redirect":
      return [302, 303, 307, 308].includes(status) && validRedirect(response, new URL(web + "/account"), spec.url)
        ? pass() : fail("ANONYMOUS_DASHBOARD_EXPOSED_OR_UNAVAILABLE");
    case "canonical_redirect":
      return [301, 308].includes(status) && validRedirect(response, new URL(web + "/"), spec.url)
        ? pass() : fail("DOMAIN_REDIRECT_MISMATCH");
    case "anonymous":
      return status === 200 && doc?.status === "anonymous" && noStore(response)
        ? pass() : fail("ANONYMOUS_SESSION_BOUNDARY");
    case "denied":
      return status === 401 && noStore(response) ? pass() : fail("AUTHORIZATION_BOUNDARY");
    case "service_health":
      return status === 200 && doc?.status === "online" && doc.databaseConfigured === true
        && doc.twilioConfigured === true && doc.sendEnabled === true
        ? pass() : fail("MESSAGING_SERVICE_DEGRADED");
    case "neon_ready":
      return status === 200 && doc?.status === "ready" && doc.database === "neon"
        ? pass() : fail("NEON_READINESS_FAILED");
    default: return fail("UNKNOWN_CHECK");
  }
}

export function remediationForFailures(probes) {
  const bad = probes.filter(p => p.result !== "PASS");
  if (!bad.length) return { status: "healthy", next: "record_receipt_only", selfHeal: "none" };
  const security = bad.some(p => p.area === "security");
  const database = bad.some(p => p.area === "database");
  const transport = bad.some(p => p.area === "transport");
  if (security) return {
    status: "critical", next: "open_security_incident_and_fail_release",
    selfHeal: "blocked_until_independent_security_review",
  };
  if (database) return {
    status: "degraded", next: "inspect_neon_auth_database_and_railway_logs",
    selfHeal: "no_automatic_data_change",
  };
  if (transport) return {
    status: "degraded", next: "inspect_exact_railway_deployment_then_retest",
    selfHeal: "single_redeploy_only_if_proven_failed_and_approved_by_policy",
  };
  return {
    status: "degraded", next: "open_deduplicated_factory_issue_and_verify_correct_repo",
    selfHeal: "draft_pr_then_independent_guardian",
  };
}
