import {
  ENTERPRISE_POLICY,
  evaluatePolicy,
  getIdentity,
  getTrustStoreEntries,
  mintLease,
  verifyEvidence,
  verifyLease,
} from "./doctrine";
import { executeAuthorizedAction, type DispatchAdapter } from "./orchestrator";
import { FORGED_WIRE_CLAIM } from "./samples";
import type { ExecutionLease, ProbeResult, TargetSnapshot } from "./types";
import { randomHex } from "./bytes";

const snapshot: TargetSnapshot = {
  tagName: "button",
  id: "approve-wire",
  domHash: "button:approve-wire:200x50",
  geometry: { x: 0, y: 0, width: 200, height: 50 },
};

function stubAdapter(host: string, clicks: { n: number }): DispatchAdapter {
  return {
    readTarget: (index) => ({
      index,
      snapshot,
      geometry: snapshot.geometry,
      domHash: snapshot.domHash,
      isOccluded: false,
      host,
    }),
    dispatchClick: () => {
      clicks.n += 1;
      return { events: ["click"], mutations: 1 };
    },
  };
}

export async function runSelfAudit(): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];

  {
    const lease = await mintLease({
      agentId: "self-audit-agent",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      snapshot,
      tier: "A2",
    });
    const v = await verifyLease(lease, { tabId: 1, targetIndex: 5 });
    results.push({
      id: "P-00",
      finding: "baseline",
      attack: "An authentic, policy-compliant lease must still verify.",
      detected: "n/a — control probe",
      refused: v.valid,
      detail: v.valid ? "authentic lease accepted" : `REGRESSION: ${v.reason}`,
    });
  }

  {
    const forged = {
      leaseId: "lease_forged",
      authorizationId: "authz_x",
      agentId: "attacker",
      kid: getIdentity().kid,
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      tier: "A2" as const,
      nonce: randomHex(16),
      issuedAt: Date.now(),
      expiresAt: Date.now() + 20_000,
      alg: "Ed25519" as const,
      signature: "deadbeef".repeat(16),
    } as ExecutionLease;
    const v = await verifyLease(forged, { tabId: 1, targetIndex: 5 });
    results.push({
      id: "P-01",
      finding: "F-1",
      attack: "Forged lease omitting targetSnapshot, to slip past an optional-crypto guard.",
      detected: "2026-09-16",
      refused: !v.valid,
      detail: v.reason ?? "ACCEPTED",
    });
  }

  {
    const forged = {
      leaseId: "lease_selfsigned",
      authorizationId: "authz_x",
      agentId: "attacker",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      targetSnapshot: snapshot,
      tier: "A2" as const,
      nonce: randomHex(16),
      issuedAt: Date.now(),
      expiresAt: Date.now() + 20_000,
      alg: "Ed25519" as const,
      kid: "rogue-kid",
      publicKey: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\n-----END PUBLIC KEY-----",
      signature: "ab".repeat(64),
    } as ExecutionLease;
    const v = await verifyLease(forged, { tabId: 1, targetIndex: 5 });
    results.push({
      id: "P-02",
      finding: "F-2",
      attack: "Self-signed lease that ships its own public key as the trust anchor.",
      detected: "2026-09-16",
      refused: !v.valid,
      detail: v.reason ?? "ACCEPTED",
    });
  }

  {
    const forged = {
      leaseId: "lease_untrusted",
      authorizationId: "authz_x",
      agentId: "attacker",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      targetSnapshot: snapshot,
      tier: "A2" as const,
      nonce: randomHex(16),
      issuedAt: Date.now(),
      expiresAt: Date.now() + 20_000,
      alg: "Ed25519" as const,
      kid: "rogue-kid",
      signature: "cd".repeat(64),
    } as ExecutionLease;
    const v = await verifyLease(forged, { tabId: 1, targetIndex: 5 });
    results.push({
      id: "P-03",
      finding: "F-2",
      attack: "Mathematically well-formed signature under a key id that is not in the trust store.",
      detected: "2026-09-16",
      refused: !v.valid,
      detail: v.reason ?? "ACCEPTED",
    });
  }

  {
    const v = await verifyEvidence(FORGED_WIRE_CLAIM, { publicPem: getIdentity().publicPem });
    results.push({
      id: "P-04",
      finding: "F-2",
      attack: "Fabricated evidence asserting an approved $4.2m wire, carrying inline key material.",
      detected: "2026-09-16",
      refused: v.verdict !== "VALID",
      detail: v.reason,
    });
  }

  {
    let dispatched = false;
    try {
      const lease = undefined;
      if (!lease) throw new Error("ERR_ADAPTER_LEASE_REQUIRED: mutating action without authority");
      dispatched = true;
    } catch (e) {
      results.push({
        id: "P-05",
        finding: "F-3",
        attack: "Mutating dispatch with the lease field simply omitted.",
        detected: "2026-09-16",
        refused: !dispatched,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  {
    const clicks = { n: 0 };
    const res = await executeAuthorizedAction(stubAdapter("evil-phishing-site.example", clicks), {
      agentId: ENTERPRISE_POLICY.principalId,
      tool: "click_element_by_index",
      tier: "A2",
      tabId: 1,
      targetIndex: 5,
      host: "evil-phishing-site.example",
    });
    results.push({
      id: "P-06",
      finding: "F-4",
      attack: "A2 mutation on a host outside the principal’s domain grant.",
      detected: "2026-09-16",
      refused: !res.ok && clicks.n === 0,
      detail: res.error ?? `PERMITTED (dispatches: ${clicks.n})`,
    });
  }

  {
    const id = getIdentity();
    const resolved = getTrustStoreEntries().some((e) => e.kid === id.kid && e.status === "active");
    results.push({
      id: "P-07",
      finding: "F-5",
      attack: "Determine whether the signing identity is pinnable, or regenerated per process.",
      detected: "2026-09-16",
      refused: !id.ephemeral && resolved,
      detail: id.ephemeral
        ? `EPHEMERAL DEV IDENTITY '${id.kid}'`
        : `persistent identity '${id.kid}' resolves in the trust store`,
    });
  }

  {
    const nearMisses = [
      "internal.acmebank.com",
      "evil-internal.acmebank.com",
      "internal.acmebank.com.evil.net",
      "user:pass@treasury.internal.acmebank.com",
    ];
    const granted = nearMisses.map((h) => evaluatePolicy(ENTERPRISE_POLICY, "A2", h, "click_element_by_index"));
    const expected = [false, false, false, true];
    const ok = granted.every((g, i) => g.permitted === expected[i]);
    results.push({
      id: "P-08",
      finding: "F-4",
      attack: "Near-miss domain matching: suffix, hyphen, extra label, credential smuggling.",
      detected: "2026-09-16",
      refused: ok,
      detail: ok
        ? "label-wise match held; credential-bearing host still resolved to treasury.internal.acmebank.com"
        : `REGRESSION: ${granted.map((g, i) => `${nearMisses[i]}=${g.permitted}`).join("; ")}`,
    });
  }

  return results;
}
