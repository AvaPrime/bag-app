import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBag } from "@/lib/bag/store";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/audit")({ component: AuditPage });

function AuditPage() {
  const probes = useBag((s) => s.probes);
  const runProbes = useBag((s) => s.runProbes);
  const identity = useBag((s) => s.identity);
  const [busy, setBusy] = useState(false);

  const refused = probes?.filter((p) => p.refused).length ?? 0;

  return (
    <main className="max-w-3xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Adversarial self-audit</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
        Hand this to the reviewer before they ask.
      </h1>
      <p className="mt-3 text-sm text-muted sm:text-base">
        Each probe is an attack that previously succeeded against this codebase. The trail is the product: found, fixed, regression added, still refused.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await runProbes();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Probing trust boundary…" : "Run self-audit"}
        </Button>
        {probes ? (
          <p className="font-mono text-sm text-muted">
            {refused}/{probes.length} refused
          </p>
        ) : null}
        {identity ? (
          <p className="font-mono text-[12px] text-subtle">identity {identity.kid}</p>
        ) : null}
      </div>

      <ol className="mt-8 space-y-3">
        {(probes ?? []).map((p) => (
          <li key={p.id} className="rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-subtle">{p.id}</span>
              <Badge tone={p.refused ? "ok" : "deny"}>{p.refused ? (p.id === "P-00" ? "HOLD" : "REFUSED") : "OPEN"}</Badge>
              {p.finding !== "baseline" ? (
                <span className="font-mono text-[11px] text-faint">regression {p.finding}</span>
              ) : (
                <span className="font-mono text-[11px] text-faint">control</span>
              )}
            </div>
            <p className="mt-2 text-sm text-fg">{p.attack}</p>
            <p className={cn("mt-2 font-mono text-[12px] leading-relaxed", p.refused ? "text-muted" : "text-refused")}>
              {p.detail}
            </p>
            <p className="mt-1 font-mono text-[11px] text-faint">detected {p.detected}</p>
          </li>
        ))}
      </ol>

      {!probes ? (
        <p className="mt-8 text-sm text-subtle">
          The probes execute against the same Ed25519 kernel this console just provisioned. Nothing is stubbed.
        </p>
      ) : refused === probes.length ? (
        <p className="mt-8 text-sm text-muted">
          Every known attack against the v0.1 trust boundary is refused.
        </p>
      ) : (
        <p className="mt-8 text-sm text-pending">Outstanding probes are published, not hidden.</p>
      )}
    </main>
  );
}
