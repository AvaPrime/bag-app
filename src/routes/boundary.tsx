import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/boundary")({ component: BoundaryPage });

const CLAUSES = [
  {
    clause: "a mutation is executable only if",
    enforced: "Lease is mandatory on both adapters. Omission is ERR_ADAPTER_LEASE_REQUIRED.",
  },
  {
    clause: "currently valid",
    enforced: "TTL window and coherence check in verifyLease. Ceiling from policy maxLeaseTtlMs. Live grant re-hashed; rotation is ERR_LEASE_POLICY_DRIFT.",
  },
  {
    clause: "non-replayed",
    enforced: "Single-use nonce consumed at dispatch. Re-submit is ERR_LEASE_NONCE_REPLAYED.",
  },
  {
    clause: "target-bound",
    enforced: "tab, frame, target index, and DOM hash sit inside the signed payload.",
  },
  {
    clause: "signed",
    enforced: "Unconditional crypto.verify. policyId and policyHash sit inside the signed bytes. Exactly one success path.",
  },
  {
    clause: "by a trusted Gateway identity",
    enforced: "kid resolved against the trust store. Inline key material rejected.",
  },
];

const INVARIANTS = [
  { id: "INV-0", title: "Authority precedes actuation", body: "Missing fields are malformed, not optional. Verification happens before any claim inside the artifact is trusted." },
  { id: "INV-1", title: "Sequential DAG integrity", body: "PROPOSED cannot skip to DISPATCHED or VERIFIED. A screenshot is not a completion." },
  { id: "INV-2", title: "Temporal boundary", body: "Date.now() ≥ expiresAt → ERR_LEASE_EXPIRED. dispatched remains false." },
  { id: "INV-3", title: "Spatial stability", body: "Δx or Δy ≥ 5px → ERR_TARGET_GEOMETRY_INVALIDATED." },
  { id: "INV-4", title: "DOM identity", body: "domHash is tag:id:widthxheight. Mutation between mint and dispatch invalidates." },
  { id: "INV-5", title: "Occlusion non-bypass", body: "elementFromPoint at the centroid must resolve to the target." },
];

const TIERS = [
  ["R0", "Public read", "Always allow"],
  ["R1", "Session read", "Active tab"],
  ["A1", "Benign interaction", "Policy grant"],
  ["A2", "State mutation", "Tier + domain allowlist, 30s TTL"],
  ["A3", "Critical", "Denied in v0.1 — ceremony is pilot scope"],
  ["D2", "Credentials", "Hard-disabled"],
];

function BoundaryPage() {
  return (
    <main className="max-w-3xl">
      <p className="font-mono text-[12px] text-subtle">Security Boundary v0.1</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
        One invariant. Every clause is load-bearing.
      </h1>
      <blockquote className="mt-6 border-l border-line-strong pl-4 text-base text-muted sm:text-lg">
        A mutation is executable only if the adapter possesses a currently valid, non-replayed, target-bound authorization signed by a trusted Gateway identity.
      </blockquote>

      <ol className="mt-10 space-y-3">
        {CLAUSES.map((c) => (
          <li key={c.clause} className="rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]">
            <p className="font-mono text-[12px] text-fg">{c.clause}</p>
            <p className="mt-1 text-sm text-muted">{c.enforced}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-12 text-xl font-medium tracking-tight">Mechanical invariants</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {INVARIANTS.map((inv) => (
          <article key={inv.id} className="rounded-lg bg-elevated p-4 shadow-[var(--shadow-border)]">
            <p className="font-mono text-[11px] text-subtle">{inv.id}</p>
            <h3 className="mt-1 text-sm font-medium">{inv.title}</h3>
            <p className="mt-1 text-sm text-muted">{inv.body}</p>
          </article>
        ))}
      </div>

      <h2 className="mt-12 text-xl font-medium tracking-tight">Capability tiers</h2>
      <div className="mt-4 overflow-hidden rounded-lg shadow-[var(--shadow-border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-elevated font-mono text-[11px] text-subtle">
            <tr>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">v0.1 authority</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map(([tier, scope, auth]) => (
              <tr key={tier} className="border-t border-line">
                <td className="px-4 py-3 font-mono text-xs">{tier}</td>
                <td className="px-4 py-3 text-muted">{scope}</td>
                <td className="px-4 py-3 text-muted">{auth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-12 rounded-xl bg-inset p-5 shadow-[var(--shadow-border)]">
        <h2 className="text-base font-medium">What this boundary still does not cover</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Channel binding is a shared bridge token, not mutual TLS.</li>
          <li>Nonce store is in-memory: replay protection resets on restart.</li>
          <li>domHash collides for same-tag, no-id, same-size elements and is resize-sensitive.</li>
          <li>No third-party pentest, SOC 2, HSM, or automated key registry.</li>
          <li>Human-approval ceremonies are not implemented; declared gates deny.</li>
          <li>
            Selective disclosure of evidence (ZK) is not in v0.1. The{" "}
            <Link to="/zk" className="text-fg underline-offset-2 hover:underline">
              ZK lab
            </Link>{" "}
            shows what Sigma, Bulletproofs, and a guest of verifyLease would and would not buy — a journal is not a receipt.
          </li>
          <li>
            Joint computation (MPC) is not in v0.1. The{" "}
            <Link to="/mpc" className="text-fg underline-offset-2 hover:underline">
              MPC lab
            </Link>{" "}
            shows what Shamir 2-of-3, Beaver AND, and FROST would and would not buy — a reconstructed share is not a lease, and A3 still denies.
          </li>
        </ul>
        <p className="mt-4 text-sm text-subtle">
          The identity in the nav is generated fresh in this browser and is not the production Gateway’s key. The
          Puppeteer path shares the Gateway process — defense in depth, not independent attestation. The extension is the
          real boundary.
        </p>
      </section>

      <div className="mt-8">
        <Button asChild variant="secondary">
          <Link to="/pilot">Discuss a 30-day pilot</Link>
        </Button>
      </div>
    </main>
  );
}
