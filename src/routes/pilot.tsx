import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pilot")({ component: PilotPage });

const TIERS = [
  { name: "Pilot A", range: "$10,000–$15,000", profile: "Single workflow, standard adapter." },
  { name: "Pilot B", range: "$15,000–$25,000", profile: "A2 mutations, custom policy, CISO review." },
  { name: "Pilot C", range: "$25,000–$40,000", profile: "High-consequence finance or health, SIEM ingest." },
];

function PilotPage() {
  const [org, setOrg] = useState("");
  const [app, setApp] = useState("");
  const [workflow, setWorkflow] = useState("");
  const [blocker, setBlocker] = useState("");
  const [copied, setCopied] = useState(false);

  const brief = useMemo(() => {
    return [
      "BAG 30-day design-partner brief",
      "",
      `Organization: ${org || "—"}`,
      `Authenticated application: ${app || "—"}`,
      `Workflow: ${workflow || "—"}`,
      `Measurable security blocker: ${blocker || "—"}`,
      "",
      "Scope: one workflow + one customer + one authenticated application + one measurable security problem.",
      "Success: 100% leased execution, zero false dispatch under drift/expiry/failed post-conditions, evidence verifiable against a customer-pinned Gateway public key.",
      "Pricing is experimental ($10k–$40k by tier), not a fixed list price.",
    ].join("\n");
  }, [org, app, workflow, blocker]);

  return (
    <main className="max-w-3xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Design partner</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
        One workflow. One application. One invoice.
      </h1>
      <p className="mt-3 text-sm text-muted sm:text-base">
        The remaining question is commercial: will a real organization pay to put this control layer in front of its agents? The purchase unit is a focused 30-day deployment.
      </p>

      <blockquote className="mt-8 border-l border-line-strong pl-4 text-base text-muted">
        What would prevent you from allowing an autonomous agent to perform this workflow in production?
      </blockquote>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {TIERS.map((t) => (
          <article key={t.name} className="rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]">
            <p className="font-mono text-[11px] text-subtle">{t.name}</p>
            <p className="mt-1 text-sm font-medium tabular">{t.range}</p>
            <p className="mt-2 text-sm text-muted">{t.profile}</p>
          </article>
        ))}
      </div>
      <p className="mt-3 text-sm text-subtle">
        Pricing is a hypothesis used to discover willingness-to-pay. Do not treat the low tier as the default quote.
      </p>

      <form
        className="mt-10 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void navigator.clipboard.writeText(brief).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        <Field label="Organization" value={org} onChange={setOrg} placeholder="Acme Payments" />
        <Field label="Authenticated application" value={app} onChange={setApp} placeholder="treasury.internal.acmebank.com" />
        <Field label="Workflow" value={workflow} onChange={setWorkflow} placeholder="Approve outbound wires over $250k" />
        <Field
          label="Measurable security blocker"
          value={blocker}
          onChange={setBlocker}
          placeholder="CISO will not allow unconstrained browser agents on the treasury host"
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit">Copy evaluation brief</Button>
          {copied ? <p className="self-center text-sm text-verified">Copied. This stays in your browser.</p> : null}
        </div>
      </form>

      <ol className="mt-12 space-y-2 text-sm text-muted">
        <li>Day 1–7 — Environment, MCP, extension profile, workflow mapping.</li>
        <li>Day 8–18 — Policy, signing identity, trust-store distribution.</li>
        <li>Day 19–25 — Governed execution on staging.</li>
        <li>Day 26–30 — Security evaluation, SIEM ingest, executive readout.</li>
      </ol>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-11 w-full rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
    </label>
  );
}
