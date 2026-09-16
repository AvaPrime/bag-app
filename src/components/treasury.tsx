import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import {
  APPROVE_ID,
  APPROVE_INDEX,
  HOLD_INDEX,
  TREASURY_URL,
  handleTreasuryClick,
  useBag,
} from "@/lib/bag/store";
import { cn } from "@/lib/cn";

export function TreasuryFixture({ interactive = true }: { interactive?: boolean }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const registerTarget = useBag((s) => s.registerTarget);
  const treasury = useBag((s) => s.treasury);

  useEffect(() => {
    registerTarget(buttonRef.current);
    return () => registerTarget(null);
  }, [registerTarget, treasury.shiftPx, treasury.mutated, treasury.approved]);

  return (
    <div className="overflow-hidden rounded-xl bg-paper text-ink shadow-[0_0_0_1px_rgb(244_244_245/0.08)]">
      <div className="flex items-center gap-2 border-b border-paper-line bg-paper-elevated px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#d4cdc3]" />
          <span className="size-2.5 rounded-full bg-[#d4cdc3]" />
          <span className="size-2.5 rounded-full bg-[#d4cdc3]" />
        </span>
        <div className="min-w-0 flex-1 truncate rounded-sm bg-paper px-3 py-1 font-mono text-[11px] text-ink-muted">
          {TREASURY_URL.replace(/(treasury\.internal\.acmebank\.com)/, treasury.host)}
        </div>
      </div>

      <div className="relative p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-muted">
              AcmeBank Treasury
            </p>
            <h2 className="mt-1 text-lg font-medium tracking-tight">Wire W-88421</h2>
          </div>
          <Badge tone={treasury.approved ? "ok" : "ink"}>
            {treasury.approved ? "Approved" : "Pending dual control"}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-ink-muted">Amount</dt>
            <dd className="font-medium tabular">$4,200,000.00</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Currency</dt>
            <dd>USD</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-muted">Beneficiary</dt>
            <dd>Meridian Holdings LLC · ****4821</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-muted">Requested by</dt>
            <dd>AP bot · claude-enterprise-agent</dd>
          </div>
        </dl>

        <div className="relative mt-6 flex flex-col gap-2 sm:flex-row">
          <div className="relative" style={{ transform: `translateY(${treasury.shiftPx}px)` }}>
            <SomBadge index={APPROVE_INDEX} />
            <button
              ref={buttonRef}
              id={treasury.mutated ? "approve-wire-mutated" : APPROVE_ID}
              type="button"
              disabled={!interactive || treasury.approved}
              onClick={() => handleTreasuryClick()}
              className={cn(
                "h-11 min-w-[11rem] rounded-sm px-4 text-sm font-medium transition-transform duration-150",
                treasury.approved
                  ? "bg-[#c5ddd2] text-ink"
                  : "bg-ink text-paper hover:opacity-90",
              )}
            >
              {treasury.approved ? "Transfer approved" : "Approve transfer"}
            </button>
          </div>
          <div className="relative">
            <SomBadge index={HOLD_INDEX} />
            <button
              type="button"
              disabled={!interactive}
              onClick={() => useBag.getState().setTreasury({ held: true })}
              className="h-11 rounded-sm border border-paper-line bg-paper-elevated px-4 text-sm text-ink"
            >
              Hold for review
            </button>
          </div>
        </div>

        {treasury.shiftPx > 0 ? (
          <p className="mt-4 font-mono text-[11px] text-ink-muted">
            Layout shift injected · +{treasury.shiftPx}px
          </p>
        ) : null}

        {treasury.occluded ? (
          <div
            className="absolute inset-0 flex items-end bg-ink/45 p-5"
            data-occlusion-layer="true"
          >
            <div className="w-full rounded-md bg-paper-elevated p-4 shadow-[0_12px_40px_rgb(28_25_23/0.25)]">
              <p className="text-sm font-medium">Session verification</p>
              <p className="mt-1 text-sm text-ink-muted">
                A modal is covering the target. elementFromPoint will not resolve to the approve control.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SomBadge({ index }: { index: number }) {
  return (
    <span
      data-som="true"
      className="absolute -left-2 -top-2 z-10 flex size-5 items-center justify-center rounded-full bg-ink font-mono text-[10px] text-paper"
    >
      {index}
    </span>
  );
}

export function DispatchMeter() {
  const count = useBag((s) => s.dispatchCount);
  return (
    <div className="rounded-lg bg-elevated p-4 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">Native dispatches</p>
      <p className="mt-1 font-mono text-4xl tabular tracking-tight">{count}</p>
      <p className="mt-1 text-sm text-muted">
        Increments only when the adapter actuates under a valid lease.
      </p>
    </div>
  );
}
