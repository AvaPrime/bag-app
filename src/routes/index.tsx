import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldOff, FileKey2, Ban } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useBag } from "@/lib/bag/store";

export const Route = createFileRoute("/")({ component: Home });

const PIPELINE = ["Propose", "Authorize", "Verify", "Actuate", "Attest"] as const;

const STEPS = [
  {
    title: "Request",
    span: "Propose → Authorize",
    body: "The agent asks to click. A plan confers no authority. Policy mints a target-bound lease — or denies.",
  },
  {
    title: "Guard",
    span: "Verify → Actuate",
    body: "Drift, occlusion, mutation, expiry, or replay kills the lease before dispatch. No lease, no click.",
  },
  {
    title: "Prove",
    span: "Attest",
    body: "Evidence is signed. The signature proves the key holder signed it. Provenance is how you got the key.",
  },
];

function Home() {
  const identity = useBag((s) => s.identity);
  const dispatchCount = useBag((s) => s.dispatchCount);

  return (
    <main className="bg-grid -mx-4 -my-8 min-h-[calc(100dvh-57px)] px-4 py-10 sm:-mx-6 sm:px-6 sm:py-16">
      <section className="max-w-3xl">
        <p className="font-mono text-[12px] text-subtle">v0.1 evaluation console</p>
        <h1 className="mt-5 text-[clamp(2.75rem,8vw,5.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
          Skills grant.
          <br />
          BAG governs.
        </h1>
        <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">
          The agent proposes. The Gateway decides. The browser is allowed to act.
          Evidence proves what happened — and what was refused.
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link to="/demo">
              Start evaluation
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="mt-3 max-w-md text-sm text-subtle">
            Four demos, five minutes, ends in a packet you can hand to your security team.
          </p>
        </div>
        {identity ? (
          <p className="mt-6 font-mono text-[12px] text-subtle">
            Pinned identity {identity.kid} · {identity.fingerprint}
            {dispatchCount > 0 ? ` · ${dispatchCount} native dispatch${dispatchCount === 1 ? "" : "es"} this session` : null}
          </p>
        ) : null}
      </section>

      <section className="mt-16 max-w-4xl">
        <p className="font-mono text-[12px] text-subtle">How a click is allowed</p>
        <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-muted">
          {PIPELINE.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              {i > 0 ? <span className="text-faint" aria-hidden="true">→</span> : null}
              <span>{label}</span>
            </li>
          ))}
        </ol>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.title} className="rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]">
              <p className="font-mono text-[11px] text-subtle">{step.span}</p>
              <h2 className="mt-2 text-base font-medium tracking-tight">{step.title}</h2>
              <p className="mt-2 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 grid gap-4 lg:grid-cols-3">
        <Claim
          icon={<Ban className="size-4" />}
          title="It can refuse"
          body="Invalid authority, stale targets, expired leases, occlusion, and DOM mutation halt before a single native event."
          to="/refusal"
        />
        <Claim
          icon={<ShieldOff className="size-4" />}
          title="It publishes its own attacks"
          body="Nine probes that once succeeded against this codebase. Found, fixed, regression-locked, still refused."
          to="/audit"
        />
        <Claim
          icon={<FileKey2 className="size-4" />}
          title="It does not attest to nothing"
          body="Without a pinned key the verifier reports UNVERIFIABLE and fails closed. Looking like a signature is not a signature."
          to="/verify"
        />
      </section>

      <section className="mt-16 max-w-3xl rounded-xl bg-elevated p-6 shadow-[var(--shadow-border)] sm:p-8">
        <h2 className="text-lg font-medium tracking-tight">What this is, and is not</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[12px] text-verified">Say</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>Enterprise-oriented security architecture with executable enforcement.</li>
              <li>Fails closed when defined invariants are violated.</li>
              <li>Ed25519 evidence, verifiable against a key you hold independently of the record.</li>
            </ul>
          </div>
          <div>
            <p className="font-mono text-[12px] text-refused">Never</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>Enterprise-ready AI security platform.</li>
              <li>Cryptographic proof of everything that happened.</li>
              <li>Human-in-the-loop approval ceremonies — those are pilot scope, and unmatched gates deny.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

function Claim({
  icon,
  title,
  body,
  to,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  to: "/refusal" | "/audit" | "/verify";
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
    >
      <span className="text-muted">{icon}</span>
      <h2 className="mt-4 text-base font-medium tracking-tight">{title}</h2>
      <p className="mt-2 flex-1 text-sm text-muted">{body}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm text-fg">
        Open
        <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
