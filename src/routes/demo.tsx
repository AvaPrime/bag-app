import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KernelLog } from "@/components/kernel-log";
import { DispatchMeter, TreasuryFixture } from "@/components/treasury";
import { StateBadge } from "@/components/verdict";
import { HMAC_ERA_EVIDENCE, TREASURY_HOST, useBag } from "@/lib/bag/store";
import { getIdentity, verifyEvidence } from "@/lib/bag/doctrine";

export const Route = createFileRoute("/demo")({ component: DemoPage });

const ACTS = [
  { n: 1, title: "Governed execution", hint: "Intent → policy → lease → native dispatch → verified" },
  { n: 2, title: "Break the world", hint: "Lease first, then shift the button 25px. Zero dispatch." },
  { n: 3, title: "Replay defense", hint: "Re-submit the consumed nonce. Refuse." },
  { n: 4, title: "Tamper refusal", hint: "Alter targetIndex inside a signed lease. Signature dies." },
  { n: 5, title: "Offline evidence", hint: "Verify without a key, then with the pinned key." },
];

function DemoPage() {
  const [busy, setBusy] = useState(false);
  const [actNote, setActNote] = useState<string | null>(null);
  const demoAct = useBag((s) => s.demoAct);
  const lastEvidence = useBag((s) => s.lastEvidence);
  const lastLease = useBag((s) => s.lastLease);
  const identity = useBag((s) => s.identity);
  const [offline, setOffline] = useState<{ without: string; with: string } | null>(null);

  async function runAct(n: number) {
    const bag = useBag.getState();
    if (!bag.ready) await bag.boot();
    setBusy(true);
    setActNote(null);
    bag.setDemoAct(n);
    try {
      if (n === 1) {
        bag.resetScene();
        await wait(220);
        const ok = await bag.proposeApprove();
        setActNote(ok ? "Act 1 passed. Browser executed under a signed lease." : "Act 1 did not dispatch.");
      } else if (n === 2) {
        bag.setTreasury({ approved: false, shiftPx: 0, occluded: false, mutated: false, host: TREASURY_HOST });
        await wait(80);
        await bag.captureLease();
        bag.setTreasury({ shiftPx: 25 });
        await wait(280);
        const dispatched = await bag.dispatchCaptured();
        setActNote(
          dispatched
            ? "REGRESSION: drift was allowed to dispatch."
            : "Act 2 passed. Geometry drift ≥ 5px. Zero native events.",
        );
      } else if (n === 3) {
        const ok = await bag.replayLastLease();
        setActNote(ok ? "Act 3 passed. Single-use nonce refused replay." : "Replay did not refuse.");
      } else if (n === 4) {
        const ok = await bag.tamperLastLease();
        setActNote(ok ? "Act 4 passed. Tampered payload failed signature verification." : "Tamper was not refused.");
      } else if (n === 5) {
        const record = bag.lastEvidence;
        if (!record) {
          setActNote("Run Act 1 first so there is a signed record to audit.");
          return;
        }
        const without = await verifyEvidence(record, { publicPem: null });
        const withKey = await verifyEvidence(record, { publicPem: getIdentity().publicPem });
        setOffline({ without: `${without.verdict} — ${without.reason}`, with: `${withKey.verdict} — ${withKey.reason}` });
        setActNote("Act 5: the verifier fails closed without a key, then verifies against the pinned identity.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function runAll() {
    useBag.getState().resetScene();
    setOffline(null);
    for (const act of ACTS) {
      await runAct(act.n);
      await wait(480);
    }
  }

  return (
    <main className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Five-act demonstration</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Watch it act. Then watch it refuse.</h1>
        <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
          Live Ed25519 in this browser. The treasury page is the target. Native dispatches only increment when the adapter is armed by a valid lease.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => void runAll()} disabled={busy}>
            Run all five acts
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              useBag.getState().resetScene();
              setOffline(null);
              setActNote(null);
            }}
            disabled={busy}
          >
            Reset scene
          </Button>
        </div>

        <ol className="mt-6 grid gap-2">
          {ACTS.map((act) => (
            <li key={act.n}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAct(act.n)}
                className="flex w-full items-start gap-3 rounded-md bg-surface px-3 py-3 text-left shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)] disabled:opacity-50"
              >
                <span className="font-mono text-xs text-subtle">{String(act.n).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{act.title}</span>
                    {demoAct === act.n ? <Badge tone="ok">live</Badge> : null}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{act.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        {actNote ? <p className="mt-4 text-sm text-fg">{actNote}</p> : null}

        {offline ? (
          <div className="mt-4 space-y-2 rounded-md bg-inset p-4 font-mono text-[12px] leading-relaxed">
            <p className="text-pending">Without key · {offline.without}</p>
            <p className="text-verified">Pinned key · {offline.with}</p>
          </div>
        ) : null}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20" data-kernel-chrome="true">
        <TreasuryFixture />
        <DispatchMeter />
        {lastLease ? (
          <div className="rounded-lg bg-elevated p-4 shadow-[var(--shadow-border)]">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">Last lease</p>
            <p className="mt-2 font-mono text-[12px] text-muted">
              {lastLease.leaseId}
              <br />
              kid {lastLease.kid} · nonce {lastLease.nonce.slice(0, 12)}…
              <br />
              target @{lastLease.targetIndex} · {lastLease.targetSnapshot.domHash}
            </p>
          </div>
        ) : null}
        {lastEvidence ? (
          <div className="rounded-lg bg-elevated p-4 shadow-[var(--shadow-border)]">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">Evidence</p>
              <StateBadge state={lastEvidence.execution.state} />
            </div>
            <p className="mt-2 font-mono text-[12px] text-muted">
              {lastEvidence.evidenceId}
              <br />
              {lastEvidence.signature.alg} · {lastEvidence.signature.kid}
              <br />
              dispatched {String(lastEvidence.execution.dispatched)}
            </p>
          </div>
        ) : null}
        {identity ? (
          <p className="font-mono text-[11px] text-faint">
            Auditor key is {identity.kid}. HMAC-era samples remain {HMAC_ERA_EVIDENCE.signature.alg}.
          </p>
        ) : null}
        <KernelLog compact />
      </aside>
    </main>
  );
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
