import { sha256Hex } from "./bytes";
import { checkPreDispatch, bootstrapIdentity, mintLease, verifyLease } from "./doctrine";
import type { ExecutionLease, Geometry, TargetSnapshot } from "./types";
import { ENTERPRISE_POLICY } from "./types";

export const GUEST_NAME = "bag.guest.verifyLease.v1";

export const GUEST_STEPS = [
  { id: "G0", title: "Embedded key", maps: "ERR_LEASE_EMBEDDED_KEY_REJECTED" },
  { id: "G1", title: "Malformed fields", maps: "ERR_MALFORMED_LEASE" },
  { id: "G2", title: "Trusted kid", maps: "ERR_LEASE_UNTRUSTED_KID" },
  { id: "G3", title: "Ed25519 verify", maps: "ERR_LEASE_SIGNATURE_INVALID" },
  { id: "G10", title: "Live grant", maps: "ERR_LEASE_POLICY_DRIFT" },
  { id: "G4", title: "TTL window", maps: "ERR_LEASE_EXPIRED" },
  { id: "G5", title: "Target bind", maps: "ERR_LEASE_TARGET_MISMATCH" },
  { id: "G6", title: "Nonce unused", maps: "ERR_LEASE_NONCE_REPLAYED" },
  { id: "G7", title: "Geometry ≤ 5px", maps: "ERR_TARGET_GEOMETRY_INVALIDATED" },
  { id: "G8", title: "DOM identity", maps: "ERR_DOM_HASH_MUTATED" },
  { id: "G9", title: "Occlusion", maps: "ERR_TARGET_OCCLUDED" },
] as const;

export type GuestStepId = (typeof GUEST_STEPS)[number]["id"];

export const GUEST_SCENARIOS = [
  { id: "permit", label: "Permit" },
  { id: "drift", label: "Drift 25px" },
  { id: "expired", label: "Expired" },
  { id: "tamper", label: "Bad signature" },
  { id: "embedded", label: "Embedded key" },
  { id: "replay", label: "Replay" },
  { id: "occluded", label: "Occluded" },
  { id: "mutated", label: "DOM mutated" },
] as const;

export type GuestScenarioId = (typeof GUEST_SCENARIOS)[number]["id"];

export interface GuestStepResult {
  id: GuestStepId;
  title: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

export interface GuestJournal {
  system: "guest-trace";
  guest: typeof GUEST_NAME;
  imageId: string;
  ok: boolean;
  halt: GuestStepId | "COMMIT";
  reasonClass: string;
  kid: string;
  leaseId: string;
  dispatched: false;
  stepsRun: number;
}

export interface GuestWitness {
  nonce: string;
  signature: string;
  driftPx: number;
  liveDomHash: string;
  occluded: boolean;
}

export interface GuestRun {
  journal: GuestJournal;
  witness: GuestWitness;
  steps: GuestStepResult[];
  imageSrc: string;
}

const SNAPSHOT: TargetSnapshot = {
  tagName: "button",
  id: "approve-wire",
  domHash: "button:approve-wire:160x40",
  geometry: { x: 48, y: 120, width: 160, height: 40 },
};

const TAB = 1;
const INDEX = 2;

const IMAGE_SRC = `${GUEST_NAME}|${GUEST_STEPS.map((s) => `${s.id}:${s.title}`).join("|")}`;

export async function guestImageId(fork = 0): Promise<string> {
  const digest = await sha256Hex(`${IMAGE_SRC}|fork=${fork}`);
  return digest.slice(0, 16);
}

function classifyReason(reason: string | undefined): { step: GuestStepId; cls: string } | null {
  if (!reason) return null;
  for (const step of GUEST_STEPS) {
    if (reason.startsWith(step.maps)) return { step: step.id, cls: step.maps };
  }
  return { step: "G1", cls: "ERR_GUEST_UNMAPPED" };
}

function reasonClassOf(halt: GuestStepId | "COMMIT", detail: string): string {
  if (halt === "COMMIT") return "OK";
  const mapped = GUEST_STEPS.find((s) => s.id === halt);
  return mapped?.maps ?? detail.split(":")[0] ?? "ERR";
}

export async function runGuest(scenario: GuestScenarioId, fork = 0): Promise<GuestRun> {
  await bootstrapIdentity();
  const ttlMs = scenario === "expired" ? 0 : 30_000;
  let lease: ExecutionLease = await mintLease({
    agentId: ENTERPRISE_POLICY.principalId,
    tabId: TAB,
    frameId: 0,
    targetIndex: INDEX,
    snapshot: SNAPSHOT,
    tier: "A2",
    ttlMs,
  });
  if (scenario === "expired") {
    await new Promise((r) => setTimeout(r, 8));
  }
  if (scenario === "tamper") {
    const last = lease.signature.slice(-1);
    lease = { ...lease, signature: lease.signature.slice(0, -1) + (last === "0" ? "1" : "0") };
  }
  if (scenario === "embedded") {
    lease = { ...lease, publicKey: "spki-inline-rejected" };
  }

  const liveGeom: Geometry = {
    ...SNAPSHOT.geometry,
    y: SNAPSHOT.geometry.y + (scenario === "drift" ? 25 : 0),
  };
  const live = {
    geometry: liveGeom,
    domHash: scenario === "mutated" ? "button:approve-wire-mutated:160x40" : SNAPSHOT.domHash,
    isOccluded: scenario === "occluded",
  };
  const driftPx = Math.max(
    Math.abs(liveGeom.x - SNAPSHOT.geometry.x),
    Math.abs(liveGeom.y - SNAPSHOT.geometry.y),
  );

  const imageId = await guestImageId(fork);
  let haltId: GuestStepId | null = null;
  let haltDetail = "all checks closed";

  const leaseResult = await verifyLease(lease, { tabId: TAB, targetIndex: INDEX }, { consumeNonce: false });
  if (!leaseResult.valid) {
    haltId = classifyReason(leaseResult.reason)?.step ?? "G1";
    haltDetail = leaseResult.reason ?? "lease invalid";
  } else if (scenario === "replay") {
    haltId = "G6";
    haltDetail = "ERR_LEASE_NONCE_REPLAYED: guest-local — the kernel nonce store was not touched";
  } else {
    const pre = checkPreDispatch(lease.targetSnapshot, live);
    if (!pre.ok) {
      haltId = classifyReason(pre.reason)?.step ?? "G7";
      haltDetail = pre.reason;
    }
  }

  const halted: GuestStepId | "COMMIT" = haltId ?? "COMMIT";
  let seenFail = false;
  const steps: GuestStepResult[] = GUEST_STEPS.map((spec) => {
    if (haltId && spec.id === haltId) {
      seenFail = true;
      return { id: spec.id, title: spec.title, status: "fail" as const, detail: haltDetail };
    }
    if (seenFail) return { id: spec.id, title: spec.title, status: "skip" as const, detail: "not reached" };
    return { id: spec.id, title: spec.title, status: "pass" as const, detail: "ok" };
  });

  const ok = halted === "COMMIT";
  const journal: GuestJournal = {
    system: "guest-trace",
    guest: GUEST_NAME,
    imageId,
    ok,
    halt: halted,
    reasonClass: reasonClassOf(halted, haltDetail),
    kid: lease.kid,
    leaseId: lease.leaseId,
    dispatched: false,
    stepsRun: steps.filter((s) => s.status !== "skip").length,
  };

  return {
    journal,
    witness: {
      nonce: lease.nonce,
      signature: lease.signature.slice(0, 24) + "…",
      driftPx,
      liveDomHash: live.domHash,
      occluded: live.isOccluded,
    },
    steps,
    imageSrc: IMAGE_SRC,
  };
}

export function wrapReceipt(run: GuestRun): { valid: false; reason: string } {
  return {
    valid: false,
    reason:
      `ERR_GUEST_NO_PROVER: guest ${run.journal.guest} ran in JavaScript. ` +
      `ImageID ${run.journal.imageId}. SP1, RISC Zero, and OpenVM 2.0 proving are server-side. ` +
      `A journal is not a receipt.`,
  };
}

export function forkNote(from: string, to: string): string {
  return `ImageID ${from} → ${to}. A receipt is bound to the guest ELF. Fork the program and old receipts do not verify.`;
}
