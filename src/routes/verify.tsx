import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { VerdictBadge } from "@/components/verdict";
import { HMAC_ERA_EVIDENCE, useBag } from "@/lib/bag/store";
import { FORGED_WIRE_CLAIM } from "@/lib/bag/samples";
import { getIdentity, verifyEvidence } from "@/lib/bag/doctrine";
import type { EvidenceRecord, VerifyResult } from "@/lib/bag/types";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/verify")({ component: VerifyPage });

function VerifyPage() {
  const lastEvidence = useBag((s) => s.lastEvidence);
  const identity = useBag((s) => s.identity);
  const [keyOn, setKeyOn] = useState(false);
  const [source, setSource] = useState<"last" | "hmac" | "forged">("hmac");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const record: EvidenceRecord | null = useMemo(() => {
    if (source === "hmac") return HMAC_ERA_EVIDENCE;
    if (source === "forged") return FORGED_WIRE_CLAIM;
    return lastEvidence;
  }, [source, lastEvidence]);

  async function run() {
    if (!record) return;
    setBusy(true);
    try {
      const bag = useBag.getState();
      if (!bag.ready) await bag.boot();
      const pem = keyOn ? getIdentity().publicPem : null;
      setResult(await verifyEvidence(record, { publicPem: pem }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Independent witness</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
          Three states. Never a polite pass.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
          A valid signature proves the key holder signed it. Provenance comes from how you got the key. Run the verifier without a key first so it refuses. Then supply the key.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ["hmac", "HMAC-era sample"],
              ["last", "Last execution"],
              ["forged", "Forged $4.2m wire"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSource(id);
                setResult(null);
              }}
              className={cn(
                "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
                source === id ? "bg-elevated text-fg" : "bg-surface text-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-5 flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={keyOn}
            onChange={(e) => {
              setKeyOn(e.target.checked);
              setResult(null);
            }}
            className="size-4 accent-accent"
          />
          Pin this console’s Gateway public key
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void run()} disabled={busy || !record}>
            Verify evidence
          </Button>
          {source === "last" && !lastEvidence ? (
            <p className="self-center text-sm text-subtle">Run the flagship demo first.</p>
          ) : null}
        </div>

        {result ? (
          <div className="mt-6 rounded-xl bg-elevated p-5 shadow-[var(--shadow-border)]">
            <VerdictBadge verdict={result.verdict} />
            <p className="mt-3 text-sm leading-relaxed text-muted">{result.reason}</p>
            <p className="mt-2 font-mono text-[11px] text-faint">
              cryptographic check {result.checked ? "performed" : "not performed"}
            </p>
          </div>
        ) : null}

        <p className="mt-6 text-sm text-subtle">
          {identity ? `Pinned fingerprint ${identity.fingerprint}.` : null} HMAC-SHA256 without a shared secret is UNVERIFIABLE. Inline key material is INVALID. Missing key is UNVERIFIABLE, not VALID.
        </p>
      </div>

      <aside className="rounded-xl bg-inset p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">Record under audit</p>
        <pre className="mt-3 max-h-[520px] overflow-auto font-mono text-[11px] leading-relaxed text-muted">
          {record ? JSON.stringify(record, null, 2) : "No record."}
        </pre>
      </aside>
    </main>
  );
}
