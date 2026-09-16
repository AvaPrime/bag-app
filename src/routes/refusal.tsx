import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { KernelLog } from "@/components/kernel-log";
import { DispatchMeter, TreasuryFixture } from "@/components/treasury";
import { TREASURY_HOST, useBag } from "@/lib/bag/store";
import { evaluatePolicy, ENTERPRISE_POLICY } from "@/lib/bag/doctrine";

export const Route = createFileRoute("/refusal")({ component: RefusalPage });

function RefusalPage() {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const treasury = useBag((s) => s.treasury);

  async function run(label: string, fn: () => Promise<boolean> | boolean | Promise<void>) {
    setBusy(true);
    try {
      const result = await fn();
      if (typeof result === "boolean") {
        setNote(result ? `${label}: refused. Dispatch count unchanged.` : `${label}: did not refuse.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid gap-8 lg:grid-cols-2">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Refusal as a feature</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Try to make it click anyway.</h1>
        <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
          Each control mutates the live page or the authority artifact, then asks the Gateway to actuate. The meter on the right is the only number that matters.
        </p>

        <div className="mt-6 grid gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run("Drift", async () => {
                const bag = useBag.getState();
                bag.setTreasury({ approved: false, shiftPx: 0, occluded: false, mutated: false, host: TREASURY_HOST });
                await bag.captureLease();
                bag.setTreasury({ shiftPx: 25 });
                await wait(200);
                return !(await bag.dispatchCaptured());
              })
            }
          >
            Shift target 25px after mint
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run("Expiry", async () => {
                const bag = useBag.getState();
                bag.setTreasury({ approved: false, shiftPx: 0, occluded: false, mutated: false, host: TREASURY_HOST });
                await bag.captureLease(700);
                await wait(900);
                return !(await bag.dispatchCaptured());
              })
            }
          >
            Expire the lease (700ms TTL)
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run("Occlusion", async () => {
                const bag = useBag.getState();
                bag.setTreasury({ approved: false, shiftPx: 0, occluded: false, mutated: false, host: TREASURY_HOST });
                await bag.captureLease();
                bag.setTreasury({ occluded: true });
                await wait(200);
                return !(await bag.dispatchCaptured());
              })
            }
          >
            Cover the target with a modal
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run("DOM hash", async () => {
                const bag = useBag.getState();
                bag.setTreasury({ approved: false, shiftPx: 0, occluded: false, mutated: false, host: TREASURY_HOST });
                await bag.captureLease();
                bag.setTreasury({ mutated: true });
                await wait(120);
                return !(await bag.dispatchCaptured());
              })
            }
          >
            Mutate the target id after mint
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run("Domain grant", async () => {
                const bag = useBag.getState();
                bag.setTreasury({
                  approved: false,
                  shiftPx: 0,
                  occluded: false,
                  mutated: false,
                  host: "evil-phishing-site.example",
                });
                return !(await bag.proposeApprove({ host: "evil-phishing-site.example" }));
              })
            }
          >
            Point the host at a phishing domain
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void run("Omitted lease", () => useBag.getState().omitLeaseClick())}
          >
            Click Approve with no lease
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              const r = evaluatePolicy(ENTERPRISE_POLICY, "A3", TREASURY_HOST, "confirm_critical_action");
              useBag.getState().log({
                level: "deny",
                state: "REJECTED",
                code: "ERR_APPROVAL_GATE_DENIED",
                message: r.reason ?? "A3 denied",
              });
              setNote("A3 / human-approval gate: denied. The ceremony is not implemented, so a declared gate fails closed.");
            }}
          >
            Request an A3 approval gate
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              useBag.getState().resetScene();
              setNote(null);
            }}
          >
            Reset scene
          </Button>
        </div>
        {note ? <p className="mt-4 text-sm text-fg">{note}</p> : null}
        <p className="mt-4 font-mono text-[12px] text-subtle">Live host {treasury.host}</p>
      </div>

      <aside className="flex flex-col gap-4" data-kernel-chrome="true">
        <TreasuryFixture />
        <DispatchMeter />
        <KernelLog />
      </aside>
    </main>
  );
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
