import { useBag } from "@/lib/bag/store";
import { cn } from "@/lib/cn";

export function KernelLog({ compact }: { compact?: boolean }) {
  const logs = useBag((s) => s.logs);
  const slice = compact ? logs.slice(-8) : logs.slice(-16);

  return (
    <div className="rounded-lg bg-inset p-3 shadow-[var(--shadow-border)]">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">Kernel</p>
        <p className="font-mono text-[11px] text-faint">{slice.length} events</p>
      </div>
      {slice.length === 0 ? (
        <p className="text-sm text-subtle">No events yet. Propose an action.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {slice.map((log) => (
            <li key={log.id} className="flex gap-2 font-mono text-[12px] leading-snug">
              <span
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  log.level === "ok" && "bg-verified",
                  log.level === "deny" && "bg-refused",
                  log.level === "warn" && "bg-pending",
                  log.level === "info" && "bg-faint",
                )}
              />
              <span className="min-w-0 text-muted">
                {log.code && !log.message.startsWith(log.code) ? (
                  <span className="text-fg">{log.code} · </span>
                ) : null}
                {log.message}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
