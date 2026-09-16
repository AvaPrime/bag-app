/**
 * Pedagogical MPC for the evaluation console.
 * Real Shamir (2-of-3) and Beaver AND over 𝔽_p, p = 2^255 − 19.
 * This process is every party and the dealer. Independent machines are a
 * deployment property, not a property of the arithmetic.
 * Reconstructing a share is not a lease. FROST is not implemented here.
 */
import { evaluatePolicy } from "./doctrine.ts";
import { ENTERPRISE_POLICY } from "./types.ts";

/** Curve25519 field prime. Shamir lives here. Not X25519, not Ed25519. */
export const MPC_P = (1n << 255n) - 19n;
export const MPC_T = 2;
export const MPC_N = 3;
export const MPC_FIELD = "2^255-19";

export const PARTIES = [
  { x: 1, name: "Human", role: "Treasury ops" },
  { x: 2, name: "Policy", role: "Gateway grant" },
  { x: 3, name: "Audit", role: "Compliance" },
] as const;

export type MpcFamilyId = "yao" | "gmw" | "bgw" | "spdz" | "frost";

export interface ShamirShare {
  x: number;
  y: string;
  party: string;
  role: string;
}

export interface ShamirSplit {
  system: "shamir-t2-n3";
  field: typeof MPC_FIELD;
  t: number;
  n: number;
  secret: string;
  shares: ShamirShare[];
}

export interface ReconstructResult {
  ok: boolean;
  secret: string | null;
  reason: string;
  used: number;
}

export interface ConjunctionTranscript {
  system: "beaver-and";
  field: typeof MPC_FIELD;
  dealer: "same-heap";
  human: 0 | 1;
  policy: 0 | 1;
  lie: 0 | 1 | null;
  opened: { d: string; e: string };
  z: string;
  zBit: 0 | 1 | null;
  views: {
    human: { input: 0 | 1; zShare: string };
    policy: { input: 0 | 1; zShare: string };
  };
}

export interface MpcFamily {
  id: MpcFamilyId;
  name: string;
  long: string;
  model: string;
  parties: string;
  rounds: string;
  setup: string;
  malicious: string;
  bag: string;
  inLab: string;
}

export const MPC_FAMILIES: MpcFamily[] = [
  {
    id: "yao",
    name: "Yao GC",
    long: "Garbled circuits (Yao 1986)",
    model: "Boolean circuit. One party garbles, the other evaluates via OT.",
    parties: "2",
    rounds: "Constant (2)",
    setup: "1-out-of-2 OT for the evaluator’s input wires",
    malicious: "Cut-and-choose or authenticated garbling. This lab does not.",
    bag: "Private policy evaluation between agent and Gateway. Still not a signature.",
    inLab: "Not executed. Circuit garbling is a different object from Shamir.",
  },
  {
    id: "gmw",
    name: "GMW",
    long: "Goldreich–Micali–Wigderson",
    model: "Secret-shared wires. XOR is local. AND is interactive OT.",
    parties: "2+",
    rounds: "Depth of the circuit",
    setup: "OT per AND gate (or OT extension)",
    malicious: "GMW compiler. Heavy. Semi-honest is the usual baseline.",
    bag: "Multi-party conjunction of grants. Rounds grow with circuit depth.",
    inLab: "Not executed. Beaver AND is the 2-party multiplication cousin.",
  },
  {
    id: "bgw",
    name: "BGW / Shamir",
    long: "Ben-Or–Goldwasser–Wigderson",
    model: "Polynomial shares. Multiplication via degree reduction.",
    parties: "n ≥ 3",
    rounds: "Depth of the circuit",
    setup: "None for semi-honest. VSS if malicious.",
    malicious: "Honest majority. t < n/3 with VSS. Plain Shamir does not detect a liar.",
    bag: "2-of-3 committee grant. One rogue operator cannot reconstruct. Two can.",
    inLab: "Shamir split / reconstruct / tamper. No VSS, so a forged share is silent.",
  },
  {
    id: "spdz",
    name: "SPDZ / MASCOT",
    long: "SPDℤ with information-theoretic MACs",
    model: "Additive shares plus a MAC key. Detects lying on open.",
    parties: "2+",
    rounds: "Depth + preprocess",
    setup: "Offline triples (MASCOT / TinyOT / dealer)",
    malicious: "Yes, with abort. Dishonest majority. No guaranteed output.",
    bag: "The security model a CISO actually wants. Not this tab’s dealer.",
    inLab: "Not executed. Beaver here has no MAC. A lie about d corrupts z.",
  },
  {
    id: "frost",
    name: "FROST",
    long: "Flexible Round-Optimized Schnorr Threshold",
    model: "Threshold Schnorr. The signing key never exists in one place.",
    parties: "t-of-n",
    rounds: "2 (sign) + DKG",
    setup: "Distributed key generation",
    malicious: "Yes, identifiable abort in the usual instantiations.",
    bag: "The only MPC that would replace localStorage Ed25519. This lab does not run it.",
    inLab: "Refused. Reconstructing a seed and signing is the opposite of FROST.",
  },
];

export const MPC_FAMILY_ROWS: { key: keyof Pick<MpcFamily, "parties" | "rounds" | "setup" | "malicious">; label: string }[] =
  [
    { key: "parties", label: "Parties" },
    { key: "rounds", label: "Rounds" },
    { key: "setup", label: "Setup" },
    { key: "malicious", label: "Malicious" },
  ];

export const MPC_SYSTEMS = [
  {
    name: "This lab · Shamir 2-of-3",
    kind: "BGW",
    bag: "Real polynomial shares over 𝔽_p. Below threshold refuses. A forged share reconstructs garbage with no error.",
  },
  {
    name: "This lab · Beaver AND",
    kind: "2PC",
    bag: "Real multiplication triple. Output is a bit. The dealer is this heap. Semi-honest only.",
  },
  {
    name: "Yao garbled circuits",
    kind: "2PC",
    bag: "Constant rounds. OT for evaluator inputs. Not run here.",
  },
  {
    name: "GMW",
    kind: "MPC",
    bag: "Secret-shared wires. Rounds = depth. Not run here.",
  },
  {
    name: "SPDZ / MASCOT",
    kind: "MAC",
    bag: "Malicious with abort. Dishonest majority. Not run here.",
  },
  {
    name: "FROST threshold Schnorr",
    kind: "Threshold",
    bag: "Would split the Gateway key. Reconstructing a seed is not FROST. Not run here.",
  },
] as const;

function mod(a: bigint): bigint {
  const r = a % MPC_P;
  return r < 0n ? r + MPC_P : r;
}

function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let b = ((base % m) + m) % m;
  let e = exp;
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    e >>= 1n;
    b = (b * b) % m;
  }
  return r;
}

function modInv(a: bigint): bigint {
  const x = mod(a);
  if (x === 0n) throw new Error("ERR_MPC_MALFORMED: inverse of 0");
  return modPow(x, MPC_P - 2n, MPC_P);
}

export function fieldToHex(n: bigint): string {
  return mod(n).toString(16).padStart(64, "0");
}

export function hexToField(s: string): bigint {
  const clean = s.trim().replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean)) throw new Error("ERR_MPC_MALFORMED: non-hex field element");
  const v = BigInt("0x" + clean);
  if (v >= MPC_P) throw new Error("ERR_MPC_MALFORMED: element not in field");
  return v;
}

function randField(): bigint {
  for (;;) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    buf[0] &= 0x7f;
    let n = 0n;
    for (const b of buf) n = (n << 8n) | BigInt(b);
    if (n < MPC_P) return n;
  }
}

export function randomSecret(): string {
  return fieldToHex(randField());
}

export function splitGrant(secretHex?: string): ShamirSplit {
  const secret = secretHex ? hexToField(secretHex) : randField();
  const a1 = randField();
  const shares: ShamirShare[] = PARTIES.map((p) => {
    const x = BigInt(p.x);
    const y = mod(secret + a1 * x);
    return { x: p.x, y: fieldToHex(y), party: p.name, role: p.role };
  });
  return {
    system: "shamir-t2-n3",
    field: MPC_FIELD,
    t: MPC_T,
    n: MPC_N,
    secret: fieldToHex(secret),
    shares,
  };
}

export function reconstructGrant(shares: ShamirShare[], t = MPC_T): ReconstructResult {
  const unique = new Map<number, ShamirShare>();
  for (const s of shares) {
    if (s.x < 1 || s.x > MPC_N) {
      return { ok: false, secret: null, reason: "ERR_MPC_MALFORMED: share index out of range", used: shares.length };
    }
    unique.set(s.x, s);
  }
  const pts = [...unique.values()];
  if (pts.length < t) {
    return {
      ok: false,
      secret: null,
      reason: `ERR_MPC_BELOW_THRESHOLD: ${pts.length} distinct share${pts.length === 1 ? "" : "s"}, need ${t}`,
      used: pts.length,
    };
  }
  const taken = pts.slice(0, t);
  let secret = 0n;
  for (let i = 0; i < taken.length; i++) {
    const xi = BigInt(taken[i]!.x);
    const yi = hexToField(taken[i]!.y);
    let num = 1n;
    let den = 1n;
    for (let j = 0; j < taken.length; j++) {
      if (i === j) continue;
      const xj = BigInt(taken[j]!.x);
      num = mod(num * -xj);
      den = mod(den * (xi - xj));
    }
    secret = mod(secret + yi * num * modInv(den));
  }
  return {
    ok: true,
    secret: fieldToHex(secret),
    reason: `Lagrange at 0 on ${taken.length} points. Integrity is not checked — Shamir without VSS.`,
    used: taken.length,
  };
}

export function tamperShare(share: ShamirShare): ShamirShare {
  return { ...share, y: fieldToHex(randField()) };
}

export function sharesMatchSecret(shares: ShamirShare[], secret: string): boolean {
  const r = reconstructGrant(shares);
  return r.ok && r.secret === secret;
}

export function proveConjunction(
  human: 0 | 1,
  policy: 0 | 1,
  lie: 0 | 1 | null = null,
): ConjunctionTranscript {
  const a = randField();
  const b = randField();
  const c = mod(a * b);
  const a0 = randField();
  const b0 = randField();
  const c0 = randField();
  const a1 = mod(a - a0);
  const b1 = mod(b - b0);
  const c1 = mod(c - c0);

  const x0 = randField();
  const x1 = mod(BigInt(human) - x0);
  const y0 = randField();
  const y1 = mod(BigInt(policy) - y0);

  let d0 = mod(x0 - a0);
  let d1 = mod(x1 - a1);
  const e0 = mod(y0 - b0);
  const e1 = mod(y1 - b1);
  if (lie === 0) d0 = randField();
  if (lie === 1) d1 = randField();

  const d = mod(d0 + d1);
  const e = mod(e0 + e1);
  const z0 = mod(c0 + mod(d * b0) + mod(e * a0) + mod(d * e));
  const z1 = mod(c1 + mod(d * b1) + mod(e * a1));
  const z = mod(z0 + z1);
  const zBit: 0 | 1 | null = z === 0n ? 0 : z === 1n ? 1 : null;

  return {
    system: "beaver-and",
    field: MPC_FIELD,
    dealer: "same-heap",
    human,
    policy,
    lie,
    opened: { d: fieldToHex(d), e: fieldToHex(e) },
    z: fieldToHex(z),
    zBit,
    views: {
      human: { input: human, zShare: fieldToHex(z0) },
      policy: { input: policy, zShare: fieldToHex(z1) },
    },
  };
}

export function conjunctionPublicView(t: ConjunctionTranscript) {
  return {
    system: t.system,
    field: t.field,
    dealer: t.dealer,
    opened: {
      d: t.opened.d.slice(0, 16) + "…",
      e: t.opened.e.slice(0, 16) + "…",
    },
    z: t.zBit === null ? "not-a-bit" : t.zBit,
    lie: t.lie,
    note: "Opened d, e are uniform. They are not the input bits.",
  };
}

export function refuseNetwork(): { valid: false; reason: string } {
  return {
    valid: false,
    reason:
      "ERR_MPC_NO_NETWORK: this tab is one JavaScript heap. It is every party and the dealer. Independent machines, OT, and abort-security are a deployment, not an arithmetic identity.",
  };
}

export function refuseFrost(): { valid: false; reason: string } {
  return {
    valid: false,
    reason:
      "ERR_MPC_NOT_FROST: reconstructing a seed and signing with it reconstitutes the single point of failure. FROST never lets the Ed25519 key exist in one place. This lab does not run DKG or threshold sign.",
  };
}

export function refuseLeaseFromSecret(): { valid: false; reason: string } {
  return {
    valid: false,
    reason:
      "ERR_MPC_NOT_A_LEASE: a field element is not a currently valid, non-replayed, target-bound authorization signed by a trusted Gateway identity. Shares do not mint.",
  };
}

export function kernelAfterCeremony(andBit: 0 | 1 | null): {
  permitted: boolean;
  reason: string;
  andBit: 0 | 1 | null;
} {
  if (andBit !== 1) {
    return {
      permitted: false,
      reason: "ERR_MPC_CONJUNCTION_OFF: ceremony output is not 1. The kernel is not reached.",
      andBit,
    };
  }
  const policy = evaluatePolicy(ENTERPRISE_POLICY, "A3", "treasury.internal.acmebank.com", "confirm_critical_action");
  return {
    permitted: false,
    reason:
      policy.reason ??
      "ERR_APPROVAL_GATE_DENIED: declared human-approval gate has no ceremony in v0.1 — fail closed",
    andBit,
  };
}

export function activeSystem(name: string, lab: "shamir" | "beaver" | "family", family: MpcFamilyId): boolean {
  if (lab === "shamir") return name.includes("Shamir");
  if (lab === "beaver") return name.includes("Beaver");
  if (family === "yao") return name.startsWith("Yao");
  if (family === "gmw") return name === "GMW";
  if (family === "bgw") return name.includes("Shamir");
  if (family === "spdz") return name.startsWith("SPDZ");
  return name.startsWith("FROST");
}
