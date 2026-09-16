import type { GuestRun } from "./guest";

export type ZkStackId = "risc0" | "sp1" | "openvm" | "guest";

export interface ZkPipelineStage {
  id: string;
  title: string;
  circuit: string;
  out: string;
  pq: boolean | null;
}

export interface ZkStack {
  id: ZkStackId;
  name: string;
  kind: "zkVM" | "Guest";
  isa: string;
  proofs: string;
  recursion: string;
  wrap: string;
  succinct: string;
  wrapped: string;
  security: string;
  setup: string;
  image: string;
  browser: string;
  bag: string;
  size: string;
  pipeline: ZkPipelineStage[];
}

export const ZKVM_STACKS: ZkStack[] = [
  {
    id: "risc0",
    name: "RISC Zero 3.0",
    kind: "zkVM",
    isa: "RISC-V ELF",
    proofs: "DEEP-ALI + FRI STARKs",
    recursion: "lift · join · resolve · identity_p254",
    wrap: "Optional Groth16 on BN254",
    succinct: "~200 kB SuccinctReceipt",
    wrapped: "~200 B Groth16Receipt — not PQ",
    security: "96-bit RISC-V / 99-bit recursion (PQ until wrap)",
    setup: "Transparent STARKs. Groth16 ceremony only if compressed.",
    image: "ImageID = Merkle snapshot of the memory image",
    browser: "No. GPU / Bonsai. Server-side.",
    bag: "Small guest: Ed25519 is the cost. Keep the succinct receipt if you need PQ.",
    size: "~200 kB or ~200 B wrap",
    pipeline: [
      { id: "execute", title: "Execute", circuit: "Guest ELF", out: "Segments + journal", pq: true },
      { id: "segment", title: "Segment STARKs", circuit: "RISC-V Circuit", out: "SegmentReceipt[]", pq: true },
      { id: "lift", title: "Lift", circuit: "Recursion Circuit", out: "SuccinctReceipt / segment", pq: true },
      { id: "join", title: "Join tree", circuit: "Recursion Circuit", out: "one SuccinctReceipt ~200 kB", pq: true },
      { id: "compress", title: "Compress", circuit: "Groth16 R1CS", out: "Groth16Receipt ~200 B", pq: false },
    ],
  },
  {
    id: "sp1",
    name: "SP1 Hypercube",
    kind: "zkVM",
    isa: "RISC-V ELF",
    proofs: "Plonky3 STARKs",
    recursion: "Recursive STARKs",
    wrap: "Optional Groth16 or PLONK",
    succinct: "Compressed STARK",
    wrapped: "EVM-verify wrap — not PQ if Groth16",
    security: "STARK until wrap. Precompiles for SHA-256 / k256.",
    setup: "Transparent STARKs. Wrap may add a ceremony.",
    image: "Program vkey / ELF hash",
    browser: "No. GPU cluster. Server-side.",
    bag: "Scales better as the guest grows. verifyLease is small — base cost matters more than ETH-block p99.",
    size: "STARK or ~1 kB wrap",
    pipeline: [
      { id: "execute", title: "Execute", circuit: "Guest ELF", out: "Trace + public values", pq: true },
      { id: "stark", title: "STARK prove", circuit: "Plonky3", out: "Compressed STARK", pq: true },
      { id: "recurse", title: "Recurse", circuit: "Plonky3", out: "Aggregated STARK", pq: true },
      { id: "wrap", title: "Wrap", circuit: "Groth16 / PLONK", out: "EVM-size proof", pq: false },
    ],
  },
  {
    id: "openvm",
    name: "OpenVM 2.0 · SWIRL",
    kind: "zkVM",
    isa: "RV32IM",
    proofs: "SWIRL (WHIR PCS)",
    recursion: "SWIRL recursion, AOT compiler",
    wrap: "Not required for size",
    succinct: "<300 kB, 100-bit, PQ",
    wrapped: "No Groth16 step in the default path",
    security: "100-bit conjectured. RV32IM Lean-checked.",
    setup: "None. Post-quantum if you do not wrap.",
    image: "Program verification key",
    browser: "No. 5090-class GPU. Server-side.",
    bag: "The stack that stays PQ at an emailable size. Guest of verifyLease does not need a pairing wrap.",
    size: "<300 kB PQ",
    pipeline: [
      { id: "execute", title: "Execute", circuit: "RV32IM guest", out: "Trace + public values", pq: true },
      { id: "prove", title: "SWIRL prove", circuit: "WHIR PCS", out: "Receipt <300 kB", pq: true },
    ],
  },
  {
    id: "guest",
    name: "This lab · guest trace",
    kind: "Guest",
    isa: "TypeScript / Web Crypto",
    proofs: "None",
    recursion: "—",
    wrap: "ERR_GUEST_NO_PROVER",
    succinct: "Journal JSON",
    wrapped: "No receipt",
    security: "Ed25519 on the lease, not on the guest",
    setup: "None",
    image: "SHA-256 of the frozen step list",
    browser: "Yes. This tab.",
    bag: "Same checks as the kernel. A journal is not a receipt.",
    size: "No receipt",
    pipeline: [{ id: "execute", title: "Execute", circuit: "JS guest", out: "Journal only", pq: null }],
  },
];

export const ARCH_ROWS: { key: keyof Pick<ZkStack, "isa" | "proofs" | "recursion" | "succinct" | "wrap" | "security" | "image" | "browser">; label: string }[] = [
  { key: "isa", label: "Guest ISA" },
  { key: "proofs", label: "Proof system" },
  { key: "recursion", label: "Recursion" },
  { key: "succinct", label: "Default receipt" },
  { key: "wrap", label: "Wrap" },
  { key: "security", label: "Soundness" },
  { key: "image", label: "Program bind" },
  { key: "browser", label: "This browser" },
];

export type StageStatus = "idle" | "ran" | "would" | "refused";

export function pipelineStatus(stack: ZkStack, ran: boolean, wrapRefused: boolean): { stage: ZkPipelineStage; status: StageStatus }[] {
  return stack.pipeline.map((stage) => {
    if (!ran) return { stage, status: "idle" as const };
    if (stage.id === "execute") return { stage, status: "ran" as const };
    if (wrapRefused && (stage.id === "compress" || stage.id === "wrap")) {
      return { stage, status: "refused" as const };
    }
    return { stage, status: "would" as const };
  });
}

export function wrapForStack(stack: ZkStack, run: GuestRun): { valid: false; reason: string } {
  if (stack.id === "guest") {
    return {
      valid: false,
      reason:
        `ERR_GUEST_NO_PROVER: guest ${run.journal.guest} ran in JavaScript. ` +
        `ImageID ${run.journal.imageId}. A journal is not a receipt.`,
    };
  }
  const next = stack.pipeline.find((s) => s.id !== "execute");
  return {
    valid: false,
    reason:
      `ERR_GUEST_NO_PROVER: execute ran. ${stack.name} would continue at ${next?.title ?? "prove"} ` +
      `(${next?.circuit ?? stack.proofs}). Default receipt ${stack.succinct}. ` +
      `Wrap is ${stack.wrap}. None of that is in this process.`,
  };
}
