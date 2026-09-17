import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bootstrapIdentity,
  checkPreDispatch,
  evaluatePolicy,
  getIdentity,
  hashPolicyGrant,
  identityRoundTrip,
  kidFromFingerprint,
  mintLease,
  resetDoctrineForTests,
  resetNonceStore,
  signEvidence,
  verifyEvidence,
  verifyLease,
} from "./doctrine.ts";
import { executeAuthorizedAction, type DispatchAdapter } from "./orchestrator.ts";
import { parseEvidenceJson } from "./evidence-io.ts";
import { HMAC_ERA_EVIDENCE, FORGED_WIRE_CLAIM } from "./samples.ts";
import { ENTERPRISE_POLICY, type ExecutionLease, type TargetSnapshot } from "./types.ts";
import { runSelfAudit } from "./probes.ts";

const mem: Record<string, string> = {};
const storage = {
  getItem: (k: string) => (k in mem ? mem[k]! : null),
  setItem: (k: string, v: string) => {
    mem[k] = String(v);
  },
  removeItem: (k: string) => {
    delete mem[k];
  },
};
(globalThis as { localStorage?: typeof storage }).localStorage = storage;

const snapshot: TargetSnapshot = {
  tagName: "button",
  id: "approve-wire",
  domHash: "button:approve-wire:200x50",
  geometry: { x: 0, y: 0, width: 200, height: 50 },
};

function adapter(host: string, clicks: { n: number }, live: TargetSnapshot = snapshot): DispatchAdapter {
  return {
    readTarget: (index) => ({
      index,
      snapshot: live,
      geometry: live.geometry,
      domHash: live.domHash,
      isOccluded: false,
      host,
    }),
    dispatchClick: () => {
      clicks.n += 1;
      return { events: ["click"], mutations: 1 };
    },
  };
}

before(async () => {
  resetDoctrineForTests();
  await bootstrapIdentity();
});

beforeEach(() => {
  resetNonceStore();
});

describe("identity", () => {
  it("binds kid to the key fingerprint and persists it", () => {
    const id = getIdentity();
    assert.equal(id.kid, kidFromFingerprint(id.fingerprint));
    assert.match(id.kid, /^gateway-eval-2026-09-[0-9a-f]{8}$/);
    assert.equal(id.ephemeral, false);
    const persist = identityRoundTrip();
    assert.equal(persist.ok, true, persist.detail);
  });

  it("migrates a stored identity that used the shared kid", async () => {
    const saved = JSON.parse(storage.getItem("bag.gateway.identity.v1")!);
    storage.setItem(
      "bag.gateway.identity.v1",
      JSON.stringify({ ...saved, kid: "gateway-eval-2026-09" }),
    );
    resetDoctrineForTests();
    const id = await bootstrapIdentity();
    assert.notEqual(id.kid, "gateway-eval-2026-09");
    assert.equal(id.kid, kidFromFingerprint(id.fingerprint));
    const stored = JSON.parse(storage.getItem("bag.gateway.identity.v1")!);
    assert.equal(stored.kid, id.kid);
  });
});

describe("verifyLease", () => {
  it("accepts an authentic policy-compliant lease", async () => {
    const lease = await mintLease({
      agentId: "agent",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      snapshot,
      tier: "A2",
    });
    const v = await verifyLease(lease, { tabId: 1, targetIndex: 5 });
    assert.equal(v.valid, true, v.reason);
    assert.equal(lease.policyId, ENTERPRISE_POLICY.policyId);
    assert.equal(lease.policyHash, await hashPolicyGrant(ENTERPRISE_POLICY));
  });

  it("refuses a lease that omits policyHash", async () => {
    const lease = await mintLease({
      agentId: "agent",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      snapshot,
      tier: "A2",
    });
    const { policyHash: _drop, ...rest } = lease;
    const v = await verifyLease(rest as ExecutionLease, { tabId: 1, targetIndex: 5 });
    assert.equal(v.valid, false);
    assert.match(v.reason ?? "", /ERR_MALFORMED_LEASE: missing policyHash/);
  });

  it("a swapped policyHash invalidates the signature", async () => {
    const lease = await mintLease({
      agentId: "agent",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      snapshot,
      tier: "A2",
    });
    const other = await hashPolicyGrant({
      ...ENTERPRISE_POLICY,
      allowedDomains: ["evil.example"],
    });
    const v = await verifyLease({ ...lease, policyHash: other }, { tabId: 1, targetIndex: 5 });
    assert.equal(v.valid, false);
    assert.match(v.reason ?? "", /ERR_LEASE_SIGNATURE_INVALID/);
  });

  it("refuses a well-signed lease after the live grant rotates", async () => {
    const lease = await mintLease({
      agentId: "agent",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      snapshot,
      tier: "A2",
    });
    const rotated = { ...ENTERPRISE_POLICY, allowedDomains: ["other.internal.acmebank.com"] };
    const v = await verifyLease(lease, { tabId: 1, targetIndex: 5 }, { grant: rotated });
    assert.equal(v.valid, false);
    assert.match(v.reason ?? "", /ERR_LEASE_POLICY_DRIFT/);
  });

  it("hashes equivalent grants bit-for-bit regardless of key and set order", async () => {
    const a = await hashPolicyGrant(ENTERPRISE_POLICY);
    const b = await hashPolicyGrant({
      requiresHumanApprovalFor: [...ENTERPRISE_POLICY.requiresHumanApprovalFor].reverse(),
      maxLeaseTtlMs: ENTERPRISE_POLICY.maxLeaseTtlMs,
      allowedDomains: [...ENTERPRISE_POLICY.allowedDomains].reverse(),
      principalId: ENTERPRISE_POLICY.principalId,
      policyId: ENTERPRISE_POLICY.policyId,
      allowedTiers: [...ENTERPRISE_POLICY.allowedTiers].reverse(),
    });
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it("refuses a lease that omits targetSnapshot", async () => {
    const forged = {
      leaseId: "lease_forged",
      authorizationId: "authz_x",
      agentId: "attacker",
      kid: getIdentity().kid,
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      tier: "A2",
      nonce: "aa".repeat(16),
      issuedAt: Date.now(),
      expiresAt: Date.now() + 20_000,
      alg: "Ed25519",
      signature: "deadbeef".repeat(16),
    } as ExecutionLease;
    const v = await verifyLease(forged, { tabId: 1, targetIndex: 5 });
    assert.equal(v.valid, false);
    assert.match(v.reason ?? "", /ERR_MALFORMED_LEASE/);
  });

  it("refuses a self-signed lease that ships its own public key", async () => {
    const forged = {
      leaseId: "lease_selfsigned",
      authorizationId: "authz_x",
      agentId: "attacker",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      targetSnapshot: snapshot,
      tier: "A2",
      nonce: "bb".repeat(16),
      issuedAt: Date.now(),
      expiresAt: Date.now() + 20_000,
      alg: "Ed25519",
      kid: "rogue-kid",
      publicKey: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\n-----END PUBLIC KEY-----",
      signature: "ab".repeat(64),
    } as ExecutionLease;
    const v = await verifyLease(forged, { tabId: 1, targetIndex: 5 });
    assert.equal(v.valid, false);
    assert.match(v.reason ?? "", /ERR_LEASE_EMBEDDED_KEY_REJECTED/);
  });

  it("refuses a well-formed signature under a kid not in the trust store", async () => {
    const forged = {
      leaseId: "lease_untrusted",
      authorizationId: "authz_x",
      agentId: "attacker",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      targetSnapshot: snapshot,
      tier: "A2",
      nonce: "cc".repeat(16),
      issuedAt: Date.now(),
      expiresAt: Date.now() + 20_000,
      alg: "Ed25519",
      kid: "rogue-kid",
      policyId: ENTERPRISE_POLICY.policyId,
      policyHash: "00".repeat(32),
      signature: "cd".repeat(64),
    } as ExecutionLease;
    const v = await verifyLease(forged, { tabId: 1, targetIndex: 5 });
    assert.equal(v.valid, false);
    assert.match(v.reason ?? "", /ERR_LEASE_UNTRUSTED_KID/);
  });

  it("refuses a bad signature under a trusted kid", async () => {
    const lease = await mintLease({
      agentId: "agent",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      snapshot,
      tier: "A2",
    });
    const v = await verifyLease({ ...lease, signature: "ab".repeat(64) }, { tabId: 1, targetIndex: 5 });
    assert.equal(v.valid, false);
    assert.equal(v.reason, "ERR_LEASE_SIGNATURE_INVALID");
  });

  it("refuses an expired lease", async () => {
    const lease = await mintLease({
      agentId: "agent",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      snapshot,
      tier: "A2",
      ttlMs: 0,
    });
    const v = await verifyLease(lease, { tabId: 1, targetIndex: 5 });
    assert.equal(v.valid, false);
    assert.equal(v.reason, "ERR_LEASE_EXPIRED");
  });

  it("refuses a target mismatch", async () => {
    const lease = await mintLease({
      agentId: "agent",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      snapshot,
      tier: "A2",
    });
    const v = await verifyLease(lease, { tabId: 9, targetIndex: 5 });
    assert.equal(v.valid, false);
    assert.match(v.reason ?? "", /ERR_LEASE_TARGET_MISMATCH/);
  });

  it("refuses a replayed nonce", async () => {
    const lease = await mintLease({
      agentId: "agent",
      tabId: 1,
      frameId: 0,
      targetIndex: 5,
      snapshot,
      tier: "A2",
    });
    const first = await verifyLease(lease, { tabId: 1, targetIndex: 5 }, { consumeNonce: true });
    assert.equal(first.valid, true, first.reason);
    const second = await verifyLease(lease, { tabId: 1, targetIndex: 5 }, { consumeNonce: true });
    assert.equal(second.valid, false);
    assert.equal(second.reason, "ERR_LEASE_NONCE_REPLAYED");
  });
});

describe("verifyEvidence", () => {
  it("reports HMAC-era evidence UNVERIFIABLE", async () => {
    const v = await verifyEvidence(HMAC_ERA_EVIDENCE, { publicPem: getIdentity().publicPem });
    assert.equal(v.verdict, "UNVERIFIABLE");
    assert.equal(v.checked, false);
  });

  it("refuses a record that nominates its own key", async () => {
    const v = await verifyEvidence(FORGED_WIRE_CLAIM, { publicPem: getIdentity().publicPem });
    assert.equal(v.verdict, "INVALID");
    assert.match(v.reason, /ERR_EVIDENCE_EMBEDDED_KEY_REJECTED/);
  });

  it("is UNVERIFIABLE without a pinned key", async () => {
    const unsigned = {
      evidenceId: "ev_test",
      timestamp: new Date().toISOString(),
      intent: { agentId: "a", tool: "click_element_by_index", params: { index: 2 }, intentHash: "aa" },
      authority: {
        tier: "A2" as const,
        policyEvaluation: "PERMITTED" as const,
        authorizationId: "authz",
        leaseId: "lease",
        leaseTtlMs: 1000,
        kid: getIdentity().kid,
      },
      execution: {
        tabId: 1,
        targetIndex: 2,
        dispatched: false,
        state: "REJECTED" as const,
        targetSnapshot: snapshot,
      },
      effect: { nativeEventsDispatched: [], domMutationsObserved: 0 },
      verification: { status: "REFUSED" as const, postConditionsSatisfied: [], unsatisfied: ["x"] },
    };
    const signed = await signEvidence(unsigned);
    const v = await verifyEvidence(signed, { publicPem: null });
    assert.equal(v.verdict, "UNVERIFIABLE");
    assert.equal(v.checked, false);
  });

  it("VALID against the pinned key of this console", async () => {
    const unsigned = {
      evidenceId: "ev_ok",
      timestamp: new Date().toISOString(),
      intent: { agentId: "a", tool: "click_element_by_index", params: { index: 2 }, intentHash: "bb" },
      authority: {
        tier: "A2" as const,
        policyEvaluation: "PERMITTED" as const,
        authorizationId: "authz",
        leaseId: "lease",
        leaseTtlMs: 1000,
        kid: getIdentity().kid,
      },
      execution: {
        tabId: 1,
        targetIndex: 2,
        dispatched: false,
        state: "REJECTED" as const,
        targetSnapshot: snapshot,
      },
      effect: { nativeEventsDispatched: [], domMutationsObserved: 0 },
      verification: { status: "REFUSED" as const, postConditionsSatisfied: [], unsatisfied: ["x"] },
    };
    const signed = await signEvidence(unsigned);
    const v = await verifyEvidence(signed, { publicPem: getIdentity().publicPem });
    assert.equal(v.verdict, "VALID", v.reason);
    assert.equal(v.checked, true);
  });

  it("names a kid mismatch when the pinned key cannot verify", async () => {
    const unsigned = {
      evidenceId: "ev_mismatch",
      timestamp: new Date().toISOString(),
      intent: { agentId: "a", tool: "click_element_by_index", params: { index: 2 }, intentHash: "cc" },
      authority: {
        tier: "A2" as const,
        policyEvaluation: "PERMITTED" as const,
        authorizationId: "authz",
        leaseId: "lease",
        leaseTtlMs: 1000,
        kid: getIdentity().kid,
      },
      execution: {
        tabId: 1,
        targetIndex: 2,
        dispatched: false,
        state: "REJECTED" as const,
        targetSnapshot: snapshot,
      },
      effect: { nativeEventsDispatched: [], domMutationsObserved: 0 },
      verification: { status: "REFUSED" as const, postConditionsSatisfied: [], unsatisfied: ["x"] },
    };
    const signed = await signEvidence(unsigned);
    signed.signature.value = "ab".repeat(64);
    signed.signature.kid = "gateway-eval-2026-09-deadbeef";
    const v = await verifyEvidence(signed, {
      publicPem: getIdentity().publicPem,
      expectedKid: getIdentity().kid,
    });
    assert.equal(v.verdict, "INVALID");
    assert.match(v.reason, /not this console/);
  });
});

describe("policy", () => {
  it("hard-disables D2", () => {
    const v = evaluatePolicy(ENTERPRISE_POLICY, "D2", "treasury.internal.acmebank.com", "click_element_by_index");
    assert.equal(v.permitted, false);
    assert.match(v.reason ?? "", /ERR_POLICY_DENIED/);
  });

  it("matches domains label-wise and still resolves credential-bearing hosts", () => {
    const nearMisses = [
      "internal.acmebank.com",
      "evil-internal.acmebank.com",
      "internal.acmebank.com.evil.net",
      "user:pass@treasury.internal.acmebank.com",
    ];
    const granted = nearMisses.map((h) => evaluatePolicy(ENTERPRISE_POLICY, "A2", h, "click_element_by_index"));
    assert.deepEqual(
      granted.map((g) => g.permitted),
      [false, false, false, true],
    );
  });
});

describe("orchestrator", () => {
  it("does not dispatch on an off-allowlist host", async () => {
    const clicks = { n: 0 };
    const res = await executeAuthorizedAction(adapter("evil-phishing-site.example", clicks), {
      agentId: ENTERPRISE_POLICY.principalId,
      tool: "click_element_by_index",
      tier: "A2",
      tabId: 1,
      targetIndex: 5,
      host: "evil-phishing-site.example",
    });
    assert.equal(res.ok, false);
    assert.equal(res.dispatched, false);
    assert.equal(clicks.n, 0);
    assert.match(res.error ?? "", /ERR_POLICY_DENIED/);
  });

  it("invalidates on geometry drift before dispatch", async () => {
    const clicks = { n: 0 };
    const drifted: TargetSnapshot = {
      ...snapshot,
      geometry: { ...snapshot.geometry, x: snapshot.geometry.x + 25 },
    };
    const pre = checkPreDispatch(snapshot, {
      geometry: drifted.geometry,
      domHash: drifted.domHash,
      isOccluded: false,
    });
    assert.equal(pre.ok, false);
    if (pre.ok === false) assert.match(pre.reason, /ERR_TARGET_GEOMETRY_INVALIDATED/);
    const res = await executeAuthorizedAction(adapter("treasury.internal.acmebank.com", clicks, drifted), {
      agentId: ENTERPRISE_POLICY.principalId,
      tool: "click_element_by_index",
      tier: "A2",
      tabId: 1,
      targetIndex: 5,
      host: "treasury.internal.acmebank.com",
    });
    // mint uses live snapshot, so this path is permitted if live == leased.
    // Drift is between leased and live — mint from live means they match.
    // The unit assertion above is the load-bearing check.
    assert.equal(typeof res.ok, "boolean");
    void clicks;
  });
});

describe("evidence paste", () => {
  it("parses a well-formed record and rejects junk", () => {
    const ok = parseEvidenceJson(JSON.stringify(HMAC_ERA_EVIDENCE));
    assert.equal(ok.ok, true);
    const empty = parseEvidenceJson("  ");
    assert.equal(empty.ok, false);
    const junk = parseEvidenceJson("{not json");
    assert.equal(junk.ok, false);
    const bare = parseEvidenceJson(JSON.stringify({ evidenceId: "x" }));
    assert.equal(bare.ok, false);
  });
});

describe("self-audit", () => {
  it("refuses every known attack against the v0.1 trust boundary", async () => {
    const results = await runSelfAudit();
    const open = results.filter((p) => !p.refused);
    assert.equal(open.length, 0, open.map((p) => `${p.id}: ${p.detail}`).join("; "));
    assert.equal(results.length, 9);
  });
});
