import { sha256Hex } from "./bytes";
import type { EvidenceRecord } from "./types";

/** RFC 3526 2048-bit MODP group. Discrete-log, not post-quantum. */
const P = BigInt(
  "0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74" +
    "020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F1437" +
    "4FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED" +
    "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF05" +
    "98DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB" +
    "9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B" +
    "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718" +
    "3995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF",
);
const Q = (P - 1n) / 2n;
const G = 2n;

export const ZK_REASONS = [
  "GEOMETRY",
  "OCCLUSION",
  "EXPIRED",
  "REPLAY",
  "POLICY",
  "TAMPER",
  "OMITTED",
  "DISPATCHED",
] as const;

export type ZkReason = (typeof ZK_REASONS)[number];

export interface ZkOpening {
  reason: ZkReason;
  index: number;
  blinding: string;
}

export interface ZkProof {
  system: "sigma-or-pedersen";
  group: "RFC3526-2048";
  commitment: string;
  challenges: string[];
  responses: string[];
  nonces: string[];
}

export interface ZkStatement {
  evidenceId: string;
  dispatched: boolean;
  kid: string;
  boundSignature: string | null;
  proof: ZkProof;
}

export interface ZkVerifyResult {
  valid: boolean;
  reason: string;
}

export const ZK_SYSTEMS = [
  {
    name: "Groth16 · circom / snarkjs",
    kind: "SNARK",
    setup: "Per-circuit ceremony",
    size: "~200 B",
    browser: "Witness yes. Proving a real circuit is a last resort.",
    bag: "Cheap auditor verify. Trusted setup is a CISO conversation.",
  },
  {
    name: "Noir UltraHonk / Halo2",
    kind: "Plonkish",
    setup: "None / universal",
    size: "~1–4 KB",
    browser: "Noir client proving ~2s on laptop; phones OOM on some circuits.",
    bag: "Best client-side fit for a small predicate circuit.",
  },
  {
    name: "Stwo · Circle STARKs",
    kind: "STARK",
    setup: "None",
    size: "~45–100 KB raw",
    browser: "Verifier is small. Proving belongs on a server.",
    bag: "Transparent. Wrap to Groth16 if you need sub-KB — that wrap is not PQ.",
  },
  {
    name: "RISC Zero 3.0",
    kind: "zkVM",
    setup: "STARKs transparent. Groth16 if compressed.",
    size: "~200 kB or ~200 B wrap",
    browser: "No. GPU / Bonsai.",
    bag: "Three circuits: RISC-V STARK, recursion STARK, Groth16 wrap. ImageID is a Merkle snapshot. Wrap drops PQ.",
  },
  {
    name: "SP1 Hypercube",
    kind: "zkVM",
    setup: "Plonky3 STARKs. Wrap optional.",
    size: "STARK or ~1 kB wrap",
    browser: "No. GPU cluster.",
    bag: "Scales on large guests. verifyLease is small — base cost beats ETH-block headlines.",
  },
  {
    name: "OpenVM 2.0 · SWIRL",
    kind: "zkVM",
    setup: "None. PQ if unwrapped.",
    size: "<300 kB PQ",
    browser: "No. 5090-class GPU.",
    bag: "Stays PQ at an emailable size. No Groth16 step on the default path.",
  },
  {
    name: "This lab · guest trace",
    kind: "Guest",
    setup: "None",
    size: "No receipt",
    browser: "Runs verifyLease in JS. Does not prove.",
    bag: "Same checks as the kernel. A journal is not a receipt. Proving is server-side.",
  },
  {
    name: "Bulletproofs (Bünz et al. 2018)",
    kind: "IPA",
    setup: "None",
    size: "2⌈log₂ n⌉+9 elements",
    browser: "This lab: 8-bit range, 3 rounds, about a second in-page.",
    bag: "Hide a committed magnitude — drift px or an amount band. Verify is linear in n.",
  },
  {
    name: "This lab · Schnorr OR",
    kind: "Sigma",
    setup: "None",
    size: "~2 KB",
    browser: "Runs here. Honest-verifier ZK via Fiat–Shamir.",
    bag: "Hides which refusal fired. Does not prove the Gateway told the truth.",
  },
] as const;

let H: bigint | null = null;

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return r;
}

function hex(n: bigint): string {
  return n.toString(16);
}

function fromHexInt(s: string): bigint {
  const clean = s.trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error("ERR_ZK_MALFORMED: non-hex integer");
  return BigInt("0x" + clean);
}

function randScalar(): bigint {
  const buf = new Uint8Array(32);
  for (;;) {
    crypto.getRandomValues(buf);
    let n = 0n;
    for (const b of buf) n = (n << 8n) | BigInt(b);
    n %= Q;
    if (n > 0n) return n;
  }
}

async function generators(): Promise<{ h: bigint }> {
  if (H) return { h: H };
  const seed = await sha256Hex("BAG-PEDERSEN-H-v1");
  let h = modPow(2n, fromHexInt(seed), P);
  h = (h * h) % P;
  if (h <= 1n) h = modPow(G, 3n, P);
  H = h;
  return { h };
}

async function fiatShamir(parts: string[]): Promise<bigint> {
  const digest = await sha256Hex(parts.join("|"));
  const e = fromHexInt(digest) % Q;
  return e === 0n ? 1n : e;
}

export function classifyEvidence(record: EvidenceRecord): ZkReason {
  if (record.execution.dispatched) return "DISPATCHED";
  const r = (record.execution.refusalReason ?? record.verification.status).toUpperCase();
  if (r.includes("GEOMETRY")) return "GEOMETRY";
  if (r.includes("OCCLUDED") || r.includes("OCCLUSION")) return "OCCLUSION";
  if (r.includes("EXPIRED")) return "EXPIRED";
  if (r.includes("REPLAY")) return "REPLAY";
  if (r.includes("SIGNATURE") || r.includes("MALFORMED") || r.includes("TAMPER") || r.includes("UNTRUSTED")) {
    return "TAMPER";
  }
  if (r.includes("LEASE_REQUIRED") || r.includes("OMIT")) return "OMITTED";
  return "POLICY";
}

export async function proveMembership(
  reason: ZkReason,
  publicInputs: { evidenceId: string; dispatched: boolean; kid: string; boundSignature: string | null },
): Promise<{ statement: ZkStatement; opening: ZkOpening }> {
  const k = ZK_REASONS.indexOf(reason);
  if (k < 0) throw new Error("ERR_ZK_UNKNOWN_REASON");
  const { h } = await generators();
  const r = randScalar();
  const C = (modPow(G, BigInt(k), P) * modPow(h, r, P)) % P;
  const n = ZK_REASONS.length;

  const A: bigint[] = Array(n);
  const e: bigint[] = Array(n);
  const s: bigint[] = Array(n);
  const w = randScalar();

  for (let i = 0; i < n; i++) {
    if (i === k) continue;
    e[i] = randScalar();
    s[i] = randScalar();
    const Yi = (C * modPow(G, Q - BigInt(i), P)) % P;
    const YiInvE = modPow(Yi, Q - e[i]!, P);
    A[i] = (modPow(h, s[i]!, P) * YiInvE) % P;
  }

  A[k] = modPow(h, w, P);

  const challenge = await fiatShamir([
    "bag.zk.v1",
    hex(P),
    hex(G),
    hex(h),
    hex(C),
    ...A.map(hex),
    publicInputs.evidenceId,
    publicInputs.dispatched ? "1" : "0",
    publicInputs.kid,
    publicInputs.boundSignature ?? "",
  ]);

  let others = 0n;
  for (let i = 0; i < n; i++) {
    if (i === k) continue;
    others = (others + e[i]!) % Q;
  }
  e[k] = (challenge - others + Q) % Q;
  s[k] = (w + e[k]! * r) % Q;

  const statement: ZkStatement = {
    evidenceId: publicInputs.evidenceId,
    dispatched: publicInputs.dispatched,
    kid: publicInputs.kid,
    boundSignature: publicInputs.boundSignature,
    proof: {
      system: "sigma-or-pedersen",
      group: "RFC3526-2048",
      commitment: hex(C),
      challenges: e.map(hex),
      responses: s.map(hex),
      nonces: A.map(hex),
    },
  };
  return { statement, opening: { reason, index: k, blinding: hex(r) } };
}

export async function verifyMembership(statement: ZkStatement): Promise<ZkVerifyResult> {
  try {
    const { proof } = statement;
    if (proof.system !== "sigma-or-pedersen" || proof.group !== "RFC3526-2048") {
      return { valid: false, reason: "ERR_ZK_UNKNOWN_SYSTEM" };
    }
    const n = ZK_REASONS.length;
    if (proof.challenges.length !== n || proof.responses.length !== n || proof.nonces.length !== n) {
      return { valid: false, reason: "ERR_ZK_MALFORMED: branch count" };
    }
    const { h } = await generators();
    const C = fromHexInt(proof.commitment);
    const A = proof.nonces.map(fromHexInt);
    const e = proof.challenges.map(fromHexInt);
    const s = proof.responses.map(fromHexInt);

    for (let i = 0; i < n; i++) {
      if (e[i]! >= Q || s[i]! >= Q) {
        return { valid: false, reason: "ERR_ZK_MALFORMED: scalar out of range" };
      }
    }

    const expected = await fiatShamir([
      "bag.zk.v1",
      hex(P),
      hex(G),
      hex(h),
      hex(C),
      ...A.map(hex),
      statement.evidenceId,
      statement.dispatched ? "1" : "0",
      statement.kid,
      statement.boundSignature ?? "",
    ]);
    const sum = e.reduce((a, b) => (a + b) % Q, 0n);
    if (sum !== expected) {
      return { valid: false, reason: "ERR_ZK_CHALLENGE_MISMATCH: Fiat–Shamir binding failed" };
    }

    for (let i = 0; i < n; i++) {
      const Yi = (C * modPow(G, Q - BigInt(i), P)) % P;
      const lhs = A[i]!;
      const rhs = (modPow(h, s[i]!, P) * modPow(Yi, Q - e[i]!, P)) % P;
      if (lhs !== rhs) {
        return { valid: false, reason: `ERR_ZK_EQUATION: branch ${i} does not close` };
      }
    }
    return {
      valid: true,
      reason: "Pedersen opening is in the published refusal set. Which member is not in the proof.",
    };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "ERR_ZK_VERIFY" };
  }
}

export async function forgeMembership(publicInputs: {
  evidenceId: string;
  dispatched: boolean;
  kid: string;
  boundSignature: string | null;
}): Promise<ZkStatement> {
  const { h } = await generators();
  const n = ZK_REASONS.length;
  const C = modPow(h, randScalar(), P);
  const A = Array.from({ length: n }, () => modPow(h, randScalar(), P));
  const e = Array.from({ length: n }, () => randScalar());
  const s = Array.from({ length: n }, () => randScalar());
  const challenge = await fiatShamir([
    "bag.zk.v1",
    hex(P),
    hex(G),
    hex(h),
    hex(C),
    ...A.map(hex),
    publicInputs.evidenceId,
    publicInputs.dispatched ? "1" : "0",
    publicInputs.kid,
    publicInputs.boundSignature ?? "",
  ]);
  let others = 0n;
  for (let i = 1; i < n; i++) others = (others + e[i]!) % Q;
  e[0] = (challenge - others + Q) % Q;
  return {
    evidenceId: publicInputs.evidenceId,
    dispatched: publicInputs.dispatched,
    kid: publicInputs.kid,
    boundSignature: publicInputs.boundSignature,
    proof: {
      system: "sigma-or-pedersen",
      group: "RFC3526-2048",
      commitment: hex(C),
      challenges: e.map(hex),
      responses: s.map(hex),
      nonces: A.map(hex),
    },
  };
}

export function openCommitment(
  opening: ZkOpening,
  commitment: string,
): Promise<{ ok: boolean; detail: string }> {
  return generators().then(({ h }) => {
    const r = fromHexInt(opening.blinding);
    const C = fromHexInt(commitment);
    const expect = (modPow(G, BigInt(opening.index), P) * modPow(h, r, P)) % P;
    if (expect !== C) return { ok: false, detail: "Opening does not match the commitment." };
    return {
      ok: true,
      detail: `Witness opens to ${opening.reason}. The verifier never received this string.`,
    };
  });
}
