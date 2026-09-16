import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBag } from "@/lib/bag/store";
import {
  ZK_REASONS,
  ZK_SYSTEMS,
  classifyEvidence,
  forgeMembership,
  openCommitment,
  proveMembership,
  verifyMembership,
  type ZkOpening,
  type ZkReason,
  type ZkStatement,
  type ZkVerifyResult,
} from "@/lib/bag/zk";
import {
  RANGE_MAX,
  RANGE_N,
  forgeRange,
  openRange,
  proveRange,
  proofBytes,
  verifyRange,
  type RangeOpening,
  type RangeProof,
  type RangeStatement,
  type RangeVerifyResult,
} from "@/lib/bag/bulletproofs";
import {
  GUEST_SCENARIOS,
  forkNote,
  guestImageId,
  runGuest,
  type GuestRun,
  type GuestScenarioId,
} from "@/lib/bag/guest";
import {
  ARCH_ROWS,
  ZKVM_STACKS,
  pipelineStatus,
  wrapForStack,
  type ZkStackId,
} from "@/lib/bag/zkvms";
import {
  FAMILIES,
  FAMILY_ROWS,
  familyView,
  mintFamily,
  sizeBarPct,
  type FamilyId,
} from "@/lib/bag/families";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/zk")({ component: ZkPage });

const POLICY_FLOOR = 5;

const CLAIMS = [
  {
    claim: "Key holder signed this",
    ed: "Yes",
    sigma: "No",
    bp: "No",
    zkvm: "Only if the guest checks the signature",
    family: "No",
  },
  {
    claim: "Dispatch did not fire",
    ed: "Field in the JSON",
    sigma: "Public input",
    bp: "Not in this proof",
    zkvm: "Public output",
    family: "Not in this comparison",
  },
  {
    claim: "Which refusal / how many px",
    ed: "Revealed",
    sigma: "Hidden until opened",
    bp: "Hidden until V opened",
    zkvm: "Hidden",
    family: "Hidden only if the circuit hides it",
  },
  {
    claim: "The kernel actually ran",
    ed: "No — the signer can lie",
    sigma: "No",
    bp: "No",
    zkvm: "Yes, if the guest is the kernel",
    family: "No — a family is not a guest",
  },
];

const RANGE_PRESETS = [0, 5, 25, 100, 255];

type Lab = "sigma" | "bulletproofs" | "guest" | "family";

function activeSystem(name: string, kind: string, lab: Lab, stack: ZkStackId, family: FamilyId, wrapped: boolean): boolean {
  if (lab === "bulletproofs") return kind === "IPA";
  if (lab === "sigma") return kind === "Sigma";
  if (lab === "family") {
    if (family === "stark") return kind === "STARK" || (wrapped && kind === "SNARK") || kind === "zkVM";
    if (family === "snark") return kind === "SNARK";
    if (family === "plonk") return kind === "Plonkish";
    return kind === "IPA";
  }
  if (stack === "risc0") return name.startsWith("RISC Zero");
  if (stack === "sp1") return name.startsWith("SP1");
  if (stack === "openvm") return name.startsWith("OpenVM");
  return kind === "Guest";
}

function ZkPage() {
  const [lab, setLab] = useState<Lab>("family");
  const [stack, setStack] = useState<ZkStackId>("risc0");
  const [family, setFamily] = useState<FamilyId>("stark");
  const [wrapped, setWrapped] = useState(false);
  const labCol = lab === "guest" ? "zkvm" : lab === "bulletproofs" ? "bp" : lab === "family" ? "family" : "sigma";

  return (
    <main className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Selective disclosure lab</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
          Zero-knowledge is not attestation.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
          {lab === "family"
            ? "A STARK is transparent and hash-based. A SNARK is pairing-based and tiny. Wrap a STARK in Groth16 and the object the auditor verifies is a SNARK — size of one, assumptions of one."
            : lab === "guest"
              ? "RISC Zero is three circuits: a RISC-V STARK, a recursion STARK, and an optional Groth16 wrap. This lab executes the guest. It does not prove a segment."
              : lab === "bulletproofs"
                ? "Bulletproofs prove a committed integer sits in [0, 2ⁿ) without a trusted setup. Proof size is logarithmic. Verification is linear. The Gateway can still lie about the integer."
                : "A Schnorr OR hides which refusal fired. It cannot prove the Gateway told the truth unless the circuit is the kernel."}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLab("family")}
            className={cn(
              "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
              lab === "family" ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            STARK · SNARK
          </button>
          <button
            type="button"
            onClick={() => setLab("guest")}
            className={cn(
              "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
              lab === "guest" ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            Kernel · zkVM guest
          </button>
          <button
            type="button"
            onClick={() => setLab("bulletproofs")}
            className={cn(
              "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
              lab === "bulletproofs" ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            Range · Bulletproofs
          </button>
          <button
            type="button"
            onClick={() => setLab("sigma")}
            className={cn(
              "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
              lab === "sigma" ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            Membership · Sigma OR
          </button>
        </div>

        {lab === "family" ? (
          <FamilyLab family={family} wrapped={wrapped} onFamily={setFamily} onWrapped={setWrapped} />
        ) : lab === "guest" ? (
          <GuestLab stack={stack} onStack={setStack} />
        ) : lab === "bulletproofs" ? (
          <RangeLab />
        ) : (
          <SigmaLab />
        )}

        <section className="mt-10 min-w-0">
          <h2 className="text-lg font-medium tracking-tight">What each system would actually buy</h2>
          <div className="mt-4 hidden overflow-x-auto rounded-lg shadow-[var(--shadow-border)] sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-elevated font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">
                <tr>
                  <th className="px-4 py-3">Claim</th>
                  <th className="px-4 py-3">Ed25519 record</th>
                  <th className="px-4 py-3">This lab</th>
                  <th className="px-4 py-3">zkVM of the kernel</th>
                </tr>
              </thead>
              <tbody>
                {CLAIMS.map((row) => (
                  <tr key={row.claim} className="border-t border-line">
                    <td className="px-4 py-3 text-fg">{row.claim}</td>
                    <td className="px-4 py-3 text-muted">{row.ed}</td>
                    <td className="px-4 py-3 text-muted">{row[labCol]}</td>
                    <td className="px-4 py-3 text-muted">{row.zkvm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ol className="mt-4 space-y-3 sm:hidden">
            {CLAIMS.map((row) => (
              <li key={row.claim} className="rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]">
                <p className="text-sm font-medium">{row.claim}</p>
                <dl className="mt-2 space-y-1 font-mono text-[11px] text-muted">
                  <div>Ed25519 · {row.ed}</div>
                  <div>Lab · {row[labCol]}</div>
                  <div>zkVM · {row.zkvm}</div>
                </dl>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        {lab === "family" ? (
          <FamilyAside familyId={family} wrapped={wrapped} />
        ) : lab === "guest" ? (
          <GuestAside stackId={stack} />
        ) : lab === "bulletproofs" ? (
          <RangeAsideBody />
        ) : (
          <SigmaAsideHint />
        )}
        <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">Implementations</p>
          <ol className="mt-3 space-y-3">
            {ZK_SYSTEMS.map((sys) => (
              <li key={sys.name}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{sys.name}</p>
                  <Badge
                    tone={
                      activeSystem(sys.name, sys.kind, lab, stack, family, wrapped) ? "ok" : "neutral"
                    }
                  >
                    {sys.kind}
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-[11px] text-faint">
                  setup {sys.setup} · proof {sys.size}
                </p>
                <p className="mt-1 text-sm text-muted">{sys.bag}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)] sm:p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">Say / never</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {lab === "family" ? (
              <>
                <li>
                  <span className="text-verified">Say.</span> STARK: hashes + FRI, no setup, PQ, tens of kB. SNARK: pairings, ceremony, ~200 B, not PQ.
                </li>
                <li>
                  <span className="text-refused">Never.</span> A wrap is still a STARK. Groth16 wrap is PQ. This tab minted either.
                </li>
              </>
            ) : lab === "guest" ? (
              <>
                <li>
                  <span className="text-verified">Say.</span> RISC Zero: RISC-V circuit, recursion circuit, optional Groth16. ImageID is a Merkle snapshot. Succinct receipt is PQ.
                </li>
                <li>
                  <span className="text-refused">Never.</span> A receipt from this tab. Groth16 wrap is PQ. Proof a native click fired.
                </li>
              </>
            ) : lab === "bulletproofs" ? (
              <>
                <li>
                  <span className="text-verified">Say.</span> Bulletproofs range proof, inner-product argument, no
                  setup. 2⌈log₂ n⌉+9 elements.
                </li>
                <li>
                  <span className="text-refused">Never.</span> Constant-time verify. Post-quantum. Proof the drift
                  actually happened in Chrome.
                </li>
              </>
            ) : (
              <>
                <li>
                  <span className="text-verified">Say.</span> Honest-verifier Schnorr OR over RFC 3526. Hides the
                  refusal class.
                </li>
                <li>
                  <span className="text-refused">Never.</span> SNARK. STARK. Post-quantum. Proof that the Gateway
                  kernel executed.
                </li>
              </>
            )}
          </ul>
          <p className="mt-4 text-sm text-subtle">
            Not in v0.1. A real kernel proof is a zkVM guest of <code className="font-mono text-[12px]">verifyLease</code>
            .{" "}
            <Link to="/boundary" className="text-fg underline-offset-2 hover:underline">
              Back to the boundary
            </Link>
            . Joint computation is a different primitive —{" "}
            <Link to="/mpc" className="text-fg underline-offset-2 hover:underline">
              MPC lab
            </Link>
            .
          </p>
        </div>
      </aside>
    </main>
  );
}

function FamilyLab({
  family,
  wrapped,
  onFamily,
  onWrapped,
}: {
  family: FamilyId;
  wrapped: boolean;
  onFamily: (id: FamilyId) => void;
  onWrapped: (w: boolean) => void;
}) {
  const [minted, setMinted] = useState<{ valid: false; reason: string } | null>(null);
  const current = FAMILIES.find((f) => f.id === family) ?? FAMILIES[0]!;
  const view = familyView(current, wrapped);
  const barBytes = view.bytes ?? current.sizeBytes;

  return (
    <div className="mt-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-muted">
        {["STARK", "wrap", "SNARK"].map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            {i > 0 ? (
              <span className="text-faint" aria-hidden="true">
                →
              </span>
            ) : null}
            <span className={step === "wrap" ? "text-subtle" : "text-fg"}>{step}</span>
          </li>
        ))}
        <li className="text-faint">wrap is a different object</li>
      </ol>
      <p className="mt-3 text-sm text-muted">
        Size, setup, and post-quantum are the three numbers that matter. ETH-block p99 is not one of them. This tab
        does not mint a proof.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {FAMILIES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              onFamily(f.id);
              if (f.wrapBytes === null) onWrapped(false);
              setMinted(null);
            }}
            className={cn(
              "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
              family === f.id ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>
      <p className="mt-3 min-w-0 break-words font-mono text-[12px] text-subtle">
        {current.long} · {view.receipt} · {view.pq ? "PQ" : "not PQ"}
      </p>
      <div className="mt-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">Proof size · log scale</p>
        <ol className="mt-3 space-y-2">
          {FAMILIES.map((f) => {
            const active = f.id === family;
            const bytes = active && wrapped && f.wrapBytes ? f.wrapBytes : f.sizeBytes;
            const label = active && wrapped && f.wrapLabel ? f.wrapLabel : f.sizeLabel;
            return (
              <li key={f.id}>
                <div className="flex min-w-0 items-baseline justify-between gap-3 font-mono text-[11px]">
                  <span className={active ? "text-fg" : "text-muted"}>{f.name}</span>
                  <span className="min-w-0 text-right text-subtle">{label}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-inset">
                  <div
                    className={cn("h-2 rounded-full", active ? "bg-fg" : "bg-line")}
                    style={{ width: `${sizeBarPct(bytes)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 font-mono text-[11px] text-faint">100 B ← → 300 kB</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={current.wrapBytes === null}
          onClick={() => {
            onWrapped(!wrapped);
            setMinted(null);
          }}
        >
          {wrapped ? "Unwrap Groth16" : "Wrap Groth16"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setMinted(mintFamily());
          }}
        >
          Mint proof
        </Button>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">Setup</dt>
          <dd className="mt-1 min-w-0 break-words text-sm text-fg">{view.setup}</dd>
        </div>
        <div className="rounded-md bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">Assumption</dt>
          <dd className="mt-1 text-sm text-fg">{view.math}</dd>
        </div>
        <div className="rounded-md bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">Post-quantum</dt>
          <dd className="mt-1 text-sm text-fg">{view.pq ? "Yes at this object" : "No — pairings / discrete log"}</dd>
        </div>
        <div className="rounded-md bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">BAG</dt>
          <dd className="mt-1 text-sm text-fg">{current.bag}</dd>
        </div>
      </dl>
      <FamilyTable highlight={family} wrapped={wrapped} />
      <LabResult
        note={
          wrapped && current.wrapBytes
            ? "Inner STARK is still transparent. The object the auditor verifies is a SNARK."
            : `${current.name} selected. No receipt.`
        }
        result={minted}
        opened={null}
        holding={false}
        holdLabel=""
      />
      <VerifierJson value={view} empty="Pick a family." />
    </div>
  );
}

function FamilyTable({ highlight, wrapped }: { highlight: FamilyId; wrapped: boolean }) {
  return (
    <section className="mt-8 min-w-0">
      <h2 className="text-lg font-medium tracking-tight">Not a leaderboard</h2>
      <p className="mt-2 text-sm text-muted">
        Groth16 wins bytes. STARKs win setup and PQ. Plonkish sits between. IPA is a different trade: log size, linear
        verify. Wrap buys SNARK size and spends the other two.
      </p>
      <div className="mt-4 hidden overflow-x-auto rounded-lg shadow-[var(--shadow-border)] sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-elevated font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">
            <tr>
              <th className="px-3 py-3"> </th>
              {FAMILIES.map((f) => (
                <th key={f.id} className={cn("px-3 py-3", f.id === highlight ? "text-fg" : undefined)}>
                  {f.name}
                  {f.id === highlight && wrapped && f.wrapLabel ? " · wrap" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FAMILY_ROWS.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <td className="px-3 py-3 font-mono text-[11px] text-subtle">{row.label}</td>
                {FAMILIES.map((f) => {
                  const wrapping = f.id === highlight && wrapped && f.wrapBytes !== null;
                  let cell: string;
                  if (row.key === "pq") {
                    cell = wrapping ? "No" : f.pq ? "Yes" : "No";
                  } else if (row.key === "sizeLabel" && wrapping && f.wrapLabel) {
                    cell = f.wrapLabel;
                  } else if (row.key === "setup" && wrapping) {
                    cell = "Groth16 ceremony on wrap";
                  } else {
                    cell = String(f[row.key]);
                  }
                  return (
                    <td key={f.id} className={cn("px-3 py-3 text-muted", f.id === highlight ? "text-fg" : undefined)}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="mt-4 space-y-3 sm:hidden">
        {FAMILIES.map((f) => (
          <li
            key={f.id}
            className={cn("rounded-lg p-4 shadow-[var(--shadow-border)]", f.id === highlight ? "bg-elevated" : "bg-surface")}
          >
            <p className="text-sm font-medium">{f.name}</p>
            <dl className="mt-2 space-y-1 font-mono text-[11px] text-muted">
              {FAMILY_ROWS.map((row) => (
                <div key={row.key}>
                  {row.label} · {row.key === "pq" ? (f.pq ? "Yes" : "No") : String(f[row.key])}
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FamilyAside({ familyId, wrapped }: { familyId: FamilyId; wrapped: boolean }) {
  const family = FAMILIES.find((f) => f.id === familyId) ?? FAMILIES[0]!;
  return (
    <ProtocolAside
      title={wrapped && family.wrapBytes ? "STARK-inside-SNARK" : family.name}
      body={
        wrapped && family.wrapBytes ? (
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted">
            <li>Inner proof is a STARK. Transparent. PQ. Tens of kB.</li>
            <li>Outer proof is Groth16 of “that STARK verified.” ~200 B.</li>
            <li>The auditor verifies the outer object. Pairings. Ceremony. Not PQ.</li>
          </ol>
        ) : (
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted">
            <li>{family.math}.</li>
            <li>{family.setup}</li>
            <li>{family.examples}.</li>
          </ol>
        )
      }
    />
  );
}

function SigmaLab() {
  const lastEvidence = useBag((s) => s.lastEvidence);
  const identity = useBag((s) => s.identity);
  const derived = lastEvidence ? classifyEvidence(lastEvidence) : null;
  const [reason, setReason] = useState<ZkReason>(derived ?? "GEOMETRY");
  const [busy, setBusy] = useState(false);
  const [statement, setStatement] = useState<ZkStatement | null>(null);
  const [opening, setOpening] = useState<ZkOpening | null>(null);
  const [result, setResult] = useState<ZkVerifyResult | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const publicView = useMemo(() => {
    if (!statement) return null;
    return {
      evidenceId: statement.evidenceId,
      dispatched: statement.dispatched,
      kid: statement.kid,
      bound: statement.boundSignature ? statement.boundSignature.slice(0, 16) + "…" : "unbound",
      commitment: statement.proof.commitment.slice(0, 20) + "…",
      system: statement.proof.system,
      branches: statement.proof.challenges.length,
    };
  }, [statement]);

  const ctx = () => ({
    evidenceId: lastEvidence?.evidenceId ?? "ev_unbound_lab",
    dispatched: reason === "DISPATCHED",
    kid: identity?.kid ?? "gateway-eval-2026-09",
    boundSignature: lastEvidence?.signature.value ?? null,
  });

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        {ZK_REASONS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setReason(id);
              setResult(null);
              setOpened(null);
            }}
            className={cn(
              "h-11 rounded-md px-3 font-mono text-[11px] shadow-[var(--shadow-border)]",
              reason === id ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            {id}
          </button>
        ))}
      </div>
      <p className="mt-3 font-mono text-[12px] text-subtle">
        {derived ? `Last evidence classifies as ${derived}.` : "No live evidence. Binding is optional."}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            setBusy(true);
            setResult(null);
            setOpened(null);
            try {
              const out = await proveMembership(reason, ctx());
              setStatement(out.statement);
              setOpening(out.opening);
              setNote("Proof minted. The witness stays in this tab until you open it.");
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        >
          Prove membership
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !statement}
          onClick={async () => {
            if (!statement) return;
            setBusy(true);
            try {
              setResult(await verifyMembership(statement));
            } finally {
              setBusy(false);
            }
          }}
        >
          Verify
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !statement}
          onClick={async () => {
            if (!statement) return;
            setBusy(true);
            try {
              const mutated = { ...statement, evidenceId: statement.evidenceId + "_tampered" };
              setStatement(mutated);
              setResult(await verifyMembership(mutated));
              setNote("evidenceId changed. Fiat–Shamir challenge no longer matches.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Tamper binding
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setOpening(null);
            setOpened(null);
            try {
              const fake = await forgeMembership(ctx());
              setStatement(fake);
              setResult(await verifyMembership(fake));
              setNote("Random scalars, no opening. Soundness is the point.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Forge without witness
        </Button>
        <Button
          variant="ghost"
          disabled={!opening || !statement}
          onClick={async () => {
            if (!statement || !opening) return;
            setOpened((await openCommitment(opening, statement.proof.commitment)).detail);
          }}
        >
          Open commitment
        </Button>
      </div>
      <LabResult note={note} result={result} opened={opened} holding={Boolean(opening && !opened)} />
      <VerifierJson value={publicView} empty="No proof yet. The reason you picked is not in this pane." />
    </div>
  );
}

function RangeLab() {
  const shiftPx = useBag((s) => s.treasury.shiftPx);
  const [value, setValue] = useState(shiftPx > 0 ? Math.min(shiftPx, RANGE_MAX - 1) : 25);
  const [busy, setBusy] = useState<"prove" | "work" | false>(false);
  const [statement, setStatement] = useState<RangeStatement | null>(null);
  const [opening, setOpening] = useState<RangeOpening | null>(null);
  const [result, setResult] = useState<RangeVerifyResult | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const publicView = useMemo(() => {
    if (!statement) return null;
    const { proof } = statement;
    return {
      system: proof.system,
      bound: statement.bound,
      range: `[0, ${RANGE_MAX})`,
      n: proof.n,
      rounds: proof.L.length,
      bytes: proofBytes(proof),
      V: proof.V.slice(0, 20) + "…",
      fold: proof.L.map((Li, i) => ({
        round: i + 1,
        n: RANGE_N >> i,
        L: Li.slice(0, 12) + "…",
        R: proof.R[i]!.slice(0, 12) + "…",
      })),
      a: proof.a.slice(0, 12) + "…",
      b: proof.b.slice(0, 12) + "…",
      value: "—",
    };
  }, [statement]);

  const bound = "bag.drift.px";
  const locked = Boolean(busy);

  return (
    <div className="mt-6">
      <FoldStrip proof={statement?.proof ?? null} />
      <p className="mt-3 text-sm text-muted">
        Commit a pixel delta. Prove it is in [0, {RANGE_MAX}) without putting the integer in the proof. The {POLICY_FLOOR}
        px floor is public policy — not a statement the proof makes.
      </p>
      <RangeTrack value={value} revealed={!statement || Boolean(opened)} policyFloor={POLICY_FLOOR} />
      <div className="mt-4 flex flex-wrap gap-2">
        {RANGE_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setValue(n);
              setResult(null);
              setOpened(null);
              setStatement(null);
              setOpening(null);
              setNote(null);
            }}
            className={cn(
              "h-11 rounded-md px-3 font-mono text-[11px] shadow-[var(--shadow-border)]",
              value === n ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            {n}px{n >= POLICY_FLOOR ? " · refuse" : " · in range"}
          </button>
        ))}
        {shiftPx > 0 && !RANGE_PRESETS.includes(shiftPx) ? (
          <button
            type="button"
            onClick={() => setValue(Math.min(shiftPx, RANGE_MAX - 1))}
            className="h-11 rounded-md bg-surface px-3 font-mono text-[11px] text-muted shadow-[var(--shadow-border)]"
          >
            live {shiftPx}px
          </button>
        ) : null}
      </div>
      <p className="mt-3 font-mono text-[12px] text-subtle">
        Witness {value}px · policy floor {POLICY_FLOOR}px is public · the integer is not.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          disabled={locked}
          onClick={async () => {
            setBusy("prove");
            setResult(null);
            setOpened(null);
            setNote(null);
            await new Promise((r) => setTimeout(r, 40));
            try {
              const out = await proveRange(value, bound);
              setStatement(out.statement);
              setOpening(out.opening);
              setNote(`Range proof minted. ${out.statement.proof.L.length} IPA rounds. Value is not in the transcript.`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy === "prove" ? "Folding inner product…" : "Prove range"}
        </Button>
        <Button
          variant="secondary"
          disabled={locked || !statement}
          onClick={async () => {
            if (!statement) return;
            setBusy("work");
            try {
              setResult(await verifyRange(statement));
            } finally {
              setBusy(false);
            }
          }}
        >
          Verify
        </Button>
        <Button
          variant="secondary"
          disabled={locked || !statement}
          onClick={async () => {
            if (!statement) return;
            setBusy("work");
            try {
              const mutated = { ...statement, bound: statement.bound + ".tampered" };
              setStatement(mutated);
              setResult(await verifyRange(mutated));
              setNote("Binding string changed. The t-polynomial check fails closed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Tamper binding
        </Button>
        <Button
          variant="secondary"
          disabled={locked}
          onClick={async () => {
            setBusy("work");
            setOpening(null);
            setOpened(null);
            try {
              const fake = await forgeRange(bound);
              setStatement(fake);
              setResult(await verifyRange(fake));
              setNote("No witness. The inner-product relation does not hold.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Forge without witness
        </Button>
        <Button
          variant="ghost"
          disabled={!opening || !statement}
          onClick={async () => {
            if (!statement || !opening) return;
            setOpened((await openRange(opening, statement.proof.V)).detail);
          }}
        >
          Open V
        </Button>
      </div>
      <LabResult
        note={note}
        result={result}
        opened={opened}
        holding={Boolean(opening && !opened)}
        holdLabel="Witness held. Verifier view has V, not the integer."
      />
      <VerifierJson value={publicView} empty="No proof yet. The pixel value you picked is not in this pane." />
    </div>
  );
}

function FoldStrip({ proof }: { proof: RangeProof | null }) {
  const sizes = [RANGE_N, RANGE_N / 2, RANGE_N / 4, 1];
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-muted">
      {sizes.map((n, i) => (
        <li key={n} className="flex items-center gap-2">
          {i > 0 ? (
            <span className="text-faint" aria-hidden="true">
              →
            </span>
          ) : null}
          <span className={proof && (i === 0 || i - 1 < proof.L.length) ? "text-fg" : undefined}>
            n = {n}
            {proof && i > 0 && proof.L[i - 1] ? ` · L ${proof.L[i - 1]!.slice(0, 6)}…` : ""}
          </span>
        </li>
      ))}
      <li className="text-faint">inner-product fold · 2⌈log₂ n⌉ group elements</li>
    </ol>
  );
}

function RangeTrack({
  value,
  revealed,
  policyFloor,
}: {
  value: number;
  revealed: boolean;
  policyFloor: number;
}) {
  const pct = (value / RANGE_MAX) * 100;
  const floorPct = (policyFloor / RANGE_MAX) * 100;
  return (
    <div className="mt-4">
      <div className="relative h-8 overflow-hidden rounded-md bg-inset shadow-[var(--shadow-border)]">
        <div
          className="absolute inset-y-0 bg-refused/10"
          style={{ left: `${floorPct}%`, width: `${100 - floorPct}%` }}
        />
        <div className="absolute inset-y-0 w-px bg-refused/50" style={{ left: `${floorPct}%` }} />
        {revealed ? (
          <div
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
            style={{ left: `${pct}%` }}
          />
        ) : (
          <div className="absolute inset-1 rounded-sm bg-elevated/90" />
        )}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-faint">
        <span>0</span>
        <span>floor {policyFloor}px</span>
        <span>{RANGE_MAX}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-subtle">
        {revealed ? `Prover view · ${value}px` : "Verifier view · committed, integer hidden"}
      </p>
    </div>
  );
}

function LabResult({
  note,
  result,
  opened,
  holding,
  holdLabel = "Witness held. Verifier view has no reason string.",
}: {
  note: string | null;
  result: { valid: boolean; reason: string } | null;
  opened: string | null;
  holding: boolean;
  holdLabel?: string;
}) {
  return (
    <>
      {note ? <p className="mt-4 text-sm text-fg">{note}</p> : null}
      {result ? (
        <div className="mt-4 rounded-xl bg-elevated p-5 shadow-[var(--shadow-border)]">
          <Badge tone={result.valid ? "ok" : "deny"}>{result.valid ? "VALID" : "INVALID"}</Badge>
          <p className="mt-3 text-sm leading-relaxed text-muted">{result.reason}</p>
        </div>
      ) : null}
      {opened ? (
        <p className="mt-4 font-mono text-[12px] leading-relaxed text-pending">{opened}</p>
      ) : holding ? (
        <p className="mt-4 font-mono text-[12px] text-subtle">{holdLabel}</p>
      ) : null}
    </>
  );
}

function VerifierJson({ value, empty }: { value: unknown; empty: string }) {
  return (
    <div className="mt-6 min-w-0 rounded-xl bg-inset p-4 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">Verifier view</p>
      {value ? (
        <pre className="mt-3 min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted">
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : (
        <p className="mt-3 text-sm text-subtle">{empty}</p>
      )}
    </div>
  );
}

function ProtocolAside({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="rounded-xl bg-inset p-4 shadow-[var(--shadow-border)] sm:p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">{title}</p>
      {body}
    </div>
  );
}

function RangeAsideBody() {
  return (
    <ProtocolAside
      title="Protocol 1 + range"
      body={
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted">
          <li>Pedersen-commit v. Decompose into {RANGE_N} bits.</li>
          <li>Commit bit vectors A, blinding S. Fiat–Shamir → y, z.</li>
          <li>
            Polynomial t(X) = ⟨l(X), r(X)⟩. Commit T₁, T₂. Challenge x.
          </li>
          <li>
            Fold ⟨l, r⟩ in {Math.log2(RANGE_N)} IPA rounds. Send a, b. Size 2⌈log₂ n⌉+9.
          </li>
        </ol>
      }
    />
  );
}

function SigmaAsideHint() {
  return (
    <ProtocolAside
      title="Cramer–Damgård–Schoenmakers"
      body={
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted">
          <li>Pedersen-commit the refusal index.</li>
          <li>Real Schnorr on the true branch. Simulate the rest.</li>
          <li>Challenges sum to the Fiat–Shamir hash. Linear in the set.</li>
        </ol>
      }
    />
  );
}

function GuestLab({ stack, onStack }: { stack: ZkStackId; onStack: (id: ZkStackId) => void }) {
  const [scenario, setScenario] = useState<GuestScenarioId>("drift");
  const [fork, setFork] = useState(0);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<GuestRun | null>(null);
  const [wrap, setWrap] = useState<{ valid: false; reason: string } | null>(null);
  const [opened, setOpened] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const current = ZKVM_STACKS.find((s) => s.id === stack) ?? ZKVM_STACKS[0]!;
  const stages = pipelineStatus(current, Boolean(run), Boolean(wrap));

  const publicView = useMemo(() => {
    if (!run) return null;
    return {
      system: run.journal.system,
      guest: run.journal.guest,
      imageId: run.journal.imageId,
      ok: run.journal.ok,
      halt: run.journal.halt,
      reasonClass: run.journal.reasonClass,
      dispatched: run.journal.dispatched,
      stack: current.id,
      receipt: current.succinct,
    };
  }, [run, current.id, current.succinct]);

  return (
    <div className="mt-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-muted">
        {["Host", "Guest", "Journal", "Receipt"].map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            {i > 0 ? (
              <span className="text-faint" aria-hidden="true">
                →
              </span>
            ) : null}
            <span className={step === "Receipt" ? "text-refused" : "text-fg"}>{step}</span>
          </li>
        ))}
        <li className="text-faint">proving stops at the journal</li>
      </ol>
      <p className="mt-3 text-sm text-muted">
        Same ten checks as verifyLease. Pick a proving stack to see what would happen next. Execute runs here. Every
        later stage is a would, not a receipt.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {ZKVM_STACKS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onStack(s.id);
              setWrap(null);
              setFocus(null);
            }}
            className={cn(
              "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
              stack === s.id ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {GUEST_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setScenario(s.id);
              setRun(null);
              setWrap(null);
              setOpened(false);
              setNote(null);
              setFocus(null);
            }}
            className={cn(
              "h-11 rounded-md px-3 font-mono text-[11px] shadow-[var(--shadow-border)]",
              scenario === s.id ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="mt-3 font-mono text-[12px] text-subtle">
        {current.name} · {current.succinct} · wrap {current.wrap}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setWrap(null);
            setOpened(false);
            setFocus("execute");
            try {
              const out = await runGuest(scenario, fork);
              setRun(out);
              setNote(
                out.journal.ok
                  ? `Guest committed on ${current.name}. Execute ran. Later stages did not.`
                  : `Guest halted at ${out.journal.halt}. Journal is not a ${current.name} receipt.`,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Executing guest…" : "Run guest"}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !run}
          onClick={() => {
            if (!run) return;
            setWrap(wrapForStack(current, run));
            setFocus(current.pipeline.at(-1)?.id ?? "compress");
            setNote("Wrap refused. No prover in this process.");
          }}
        >
          Wrap receipt
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            const from = run?.journal.imageId ?? (await guestImageId(fork));
            const next = fork + 1;
            setFork(next);
            setWrap(null);
            setOpened(false);
            setFocus(null);
            const to = await guestImageId(next);
            setRun(null);
            setNote(forkNote(from, to));
          }}
        >
          Fork ImageID
        </Button>
        <Button variant="ghost" disabled={!run} onClick={() => setOpened(true)}>
          Open witness
        </Button>
      </div>
      <ol className="mt-5 space-y-1.5">
        {stages.map(({ stage, status }) => (
          <li key={stage.id}>
            <button
              type="button"
              onClick={() => setFocus(stage.id)}
              className={cn(
                "flex w-full min-w-0 items-baseline justify-between gap-3 rounded-md px-3 py-2 text-left shadow-[var(--shadow-border)]",
                focus === stage.id ? "bg-elevated" : "bg-surface",
              )}
            >
              <span className="font-mono text-[12px] text-fg">
                {stage.title}
                <span className="ml-2 text-subtle">{stage.circuit}</span>
              </span>
              <Badge tone={status === "ran" ? "ok" : status === "refused" ? "deny" : "neutral"}>{status}</Badge>
            </button>
          </li>
        ))}
      </ol>
      {focus ? (
        <p className="mt-2 font-mono text-[12px] leading-relaxed text-subtle">
          {(() => {
            const row = stages.find((s) => s.stage.id === focus);
            if (!row) return null;
            const pq =
              row.stage.pq === true ? "PQ at this stage." : row.stage.pq === false ? "Not PQ." : "No proof.";
            return `${row.stage.out} · ${pq}`;
          })()}
        </p>
      ) : (
        <p className="mt-2 font-mono text-[12px] text-subtle">Select a stage. Only Execute can run here.</p>
      )}
      {run ? (
        <ol className="mt-5 space-y-1.5">
          {run.steps.map((step) => (
            <li
              key={step.id}
              className="flex min-w-0 items-baseline justify-between gap-3 rounded-md bg-surface px-3 py-2 shadow-[var(--shadow-border)]"
            >
              <span className="font-mono text-[12px] text-fg">
                {step.id} {step.title}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="hidden truncate font-mono text-[11px] text-subtle sm:inline">{step.detail}</span>
                <Badge tone={step.status === "pass" ? "ok" : step.status === "fail" ? "deny" : "neutral"}>
                  {step.status}
                </Badge>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <ArchTable highlight={stack} />
      <LabResult
        note={note}
        result={wrap}
        opened={
          opened && run
            ? `Witness · nonce ${run.witness.nonce.slice(0, 12)}… · drift ${run.witness.driftPx}px · occluded ${run.witness.occluded} · ${run.witness.liveDomHash}`
            : null
        }
        holding={Boolean(run && !opened)}
        holdLabel="Witness held. Verifier view is the journal. A SuccinctReceipt would hide it; this tab does not mint one."
      />
      <VerifierJson value={publicView} empty="No guest run yet. The journal is not a receipt." />
    </div>
  );
}

function ArchTable({ highlight }: { highlight: ZkStackId }) {
  return (
    <section className="mt-8 min-w-0">
      <h2 className="text-lg font-medium tracking-tight">Architecture, not a leaderboard</h2>
      <p className="mt-2 text-sm text-muted">
        verifyLease is a small guest. ETH-block p99 is the wrong number. Ed25519 cost, receipt size, and whether the wrap
        drops PQ are the right ones.
      </p>
      <div className="mt-4 hidden overflow-x-auto rounded-lg shadow-[var(--shadow-border)] sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-elevated font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">
            <tr>
              <th className="px-3 py-3"> </th>
              {ZKVM_STACKS.map((s) => (
                <th key={s.id} className={cn("px-3 py-3", s.id === highlight ? "text-fg" : undefined)}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ARCH_ROWS.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <td className="px-3 py-3 font-mono text-[11px] text-subtle">{row.label}</td>
                {ZKVM_STACKS.map((s) => (
                  <td key={s.id} className={cn("px-3 py-3 text-muted", s.id === highlight ? "text-fg" : undefined)}>
                    {s[row.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="mt-4 space-y-3 sm:hidden">
        {ZKVM_STACKS.map((s) => (
          <li
            key={s.id}
            className={cn("rounded-lg p-4 shadow-[var(--shadow-border)]", s.id === highlight ? "bg-elevated" : "bg-surface")}
          >
            <p className="text-sm font-medium">{s.name}</p>
            <dl className="mt-2 space-y-1 font-mono text-[11px] text-muted">
              {ARCH_ROWS.map((row) => (
                <div key={row.key}>
                  {row.label} · {s[row.key]}
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GuestAside({ stackId }: { stackId: ZkStackId }) {
  const stack = ZKVM_STACKS.find((s) => s.id === stackId) ?? ZKVM_STACKS[0]!;
  if (stack.id === "risc0") {
    return (
      <ProtocolAside
        title="RISC Zero · three circuits"
        body={
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted">
            <li>RISC-V Circuit (STARK) proves the guest ELF. Output: SegmentReceipts.</li>
            <li>Recursion Circuit (STARK) lifts and joins until one SuccinctReceipt ~200 kB. PQ.</li>
            <li>Groth16 R1CS wraps for chain verify ~200 B. Drops PQ. Control root avoids a new ceremony.</li>
          </ol>
        }
      />
    );
  }
  return (
    <ProtocolAside
      title={stack.name}
      body={
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted">
          {stack.pipeline.map((s) => (
            <li key={s.id}>
              {s.title} · {s.circuit} → {s.out}
            </li>
          ))}
        </ol>
      }
    />
  );
}
