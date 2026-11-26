export type ReliabilityProbe = {
  id: string;
  area: string;
  result: "PASS" | "FAIL" | "UNKNOWN";
  code: string;
  httpStatus: number | null;
  durationMs: number;
  attempts: number;
};
export type ReliabilityReceipt = {
  schema: "xtreme-avatar.reliability.receipt.v1";
  version: string;
  iterationId: string;
  observedAt: string;
  targetRepo: string;
  sourceCommit: string | null;
  fingerprint: string;
  summary: { total: number; pass: number; fail: number; unknown: number };
  remediation: { status: string; next: string; selfHeal: string };
  probes: ReliabilityProbe[];
  mutationCount: number;
  guardianCertified: boolean;
  note: string;
};
export function runAudit(options?: {
  attempts?: number;
  commit?: string | null;
}): Promise<ReliabilityReceipt>;
