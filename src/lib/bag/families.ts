export type FamilyId = "stark" | "snark" | "plonk" | "ipa";

export interface ProofFamily {
  id: FamilyId;
  name: string;
  long: string;
  setup: string;
  math: string;
  sizeBytes: number;
  sizeLabel: string;
  wrapBytes: number | null;
  wrapLabel: string | null;
  pq: boolean;
  verify: string;
  prove: string;
  bag: string;
  examples: string;
}

export const FAMILIES: ProofFamily[] = [
  {
    id: "stark",
    name: "STARK",
    long: "Scalable Transparent Argument of Knowledge",
    setup: "None. Public randomness / Fiat–Shamir.",
    math: "Collision-resistant hashes + FRI",
    sizeBytes: 100_000,
    sizeLabel: "~45–200 kB",
    wrapBytes: 200,
    wrapLabel: "~200 B Groth16",
    pq: true,
    verify: "Polylog. Tens of ms off-chain.",
    prove: "Hash-based. Fast on large traces. Heavy RAM. Server.",
    bag: "Keep the STARK if you need PQ. Wrap if the auditor wants 200 bytes — that object is a SNARK.",
    examples: "Stwo, RISC Zero succinct, SP1 STARK, OpenVM SWIRL",
  },
  {
    id: "snark",
    name: "SNARK",
    long: "Succinct Non-interactive Argument of Knowledge",
    setup: "Groth16: per-circuit ceremony. PLONK: universal SRS.",
    math: "Elliptic-curve pairings (BN254 / BLS12)",
    sizeBytes: 200,
    sizeLabel: "~200–800 B",
    wrapBytes: null,
    wrapLabel: null,
    pq: false,
    verify: "Constant. Pairing check. A few ms. Cheap on-chain.",
    prove: "FFT + MSM. Circuit-specific. Browser is a last resort.",
    bag: "Auditor verify is cheap. Ceremony and not-PQ are the cost. Still not the kernel unless the circuit is.",
    examples: "Groth16, circom / snarkjs",
  },
  {
    id: "plonk",
    name: "Plonkish",
    long: "PLONK / Halo2 / UltraHonk",
    setup: "Universal SRS, or none with IPA (Halo2).",
    math: "Polynomial IOP + KZG or IPA",
    sizeBytes: 3_000,
    sizeLabel: "~1–4 kB",
    wrapBytes: null,
    wrapLabel: null,
    pq: false,
    verify: "Small. Recursion-friendly.",
    prove: "Laptop-ok for a small predicate. Phones OOM on some circuits.",
    bag: "Best client-side fit for a small check. Not verifyLease.",
    examples: "Noir UltraHonk, Halo2",
  },
  {
    id: "ipa",
    name: "IPA",
    long: "Inner-product argument (Bulletproofs)",
    setup: "None.",
    math: "Discrete log, Pedersen commitments",
    sizeBytes: 700,
    sizeLabel: "2⌈log₂ n⌉+9 elements",
    wrapBytes: null,
    wrapLabel: null,
    pq: false,
    verify: "Linear in n. This lab: n = 8.",
    prove: "Runs in this tab for an 8-bit range.",
    bag: "Hide a magnitude. Verify is linear. Not a kernel proof.",
    examples: "Bulletproofs 2018 — Range tab",
  },
];

export const FAMILY_ROWS: { key: keyof Pick<ProofFamily, "setup" | "math" | "sizeLabel" | "verify" | "prove" | "pq">; label: string }[] = [
  { key: "setup", label: "Setup" },
  { key: "math", label: "Assumption" },
  { key: "sizeLabel", label: "Proof size" },
  { key: "verify", label: "Verify" },
  { key: "prove", label: "Prove" },
  { key: "pq", label: "Post-quantum" },
];

const LOG_MIN = Math.log10(100);
const LOG_MAX = Math.log10(300_000);

export function sizeBarPct(bytes: number): number {
  const x = (Math.log10(Math.max(bytes, 100)) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return Math.min(100, Math.max(3, Math.round(x * 100)));
}

export function familyView(family: ProofFamily, wrapped: boolean) {
  const wrapping = wrapped && family.wrapBytes !== null;
  return {
    family: family.name,
    wrapped: wrapping,
    receipt: wrapping ? family.wrapLabel : family.sizeLabel,
    bytes: wrapping ? family.wrapBytes : family.sizeBytes,
    pq: wrapping ? false : family.pq,
    setup: wrapping ? "Groth16 ceremony on the wrap circuit. Inner STARK stays transparent." : family.setup,
    math: wrapping ? "Inner: hashes + FRI. Outer: BN254 pairings." : family.math,
    system: wrapping ? "STARK-inside-SNARK" : family.name,
  };
}

export function mintFamily(): { valid: false; reason: string } {
  return {
    valid: false,
    reason:
      "ERR_FAMILY_NO_PROVER: this tab compares proof systems. It does not mint a STARK or a SNARK. A wrap is a different object with different assumptions.",
  };
}
