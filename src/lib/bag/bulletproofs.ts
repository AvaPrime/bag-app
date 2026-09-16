import { sha256Hex } from "./bytes";

/** RFC 3526 2048-bit MODP. Same group as the Sigma lab. Discrete-log, not PQ. */
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

/** Bit length of the range. v ∈ [0, 2^N). Power of two for the IPA fold. */
export const RANGE_N = 8;
export const RANGE_MAX = 1 << RANGE_N;

export interface RangeProof {
  system: "bulletproofs-range";
  group: "RFC3526-2048";
  n: number;
  V: string;
  A: string;
  S: string;
  T1: string;
  T2: string;
  taux: string;
  mu: string;
  tHat: string;
  L: string[];
  R: string[];
  a: string;
  b: string;
}

export interface RangeStatement {
  bound: string;
  proof: RangeProof;
}

export interface RangeOpening {
  value: number;
  gamma: string;
}

export interface RangeVerifyResult {
  valid: boolean;
  reason: string;
  rounds: number;
}

type Gens = {
  g: bigint;
  h: bigint;
  Gv: bigint[];
  Hv: bigint[];
  u: bigint;
};

let cached: Gens | null = null;

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

function smod(x: bigint): bigint {
  x %= Q;
  return x < 0n ? x + Q : x;
}

function hex(n: bigint): string {
  return n.toString(16);
}

function fromHexInt(s: string): bigint {
  const clean = s.trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error("ERR_BP_MALFORMED: non-hex");
  return BigInt("0x" + clean);
}

function invQ(x: bigint): bigint {
  const n = smod(x);
  if (n === 0n) throw new Error("ERR_BP_INV: zero");
  return modPow(n, Q - 2n, Q);
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

function mul(a: bigint, b: bigint): bigint {
  return (a * b) % P;
}

function gpow(base: bigint, exp: bigint): bigint {
  return modPow(base, smod(exp), P);
}

function vecCommit(gens: bigint[], scalars: bigint[]): bigint {
  let acc = 1n;
  for (let i = 0; i < gens.length; i++) acc = mul(acc, gpow(gens[i]!, scalars[i]!));
  return acc;
}

function inner(a: bigint[], b: bigint[]): bigint {
  let s = 0n;
  for (let i = 0; i < a.length; i++) s = smod(s + a[i]! * b[i]!);
  return s;
}

function hadamard(a: bigint[], b: bigint[]): bigint[] {
  return a.map((x, i) => smod(x * b[i]!));
}

function scale(a: bigint[], k: bigint): bigint[] {
  return a.map((x) => smod(x * k));
}

function addv(a: bigint[], b: bigint[]): bigint[] {
  return a.map((x, i) => smod(x + b[i]!));
}

function powers(base: bigint, n: number): bigint[] {
  const out = Array<bigint>(n);
  let acc = 1n;
  for (let i = 0; i < n; i++) {
    out[i] = acc;
    acc = smod(acc * base);
  }
  return out;
}

function ones(n: number): bigint[] {
  return Array.from({ length: n }, () => 1n);
}

function twoN(n: number): bigint[] {
  return powers(2n, n);
}

async function fs(parts: string[]): Promise<bigint> {
  const d = await sha256Hex(parts.join("|"));
  const e = fromHexInt(d) % Q;
  return e === 0n ? 1n : e;
}

async function hashToGroup(label: string): Promise<bigint> {
  const d = await sha256Hex(label);
  let x = gpow(2n, fromHexInt(d));
  x = mul(x, x);
  return x <= 1n ? gpow(G, 7n) : x;
}

async function generators(): Promise<Gens> {
  if (cached) return cached;
  const g = G;
  const h = await hashToGroup("bag.bp.h");
  const u = await hashToGroup("bag.bp.u");
  const Gv: bigint[] = [];
  const Hv: bigint[] = [];
  for (let i = 0; i < RANGE_N; i++) {
    Gv.push(await hashToGroup(`bag.bp.G.${i}`));
    Hv.push(await hashToGroup(`bag.bp.H.${i}`));
  }
  cached = { g, h, Gv, Hv, u };
  return cached;
}

function split<T>(xs: T[]): [T[], T[]] {
  const m = xs.length / 2;
  return [xs.slice(0, m), xs.slice(m)];
}

async function ipaProve(
  g: bigint[],
  h: bigint[],
  u: bigint,
  a: bigint[],
  b: bigint[],
  seed: string[],
): Promise<{ L: bigint[]; R: bigint[]; a: bigint; b: bigint; xs: bigint[] }> {
  const L: bigint[] = [];
  const R: bigint[] = [];
  const xs: bigint[] = [];
  let gv = g.slice();
  let hv = h.slice();
  let av = a.slice();
  let bv = b.slice();
  while (av.length > 1) {
    const [gL, gR] = split(gv);
    const [hL, hR] = split(hv);
    const [aL, aR] = split(av);
    const [bL, bR] = split(bv);
    const cL = inner(aL, bR);
    const cR = inner(aR, bL);
    const Li = mul(mul(vecCommit(gR, aL), vecCommit(hL, bR)), gpow(u, cL));
    const Ri = mul(mul(vecCommit(gL, aR), vecCommit(hR, bL)), gpow(u, cR));
    L.push(Li);
    R.push(Ri);
    const x = await fs([...seed, "ipa", hex(Li), hex(Ri), String(L.length)]);
    xs.push(x);
    const xinv = invQ(x);
    av = addv(scale(aL, x), scale(aR, xinv));
    bv = addv(scale(bL, xinv), scale(bR, x));
    gv = gL.map((gi, i) => mul(gpow(gi, xinv), gpow(gR[i]!, x)));
    hv = hL.map((hi, i) => mul(gpow(hi, x), gpow(hR[i]!, xinv)));
  }
  return { L, R, a: av[0]!, b: bv[0]!, xs };
}

async function ipaVerify(
  g: bigint[],
  h: bigint[],
  u: bigint,
  Pcom: bigint,
  proof: { L: bigint[]; R: bigint[]; a: bigint; b: bigint },
  seed: string[],
): Promise<boolean> {
  const rounds = proof.L.length;
  if (proof.R.length !== rounds || 1 << rounds !== g.length) return false;
  const xs: bigint[] = [];
  for (let i = 0; i < rounds; i++) {
    xs.push(await fs([...seed, "ipa", hex(proof.L[i]!), hex(proof.R[i]!), String(i + 1)]));
  }
  const s = Array<bigint>(g.length).fill(1n);
  for (let i = 0; i < g.length; i++) {
    let acc = 1n;
    for (let j = 0; j < rounds; j++) {
      const bit = (i >> (rounds - 1 - j)) & 1;
      acc = smod(acc * (bit ? xs[j]! : invQ(xs[j]!)));
    }
    s[i] = acc;
  }
  const gP = vecCommit(g, s);
  const hP = vecCommit(h, s.map((si) => invQ(si)));
  let P = Pcom;
  for (let i = 0; i < rounds; i++) {
    const x2 = smod(xs[i]! * xs[i]!);
    P = mul(mul(P, gpow(proof.L[i]!, x2)), gpow(proof.R[i]!, invQ(x2)));
  }
  const rhs = mul(mul(gpow(gP, proof.a), gpow(hP, proof.b)), gpow(u, smod(proof.a * proof.b)));
  return P === rhs;
}

function bitsOf(v: number, n: number): bigint[] {
  const a = Array<bigint>(n);
  for (let i = 0; i < n; i++) a[i] = BigInt((v >> i) & 1);
  return a;
}

export async function proveRange(
  value: number,
  bound: string,
): Promise<{ statement: RangeStatement; opening: RangeOpening }> {
  if (!Number.isInteger(value) || value < 0 || value >= RANGE_MAX) {
    throw new Error(`ERR_BP_RANGE: value must be in [0, ${RANGE_MAX})`);
  }
  const n = RANGE_N;
  const gens = await generators();
  const gamma = randScalar();
  const V = mul(gpow(gens.g, BigInt(value)), gpow(gens.h, gamma));
  const aL = bitsOf(value, n);
  const aR = aL.map((bit) => smod(bit - 1n));
  const alpha = randScalar();
  const A = mul(mul(vecCommit(gens.Gv, aL), vecCommit(gens.Hv, aR)), gpow(gens.h, alpha));
  const sL = Array.from({ length: n }, () => randScalar());
  const sR = Array.from({ length: n }, () => randScalar());
  const rho = randScalar();
  const S = mul(mul(vecCommit(gens.Gv, sL), vecCommit(gens.Hv, sR)), gpow(gens.h, rho));

  const y = await fs(["bag.bp.v1", bound, hex(V), hex(A), hex(S), "y"]);
  const z = await fs(["bag.bp.v1", bound, hex(V), hex(A), hex(S), "z", hex(y)]);
  const yn = powers(y, n);
  const twos = twoN(n);
  const z1 = ones(n).map(() => z);
  const t2 = inner(sL, hadamard(yn, sR));
  const l0 = addv(aL, scale(z1, -1n));
  const r0 = addv(hadamard(yn, addv(aR, z1)), scale(twos, smod(z * z)));
  const t0 = inner(l0, r0);
  const t1 = smod(inner(l0, hadamard(yn, sR)) + inner(sL, r0));
  const tau1 = randScalar();
  const tau2 = randScalar();
  const T1 = mul(gpow(gens.g, t1), gpow(gens.h, tau1));
  const T2 = mul(gpow(gens.g, t2), gpow(gens.h, tau2));
  const x = await fs(["bag.bp.v1", bound, hex(V), hex(A), hex(S), hex(T1), hex(T2), "x"]);

  const l = addv(l0, scale(sL, x));
  const r = addv(r0, hadamard(yn, scale(sR, x)));
  const tHat = inner(l, r);
  const expectedT = smod(t0 + t1 * x + t2 * x * x);
  if (tHat !== expectedT) throw new Error("ERR_BP_INTERNAL: t(x) mismatch");
  const taux = smod(tau2 * x * x + tau1 * x + z * z * gamma);
  const mu = smod(alpha + rho * x);

  const yinv = invQ(y);
  const yinvn = powers(yinv, n);
  const hprime = gens.Hv.map((hi, i) => gpow(hi, yinvn[i]!));
  const ipaSeed = ["bag.bp.v1", bound, hex(V), hex(A), hex(S), hex(T1), hex(T2), hex(x)];
  const ipa = await ipaProve(gens.Gv, hprime, gens.u, l, r, ipaSeed);

  return {
    statement: {
      bound,
      proof: {
        system: "bulletproofs-range",
        group: "RFC3526-2048",
        n,
        V: hex(V),
        A: hex(A),
        S: hex(S),
        T1: hex(T1),
        T2: hex(T2),
        taux: hex(taux),
        mu: hex(mu),
        tHat: hex(tHat),
        L: ipa.L.map(hex),
        R: ipa.R.map(hex),
        a: hex(ipa.a),
        b: hex(ipa.b),
      },
    },
    opening: { value, gamma: hex(gamma) },
  };
}

export async function verifyRange(statement: RangeStatement): Promise<RangeVerifyResult> {
  try {
    const { proof, bound } = statement;
    if (proof.system !== "bulletproofs-range" || proof.n !== RANGE_N) {
      return { valid: false, reason: "ERR_BP_UNKNOWN_SYSTEM", rounds: 0 };
    }
    const rounds = Math.log2(RANGE_N);
    const gens = await generators();
    const V = fromHexInt(proof.V);
    const A = fromHexInt(proof.A);
    const S = fromHexInt(proof.S);
    const T1 = fromHexInt(proof.T1);
    const T2 = fromHexInt(proof.T2);
    const taux = fromHexInt(proof.taux);
    const mu = fromHexInt(proof.mu);
    const tHat = fromHexInt(proof.tHat);
    const y = await fs(["bag.bp.v1", bound, hex(V), hex(A), hex(S), "y"]);
    const z = await fs(["bag.bp.v1", bound, hex(V), hex(A), hex(S), "z", hex(y)]);
    const x = await fs(["bag.bp.v1", bound, hex(V), hex(A), hex(S), hex(T1), hex(T2), "x"]);
    const yn = powers(y, RANGE_N);
    const sumY = yn.reduce((a, b) => smod(a + b), 0n);
    const sum2 = twoN(RANGE_N).reduce((a, b) => smod(a + b), 0n);
    const delta = smod((z - z * z) * sumY - z * z * z * sum2);
    const lhs = mul(gpow(gens.g, tHat), gpow(gens.h, taux));
    const rhs = mul(mul(mul(gpow(V, smod(z * z)), gpow(gens.g, delta)), gpow(T1, x)), gpow(T2, smod(x * x)));
    if (lhs !== rhs) {
      return { valid: false, reason: "ERR_BP_T_POLY: t̂ does not match V^{z²} g^δ T1^x T2^{x²}", rounds };
    }

    const yinvn = powers(invQ(y), RANGE_N);
    const hprime = gens.Hv.map((hi, i) => gpow(hi, yinvn[i]!));
    const z1 = scale(ones(RANGE_N), z);
    const P1 = mul(A, gpow(S, x));
    const P2 = vecCommit(gens.Gv, scale(z1, -1n));
    const P3 = vecCommit(gens.Hv, z1);
    const P4 = vecCommit(hprime, scale(twoN(RANGE_N), smod(z * z)));
    const Pcommit = mul(mul(mul(P1, P2), P3), P4);
    const Pipa = mul(mul(Pcommit, gpow(gens.h, smod(-mu))), gpow(gens.u, tHat));
    const ipaSeed = ["bag.bp.v1", bound, hex(V), hex(A), hex(S), hex(T1), hex(T2), hex(x)];
    const ok = await ipaVerify(
      gens.Gv,
      hprime,
      gens.u,
      Pipa,
      {
        L: proof.L.map(fromHexInt),
        R: proof.R.map(fromHexInt),
        a: fromHexInt(proof.a),
        b: fromHexInt(proof.b),
      },
      ipaSeed,
    );
    if (!ok) return { valid: false, reason: "ERR_BP_IPA: inner-product fold did not close", rounds };
    return {
      valid: true,
      reason: `Committed value is in [0, ${RANGE_MAX}). ${rounds} IPA rounds. The integer itself is not in the proof.`,
      rounds,
    };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "ERR_BP_VERIFY", rounds: 0 };
  }
}

export async function forgeRange(bound: string): Promise<RangeStatement> {
  const gens = await generators();
  const dummy = mul(gpow(gens.g, randScalar()), gpow(gens.h, randScalar()));
  const zeros = Array.from({ length: Math.log2(RANGE_N) }, () => hex(dummy));
  return {
    bound,
    proof: {
      system: "bulletproofs-range",
      group: "RFC3526-2048",
      n: RANGE_N,
      V: hex(dummy),
      A: hex(dummy),
      S: hex(dummy),
      T1: hex(dummy),
      T2: hex(dummy),
      taux: hex(randScalar()),
      mu: hex(randScalar()),
      tHat: hex(randScalar()),
      L: zeros,
      R: zeros,
      a: hex(randScalar()),
      b: hex(randScalar()),
    },
  };
}

export async function openRange(
  opening: RangeOpening,
  Vhex: string,
): Promise<{ ok: boolean; detail: string }> {
  const gens = await generators();
  const V = fromHexInt(Vhex);
  const expect = mul(gpow(gens.g, BigInt(opening.value)), gpow(gens.h, fromHexInt(opening.gamma)));
  if (expect !== V) return { ok: false, detail: "Opening does not match V." };
  return {
    ok: true,
    detail: `Witness opens to ${opening.value}. The verifier received only V and a ${Math.log2(RANGE_N)}-round IPA.`,
  };
}

export function proofBytes(proof: RangeProof): number {
  const groups = 5 + proof.L.length + proof.R.length;
  const scalars = 5;
  return Math.ceil((groups * 2048 + scalars * 256) / 8);
}
