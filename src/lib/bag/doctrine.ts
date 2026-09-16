import {
  ENTERPRISE_POLICY,
  MUTATING_TIERS,
  type CapabilityTier,
  type EvidenceRecord,
  type EvidenceVerdict,
  type ExecutionLease,
  type GatewayIdentity,
  type Geometry,
  type LeaseVerifyResult,
  type PolicyGrant,
  type TargetSnapshot,
  type VerifyResult,
} from "./types";
import {
  bytesToPem,
  fingerprintHex,
  fromB64,
  fromHex,
  pemToBytes,
  randomHex,
  sha256Hex,
  toArrayBuffer,
  toB64,
  toHex,
  uid,
} from "./bytes";

const ED = { name: "Ed25519" } as AlgorithmIdentifier;
const DRIFT_PX = 5;
const DEFAULT_KID = "gateway-eval-2026-09";
const STORAGE_KEY = "bag.gateway.identity.v1";

export const geometryDriftPx = DRIFT_PX;

let identity: GatewayIdentity | null = null;
let privateKey: CryptoKey | null = null;
let publicKey: CryptoKey | null = null;
const trustStore = new Map<string, { spki: Uint8Array; status: "active" | "revoked"; cryptoKey?: CryptoKey }>();
const consumedNonces = new Set<string>();

function assertCrypto(): void {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Web Crypto is required for Gateway identity.");
  }
}

export async function bootstrapIdentity(): Promise<GatewayIdentity> {
  assertCrypto();
  if (identity && privateKey && publicKey) return identity;

  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as { kid: string; pkcs8: string; spki: string };
      const pkcs8 = fromB64(parsed.pkcs8);
      const spki = fromB64(parsed.spki);
      privateKey = await crypto.subtle.importKey("pkcs8", toArrayBuffer(pkcs8), ED, true, ["sign"]);
      publicKey = await crypto.subtle.importKey("spki", toArrayBuffer(spki), ED, true, ["verify"]);
      const fp = await sha256Hex(spki);
      identity = {
        kid: parsed.kid,
        fingerprint: fingerprintHex(fp),
        publicPem: bytesToPem(spki, "PUBLIC KEY"),
        privatePkcs8: pkcs8,
        publicSpki: spki,
        ephemeral: false,
      };
      trustStore.set(identity.kid, { spki, status: "active", cryptoKey: publicKey });
      return identity;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const pair = (await crypto.subtle.generateKey(ED, true, ["sign", "verify"])) as CryptoKeyPair;
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const fp = await sha256Hex(spki);
  identity = {
    kid: DEFAULT_KID,
    fingerprint: fingerprintHex(fp),
    publicPem: bytesToPem(spki, "PUBLIC KEY"),
    privatePkcs8: pkcs8,
    publicSpki: spki,
    ephemeral: false,
  };
  trustStore.set(identity.kid, { spki, status: "active", cryptoKey: publicKey });
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ kid: identity.kid, pkcs8: toB64(pkcs8), spki: toB64(spki) }),
  );
  return identity;
}

export function getIdentity(): GatewayIdentity {
  if (!identity) throw new Error("Gateway identity has not been provisioned.");
  return identity;
}

export function getTrustStoreEntries(): { kid: string; status: string; fingerprint: string }[] {
  const id = identity;
  return [...trustStore.entries()].map(([kid, rec]) => ({
    kid,
    status: rec.status,
    fingerprint: id && kid === id.kid ? id.fingerprint : toHex(rec.spki).slice(0, 16),
  }));
}

export function resetNonceStore(): void {
  consumedNonces.clear();
}

export function nonceStoreSize(): number {
  return consumedNonces.size;
}

function leasePayload(lease: Omit<ExecutionLease, "signature"> | ExecutionLease): string {
  return [
    lease.agentId,
    lease.tabId,
    lease.frameId,
    lease.targetIndex,
    lease.targetSnapshot.domHash,
    lease.nonce,
    lease.issuedAt,
    lease.expiresAt,
    lease.kid,
    lease.tier,
  ].join(":");
}

async function signBytes(message: string): Promise<string> {
  if (!privateKey) throw new Error("signing key unavailable");
  const sig = await crypto.subtle.sign(ED, privateKey, new TextEncoder().encode(message));
  return toHex(sig);
}

async function verifyWithKey(key: CryptoKey, message: string, signatureHex: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      ED,
      key,
      toArrayBuffer(fromHex(signatureHex)),
      new TextEncoder().encode(message),
    );
  } catch {
    return false;
  }
}

async function resolveKid(kid: string): Promise<CryptoKey | null> {
  const rec = trustStore.get(kid);
  if (!rec || rec.status !== "active") return null;
  if (rec.cryptoKey) return rec.cryptoKey;
  rec.cryptoKey = await crypto.subtle.importKey("spki", toArrayBuffer(rec.spki), ED, true, ["verify"]);
  return rec.cryptoKey;
}

export function matchDomain(pattern: string, host: string): boolean {
  const hostname = host
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]!
    .split("@")
    .pop()!
    .split(":")[0]!;
  const p = pattern.toLowerCase();
  if (p.startsWith("*.")) {
    const suffix = p.slice(2);
    const hostLabels = hostname.split(".");
    const suffixLabels = suffix.split(".");
    if (hostLabels.length !== suffixLabels.length + 1) return false;
    return hostLabels.slice(1).join(".") === suffix;
  }
  return hostname === p;
}

export function evaluatePolicy(
  grant: PolicyGrant,
  requestedTier: CapabilityTier,
  host: string,
  tool: string,
): { permitted: boolean; reason?: string } {
  if (requestedTier === "D2") {
    return { permitted: false, reason: "ERR_POLICY_DENIED: D2 credential-bearing access is hard-disabled" };
  }
  if (grant.requiresHumanApprovalFor.some((g) => g === tool || g === `${requestedTier}:*` || g === requestedTier)) {
    return {
      permitted: false,
      reason: "ERR_APPROVAL_GATE_DENIED: declared human-approval gate has no ceremony in v0.1 — fail closed",
    };
  }
  if (!grant.allowedTiers.includes(requestedTier)) {
    return { permitted: false, reason: `ERR_POLICY_DENIED: principal lacks grant for tier ${requestedTier}` };
  }
  if (MUTATING_TIERS.includes(requestedTier)) {
    if (grant.allowedDomains.length === 0) {
      return { permitted: false, reason: "ERR_POLICY_DENIED: no domain grant — mutating action refused" };
    }
    const ok = grant.allowedDomains.some((p) => matchDomain(p, host));
    if (!ok) {
      return { permitted: false, reason: `ERR_POLICY_DENIED: host ${host} is outside the domain allowlist` };
    }
  }
  return { permitted: true };
}

export async function mintLease(input: {
  agentId: string;
  tabId: number;
  frameId: number;
  targetIndex: number;
  snapshot: TargetSnapshot;
  tier: CapabilityTier;
  ttlMs?: number;
  grant?: PolicyGrant;
}): Promise<ExecutionLease> {
  const id = getIdentity();
  if (!privateKey) throw new Error("signing key unavailable");
  const grant = input.grant ?? ENTERPRISE_POLICY;
  const ttl = Math.min(input.ttlMs ?? 30_000, grant.maxLeaseTtlMs);
  const issuedAt = Date.now();
  const unsigned: Omit<ExecutionLease, "signature"> = {
    leaseId: uid("lease"),
    authorizationId: uid("authz"),
    agentId: input.agentId,
    tabId: input.tabId,
    frameId: input.frameId,
    targetIndex: input.targetIndex,
    targetSnapshot: input.snapshot,
    tier: input.tier,
    nonce: randomHex(16),
    issuedAt,
    expiresAt: issuedAt + ttl,
    alg: "Ed25519",
    kid: id.kid,
  };
  const signature = await signBytes(leasePayload(unsigned));
  return { ...unsigned, signature };
}

const REQUIRED_LEASE_FIELDS: (keyof ExecutionLease)[] = [
  "leaseId",
  "agentId",
  "kid",
  "tabId",
  "frameId",
  "targetIndex",
  "targetSnapshot",
  "tier",
  "nonce",
  "issuedAt",
  "expiresAt",
  "alg",
  "signature",
];

export async function verifyLease(
  lease: ExecutionLease,
  expected?: { tabId?: number; targetIndex?: number },
  options?: { consumeNonce?: boolean },
): Promise<LeaseVerifyResult> {
  if (lease.publicKey) {
    return { valid: false, reason: "ERR_LEASE_EMBEDDED_KEY_REJECTED: artifact may not define its own trust anchor" };
  }
  for (const field of REQUIRED_LEASE_FIELDS) {
    if (lease[field] === undefined || lease[field] === null || lease[field] === "") {
      return { valid: false, reason: `ERR_MALFORMED_LEASE: missing ${field}` };
    }
  }
  if (!lease.targetSnapshot?.domHash) {
    return { valid: false, reason: "ERR_MALFORMED_LEASE: missing targetSnapshot" };
  }

  const key = await resolveKid(lease.kid);
  if (!key) {
    return { valid: false, reason: `ERR_LEASE_UNTRUSTED_KID: ${lease.kid} is not in the trust store` };
  }

  const ok = await verifyWithKey(key, leasePayload(lease), lease.signature);
  if (!ok) {
    return { valid: false, reason: "ERR_LEASE_SIGNATURE_INVALID" };
  }

  if (Date.now() >= lease.expiresAt) {
    return { valid: false, reason: "ERR_LEASE_EXPIRED" };
  }
  if (expected?.tabId !== undefined && expected.tabId !== lease.tabId) {
    return { valid: false, reason: `ERR_LEASE_TARGET_MISMATCH: tabId expected ${expected.tabId} got ${String(lease.tabId)}` };
  }
  if (expected?.targetIndex !== undefined && expected.targetIndex !== lease.targetIndex) {
    return { valid: false, reason: "ERR_LEASE_TARGET_MISMATCH: targetIndex" };
  }
  if (options?.consumeNonce) {
    if (consumedNonces.has(lease.nonce)) {
      return { valid: false, reason: "ERR_LEASE_NONCE_REPLAYED" };
    }
    consumedNonces.add(lease.nonce);
  }
  return { valid: true };
}

export function checkPreDispatch(
  leased: TargetSnapshot,
  live: { geometry: Geometry; domHash: string; isOccluded: boolean },
): { ok: true } | { ok: false; reason: string } {
  const dx = Math.abs(live.geometry.x - leased.geometry.x);
  const dy = Math.abs(live.geometry.y - leased.geometry.y);
  if (dx >= DRIFT_PX || dy >= DRIFT_PX) {
    return { ok: false, reason: `ERR_TARGET_GEOMETRY_INVALIDATED: drift ${Math.round(Math.max(dx, dy))}px ≥ ${DRIFT_PX}px` };
  }
  if (live.domHash !== leased.domHash) {
    return { ok: false, reason: "ERR_DOM_HASH_MUTATED" };
  }
  if (live.isOccluded) {
    return { ok: false, reason: "ERR_TARGET_OCCLUDED" };
  }
  return { ok: true };
}

function canonicalEvidence(record: Omit<EvidenceRecord, "signature"> | EvidenceRecord): string {
  const body = {
    evidenceId: record.evidenceId,
    timestamp: record.timestamp,
    intent: record.intent,
    authority: record.authority,
    execution: record.execution,
    effect: record.effect,
    verification: record.verification,
  };
  return JSON.stringify(body);
}

export async function signEvidence(record: Omit<EvidenceRecord, "signature">): Promise<EvidenceRecord> {
  const id = getIdentity();
  const value = await signBytes(canonicalEvidence(record));
  return {
    ...record,
    signature: { alg: "Ed25519", kid: id.kid, value },
  };
}

export async function verifyEvidence(
  record: EvidenceRecord,
  options?: { publicPem?: string | null; requireKey?: boolean },
): Promise<VerifyResult> {
  if (record.signature.publicKey) {
    return {
      verdict: "INVALID",
      reason: "ERR_EVIDENCE_EMBEDDED_KEY_REJECTED: a record may not nominate its own verification key",
      checked: true,
    };
  }

  const alg = record.signature.alg;
  if (alg !== "Ed25519") {
    if (alg === "HMAC-SHA256") {
      return {
        verdict: "UNVERIFIABLE",
        reason: "SIGNATURE UNVERIFIED: HMAC-SHA256 cannot be re-checked without a shared secret the auditor does not have. Unrecognized for Ed25519 identity.",
        checked: false,
      };
    }
    return {
      verdict: "INVALID",
      reason: `Unrecognized signature algorithm ${String(alg)}`,
      checked: true,
    };
  }

  const pem = options?.publicPem;
  if (!pem) {
    return {
      verdict: "UNVERIFIABLE",
      reason: "SIGNATURE UNVERIFIED: no independently held public key. Pin a key (or a trust store) obtained out of band.",
      checked: false,
    };
  }

  try {
    const spki = pemToBytes(pem);
    const key = await crypto.subtle.importKey("spki", toArrayBuffer(spki), ED, true, ["verify"]);
    const ok = await verifyWithKey(key, canonicalEvidence(record), record.signature.value);
    if (!ok) {
      return { verdict: "INVALID", reason: "SIGNATURE INVALID: Ed25519 verification failed against the pinned key.", checked: true };
    }
    return {
      verdict: "VALID",
      reason: "VALID: the holder of the pinned key signed this record. Provenance is how you obtained the key, not the record.",
      checked: true,
    };
  } catch (err) {
    return {
      verdict: "UNVERIFIABLE",
      reason: `SIGNATURE UNVERIFIED: could not import pinned key (${err instanceof Error ? err.message : "import failed"})`,
      checked: false,
    };
  }
}

export function classifyVerdict(v: EvidenceVerdict): "ok" | "deny" | "warn" {
  if (v === "VALID") return "ok";
  if (v === "INVALID") return "deny";
  return "warn";
}

export function makeDomHash(tagName: string, id: string, geometry: Geometry): string {
  return `${tagName.toLowerCase()}:${id}:${Math.round(geometry.width)}x${Math.round(geometry.height)}`;
}

export async function intentHash(tool: string, params: Record<string, unknown>): Promise<string> {
  return sha256Hex(JSON.stringify({ tool, params }));
}

export { ENTERPRISE_POLICY };
