import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { KernelLog } from "@/components/kernel-log";
import { DispatchMeter, TreasuryFixture } from "@/components/treasury";
import { TREASURY_HOST, useBag } from "@/lib/bag/store";
import { evaluatePolicy, ENTERPRISE_POLICY } from "@/lib/bag/doctrine";
import type { CapabilityTier, PolicyGrant } from "@/lib/bag/types";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/refusal")({ component: RefusalPage });

const TIER_OPTIONS: CapabilityTier[] = ["R0", "R1", "A1", "A2"];

function parseList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function Scratchpad() {
  const [allowlist, setAllowlist] = useState("*.internal.acmebank.com, treasury.internal.acmebank.com");
  const [ttlSec, setTtlSec] = useState(30);
  const [tiers, setTiers] = useState<CapabilityTier[]>(["R0", "R1", "A1", "A2"]);
  const [gates, setGates] = useState("confirm_critical_action, A3:*");
  const lastLine = useRef<string | null>(null);

  const grant: PolicyGrant = useMemo(
    () => ({
      policyId: "scratchpad-v0.1",
      principalId: "claude-enterprise-agent",
      allowedTiers: tiers,
      allowedDomains: parseList(allowlist),
      maxLeaseTtlMs: ttlSec * 1000,
      requiresHumanApprovalFor: parseList(gates),
    }),
    [allowlist, ttlSec, tiers, gates],
  );

  const rows = useMemo(
    () => [
      {
        label: `A2 ${TREASURY_HOST}`,
        result: evaluatePolicy(grant, "A2", TREASURY_HOST, "click_element_by_index"),
      },
      {
        label: "A2 evil-phishing-site.example",
        result: evaluatePolicy(grant, "A2", "evil-phishing-site.example", "click_element_by_index"),
      },
      {
        label: "A3 confirm_critical_action",
        result: evaluatePolicy(grant, "A3", TREASURY_HOST, "confirm_critical_action"),
      },
      {
        label: "D2 credentials",
        result: evaluatePolicy(grant, "D2", TREASURY_HOST, "click_element_by_index"),
      },
    ],
    [grant],
  );

  useEffect(() => {
    const primary = rows[0]!.result;
    const line = primary.permitted
      ? `Scratchpad: A2 ${TREASURY_HOST} permitted · TTL ${grant.maxLeaseTtlMs}ms`
      : `Scratchpad: ${primary.reason}`;
    if (lastLine.current === line) return;
    lastLine.current = line;
    useBag.getState().log({
      level: primary.permitted ? "ok" : "deny",
      state: primary.permitted ? "POLICY_EVALUATED" : "REJECTED",
      message: line,
    });
  }, [grant.maxLeaseTtlMs, rows]);

  function toggleTier(tier: CapabilityTier) {
    setTiers((cur) => (cur.includes(tier) ? cur.filter((t) => t !== tier) : [...cur, tier]));
  }

  return (
    <section className="mt-8 rounded-lg bg-inset p-4 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[12px] text-subtle">Live grant</p>
      <p className="mt-1 text-sm text-muted">
        This is the kernel’s policy object, not a form. Changing a field re-evaluates immediately. It does not mint a lease.
      </p>

      <label className="mt-4 block">
        <span className="font-mono text-[11px] text-subtle">Domain allowlist</span>
        <input
          value={allowlist}
          onChange={(e) => setAllowlist(e.target.value)}
          spellCheck={false}
          className="mt-1.5 h-11 w-full rounded-md bg-surface px-3 font-mono text-[12px] text-fg shadow-[var(--shadow-border)]"
        />
      </label>

      <label className="mt-4 block">
        <span className="font-mono text-[11px] text-subtle">Lease TTL {ttlSec}s</span>
        <input
          type="range"
          min={5}
          max={30}
          step={1}
          value={ttlSec}
          onChange={(e) => setTtlSec(Number(e.target.value))}
          className="mt-2 w-full accent-verified"
        />
      </label>

      <div className="mt-4">
        <p className="font-mono text-[11px] text-subtle">Allowed tiers</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TIER_OPTIONS.map((tier) => {
            const on = tiers.includes(tier);
            return (
              <button
                key={tier}
                type="button"
                onClick={() => toggleTier(tier)}
                className={cn(
                  "h-9 rounded-md px-3 font-mono text-[12px] shadow-[var(--shadow-border)]",
                  on ? "bg-elevated text-fg" : "bg-surface text-subtle",
                )}
              >
                {tier}
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-4 block">
        <span className="font-mono text-[11px] text-subtle">Approval-gate pattern</span>
        <input
          value={gates}
          onChange={(e) => setGates(e.target.value)}
          spellCheck={false}
          className="mt-1.5 h-11 w-full rounded-md bg-surface px-3 font-mono text-[12px] text-fg shadow-[var(--shadow-border)]"
        />
      </label>

      <ul className="mt-4 space-y-1.5 font-mono text-[12px]">
        {rows.map((row) => (
          <li key={row.label} className="flex gap-2">
            <span className={row.result.permitted ? "text-verified" : "text-refused"}>
              {row.result.permitted ? "PERMIT" : "DENY"}
            </span>
            <span className="text-muted">{row.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
        <p className="font-mono text-[12px] text-subtle">Refusal as a feature</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Try to make it click anyway.</h1>
        <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
          Each control mutates the live page or the authority artifact, then asks the Gateway to actuate. The meter on the right is the only number that matters.
        </p>

        <Scratchpad />

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
