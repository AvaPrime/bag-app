import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MPC_FAMILIES,
  MPC_FAMILY_ROWS,
  MPC_SYSTEMS,
  activeSystem,
  conjunctionPublicView,
  kernelAfterCeremony,
  proveConjunction,
  reconstructGrant,
  refuseFrost,
  refuseLeaseFromSecret,
  refuseNetwork,
  splitGrant,
  tamperShare,
  type ConjunctionTranscript,
  type MpcFamilyId,
  type ShamirShare,
  type ShamirSplit,
} from "@/lib/bag/mpc";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/mpc")({ component: MpcPage });

type Lab = "shamir" | "beaver" | "family";

const CLAIMS = [
  {
    claim: "Key holder signed this",
    ed: "Yes",
    shamir: "No — a field element",
    beaver: "No — a bit",
    family: "Only FROST, not this tab",
    frost: "Yes, if t honest shares sign",
  },
  {
    claim: "Dispatch did not fire",
    ed: "Field in the JSON",
    shamir: "Not computed",
    beaver: "Not computed",
    family: "Not computed",
    frost: "Not computed",
  },
  {
    claim: "Which party said no",
    ed: "Revealed if logged",
    shamir: "n/a — committee secret",
    beaver: "Hidden until inputs open",
    family: "Depends on the circuit",
    frost: "Hidden",
  },
  {
    claim: "The kernel actually ran",
    ed: "No — the signer can lie",
    shamir: "No",
    beaver: "No. AND = 1 still dies at A3",
    family: "No — a family is not a network",
    frost: "No — a signature is not a guest",
  },
];

function MpcPage() {
  const [lab, setLab] = useState<Lab>("shamir");
  const [family, setFamily] = useState<MpcFamilyId>("bgw");
  const labCol = lab === "family" ? "family" : lab === "beaver" ? "beaver" : "shamir";

  return (
    <main className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Joint computation lab</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">MPC is not a Gateway.</h1>
        <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
          {lab === "family"
            ? "Yao garbles a circuit. GMW shares wires. BGW shares a polynomial. SPDZ adds a MAC. FROST is the only one that would replace the localStorage key — and this tab does not run it."
            : lab === "beaver"
              ? "Human bit AND policy bit, via a Beaver triple. Neither party sees the other’s bit. The output is still a bit. A3 remains unmatched and denies."
              : "2-of-3 Shamir over 𝔽_p. One share reveals nothing. Two reconstruct. A forged share reconstructs garbage with no error — secret sharing is not integrity."}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLab("shamir")}
            className={cn(
              "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
              lab === "shamir" ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            Threshold · Shamir
          </button>
          <button
            type="button"
            onClick={() => setLab("beaver")}
            className={cn(
              "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
              lab === "beaver" ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            Conjunction · Beaver
          </button>
          <button
            type="button"
            onClick={() => setLab("family")}
            className={cn(
              "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
              lab === "family" ? "bg-elevated text-fg" : "bg-surface text-muted",
            )}
          >
            Yao · SPDZ · FROST
          </button>
        </div>

        {lab === "family" ? (
          <FamilyLab family={family} onFamily={setFamily} />
        ) : lab === "beaver" ? (
          <BeaverLab />
        ) : (
          <ShamirLab />
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
                  <th className="px-4 py-3">FROST of the key</th>
                </tr>
              </thead>
              <tbody>
                {CLAIMS.map((row) => (
                  <tr key={row.claim} className="border-t border-line">
                    <td className="px-4 py-3 text-fg">{row.claim}</td>
                    <td className="px-4 py-3 text-muted">{row.ed}</td>
                    <td className="px-4 py-3 text-muted">{row[labCol]}</td>
                    <td className="px-4 py-3 text-muted">{row.frost}</td>
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
                  <div>FROST · {row.frost}</div>
                </dl>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        {lab === "family" ? (
          <FamilyAside familyId={family} />
        ) : lab === "beaver" ? (
          <ProtocolAside
            title="Beaver multiplication"
            body={
              <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted">
                <li>Dealer samples a, b and c = a·b. Splits them additively. This heap is the dealer.</li>
                <li>Parties hold [x], [y]. Open d = x−a, e = y−b. Uniform, not the bits.</li>
                <li>[z] = [c] + d[b] + e[a] + de. z = x·y. One party keeps the de term.</li>
                <li>No MAC. A lie about d corrupts z. SPDZ would abort. This lab does not.</li>
              </ol>
            }
          />
        ) : (
          <ProtocolAside
            title="Shamir t = 2, n = 3"
            body={
              <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted">
                <li>Secret s ∈ 𝔽_p, p = 2²⁵⁵−19. Not X25519. Not Ed25519.</li>
                <li>f(x) = s + a₁x. Share i is (i, f(i)) for Human, Policy, Audit.</li>
                <li>Lagrange at 0 on any two points recovers s. One point refuses.</li>
                <li>No VSS. A forged y reconstructs a wrong s and reports success.</li>
              </ol>
            }
          />
        )}
        <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">Implementations</p>
          <ol className="mt-3 space-y-3">
            {MPC_SYSTEMS.map((sys) => (
              <li key={sys.name}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{sys.name}</p>
                  <Badge tone={activeSystem(sys.name, lab, family) ? "ok" : "neutral"}>{sys.kind}</Badge>
                </div>
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
                  <span className="text-verified">Say.</span> Semi-honest 2PC is Yao or GMW. Malicious dishonest-majority
                  is SPDZ. Threshold Schnorr is FROST. Honest majority is BGW.
                </li>
                <li>
                  <span className="text-refused">Never.</span> This tab ran a network. FROST from a split seed. MPC
                  minted a lease.
                </li>
              </>
            ) : lab === "beaver" ? (
              <>
                <li>
                  <span className="text-verified">Say.</span> Beaver AND over 𝔽_p. Semi-honest. Dealer is this process.
                  Output is x∧y.
                </li>
                <li>
                  <span className="text-refused">Never.</span> Malicious security. Independent parties. A3 ceremony
                  exists in v0.1.
                </li>
              </>
            ) : (
              <>
                <li>
                  <span className="text-verified">Say.</span> Shamir 2-of-3 over 𝔽_p. One share is uniform. Two
                  reconstruct. Forgery is silent.
                </li>
                <li>
                  <span className="text-refused">Never.</span> Verifiable secret sharing. Threshold Ed25519. A
                  reconstructed s is a signature.
                </li>
              </>
            )}
          </ul>
          <p className="mt-4 text-sm text-subtle">
            Not in v0.1. Human-approval ceremonies deny.{" "}
            <Link to="/boundary" className="text-fg underline-offset-2 hover:underline">
              Back to the boundary
            </Link>
            . Selective disclosure is a different primitive —{" "}
            <Link to="/zk" className="text-fg underline-offset-2 hover:underline">
              ZK lab
            </Link>
            .
          </p>
        </div>
      </aside>
    </main>
  );
}

function ShamirLab() {
  const [split, setSplit] = useState<ShamirSplit | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set([1, 2]));
  const [forgedX, setForgedX] = useState<number | null>(null);
  const [recon, setRecon] = useState<{ ok: boolean; reason: string; secret: string | null } | null>(null);
  const [minted, setMinted] = useState<{ valid: boolean; reason: string } | null>(null);

  const liveShares = useMemo(() => {
    if (!split) return [];
    return split.shares
      .filter((s) => selected.has(s.x))
      .map((s) => (forgedX === s.x ? tamperShare(s) : s));
  }, [split, selected, forgedX]);

  function toggle(x: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(x)) next.delete(x);
      else next.add(x);
      return next;
    });
    setRecon(null);
    setMinted(null);
  }

  const verifier = split
    ? {
        system: split.system,
        field: split.field,
        t: split.t,
        n: split.n,
        selected: liveShares.map((s) => ({
          party: s.party,
          x: s.x,
          y: s.y.slice(0, 16) + "…",
          tampered: forgedX === s.x,
        })),
        reconstructed: recon?.ok ? recon.secret?.slice(0, 16) + "…" : null,
      }
    : null;

  return (
    <div className="mt-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-muted">
        {["Split", "Select", "Reconstruct"].map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            {i > 0 ? (
              <span className="text-faint" aria-hidden="true">
                →
              </span>
            ) : null}
            <span>{step}</span>
          </li>
        ))}
        <li className="text-faint">integrity is not a step</li>
      </ol>
      <p className="mt-3 text-sm text-muted">
        Human, Policy, and Audit each hold one share of a committee grant. The grant is a field element. It is not the
        Gateway key.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setSplit(splitGrant());
            setSelected(new Set([1, 2]));
            setForgedX(null);
            setRecon(null);
            setMinted(null);
          }}
        >
          Split grant
        </Button>
        <Button
          variant="secondary"
          disabled={!split}
          onClick={() => {
            setRecon(reconstructGrant(liveShares));
            setMinted(null);
          }}
        >
          Reconstruct
        </Button>
        <Button
          variant="secondary"
          disabled={!split}
          onClick={() => {
            setForgedX(3);
            setSelected(new Set([1, 3]));
            setRecon(null);
            setMinted(null);
          }}
        >
          Forge Audit’s share
        </Button>
        <Button
          variant="secondary"
          disabled={!recon?.ok}
          onClick={() => setMinted(refuseLeaseFromSecret())}
        >
          Mint lease from secret
        </Button>
      </div>
      {split ? (
        <ol className="mt-5 grid gap-2 sm:grid-cols-3">
          {split.shares.map((s: ShamirShare) => {
            const on = selected.has(s.x);
            const forged = forgedX === s.x;
            return (
              <li key={s.x}>
                <button
                  type="button"
                  onClick={() => toggle(s.x)}
                  className={cn(
                    "w-full rounded-lg p-3 text-left shadow-[var(--shadow-border)]",
                    on ? "bg-elevated text-fg" : "bg-surface text-muted",
                  )}
                >
                  <p className="font-mono text-[11px] text-subtle">
                    x = {s.x}
                    {forged ? " · forged" : ""}
                  </p>
                  <p className="mt-1 text-sm font-medium">{s.party}</p>
                  <p className="mt-1 text-sm text-muted">{s.role}</p>
                  <p className="mt-2 break-all font-mono text-[11px] text-faint">
                    {(forged ? tamperShare(s).y : s.y).slice(0, 18)}…
                  </p>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
      <LabResult
        note={null}
        result={recon ? { valid: recon.ok, reason: recon.reason } : null}
        opened={
          recon?.ok && split && recon.secret !== split.secret
            ? "Reconstructed. Wrong secret. No error. Plain Shamir is not VSS."
            : recon?.ok
              ? `Reconstructed s = ${recon.secret?.slice(0, 18)}…`
              : null
        }
        holding={false}
      />
      {minted ? <LabResult note={null} result={minted} opened={null} holding={false} /> : null}
      <VerifierJson value={verifier} empty="Split a grant. The verifier sees selected shares, not s." />
    </div>
  );
}

function BeaverLab() {
  const [human, setHuman] = useState<0 | 1>(1);
  const [policy, setPolicy] = useState<0 | 1>(1);
  const [transcript, setTranscript] = useState<ConjunctionTranscript | null>(null);
  const [kernel, setKernel] = useState<{ permitted: boolean; reason: string } | null>(null);

  const pub = transcript ? conjunctionPublicView(transcript) : null;

  function run(lie: 0 | 1 | null) {
    const t = proveConjunction(human, policy, lie);
    setTranscript(t);
    setKernel(null);
  }

  return (
    <div className="mt-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-muted">
        {["Share bits", "Open d, e", "Multiply", "Ask kernel"].map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            {i > 0 ? (
              <span className="text-faint" aria-hidden="true">
                →
              </span>
            ) : null}
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted">
        The human-approval ceremony that A3 names and v0.1 does not implement. Conjunction of two private bits. Then the
        kernel, which still denies.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <BitToggle label="Human" value={human} onChange={setHuman} yes="Approve" no="Deny" />
        <BitToggle label="Policy" value={policy} onChange={setPolicy} yes="Permit host" no="Refuse host" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => run(null)}>Run conjunction</Button>
        <Button variant="secondary" onClick={() => run(0)}>
          Human lies about d
        </Button>
        <Button
          variant="secondary"
          disabled={!transcript}
          onClick={() => setKernel(kernelAfterCeremony(transcript?.zBit ?? null))}
        >
          Ask kernel to mint A3
        </Button>
      </div>
      {transcript ? (
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Opened d" value={transcript.opened.d.slice(0, 12) + "…"} />
          <Stat label="Opened e" value={transcript.opened.e.slice(0, 12) + "…"} />
          <Stat
            label="z = x ∧ y"
            value={transcript.zBit === null ? "not a bit" : String(transcript.zBit)}
          />
        </dl>
      ) : null}
      <LabResult
        note={
          transcript
            ? transcript.lie !== null
              ? "A party sent a random d-share. z is junk. Semi-honest MPC assumes they don’t. SPDZ would abort."
              : `Conjunction is ${transcript.zBit}. Inputs stay in each party’s view.`
            : null
        }
        result={
          kernel
            ? { valid: kernel.permitted, reason: kernel.reason }
            : transcript && transcript.zBit === null
              ? { valid: false, reason: "ERR_MPC_OPEN_CORRUPT: reconstructed z is not in {0,1}." }
              : null
        }
        opened={null}
        holding={false}
      />
      <VerifierJson value={pub} empty="Run the conjunction. The verifier sees d, e, and z — not who said no." />
    </div>
  );
}

function FamilyLab({ family, onFamily }: { family: MpcFamilyId; onFamily: (id: MpcFamilyId) => void }) {
  const [refused, setRefused] = useState<{ valid: false; reason: string } | null>(null);
  const current = MPC_FAMILIES.find((f) => f.id === family) ?? MPC_FAMILIES[0]!;

  return (
    <div className="mt-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-muted">
        {["Yao", "GMW", "BGW", "SPDZ", "FROST"].map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            {i > 0 ? (
              <span className="text-faint" aria-hidden="true">
                →
              </span>
            ) : null}
            <span className={step === current.name.split(" ")[0] || (current.id === "bgw" && step === "BGW") ? "text-fg" : undefined}>
              {step}
            </span>
          </li>
        ))}
        <li className="text-faint">none of these is a lease</li>
      </ol>
      <p className="mt-3 text-sm text-muted">
        Security model, party count, and whether the signing key ever exists in one place. This tab does not run a
        network.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {MPC_FAMILIES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              onFamily(f.id);
              setRefused(null);
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
      <p className="mt-3 min-w-0 break-words font-mono text-[12px] text-subtle">{current.long}</p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <Stat label="Parties" value={current.parties} />
        <Stat label="Rounds" value={current.rounds} />
        <div className="rounded-md bg-surface px-3 py-2 shadow-[var(--shadow-border)] sm:col-span-2">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">Malicious</dt>
          <dd className="mt-1 text-sm text-fg">{current.malicious}</dd>
        </div>
        <div className="rounded-md bg-surface px-3 py-2 shadow-[var(--shadow-border)] sm:col-span-2">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">BAG</dt>
          <dd className="mt-1 text-sm text-fg">{current.bag}</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setRefused(family === "frost" ? refuseFrost() : refuseNetwork())}>
          {family === "frost" ? "Run FROST" : "Open a network"}
        </Button>
      </div>
      <FamilyTable highlight={family} />
      <LabResult note={`${current.name} selected. ${current.inLab}`} result={refused} opened={null} holding={false} />
      <VerifierJson
        value={{
          family: current.name,
          model: current.model,
          setup: current.setup,
          inLab: current.inLab,
        }}
        empty="Pick a family."
      />
    </div>
  );
}

function FamilyTable({ highlight }: { highlight: MpcFamilyId }) {
  return (
    <section className="mt-8 min-w-0">
      <h2 className="text-lg font-medium tracking-tight">Not a leaderboard</h2>
      <p className="mt-2 text-sm text-muted">
        Yao wins rounds. Shamir wins honest-majority simplicity. SPDZ wins the threat model. FROST is the only one that
        signs.
      </p>
      <div className="mt-4 hidden overflow-x-auto rounded-lg shadow-[var(--shadow-border)] sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-elevated font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">
            <tr>
              <th className="px-3 py-3"> </th>
              {MPC_FAMILIES.map((f) => (
                <th key={f.id} className={cn("px-3 py-3", f.id === highlight ? "text-fg" : undefined)}>
                  {f.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MPC_FAMILY_ROWS.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <td className="px-3 py-3 font-mono text-[11px] text-subtle">{row.label}</td>
                {MPC_FAMILIES.map((f) => (
                  <td key={f.id} className={cn("px-3 py-3 text-muted", f.id === highlight ? "text-fg" : undefined)}>
                    {f[row.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="mt-4 space-y-3 sm:hidden">
        {MPC_FAMILIES.map((f) => (
          <li
            key={f.id}
            className={cn("rounded-lg p-4 shadow-[var(--shadow-border)]", f.id === highlight ? "bg-elevated" : "bg-surface")}
          >
            <p className="text-sm font-medium">{f.name}</p>
            <dl className="mt-2 space-y-1 font-mono text-[11px] text-muted">
              {MPC_FAMILY_ROWS.map((row) => (
                <div key={row.key}>
                  {row.label} · {f[row.key]}
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FamilyAside({ familyId }: { familyId: MpcFamilyId }) {
  const family = MPC_FAMILIES.find((f) => f.id === familyId) ?? MPC_FAMILIES[0]!;
  return (
    <ProtocolAside
      title={family.name}
      body={
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted">
          <li>{family.model}</li>
          <li>{family.setup}.</li>
          <li>{family.inLab}</li>
        </ol>
      }
    />
  );
}

function BitToggle({
  label,
  value,
  onChange,
  yes,
  no,
}: {
  label: string;
  value: 0 | 1;
  onChange: (v: 0 | 1) => void;
  yes: string;
  no: string;
}) {
  return (
    <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">{label}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onChange(1)}
          className={cn(
            "h-11 flex-1 rounded-md text-sm",
            value === 1 ? "bg-elevated text-fg" : "bg-inset text-muted",
          )}
        >
          {yes}
        </button>
        <button
          type="button"
          onClick={() => onChange(0)}
          className={cn(
            "h-11 flex-1 rounded-md text-sm",
            value === 0 ? "bg-elevated text-fg" : "bg-inset text-muted",
          )}
        >
          {no}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
      <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">{label}</dt>
      <dd className="mt-1 min-w-0 break-all font-mono text-[12px] text-fg">{value}</dd>
    </div>
  );
}

function LabResult({
  note,
  result,
  opened,
  holding,
}: {
  note: string | null;
  result: { valid: boolean; reason: string } | null;
  opened: string | null;
  holding: boolean;
}) {
  return (
    <>
      {note ? <p className="mt-4 text-sm text-fg">{note}</p> : null}
      {result ? (
        <div className="mt-4 rounded-xl bg-elevated p-5 shadow-[var(--shadow-border)]">
          <Badge tone={result.valid ? "ok" : "deny"}>{result.valid ? "VALID" : "REFUSED"}</Badge>
          <p className="mt-3 text-sm leading-relaxed text-muted">{result.reason}</p>
        </div>
      ) : null}
      {opened ? (
        <p className="mt-4 font-mono text-[12px] leading-relaxed text-pending">{opened}</p>
      ) : holding ? (
        <p className="mt-4 font-mono text-[12px] text-subtle">Witness held.</p>
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
