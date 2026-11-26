import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { PROBES, RELIABILITY_VERSION, assertAllowlistedProbe, evaluateProbe, remediationForFailures } from "./policy.mjs";

const MAX_BODY_BYTES = 96 * 1024;
const DEFAULT_TIMEOUT_MS = 9000;
const MAX_ATTEMPTS = 2;

async function boundedText(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return output + decoder.decode();
      bytes += part.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error("BODY_TOO_LARGE");
      }
      output += decoder.decode(part.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

/** One bounded anonymous probe, with no redirects, credentials or user data. */
export async function probeOnce(spec, fetcher = fetch, timeoutMs = DEFAULT_TIMEOUT_MS) {
  assertAllowlistedProbe(spec);
  const before = performance.now();
  try {
    const response = await fetcher(spec.url, {
      method: spec.method,
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: spec.assertion === "html" ? "text/html" : "application/json",
        ...(spec.body ? { "Content-Type": "application/json", Origin: "https://www.xtremeavatar.com" } : {}),
      },
      body: spec.body,
      signal: AbortSignal.timeout(Math.min(Math.max(timeoutMs, 1000), 15_000)),
    });
    const body = [301, 302, 303, 307, 308].includes(response.status) ? "" : await boundedText(response);
    const result = evaluateProbe(spec, response, body);
    return {
      id: spec.id, area: spec.area,
      result: result.pass ? "PASS" : "FAIL",
      code: result.code,
      httpStatus: response.status,
      durationMs: Math.round(performance.now() - before),
    };
  } catch (e) {
    const code = e?.name === "TimeoutError" || e?.name === "AbortError" ? "TIMEOUT" :
      e?.message === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" : "NETWORK_UNAVAILABLE";
    return {
      id: spec.id, area: spec.area, result: "UNKNOWN", code,
      httpStatus: null, durationMs: Math.round(performance.now() - before),
    };
  }
}

export async function probeWithRetry(spec, fetcher = fetch, options = {}) {
  const retries = Math.max(1, Math.min(options.attempts ?? MAX_ATTEMPTS, MAX_ATTEMPTS));
  const pause = options.pause ?? (async ms => new Promise(done => setTimeout(done, ms)));
  let last;
  for (let n = 1; n <= retries; n++) {
    last = await probeOnce(spec, fetcher, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (last.result === "PASS") return { ...last, attempts: n };
    if (n < retries) await pause(250 * n);
  }
  return { ...last, attempts: retries };
}

export async function runAudit({ fetcher = fetch, attempts = MAX_ATTEMPTS, pause, now = () => new Date(), commit = null } = {}) {
  const results = [];
  // Bounded parallelism: at most 3 probes at a time.
  for (let i = 0; i < PROBES.length; i += 3) {
    const batch = await Promise.all(PROBES.slice(i, i + 3).map(p =>
      probeWithRetry(p, fetcher, { attempts, pause }),
    ));
    results.push(...batch);
  }
  const remediation = remediationForFailures(results);
  const summary = {
    total: results.length,
    pass: results.filter(x => x.result === "PASS").length,
    fail: results.filter(x => x.result === "FAIL").length,
    unknown: results.filter(x => x.result === "UNKNOWN").length,
  };
  const fingerprint = createHash("sha256")
    .update(results.filter(x=>x.result!=="PASS").map(x => x.id + ":" + x.code).sort().join("|") || "healthy")
    .digest("hex").slice(0, 20);
  return {
    schema: "xtreme-avatar.reliability.receipt.v1",
    version: RELIABILITY_VERSION,
    iterationId: randomUUID(),
    observedAt: now().toISOString(),
    targetRepo: "XTREME-SYSTEMS/xtreme-avatar-clean",
    sourceCommit: commit && /^[0-9a-f]{7,40}$/i.test(commit) ? commit : null,
    fingerprint, summary, remediation, probes: results,
    mutationCount: 0,
    guardianCertified: false,
    note: "Read-only canary evidence. Foreman repair and independent Guardian verification require separate receipts.",
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(x => !["--local", "--write-receipt"].includes(x))) {
    console.error("usage: node scripts/reliability/audit.mjs [--local] [--write-receipt]");
    process.exitCode = 2;
    return;
  }
  const result = await runAudit({ commit: process.env.GITHUB_SHA ?? null });
  console.log(JSON.stringify(result, null, 2));
  if (args.includes("--write-receipt")) {
    await writeFile("xtreme-avatar-reliability-receipt.json", JSON.stringify(result, null, 2) + "\n", { flag: "w", mode: 0o600 });
  }
  if (result.summary.fail || result.summary.unknown) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
